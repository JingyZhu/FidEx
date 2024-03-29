/**
 * Load the archived page, check for any exceptions (caught and uncaught), and try to revert the write
 */
const puppeteer = require("puppeteer");
const fs = require('fs');
const { program } = require('commander');

const eventSync = require('../utils/event_sync');
const errorFix = require('./error-fix');
const { Overrider } = require('./overrider');
const { loadToChromeCTX } = require('../utils/load');
const { logger } = require("../utils/logger");

// * Used for recording patched overrides across different loads
var workingOverrides = {};

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


/**
 * Check if after patching, there is any extra events. 
 * And if so, trigger all these events to see if they have any effect on the fidelity.
 * @param {Page} page 
 * @param {CDPClient} client 
 * @param {object} options
 * @param {function} loadAndCollectListeners 
 * @returns {object} 
*/
async function checkExtraEventsFidelity(page, client, options, loadAndCollectListeners) {
    const serializeListeners = () => {
        let serializedEvents = [];
        for (let idx = 0; idx < eli.listeners.length; idx++) {
            const event = eli.listeners[idx];
            let [elem, handlers] = event;
            orig_path = eli.origPath[idx]
            const serializedEvent = {
                element: getElemId(elem),
                path: orig_path,
                events: handlers,
                url: window.location.href,
             }
            serializedEvents.push(serializedEvent);
        }
        return serializedEvents;
    }
    const collectExtraEvents = (initialEvents, patchEvents) => {
        let extraEvents = [];
        let initialEventSet = new Set(initialEvents.map(event => event.path));
        for (let i = 0; i < patchEvents.length; i++) {
            const event = patchEvents[i];
            if (!initialEventSet.has(event.path))
                extraEvents.push({idx: i, event: event});
        }
        return extraEvents;
    }
    await loadAndCollectListeners();
    const initialEvents = await page.evaluate(serializeListeners);
    const initialNumEvents = initialEvents.length;
    logger.log("load_override.js:", "Number of events (initial)", initialNumEvents);

    const overrider = new Overrider(client, {overrides: workingOverrides});
    await overrider.overrideResources({});
    await Promise.all([client.send('Network.clearBrowserCookies'), 
                    client.send('Network.clearBrowserCache')]);
    const recorder = new errorFix.PageRecorder(page, client);
    recorder.prepareLogging();
    await loadAndCollectListeners();
    const patchEvents = await page.evaluate(serializeListeners);
    const patchNumEvents = patchEvents.length;
    logger.log("load_override.js:", "Number of events (patched)", patchNumEvents);
    let result = {
        fixedIdx: -1,
        stage: 'extraInteraction',
        initialEvents: initialEvents,
        extraEvents: [],
        results: []
    };
    if (initialNumEvents < patchNumEvents) {
        const extraEvents = collectExtraEvents(initialEvents, patchEvents);
        result.extraEvents = extraEvents;
        for ({idx} of extraEvents) {
            try {
                await page.waitForFunction(async (idx) => {
                    await eli.triggerNth(idx);
                    return true;
                }, {timeout: 3000}, idx);
                result.results.push({
                    type: "eventTriggered",
                    idx: idx,
                });
            } catch(e) {
                logger.error("load_override.js:", "Error in triggering event", e.message.split('\n')[0]);
                result.results.push({
                    type: "eventTriggeredWithException",
                    idx: idx,
                });
                result['fixedIdx'] = idx;
                break;
            }
        }
        await recorder.record(options.dir, 'extraInteraction_exception_0');
        // cp load_initial* to extraInteration_initial*
        const suffices = ['_elements.json', '_requests.json', '_writes.json', '.png'];
        for (const suffix of suffices)
            fs.copyFileSync(`${options.dir}/load_initial${suffix}`, `${options.dir}/extraInteraction_initial${suffix}`);
        const fidelityCheck = await recorder.fidelityCheck(options.dir, 'extraInteraction_initial', 'extraInteraction_exception_0');
        if (fidelityCheck.different) {
            logger.log("load_override.js:", "Fixed fidelity issue");
            result['fixedIdx'] = 0;
        }
    }
    return result;
}

/**
 * 
 * @returns {object} A mapping from interaction id to their metadata
 */
