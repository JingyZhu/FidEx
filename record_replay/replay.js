/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In replay phase, Start the browser and load certain page
*/
const fs = require('fs');

const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const execution = require('../utils/execution');
const { startChrome, 
        loadToChromeCTX, 
        loadToChromeCTXWithUtils, 
        clearBrowserStorage,
        preventNavigation,
        preventWindowPopup, 
      } = require('../utils/load');
const { recordReplayArgs } = require('../utils/argsparse');
const { loggerizeConsole } = require('../utils/logger');

loggerizeConsole();

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
    const { browser } = await startChrome(options.chrome_data, headless, options.proxy);
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    
    let page = await browser.newPage();
    const client = await page.createCDPSession();
    await clearBrowserStorage(browser);
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
        await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        await eventSync.sleep(1000);
        
        // * Step 1: Parse and Inject the overriding script
        let excepFF = null, executionStacks = null;
        if (options.exetrace) {
            excepFF = new measure.excepFFHandler();
            executionStacks = new execution.ExecutionStacks();
            client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
            client.on('Runtime.consoleAPICalled', params => executionStacks.onWriteStack(params))
            client.on('Network.requestWillBeSent', params => {
                excepFF.onRequest(params);
                executionStacks.onRequestStack(params);
            })
            client.on('Network.responseReceived', params => excepFF.onFetch(params))
        }
        const timeout = 30*1000;
        
        await preventNavigation(page);
        await preventWindowPopup(page);
        const nwoScript = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        const csScript = fs.readFileSync( `${__dirname}/../chrome_ctx/capture_sync.js`, 'utf8');
        await page.evaluateOnNewDocument(nwoScript);
        await page.evaluateOnNewDocument(csScript);
        if (options.exetrace)
            await page.evaluateOnNewDocument("__trace_enabled = true");
        Error.stackTraceLimit = Infinity;

        // * Step 2: Load the page
        try {
            console.log("Replay: Start loading the actual page");
            let networkIdle = page.goto(url, {
                waitUntil: 'networkidle0'
            })
            await eventSync.waitTimeout(networkIdle, timeout); 
        } catch {}
        if (scroll)
            await measure.scroll(page);
        
        // * Step 3: Wait for the page to be loaded
        if (options.manual)
            await eventSync.waitForReady();
        else
            await eventSync.waitCaptureSync(page);
        if (options.exetrace)
            excepFF.afterInteraction('onload');

        // * Step 4: Collect the screenshot and other measurements
        if (options.rendertree){
            const rootFrame = page.mainFrame();
            const renderInfoRaw = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
            fs.writeFileSync(`${dirname}/${filename}_dom.json`, JSON.stringify(renderInfoRaw.renderTree, null, 2));
        }
        if (options.screenshot)
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(page, dirname, filename);

        // * Step 5: Interact with the webpage
        if (options.interaction){
            const allEvents = await measure.interaction(page, client, excepFF, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }
        
        // * Step 6: Collect the writes to the DOM
        // ? If seeing double-size writes, maybe caused by the same script in tampermonkey.
        if (options.write){
            await loadToChromeCTXWithUtils(page, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
            const writeLog = await page.evaluate(() => { 
                collect_writes();
                return __write_log_processed;
            });
            fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
        }

        // * Step 7: Collect execution trace
        if (options.exetrace) {
            fs.writeFileSync(`${dirname}/${filename}_exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_requestStacks.json`, JSON.stringify(executionStacks.requestStacksToList(), null, 2));
            fs.writeFileSync(`${dirname}/${filename}_writeStacks.json`, JSON.stringify(executionStacks.writeStacksToList(), null, 2));
        }
        
    } catch (err) {
        console.error(`Replay proxy=${options.proxy?true:false} exception on ${urlStr}: ${err.stack}`);
    } finally {
        await browser.close();
        process.exit();
    }
})()