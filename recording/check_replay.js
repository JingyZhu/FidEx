/*
    Wrapper for get_elem_dimensions.js
    Start the browser and load certain page
*/
const puppeteer = require("puppeteer")
const fs = require('fs')
const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const { loadToChromeCTX } = require('../utils/load');
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

async function interaction(page, cdp, excepFF, url, dirname){
    // * Read path file
    let loadEvents = [];
    // let data = fs.readFileSync(`${dirname}/exception_failfetch_record.json`)
    // data = JSON.parse(data).slice(1)
    // for (const obj of data)
    //     loadEvents.push([obj.interaction.path, obj.interaction.events])
    // const script = fs.readFileSync("../chrome_ctx/interaction.js", 'utf8');
    // await cdp.send("Runtime.evaluate", {expression: script, includeCommandLineAPI:true});
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/interaction.js`)
    const expr = `
    // let loadEvents = ${JSON.stringify(loadEvents)};
    // let eli = new eventListenersIterator(loadEvents);
    let eli = new eventListenersIterator();
    `
    // console.log(expr);
    await cdp.send("Runtime.evaluate", {expression: expr, includeCommandLineAPI:true});
    let numEvents = await page.evaluate(async () => {
        eli.init();
        return eli.listeners.length;
    })
    // ! Temp
    // let origPath = await page.evaluate(async () => {
    //     return eli.origPath;
    // })
    // fs.writeFileSync(`${dirname}/listeners.json`, JSON.stringify(origPath, null, 2));
    // ! End of temp
    let count = 1;
    for (let i = 0; i < numEvents && i < 20; i++) {
        let e = await page.evaluate(async () => await eli.triggerNext())
        if (Object.keys(e).length <= 0) 
            continue
        // console.log(e);
        e.screenshot_count = count;
        excepFF.afterInteraction(e);
        await measure.collectFidelityInfo(page, url, dirname,
                             `${filename}_${count++}`, collectFidelityInfoOptions)
    }
}

(async function(){
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page, require exception_failfetch_record.json to be present in the directory");

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
        let excepFF = new measure.excepFFHandler();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
        client.on('Network.requestWillBeSent', params => excepFF.onRequest(params))
        client.on('Network.responseReceived', params => excepFF.onFetch(params))
        await page.goto(url, {
            waitUntil: 'networkidle2'
        })

        // await page.evaluate(() => document.querySelector("body > header").remove())
        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(2000);
        // * Log down measurements of the page
        excepFF.afterInteraction('onload')
        await measure.collectFidelityInfo(page, url, dirname, 
                                filename, collectFidelityInfoOptions)
        
        // * Interact with the webpage
        if (options.interaction){
            await interaction(page, client, excepFF, url, dirname);
            if (options.manual)
                await eventSync.waitForReady();
        }
        
        fs.writeFileSync(`${dirname}/exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()