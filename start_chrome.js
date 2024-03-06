/*
    Wrapper for get_elem_dimensions.js
    Start the browser and load certain page

    Before recording, making sure that the collection 
    has already been created on the target browser extension

*/
const puppeteer = require("puppeteer")
const { program } = require('commander');
const eventSync = require('./utils/event_sync');
const measure = require('./utils/measure');
const fs = require('fs');


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
            '--user-data-dir=./chrome_data',
            '--enable-automation',
            // ! For debugging on a remote device (including host machine), need to set ssh forwarding
            '--remote-debugging-port=9222'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: false
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

async function getActivePage(browser) {
    const waitTimeout = async function (event, ms) {
        return Promise.race([event, sleep(ms)]);
    }
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

(async function(){
    program
        .option('-s, --screenshot', "Looping on screenshot")
        .option('-u --url <url>', 'URL to load')
    program.parse();
    const options = program.opts();
    const browser = await startChrome();
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: '/home/jingyz/browser-screenshots/',
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 0,
        mobile: false
    });
    // await recordPage._client().send('Emulation.setDeviceMetricsOverride', {
    //     width: 1920,
    //     height: 1080,
    //     deviceScaleFactor: 0,
    //     mobile: false
    // });

    const script = fs.readFileSync( `chrome_ctx/node_writes_override.js`, 'utf8');
    await page.evaluateOnNewDocument(script);

    if (options.url){
        await page.goto(
            options.url,
            {waitUntil: 'load'}
        )
    }
    await eventSync.waitForReady();
    if (options.screenshot){
        while (true){
            let page = await getActivePage(browser);
            await measure.collectNaiveInfo(page, 'temp', 'dimension');
            await eventSync.waitForReady();
        }
    }
    await browser.close();
    process.exit();
})()