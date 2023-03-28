/*
    Inject custom script into the page to make it to be executed as soon as possible 
*/
const puppeteer = require('puppeteer');
const fs = require('fs');
const { loadToChromeCTXWithUtils } = require('../utils/load');
const { program } = require('commander');
const eventSync = require('../utils/event_sync');

const collectFidelityInfoOptions = {html: true, dimension: true}

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
            '--user-data-dir=../chrome_data',
            '--enable-automation'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: false
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

(async function(){
    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    const browser = await startChrome();
    const url = new URL(urlStr);
    
    let page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0); 
    const client = await page.target().createCDPSession();
    
    try {
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        await sleep(3000);

        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await page.evaluateOnNewDocument(script);
        await page.goto(url, {waitUntil: 'load'});
        await loadToChromeCTXWithUtils(page, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
        const writeLog = await page.evaluate(() => __write_log_prcessed);
        fs.writeFileSync('write_log.json', JSON.stringify(writeLog, null, 4));

        await eventSync.waitForReady();
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()