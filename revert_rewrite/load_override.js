/**
 * Load the archived page, check for any exceptions (caught and uncaught), and try to revert the write
 */
const puppeteer = require("puppeteer");
const fs = require('fs');
const { program } = require('commander');

const eventSync = require('../utils/event_sync');
const errorFix = require('./error-fix');
const { loadToChromeCTX } = require('../utils/load');

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
 * 
 * @returns {object} A mapping from interaction id to their metadata
 */
async function interaction(browser, url, dirname, timeout, options) {
    // * Step 1: Collect number of events
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await enableFields(client);
    let results = {}, logs = {};
    const loadAndCollectListeners = async (page, client) => {
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: timeout
        });
        await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/interaction.js`)
        await client.send("Runtime.evaluate", {expression: "let eli = new eventListenersIterator();", includeCommandLineAPI:true});    
    }
    await loadAndCollectListeners(page, client);
    const allEvents = await page.evaluate(() => {
        let serializedEvents = [];
        for (let idx in eli.listeners) {
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
    });
    const numEvents = allEvents.length;
    console.log("Number of events", numEvents);
    await page.close();
    
    // * Step 2: Trigger events
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    for (let i = 0; i < numEvents && i < 5; i++) {
        let e = {};
        let page = await browser.newPage();
        const client = await page.target().createCDPSession();
        await enableFields(client);    
        const triggerEvent = async () => {
            console.log(page, i);
            await page.evaluate(async (idx) => {
                await eli.triggerNth(idx)
            }, i);
            await sleep(1000000)
            // await waitTimeout(p, 10000);
        }
        let {result, log} = await loadAndFix(url, page, client, `interaction_${i}`, dirname, options, triggerEvent, {beforeFunc: loadAndCollectListeners});
        console.log("e", e)
        result = {
            fixedIdx: result.fixedIdx,
            stage: `interaction_${i}`,
            events: allEvents[i],
            results: result.results
        }
        results[`interaction_${i}`] = result;
        logs[`interaction_${i}`] = log;
        await page.close();
    }
    return {
        results: results,
        logs: logs
    }
}


async function loadAndFix(url, page, client, stage, dirname, options, loadFunc, {beforeFunc=null}={}) {
    let errorFixer = new errorFix.ErrorFixer(page, client, {
                                                            dirname: dirname, 
                                                            manual: options.manual,
                                                            decider: options.optimized,
                                                            beforeReloadFunc: beforeFunc,
                                                            reloadFunc: loadFunc
                                                            });
    await errorFixer.recorder.prepareLogging();
    if(beforeFunc)
        await beforeFunc(page, client);                                                    
    await errorFixer.prepare(url, stage, exceptionType='all');
    await loadFunc(page, client);
    await errorFixer.collectLoadInfo();
    const fixedIdx = await errorFixer.fix();
    const result = {
        fixedIdx: fixedIdx,
        stage: stage,
        results: errorFixer.results
    }
    if (options.optimized)
        errorFixer.updateRules();
    errorFixer.overrider.flushCache();
    errorFixer.finish();
    return {
        result: result,
        log: errorFixer.log
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
        const timeout = options.wayback ? 200*1000 : 60*1000;
        
        let results = {}, logs = {};
        // * Step 2: Load the page
        // const loadFunc = async () => {await page.goto(url, {
        //     waitUntil: 'networkidle0',
        //     timeout: timeout
        // })}
        // const {result, log} = await loadAndFix(url, page, client, 'load', dirname, options, loadFunc);
        // results['load'] = result;
        // logs['load'] = log;
        await page.close();

        if (options.interaction) {
            const {results: interactionResults, logs: interactionLogs} = await interaction(browser, urlStr, dirname, timeout, options);
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