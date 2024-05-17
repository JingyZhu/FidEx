/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In replay phase, Start the browser and load certain page
*/
const puppeteer = require("puppeteer");
const fs = require('fs');
const { program } = require('commander');

const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const execution = require('../utils/execution');
const { loadToChromeCTX, loadToChromeCTXWithUtils } = require('../utils/load');


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

async function preventNavigation(page) {
    page.on('dialog', async dialog => {
        console.log(dialog.message());
        await dialog.dismiss(); // or dialog.accept() to accept
    });
    await page.evaluateOnNewDocument(() => {
        window.addEventListener('beforeunload', (event) => {
            event.preventDefault();
            event.returnValue = '';
        });
    });
}

async function interaction(page, cdp, excepFF, url, dirname, filename, options) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/interaction.js`)
    await cdp.send("Runtime.evaluate", {expression: "let eli = new eventListenersIterator();", includeCommandLineAPI:true});
    const allEvents = await page.evaluate(() => {
        let serializedEvents = [];
        for (let idx = 0; idx < eli.listeners.length; idx++) {
            const event = eli.listeners[idx];
            let [elem, handlers] = event;
            orig_path = eli.origPath[idx]
            const serializedEvent = {
                idx: idx,
                element: getElemId(elem),
                path: orig_path,
                events: handlers,
                url: window.location.href,
             }
            serializedEvents.push(serializedEvent);
        }
        return serializedEvents;
    });
    const numEvents = allEvents.length;
    console.log("load_override.js:", "Number of events", numEvents);
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    for (let i = 0; i < numEvents && i < 20; i++) {
        try {
            await page.waitForFunction(async (idx) => {
                await eli.triggerNth(idx);
                return true;
            }, {timeout: 10000}, i);
        } catch(e) { // Print top line of the error
            console.error(e.toString().split('\n')[0]);
            continue
        }
        excepFF.afterInteraction(allEvents[i]);
        // if (options.scroll)
        //     await measure.scroll(page);
        if (options.write){
            const writeLog = await page.evaluate(() => {
                __recording_enabled = false;
                collect_writes();
                __recording_enabled = true;
                return {
                    writes: __final_write_log_processed,
                    rawWrites: __raw_write_log_processed
                }
            });
            fs.writeFileSync(`${dirname}/${filename}_${i}_writes.json`, JSON.stringify(writeLog, null, 2));
        }
        if (options.screenshot) {
            const rootFrame = page.mainFrame();
            const renderInfo = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0});
            // console.log("Replay: Collected render tree");    
            await measure.collectNaiveInfo(page, dirname, `${filename}_${i}`)
            // console.log("Replay: Collected screenshot");    
            fs.writeFileSync(`${dirname}/${filename}_${i}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
        }      
    }
    return allEvents;
}

(async function(){
    // * Step 0: Prepare for running
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page")
        .option('-w, --write', "Collect writes to the DOM")
        .option('-b, --wayback', "Whether replay is from wayback machine")
        .option('-s, --screenshot', "Collect screenshot and other measurements")
        .option('--scroll', "Scroll to the bottom.")

    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    let scroll = options.scroll == true;
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
        let executionStacks = new execution.ExecutionStacks();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        await sleep(1000);
        
        // * Step 1: Parse and Inject the overriding script
       
        client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
        client.on('Runtime.consoleAPICalled', params => executionStacks.onWriteStack(params))
        client.on('Network.requestWillBeSent', params => {
            excepFF.onRequest(params);
            executionStacks.onRequestStack(params);
        })
        client.on('Network.responseReceived', params => excepFF.onFetch(params))
        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        const timeout = options.wayback ? 200*1000 : 30*1000;
        
        await preventNavigation(page);
        await page.evaluateOnNewDocument(script);
        // if (options.write)
        //     await page.evaluateOnNewDocument("__trace_enabled = true");
        
        // * Step 2: Load the page
        try {
            let networkIdle = page.goto(url, {
                waitUntil: 'networkidle0'
            })
            await waitTimeout(networkIdle, timeout); 
        } catch {}
        if (scroll)
            await measure.scroll(page);
        
        // * Step 3: If replaying on Wayback, need to remove the banner for fidelity consistency
        if (options.wayback){
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
            await sleep(2000);
        }

        // * Step 4: Wait for the page to be loaded
        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(1000);
        excepFF.afterInteraction('onload');
        
        // * Step 5: Collect the writes to the DOM
        // ? If seeing double-size writes, maybe caused by the same script in tampermonkey.
        if (options.write){
            await loadToChromeCTXWithUtils(page, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
            const writeLog = await page.evaluate(() => {
                return {
                    writes: __final_write_log_processed,
                    rawWrites: __raw_write_log_processed
                }
            });
            fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_requestStacks.json`, JSON.stringify(executionStacks.requestStacks, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_writeStacks.json`, JSON.stringify(executionStacks.writeStacks, null, 2));
        }

        // * Step 6: Collect the screenshot and other measurements
        if (options.screenshot){
            const rootFrame = page.mainFrame();
            const renderInfo = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, true);
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(page, dirname, filename);
            fs.writeFileSync(`${dirname}/${filename}.html`, renderInfo.renderHTML.join('\n'));
            fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
        }

        // * Step 7: Interact with the webpage
        if (options.interaction){
            const allEvents = await interaction(page, client, excepFF, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }
        fs.writeFileSync(`${dirname}/${filename}_exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));

        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()