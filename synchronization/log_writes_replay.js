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
        headless: false,
        downloadPath: './downloads/'
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
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
        
        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await page.evaluateOnNewDocument(script);
        await page.goto(url, {
            waitUntil: 'networkidle2'
        })

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
        await loadToChromeCTXWithUtils(page, `${__dirname}/../chrome_ctx/render_tree_collect.js`);
        const writeLog = await page.evaluate(() => _render_tree);
        fs.writeFileSync(`${dirname}/${filename}.json`, JSON.stringify(writeLog, null, 2));
    
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()