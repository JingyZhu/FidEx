/*
    Check if a liveweb page is deterministic by loading it multiple times.
*/
const puppeteer = require("puppeteer");
const fs = require('fs');
const os = require('os');
const { program } = require('commander');
const { spawn } = require('child_process');

const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const execution = require('../utils/execution');
const { loadToChromeCTX, loadToChromeCTXWithUtils } = require('../utils/load');

const HOME = os.homedir();
const RELOADS = 3;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}

async function startChrome(chromeData=null){
    chromeData = chromeData || `${HOME}/chrome_data/${os.hostname()}`;
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
            `--user-data-dir=${chromeData}`,
            '--enable-automation'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: 'new'
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

(async function(){
    // * Step 0: Prepare for running
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'determinism/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-s, --screenshot', "Collect screenshot and other measurements")
        .option('-c, --chrome_data <chrome_data>', "Directory of Chrome data")
        .option('-m, --manual', "Wait for manual input to continue")
 
    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    let chromeData = options.chrome_data ? options.chrome_data : null;
    const browser = await startChrome(chromeData);
    const url = new URL(urlStr);
    const timeout = 30*1000;
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
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
        await sleep(1000);
        
        for (let idx = 0; idx < RELOADS; idx++) {
            await Promise.all([client.send('Network.clearBrowserCookies'), 
                                client.send('Network.clearBrowserCache')]);
            // * Step 1: Load the page
            try {
                let networkIdle = page.goto(url, {
                    waitUntil: 'networkidle0'
                })
                await waitTimeout(networkIdle, timeout); 
            } catch {}
            
            // * Step 2: Wait for the page to be loaded
            if (options.manual)
                await eventSync.waitForReady();
            else
                await sleep(1000);

            // * Step 3: Collect the screenshot and other measurements
            if (options.screenshot){
                const rootFrame = page.mainFrame();
                const renderInfo = await measure.collectRenderTree(rootFrame,
                    {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
                // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
                await measure.collectNaiveInfo(page, dirname, `${filename}_${idx}`);
                fs.writeFileSync(`${dirname}/${filename}_${idx}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
            }
            await sleep(2000);
        }
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()