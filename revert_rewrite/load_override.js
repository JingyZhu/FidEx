/**
 * Load the archived page, check for any exceptions (caught and uncaught), and try to revert the write
 */
const puppeteer = require("puppeteer");
const fs = require('fs');
const { program } = require('commander');

const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const errorFix = require('./error-fix');
const execution = require('../utils/execution');
const { loadToChromeCTXWithUtils } = require('../utils/load');

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

async function removeWaybackBanner(page){
    try {
        await page.evaluate(() => {
            document.querySelector("#wm-ipp-base").remove();
            document.querySelector("#wm-ipp-print").remove();
            let elements = document.querySelectorAll('*');
            for (const element of elements){
                if (element.hasAttribute('loading'))
                    element.loading = 'eager';
            }
        })
    } catch {}
}


(async function(){
    // * Step 0: Prepare for running
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page")
        .option('-b, --wayback', "Whether replay is from wayback machine")
        
    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
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
        let excepFF = new measure.excepFFHandler();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        await sleep(500);
        const timeout = options.wayback ? 200*1000 : 60*1000;

        // * Step 1: Prepare recording for exceptions
        let exceptionHandler = new errorFix.ExceptionHandler(page, client, dirname);
        await exceptionHandler.prepare(url, exceptionType='all');
        
        // * Step 2: Load the page and collect exception
        try {
            let networkIdle = page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 0
            })
            await waitTimeout(networkIdle, timeout); 
        } catch {}
        await exceptionHandler.collectExceptions();

        // * Step 3: If replaying on Wayback, need to remove the banner for fidelity consistency
        if (options.wayback){
            await removeWaybackBanner(page);
            await sleep(2000);
        }

        // ! Temp
        const fixedIdx = await exceptionHandler.fixNetwork();
        // let fixedIdx = await exceptionHandler.fixException();
        let result = {
            fixedIdx: fixedIdx,
            log: exceptionHandler.log
        }
        fs.writeFileSync(`${dirname}/result_log.json`, JSON.stringify(result, null, 2));

        // * Step 4: Wait for the page to be loaded
        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(1000);
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()