/*
    Wrapper for get_elem_dimensions.js
    Start the browser and load certain page

    Before recording, making sure that the collection 
    has already been created on the target browser extension

*/
const puppeteer = require("puppeteer")
const fs = require('fs');
const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const { loadToChromeCTX } = require('../utils/load');
const { program } = require('commander');

const http = require('http');
// Dummy server for enable page's network and runtime before loading actual page
try{
    http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('Hello World!');
    }).listen(8086);
} catch(e){}

const extensionId = "fpeoodllldobpkbkabpblcfaogecpndd"
let Archive = null;
let ArchiveFile = null; 

const collectFidelityInfoOptions = {html: true, dimension: true}


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
            '--enable-automation',
            '--disable-skia-runtime-opts'
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

async function interaction(page, cdp, excepFF, url, dirname) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/interaction.js`)
    await cdp.send("Runtime.evaluate", {expression: "let eli = new eventListenersIterator();", includeCommandLineAPI:true});
    let numEvents = await page.evaluate(async () => {
        eli.init();
        // eli.shuffle();
        return eli.listeners.length;
    })
    // ! Temp
    // let origPath = await page.evaluate(async () => {
    //     return eli.origPath;
    // })
    // fs.writeFileSync(`${dirname}/listeners.json`, JSON.stringify(origPath, null, 2));
    // ! End of temp
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    let count = 1;
    for (let i = 0; i < numEvents && i < 20; i++) {
        let e = {};
        let p = page.evaluate(async () => await eli.triggerNext())
            .then(r => e = r)
        await waitTimeout(p, 3000);
        if (Object.keys(e).length <= 0) 
            continue
        // console.log(e);
        e.screenshot_count = count;
        excepFF.afterInteraction(e);
        await measure.collectFidelityInfo(page, url, dirname, 
                            `dimension_${count++}`, collectFidelityInfoOptions)        
    }
}

(async function(){
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-a --archive <Archive>', 'Archive list to record the page', 'test')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page");

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
    await client_0.send('Network.clearBrowserCookies');
    await client_0.send('Network.clearBrowserCache');
    
    try {
        
        // * Input dummy URL to get the active page being recorded
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
            {waitUntil: 'load'}
        )
        await dummyRecording(page, url);
        await sleep(3000);
        
        let recordPage = await getActivePage(browser);
        if (!recordPage)
            throw new Error('Cannot find active page')
        // Avoid puppeteer from overriding dpr
        // ? Timeout doesn't alway work
        let networkIdle = recordPage.waitForNetworkIdle({
            timeout: 3*1000
        })
        await waitTimeout(networkIdle, 3*1000) 

        // * Loading actual URL
        const client = await recordPage.target().createCDPSession();
        let excepFF = new measure.excepFFHandler();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
        client.on('Network.requestWillBeSent', params => excepFF.onRequest(params))
        client.on('Network.responseReceived', params => excepFF.onFetch(params))

        // await recordPage._client().send('Emulation.setDeviceMetricsOverride', {
        //     width: 1920,
        //     height: 1080,
        //     deviceScaleFactor: 0,
        //     mobile: false
        // });
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
        } catch(err) {}

        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(2000);
        // * Log down measurements of the page
        excepFF.afterInteraction('onload')

        await measure.collectFidelityInfo(recordPage, url, dirname, 
                            'dimension', collectFidelityInfoOptions);
        
        // * Interact with the webpage
        if (options.interaction){
            await interaction(recordPage, client, excepFF, url, dirname);
            if (options.manual)
                await eventSync.waitForReady();
        }
        fs.writeFileSync(`${dirname}/exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
        
        await recordPage.close();
        
        // * Download recorded archive
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
            {waitUntil: 'load'}
        )
        await sleep(500);
        let ts = await clickDownload(page);

        // ! Signal of the end of the program
        console.log("recording page ts:", ts)
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()