async function interaction(browser, url, timeout, options) {
    // * Step 1: Collect number of events, before and after patch.
    // * Note that if the number of events is different, will first try additional events.
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await enableFields(client);
    let results = {}, logs = {};
    const getBeforeFunc = (url, page, client, timeout) =>  {
        return async () => {
            await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: timeout
            });
            await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/interaction.js`)
            await client.send("Runtime.evaluate", {expression: "let eli = new eventListenersIterator();", includeCommandLineAPI:true});    
        }
    };
    const loadAndCollectListeners = getBeforeFunc(url, page, client, timeout);
    const exEvtResult = await checkExtraEventsFidelity(page, client, options, loadAndCollectListeners);
    await page.close();
    if (exEvtResult.fixedIdx != -1) {
        return {
            results: {extraInteraction: exEvtResult},
            logs: {extraInteraction: []},
        }
    } else if (exEvtResult.extraEvents.length > 0) {
        result.results['extraInteraction'] = exEvtResult;
        result.logs['extraInteraction'] = [];
    }
    

    // * Step 2: Trigger events
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    const initialEvents = exEvtResult.initialEvents;
    const initialNumEvents = initialEvents.length;
    for (let i = 0; i < initialNumEvents && i < 20; i++) {
        logger.verbose("load_override.js:", "Triggering events", i);
        let page = await browser.newPage();
        const client = await page.target().createCDPSession();
        await enableFields(client);
        const loadAndCollectListeners = getBeforeFunc(url, page, client, timeout);   
        const triggerEvent = ((page, i) => {
            return async () => {
                await page.waitForFunction(async (idx) => {
                    await eli.triggerNth(idx);
                    return true;
                }, {timeout: 10000}, i);
            }
        })(page, i)
        let {result, log} = await loadAndFix(url, page, client, `interaction_${i}`, options, triggerEvent, 
                                                                {
                                                                    beforeFunc: loadAndCollectListeners,
                                                                    workingOverrides: workingOverrides
                                                                });
        result = {
            fixedIdx: result.fixedIdx,
            stage: `interaction_${i}`,
            events: initialEvents[i],
            success: result.success,
            results: result.results
        }
        results[`interaction_${i}`] = result;
        logs[`interaction_${i}`] = log;
        await page.close();
        if (result.fixedIdx != -1)
            break
    }
    return {
        results: results,
        logs: logs
    }
}

/**
 * @returns {object} result: {fixedIdx, stage, success, results}, log: [], workingOverrides: {}
 */
async function loadAndFix(url, page, client, stage, options, loadFunc, 
                          {beforeFunc=null, workingOverrides={}}={}) {
    let errorFixer = new errorFix.ErrorFixer(page, client, {
                                                            dirname: options.dir, 
                                                            manual: options.manual,
                                                            decider: options.optimized,
                                                            beforeReloadFunc: beforeFunc,
                                                            reloadFunc: loadFunc
                                                            });
    await errorFixer.recorder.prepareLogging();
    if(beforeFunc)
        await beforeFunc();                                                    
    await errorFixer.prepare(url, stage, exceptionType='all');
    // * For interaction, there is a chance that the interaction will trigger the navigation
    // * If so, need to catch and exit early
    try {
        await loadFunc(page, client);
    } catch (e) {
        logger.error("load_override.js:", "Error in loadFunc", e.message.split('\n')[0]);
        return {
            result: {
                fixedIdx: -1,
                stage: stage,
                success: false,
                results: []
            },
            log: [],
            workingOverrides: {}
        };
    }
    await errorFixer.collectLoadInfo();
    errorFixer.overrider.baseOverrides = workingOverrides;
    const fixedIdx = await errorFixer.fix();
    const result = {
        fixedIdx: fixedIdx,
        stage: stage,
        success: true,
        results: errorFixer.results
    }
    if (options.optimized)
        errorFixer.updateRules();
    errorFixer.overrider.flushCache();
    errorFixer.finish();
    return {
        result: result,
        log: errorFixer.log,
        workingOverrides: errorFixer.overrider.popWorkingOverrides()
    }
}

async function enableFields(client) {
    await client.send('Network.enable');
    await client.send('Runtime.enable');
    await client.send('Debugger.enable');
    await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
    await sleep(100);
}

(async function(){
    // * Step 0: Prepare for running
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page")
        .option('-o, --optimized', "Apply a fix decider for runtime optimization")
        
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
        await enableFields(client);
        const timeout = options.wayback ? 200*1000 : 30*1000;
        
        let results = {}, logs = {};
        // * Step 2: Load the page
        const loadFunc = async () => {await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: timeout
        })}
        let {result, log, workingOverrides: newWorkingOverrides} = await loadAndFix(url, page, client, 'load', options, loadFunc);
        workingOverrides = newWorkingOverrides;
        results['load'] = result;
        logs['load'] = log;
        await page.close();

        if (options.interaction && results['load']['fixedIdx'] == -1 ) {
            const {results: interactionResults, logs: interactionLogs} = await interaction(browser, urlStr, timeout, options);
            results = {...results, ...interactionResults};
            logs = {...logs, ...interactionLogs};
        }
        
        fs.writeFileSync(`${dirname}/results.json`, JSON.stringify(results, null, 2));
        fs.writeFileSync(`${dirname}/log.json`, JSON.stringify(logs, null, 2));
        
        if (options.manual)
            await eventSync.waitForReady();
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()