/**
 * Load the archived page, check for any exceptions (caught and uncaught), and try to revert the write
 */
const puppeteer = require("puppeteer");
const fs = require('fs');
const os = require('os');
const { program } = require('commander');

const eventSync = require('../utils/event_sync');
const errorFix = require('./error-fix-rw');
const { Overrider, OverrideServer } = require('./overrider-rw');
const { loadToChromeCTX, BrowserFetcher, browserFetcher } = require('../utils/load');
const { logger } = require("../utils/logger");
const { fixDecider } = require('../error_match/fix-decider');

const HOME = os.homedir();
// * Used for recording patched overrides across different loads
var workingOverrides = {};
var overrideServer = null;
var interactionScript = fs.readFileSync(`${__dirname}/../chrome_ctx/interaction.js`, 'utf8');
var utilScript = fs.readFileSync(`${__dirname}/../chrome_ctx/utils.js`, 'utf8');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}

async function startChrome(chromeData=null){
    chromeData = chromeData || `../chrome_data`;
    const launchOptions = {
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
        // headless: 'new',
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
    const targetFrame = await errorFix.collectActualFrame(page)
    const initialEvents = await targetFrame.evaluate(serializeListeners);
    const initialNumEvents = initialEvents.length;
    logger.log("load_override.js:", "Number of events (initial)", initialNumEvents);

    const overrider = new Overrider(client, overrideServer, {overrides: workingOverrides});
    await overrider.overrideResources({});
    await Promise.all([client.send('Network.clearBrowserCookies'), 
                    client.send('Network.clearBrowserCache')]);
    const recorder = new errorFix.PageRecorder(page, client);
    recorder.prepareLogging();
    await loadAndCollectListeners();
    const patchEvents = await targetFrame.evaluate(serializeListeners);
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
                await targetFrame.waitForFunction(async (idx) => {
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
    let profile = {extraInteraction: {start: Date.now(), end: null}}
    const archiveOrigin = `http://${new URL(url).host}`;
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await enableFields(client);
    
    var contextIds = {}
    client.on('Runtime.executionContextCreated', event => {
        const context = event.context;
        if (context.origin === archiveOrigin) 
            contextIds[context.auxData.frameId] = context.id;
    })

    let results = {}, logs = {};
    const getBeforeFunc = (url, page, client, timeout, contextIds) =>  {
        return async () => {
            await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: timeout
            });
            const targetFrame = await errorFix.collectActualFrame(page);
            const targetContextId = contextIds[targetFrame._id];
            // * Currently puppeteer does not either support: creating CDPSession for a frame, and use inclideCommandLineAPI
            // * Cannot use loadToChromeCTX or loadToChromeCTXWithUtils
            await client.send("Runtime.evaluate", {expression: utilScript, includeCommandLineAPI:true, contextId: targetContextId});
            await client.send("Runtime.evaluate", {expression: interactionScript, includeCommandLineAPI:true, contextId: targetContextId});
            await client.send("Runtime.evaluate", {expression: "let eli = new eventListenersIterator();", includeCommandLineAPI:true, contextId: targetContextId});    
        }
    };
    const loadAndCollectListeners = getBeforeFunc(url, page, client, timeout, contextIds);
    const exEvtResult = await checkExtraEventsFidelity(page, client, options, loadAndCollectListeners);
    await page.close();
    profile['extraInteraction'].end = Date.now();
    if (exEvtResult.fixedIdx != -1) {
        return {
            results: {extraInteraction: exEvtResult},
            logs: {extraInteraction: []},
            profile: profile
        }
    } else if (exEvtResult.extraEvents.length > 0) {
        results['extraInteraction'] = exEvtResult;
        logs['extraInteraction'] = [];
    }
    

    // * Step 2: Trigger events
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    const initialEvents = exEvtResult.initialEvents;
    const initialNumEvents = initialEvents.length;
    for (let i = 0; i < initialNumEvents && i < 20; i++) {
        profile[`interaction_${i}`] = {start: Date.now(), end: null}
        if (options.optimized) {
            const decision = fixDecider.decideInteract(initialEvents[i]);
            if (!decision.couldBeFixed) {
                logger.verbose("load_override.js:", "Skipping event", i);
                continue;
            }
        }
        logger.verbose("load_override.js:", "Triggering events", i);
        let page = await browser.newPage();
        const client = await page.target().createCDPSession();
        var contextIds = {}
        client.on('Runtime.executionContextCreated', event => {
            const context = event.context;
            if (context.origin === archiveOrigin) 
                contextIds[context.auxData.frameId] = context.id;
        })
        await enableFields(client);
        const loadAndCollectListeners = getBeforeFunc(url, page, client, timeout, contextIds);   
        const triggerEvent = ((page, i) => {
            return async () => {
                const targetFrame = await errorFix.collectActualFrame(page);
                await targetFrame.waitForFunction(async (idx) => {
                    await eli.triggerNth(idx);
                    return true;
                }, {timeout: 10000}, i);
            }
        })(page, i)
        let {result, log} = await loadAndFix(url, page, client, 
                                                                `interaction_${i}`, options, triggerEvent, 
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
        if (options.optimized) {
            fixDecider.parseInteractionResult(result)
        }
        results[`interaction_${i}`] = result;
        logs[`interaction_${i}`] = log;
        profile[`interaction_${i}`].end = Date.now();
        await page.close();
        if (result.fixedIdx != -1)
            break
    }
    return {
        results: results,
        logs: logs,
        profile: profile
    }
}

/**
 * @returns {object} result: {fixedIdx, stage, success, results}, log: [], workingOverrides: {}
 */
async function loadAndFix(url, page, client, stage, options, loadFunc, 
                          {beforeFunc=null, workingOverrides={}}={}) {
    
    let errorFixer = new errorFix.ErrorFixer(page, client, overrideServer, {
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
    await client.send('Log.enable');
    await client.send('ServiceWorker.enable');
    await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
    await sleep(100);
}

(async function(){
    // * Step 0: Prepare for running
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page")
        .option('-o, --optimized <oid>', "Apply a fix decider for runtime optimization")
        .option('-c, --chrome_data <chrome_data>', "Directory of Chrome data")
        .option('-p, --port_overrider <port>', "Port number for overrider server", 3000)
        
    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    const browser = await startChrome(options.chrome_data);
    overrideServer = new OverrideServer(options.port_overrider);
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    
    const archiveHost = url.host;
    let crawlPage = await browser.newPage();
    const crawlClient = await crawlPage.target().createCDPSession();
    await enableFields(crawlClient);
    await crawlClient.send('Storage.clearDataForOrigin', 
                                { origin: `http://${archiveHost}`, storageTypes: 'all' })
    // * Load it one-time first to load the warc
    await crawlPage.goto(url, {
        waitUntil: 'networkidle0'
    })
    await sleep(5000);
    await crawlPage.goto(`http://${archiveHost}`, {
        waitUntil: 'networkidle0'
    })
    browserFetcher.setPage(crawlPage);

    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await enableFields(client);
    await  client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/',
    });
    await Promise.all([
                        client.send('Network.clearBrowserCookies'), 
                        client.send('Network.clearBrowserCache'),   
                        client.send('ServiceWorker.stopAllWorkers')
                    ]);
    // Avoid puppeteer from overriding dpr
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 0,
        mobile: false
    });
    
    let profile = {overall: {start: Date.now(), end: null}}
    try {
        const timeout = options.wayback ? 200*1000 : 60*1000;
        let results = {}, logs = {};
        profile['load'] = {start: Date.now(), end: null};
        // * Step 2: Load the page
        // Prevent from not actually navigation
        const beforeFunc = async () => {await page.goto(`http://${archiveHost}`, {
            waitUntil: 'networkidle0',
        })}
        const loadFunc = async () => {await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: timeout
        })}
        let {result, log, workingOverrides: newWorkingOverrides} = await loadAndFix(url, page, client, 'load', options, loadFunc, {beforeFunc: beforeFunc});
        if (!result['success'])
            throw new Error("load_override.js: Failed to load the page");
        workingOverrides = newWorkingOverrides;
        results['load'] = result;
        logs['load'] = log;
        profile['load'].end = Date.now();
        await page.close();

        if (options.interaction && results['load']['fixedIdx'] == -1 ) {
            const {results: interactionResults, logs: interactionLogs, profile: interactionProfile} = await interaction(browser, urlStr, timeout, options);
            results = {...results, ...interactionResults};
            logs = {...logs, ...interactionLogs};
            profile = {...profile, ...interactionProfile};
        }
        
        fs.writeFileSync(`${dirname}/results.json`, JSON.stringify(results, null, 2));
        fs.writeFileSync(`${dirname}/log.json`, JSON.stringify(logs, null, 2));
        
        if (options.manual)
            await eventSync.waitForReady();
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        await overrideServer.close();
        profile['overall'].end = Date.now();
        fs.writeFileSync(`${dirname}/profile.json`, JSON.stringify(profile, null, 2));
        process.exit();
    }
})()