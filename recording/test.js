/*
    Wrapper for get_elem_dimensions.js
    Start the browser and load certain page

    Before recording, making sure that the collection 
    has already been created on the target browser extension

*/
const puppeteer = require("puppeteer")
const fs = require('fs')
const assert = require('assert');
const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const { program } = require('commander');
const { fail } = require("assert");


const extensionId = "fpeoodllldobpkbkabpblcfaogecpndd"
const Archive = "test";
const ArchiveFile = (() => Archive.toLowerCase().replace(/ /g, '-'))();

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
        defaultViewport: {width: 1920, height: 1080, deviceScaleFactor: 1},
        // defaultViewport: null,
        headless: false,
        downloadPath: './downloads/'
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

async function clickDownload(page) {
    const script = fs.readFileSync("../chrome_ctx/click_download.js", 'utf8');
    await page.evaluate(script);
    await page.evaluate(archive => firstPageClick(archive), Archive)
    await sleep(500);
    await page.evaluate(script);
    let pageTs = await page.evaluate(() => secondPageDownload());
    await eventSync.waitFile(`./downloads/${ArchiveFile}.warc`);
    return pageTs;
}

async function startRecording(page, url) {
    const script = fs.readFileSync("../chrome_ctx/start_recording.js", 'utf8');
    await page.evaluate(script);
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
        console.log(await p.evaluate(() => window.devicePixelRatio));
        if(visible) {
            arr.push(p);
        }
    }
    if(arr.length == 1) return arr[0];
    // else return pages[pages.length-1]; // ! Fall back solution
}

var exceptions = [];
async function onException(params) {
    let ts = params.timestamp;
    let detail = params.exceptionDetails;
    // console.log("Exceptions at", ts);
    let detailObj = {
        ts: ts,
        id: detail.exceptionId,
        description: detail.exception.description,
        script: detail.scriptId,
        line: detail.lineNumber,
        column: detail.columnNumber
    }
    console.log(detailObj);
    exceptions.push(detailObj);
}

var failedFetches = [];
async function onFetch(params) {
    let response = params.response;
    if (response.status / 100 < 4 )
        return
    let failedObj = {
        url: response.url,
        status: response.status,
    }
    console.log(failedObj);
    failedFetches.push(failedObj)
}

(async function(){
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-m, --manual');
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
    if (fs.existsSync(`./downloads/${ArchiveFile}.warc`))
        fs.unlinkSync(`./downloads/${ArchiveFile}.warc`)
    
    let page = await browser.newPage();
    await  page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/',
    });
    
    try {
        // * Input URL to record

        // console.log("Before extension page");
        // console.log(await page.evaluate(() => window.devicePixelRatio));
        // console.log(await page.evaluate(() => window.innerWidth));
        // await page.goto(
        //     "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
        //     {waitUntil: 'load'}
        // )

        // console.log("After extension page");
        // console.log(await page.evaluate(() => window.devicePixelRatio));
        // console.log(await page.evaluate(() => window.innerWidth));
        
        // await startRecording(page, url);
        // await sleep(5000);
        
        // * Log down measurements of the page
        let recordPage = await getActivePage(browser);
        if (!recordPage)
            throw new Error('Cannot find active page')
        // * Timeout doesn't alway work
        
        // console.log("Record page");
        // console.log(await recordPage.evaluate(() => window.devicePixelRatio));
        // console.log(await recordPage.evaluate(() => window.innerWidth));
        const client = await recordPage.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        client.on('Runtime.exceptionThrown', params => onException(params))
        client.on('Network.responseReceived', params => onFetch(params))
        
        recordPage.goto(
            url,
            {waitUntil: 'load'}
        )

        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(5000);
        // await measure.collectFidelityInfo(recordPage, url, dirname)
        // await recordPage.close();
        // await sleep(500);

        // // * Download recorded archive
        // await page.goto(
        //     "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
        //     {waitUntil: 'load'}
        // )
        // let ts = await clickDownload(page);

        // // ! Signal of the end of the program
        // console.log("recording page ts:", ts)'
        const obj = {exceptions: exceptions, failedFetches: failedFetches}
        // fs.writeFileSync('exception_failfetch_test.json', JSON.stringify(obj, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()