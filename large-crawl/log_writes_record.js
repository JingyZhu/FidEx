/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In rrcord phase, Start the browser and load certain page

    Before recording, making sure that the collection 
    has already been created on the target browser extension

*/
const puppeteer = require("puppeteer")
const fs = require('fs');
const eventSync = require('../utils/event_sync');
const { loadToChromeCTX, loadToChromeCTXWithUtils } = require('../utils/load');
const { program } = require('commander');
const measure = require('../utils/measure');
const { parse: HTMLParse } = require('node-html-parser');

const http = require('http');
// Dummy server for enable page's network and runtime before loading actual page
try{
    http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('Hello World!');
    }).listen(8086);
} catch(e){}

let Archive = null;
let ArchiveFile = null; 

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

async function clickDownload(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    await page.evaluate(archive => firstPageClick(archive), Archive)
    await sleep(500);
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    let pageTs = await page.evaluate(() => secondPageDownload());
    await eventSync.waitFile(`./downloads/${ArchiveFile}.warc`);
    return pageTs;
}
// This function assumes that the archive collection is already opened
// i.e. click_download.js:firstPageClick should already be executed
async function removeRecordings(page, topN) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/remove_recordings.js`)
    await page.evaluate(topN => removeRecording(topN), topN)
}

async function dummyRecording(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/start_recording.js`)
    const url = "http://localhost:8086"
    await page.evaluate((archive, url) => startRecord(archive, url), 
                        Archive, url);
}

async function getActivePage(browser) {
    var pages = await browser.pages();
    var arr = [];
    for (const p of pages) {
        let visible = await waitTimeout(
            p.evaluate(() => { 
                return document.visibilityState == 'visible' 
            }), 3000)
        if(visible) {
            arr.push(p);
        }
    }
    if(arr.length == 1) return arr[0];
    // else return pages[pages.length-1]; // ! Fall back solution
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
        .option('-a --archive <Archive>', 'Archive list to record the page', 'test')
        .option('-m, --manual', "Manual control for finishing loading the page")

    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    Archive = options.archive;
    ArchiveFile = (() => Archive.toLowerCase().replace(/ /g, '-'))();
    
    // // * Update URL for potential redirection
    // const res = await fetch(urlStr);
    // urlStr = res.url;

    const browser = await startChrome();
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    if (fs.existsSync(`./downloads/${ArchiveFile}.warc`))
        fs.unlinkSync(`./downloads/${ArchiveFile}.warc`)
    
    let page = await browser.newPage();
    const client_0 = await page.target().createCDPSession();
    await  client_0.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/',
    });
    await Promise.all([client_0.send('Network.clearBrowserCookies'), 
                        client_0.send('Network.clearBrowserCache')]);
    
    try {
        
        // * Input dummy URL to get the active page being recorded
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
            {waitUntil: 'load'}
        )
        await dummyRecording(page, url);
        await sleep(1000);
        
        let recordPage = await getActivePage(browser);
        if (!recordPage)
            throw new Error('Cannot find active page')
        // Avoid puppeteer from overriding dpr
        // ? Timeout doesn't alway work
        let networkIdle = recordPage.waitForNetworkIdle({
            timeout: 2*1000
        })
        await waitTimeout(networkIdle, 2*1000) 

        // * Loading actual URL
        const client = await recordPage.target().createCDPSession();
        let excepFF = new measure.excepFFHandler();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
        client.on('Network.requestWillBeSent', params => excepFF.onRequest(params))
        client.on('Network.responseReceived', params => excepFF.onFetch(params))
        await sleep(1000);

        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await recordPage.evaluateOnNewDocument(script);
        await recordPage.goto(
            url,
            {waitUntil: 'load'}
        )
        
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1920,
            height: 1080,
            deviceScaleFactor: 0,
            mobile: false
        });
        
        // ? Timeout doesn't alway work, undeterminsitically throw TimeoutError
        try {
            networkIdle = recordPage.waitForNetworkIdle({
                timeout: 30*1000
            })
            await waitTimeout(networkIdle, 30*1000); 
        } catch {}

        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(2000);
        // * Log down measurements of the page
        excepFF.afterInteraction('onload')

        // * Interact with the webpage
        // if (options.interaction){
        //     await interaction(recordPage, client, excepFF, url, dirname);
        //     if (options.manual)
        //         await eventSync.waitForReady();
        // }
        
        const finalURL = recordPage.url();

        // * Record writes to HTML
        const rootFrame = recordPage.mainFrame();
        const renderInfo = await pageIframesInfo(rootFrame,
            {xpath: '', dimension: {left: 0, top: 0}, prefix: ""});

        // * Take screenshot
        // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
        await measure.collectFidelityInfo(recordPage, url, dirname, filename);

        fs.writeFileSync(`${dirname}/${filename}.html`, renderInfo.renderHTML.join('\n'));
        fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderMap, null, 2));
        fs.writeFileSync(`${dirname}/${filename}_exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));

        await recordPage.close();
        
        // * Download recorded archive
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
            {waitUntil: 'load'}
        )
        await sleep(500);
        let ts = await clickDownload(page);
        await removeRecordings(page, 0)

        // ! Signal of the end of the program
        console.log("recorded page:", JSON.stringify({ts: ts, url: finalURL}));
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()