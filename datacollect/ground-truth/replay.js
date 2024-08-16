/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In replay phase, Start the browser and load certain page
*/
const fs = require('fs');
const os = require('os');

const eventSync = require('../../utils/event_sync');
const measure = require('../../utils/measure');
const { startChrome, loadToChromeCTX, loadToChromeCTXWithUtils } = require('../../utils/load');
const {recordReplayArgs} = require('../../utils/argsparse');


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
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
    await loadToChromeCTX(page, `${__dirname}/../../chrome_ctx/interaction.js`)
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
    console.log("Replay:", "Number of events", numEvents);
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    for (let i = 0; i < numEvents && i < 20; i++) {
        // console.log("Replay: Triggering interaction", i);
        try {
            await page.waitForFunction(async (idx) => {
                await eli.triggerNth(idx);
                return true;
            }, {timeout: 10000}, i);
        } catch(e) { // Print top line of the error
            console.error(e.toString().split('\n')[0]);
            continue
        }
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
    program = recordReplayArgs();
    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    let scroll = options.scroll == true;
    
    const headless = options.headless ? "new": false;
    const { browser } = await startChrome(options.chrome_data, headless);
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
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await sleep(1000);
        
        // * Step 1: Parse and Inject the overriding script
        const script = fs.readFileSync( `${__dirname}/../../chrome_ctx/node_writes_override.js`, 'utf8');
        const timeout = 30*1000;
        
        await preventNavigation(page);
        await page.evaluateOnNewDocument(script);
        if (options.write)
            await page.evaluateOnNewDocument("__trace_enabled = true");
        
        // * Step 2: Load the page
        try {
            console.log("Replay: Start loading the actual page");
            let networkIdle = page.goto(url, {
                waitUntil: 'networkidle0'
            })
            await waitTimeout(networkIdle, timeout); 
        } catch {}
        if (scroll)
            await measure.scroll(page);
        
        // * Step 3: Wait for the page to be loaded
        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(1000);
        
        // * Step 4: Collect the writes to the DOM
        // ? If seeing double-size writes, maybe caused by the same script in tampermonkey.
        if (options.write){
            await loadToChromeCTXWithUtils(page, `${__dirname}/../../chrome_ctx/node_writes_collect.js`);
            const writeLog = await page.evaluate(() => {
                return {
                    writes: __final_write_log_processed,
                    rawWrites: __raw_write_log_processed
                }
            });
            fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
        }

        // * Step 5: Collect the screenshot and other measurements
        if (options.screenshot){
            const rootFrame = page.mainFrame();
            const renderInfo = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, true);
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            // console.log("Replay: Collected render tree");
            await measure.collectNaiveInfo(page, dirname, filename);
            // console.log("Replay: Collected screenshot");
            fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
        }

        // * Step 7: Interact with the webpage
        if (options.interaction){
            const allEvents = await interaction(page, client, null, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }
        
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()