/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In replay phase, Start the browser and load certain page
*/
const puppeteer = require("puppeteer")
const fs = require('fs')
const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const { loadToChromeCTXWithUtils } = require('../utils/load');
const { program } = require('commander');
const { parse: HTMLParse } = require('node-html-parser');


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}

async function startChrome(){
    const launchOptions = {
        // other options (headless, args, etc)
        // executablePath: '/usr/bin/chromium-browser',
        args: [
            '--disk-cache-size=1', 
            // '-disable-features=IsolateOrigins,site-per-process',
            // '--disable-site-isolation-trials',
            '--window-size=1920,1080',
            // '--disable-web-security',
            // '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
            // '--autoplay-policy=no-user-gesture-required',
            // `--user-data-dir=/tmp/chrome/${Date.now()}`
            '--user-data-dir=../chrome_data',
            '--enable-automation'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: false,
        downloadPath: './downloads/'
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

// Traverse through the iframe tree to build write log
async function pageIframesInfo(iframe, parentInfo){
    await loadToChromeCTXWithUtils(iframe, `${__dirname}/../chrome_ctx/render_tree_collect.js`);
    let renderHTML = await iframe.evaluate(() => _render_tree_text);
    let renderMap = await iframe.evaluate(() => _node_info);
    for (const element in renderMap){
        let updateAttr = {
            xpath: parentInfo.xpath + renderMap[element].xpath,
            dimension: renderMap[element].dimension? {
                left: parentInfo.dimension.left + renderMap[element].dimension.left,
                top: parentInfo.dimension.top + renderMap[element].dimension.top,
                width: renderMap[element].dimension.width,
                height: renderMap[element].dimension.height
            } : null
        }
        renderMap[element] = Object.assign(renderMap[element], updateAttr);
    }
    let htmlIframes = {};
    for (let idx = 0; idx < renderHTML.length; idx++){
        const line = renderHTML[idx];
        const tag = HTMLParse(line.trim()).childNodes[0];
        const info = renderMap[line.trim()]
        if (tag.rawTagName === 'iframe'){
            htmlIframes[tag.getAttribute('src')] = {
                html: line,
                idx: idx,
                info: info
            }
        }
    }
    const childFrames = await iframe.childFrames();
    let childHTMLs = [], childidx = [];
    for (const childFrame of childFrames){
        const childURL = childFrame.url();
        if (!(childURL in htmlIframes))
            continue
        let prefix = htmlIframes[childURL].html.match(/^\s+/)
        prefix = prefix ? prefix[0] : '';
        let currentInfo = htmlIframes[childURL].info;
        currentInfo = {
            xpath: parentInfo.xpath + currentInfo.xpath,
            dimension: {
                left: parentInfo.dimension.left + currentInfo.dimension.left,
                top: parentInfo.dimension.top + currentInfo.dimension.top,
            },
            prefix: parentInfo.prefix + '  ' + prefix
        }
        const childInfo = await pageIframesInfo(childFrame, currentInfo);
        for (const [key, value] of Object.entries(childInfo.renderMap)){
            renderMap[key] = value;
        }
        childHTMLs.push(childInfo.renderHTML);
        childidx.push(htmlIframes[childURL].idx);
    }
    childidx.push(renderHTML.length-1)
    for (let idx = 0; idx < renderHTML.length; idx++)
        renderHTML[idx] = parentInfo.prefix + renderHTML[idx];
    let newRenderHTML = renderHTML.slice(0, childidx[0]+1)
    for(let i = 0; i < childHTMLs.length; i++){
        newRenderHTML = newRenderHTML.concat(childHTMLs[i], renderHTML.slice(childidx[i]+1, childidx[i+1]+1));
    }
    return {
        renderHTML: newRenderHTML,
        renderMap: renderMap
    }
}

(async function(){
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-m, --manual', "Manual control for finishing loading the page")

    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    const browser = await startChrome();
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await  client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/',
    });
    await Promise.all([client.send('Network.clearBrowserCookies'), 
                        client.send('Network.clearBrowserCache')]);
    // Avoid puppeteer from overriding dpr
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 0,
        mobile: false
    });
    
    try {
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        await sleep(1000);
        
        let requestMap = {};
        let networkLogs = [];
        client.on('Network.requestWillBeSent', (params) => {
            const request = params.request;
            requestMap[params.requestId] = {
                url: request.url,
                method: request.method,
            }
        });
        client.on('Network.responseReceived', (params) => {
            const response = params.response;
            networkLogs.push({
                url: response.url,
                status: response.status,
                method: requestMap[params.requestId].method
            })
        });
        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await page.evaluateOnNewDocument(script);
        try{
            let networkIdle = page.goto(url, {
                waitUntil: 'networkidle0'
            })
            await waitTimeout(networkIdle, 30*1000); 
        } catch {}

        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(2000);
        
        // * Interact with the webpage
        // if (options.interaction){
        //     await interaction(page, client, excepFF, url, dirname);
        //     if (options.manual)
        //         await eventSync.waitForReady();
        // }
        // fs.writeFileSync(`${dirname}/exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
    
        // * Record writes to HTML
        const rootFrame = page.mainFrame();
        const renderInfo = await pageIframesInfo(rootFrame,
            {xpath: '', dimension: {left: 0, top: 0}, prefix: ""});

        fs.writeFileSync(`${dirname}/${filename}.html`, renderInfo.renderHTML.join('\n'));
        fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderMap, null, 2));
        fs.writeFileSync(`${dirname}/${filename}_network.json`, JSON.stringify(networkLogs, null, 2));

        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()