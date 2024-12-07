/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In replay phase, Start the browser and load certain page
*/
const fs = require('fs');

const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const execution = require('../utils/execution');
const override = require('../utils/override');
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
const TIMEOUT = 60*1000;

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
    let replayweb = options.replayweb == true;
    
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
            excepFF = new execution.ExcepFFHandler();
            executionStacks = new execution.ExecutionStacks();
            client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
            client.on('Runtime.consoleAPICalled', params => executionStacks.onWriteStack(params))
            client.on('Network.requestWillBeSent', params => {
                excepFF.onRequest(params);
                executionStacks.onRequestStack(params);
            })
            client.on('Network.responseReceived', params => excepFF.onFetch(params))
            client.on('Network.loadingFailed', params => excepFF.onFailFetch(params))
        }

        // * Step 1.5: Collect all execution contexts (for replayweb.page)
        if (replayweb) {
            var executionContexts = [];
            client.on('Runtime.executionContextCreated', params => { executionContexts.push(params) });
            var web_resources = new Map();
            await measure.collectWebResources(client, web_resources);
        }

        if (options.override) {
            let overrideName = options.override === true ? 'overrides.json': options.override;
            const overrideInfos = override.readOverrideInfo(`${dirname}/${overrideName}`);
            await override.overrideResources(client, overrideInfos);
        }
        
        await preventNavigation(page);
        await preventWindowPopup(page);
        if (!options.minimal) {
            const nwoScript = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
            const csScript = fs.readFileSync( `${__dirname}/../chrome_ctx/capture_sync.js`, 'utf8');
            await page.evaluateOnNewDocument(nwoScript);
            await page.evaluateOnNewDocument(csScript);
        }
        if (options.exetrace)
            await page.evaluateOnNewDocument("__trace_enabled = true");
        Error.stackTraceLimit = Infinity;
        let invarObserver = null;
        if (options.mutation) {
            await page.evaluateOnNewDocument("__fidex_mutation = true");
            invarObserver = new execution.InvariantObserver();
            client.on('Runtime.consoleAPICalled', params => invarObserver.onViolation(params));
        }
            
        // * Step 2: Load the page
        try {
            console.log("Replay: Start loading the actual page");
            let networkIdle = page.goto(url, {
                waitUntil: 'networkidle0'
            })
            const timeoutDur = replayweb ? 5000 : TIMEOUT; // websocket will stay open and puppeteer will mark it as not idle???
            start = Date.now();
            await eventSync.waitTimeout(networkIdle, timeoutDur); 
            if (replayweb) 
                await eventSync.sleep(5000-Date.now()+start);
        } catch {}
        if (options.minimal)
            return;

        let evalIframe = await measure.getEvalIframeFromPage(page);
        let evalIframeExecCtxId = null;
        if (replayweb) {
            await page.evaluate(`document.querySelector("body > replay-app-main").shadowRoot.querySelector("nav").style.display = "none";`);
            await page.evaluate(`document.querySelector("body > replay-app-main").shadowRoot.querySelector("wr-item").shadowRoot.querySelector("nav").style.display = "none"`);
        
            for (let execCtx of executionContexts) {
                if (!(execCtx && execCtx.context && execCtx.context.auxData && execCtx.context.auxData.frameId)) {
                    continue
                }
                if (execCtx.context.auxData.frameId === evalIframe._id && !execCtx.context.origin.includes("puppeteer")) {
                    evalIframeExecCtxId = execCtx.context.id;
                    break;
                }
            }
            global.__eval_iframe_exec_ctx_id = evalIframeExecCtxId;
        } else {
            global.__eval_iframe_exec_ctx_id = null;
        }
        if (scroll)
            await measure.scroll(evalIframe);
        
        // * Step 3: Wait for the page to be loaded
        if (options.manual)
            await eventSync.waitForReady();
        else
            await eventSync.waitCaptureSync(page);
        if (options.exetrace)
            excepFF.afterInteraction('onload', {});

        // * Step 4: Collect the screenshot and other measurements
        if (options.rendertree){
            let frameRenderTree;
            if (replayweb) {
                frameRenderTree = evalIframe;
            } else {
                frameRenderTree = page.mainFrame();
            }
            const renderInfoRaw = await measure.collectRenderTree(frameRenderTree,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
            fs.writeFileSync(`${dirname}/${filename}_dom.json`, JSON.stringify(renderInfoRaw.renderTree, null, 2));
        }
        if (options.screenshot)
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(evalIframe, dirname, filename);

        // * Step 5: Interact with the webpage
        if (options.interaction){
            const allEvents = await measure.interaction(evalIframe, client, excepFF, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }
        
        // * Step 6: Collect the writes to the DOM
        // ? If seeing double-size writes, maybe caused by the same script in tampermonkey.
        if (options.write){
            await loadToChromeCTXWithUtils(evalIframe, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
            const writeLog = await evalIframe.evaluate(() => { 
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
        if (options.mutation)
            fs.writeFileSync(`${dirname}/${filename}_invariant_violations.json`, JSON.stringify(invarObserver.violations, null, 2));

        // * Step 8: If replayweb, collect HTMLs and JavaScripts
        if (replayweb)
            fs.writeFileSync(`${dirname}/${filename}_resources.json`, JSON.stringify(web_resources, null, 2));

        fs.writeFileSync(`${dirname}/${filename}_done`, "");
        
    } catch (err) {
        console.error(`Replay proxy=${options.proxy?true:false} exception on ${urlStr}: ${err.stack}`);
    } finally {
        await browser.close();
        process.exit();
    }
})()