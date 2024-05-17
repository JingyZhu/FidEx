/*
    Wrapper for node_write_override.js and node_write_collect.js.
    In record phase, Start the browser and load certain page

    Before recording, making sure that the collection 
    has already been created on the target browser extension

*/
const puppeteer = require("puppeteer");
const fs = require('fs');
const { program } = require('commander');

const eventSync = require('../utils/event_sync');
const { loadToChromeCTX, loadToChromeCTXWithUtils } = require('../utils/load');
const measure = require('../utils/measure');
const execution = require('../utils/execution');

const http = require('http');
const { exec } = require("child_process");
// Dummy server for enable page's network and runtime before loading actual page
try{
    http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('Hello World!');
    }).listen(8086);
} catch(e){}

let Archive = null;
let ArchiveFile = null;
const TIMEOUT = 300*1000;

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

async function clickDownload(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    await page.evaluate(archive => firstPageClick(archive), Archive)
    await sleep(500);
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    let pageTs = await page.evaluate(() => secondPageDownload());
    await eventSync.waitFile(`./downloads/${ArchiveFile}.warc`);
    return pageTs;
}
// This function assumes that the archive collection is already opened
// i.e. click_download.js:firstPageClick should already be executed
async function removeRecordings(page, topN) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/remove_recordings.js`)
    await page.evaluate(topN => removeRecording(topN), topN)
}

async function dummyRecording(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/start_recording.js`)
    const url = "http://localhost:8086"
    await page.evaluate((archive, url) => startRecord(archive, url), 
                        Archive, url);
}

async function getActivePage(browser) {
    var pages = await browser.pages();
    var arr = [];
    for (const p of pages) {
        let visible = await waitTimeout(
            p.evaluate(() => { 
                return document.visibilityState == 'visible' 
            }), 3000)
        if(visible) {
            arr.push(p);
        }
    }
    if(arr.length == 1) return arr[0];
    else return pages[pages.length-1]; // ! Fall back solution
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
        console.log("Record: Triggering interaction", i);
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
            console.log("Record: Collected render tree");    
            await measure.collectNaiveInfo(page, dirname, `${filename}_${i}`)
            console.log("Record: Collected screenshot");
            fs.writeFileSync(`${dirname}/${filename}_${i}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
        }  
    }
    return allEvents;
}

/*
    Refer to README-->Record phase for the detail of this function
*/
(async function(){
    // * Step 0: Prepare for running
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-a --archive <Archive>', 'Archive list to record the page', 'test')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page")
        .option('-w, --write', "Collect writes to the DOM")
        .option('-s, --screenshot', "Collect screenshot and other measurements")
        .option('-r, --remove', "Remove recordings after finishing loading the page")
        .option('--scroll', "Scroll to the bottom.")

    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    Archive = options.archive;
    let scroll = options.scroll == true;
    ArchiveFile = (() => Archive.toLowerCase().replace(/ /g, '-'))();
    
    // // * Update URL for potential redirection
    // const res = await fetch(urlStr);
    // urlStr = res.url;

    const browser = await startChrome();
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    if (fs.existsSync(`./downloads/${ArchiveFile}.warc`))
        fs.unlinkSync(`./downloads/${ArchiveFile}.warc`)
    
    let page = await browser.newPage();
    const client_0 = await page.target().createCDPSession();
    await  client_0.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/',
    });
    await Promise.all([client_0.send('Network.clearBrowserCookies'), 
                        client_0.send('Network.clearBrowserCache')]);
    
    try {
        
        // * Step 1-2: Input dummy URL to get the active page being recorded
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
            {waitUntil: 'load'}
        )
        await sleep(1000);
        await dummyRecording(page, url);
        await sleep(1000);
        
        let recordPage = await getActivePage(browser);
        if (!recordPage)
            throw new Error('Cannot find active page')
        // Avoid puppeteer from overriding dpr
        // ? Timeout doesn't alway work
        let networkIdle = recordPage.waitForNetworkIdle({
            timeout: 2*1000
        })
        await waitTimeout(networkIdle, 2*1000) 

        // * Step 3: Prepare and Inject overriding script
        const client = await recordPage.target().createCDPSession();
        let excepFF = new measure.excepFFHandler();
        let executionStacks = new execution.ExecutionStacks();
        // let executableResources = new execution.ExecutableResources();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1920,
            height: 1080,
            deviceScaleFactor: 0,
            mobile: false
        });

        client.on('Runtime.exceptionThrown', params => excepFF.onException(params))
        client.on('Runtime.consoleAPICalled', params => executionStacks.onWriteStack(params))
        client.on('Network.requestWillBeSent', params => {
            excepFF.onRequest(params);
            executionStacks.onRequestStack(params);
        })
        client.on('Network.responseReceived', params => excepFF.onFetch(params))
        // recordPage.on('response', async response => executableResources.onResponse(response));
        await sleep(1000);

        await preventNavigation(recordPage);
        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await recordPage.evaluateOnNewDocument(script);
        if (options.write)
            await recordPage.evaluateOnNewDocument("__trace_enabled = true");
        // // Seen clearCache Cookie not working, can pause here to manually clear them
        // await eventSync.waitForReady();
        // * Step 4: Load the page
        await recordPage.goto(
            url,
            {
                waitUntil: 'load',
                timeout: TIMEOUT
            }
        )
        
        // * Step 5: Wait for the page to finish loading
        // ? Timeout doesn't alway work, undeterminsitically throw TimeoutError
        try {
            networkIdle = recordPage.waitForNetworkIdle({
                timeout: TIMEOUT
            })
            await waitTimeout(networkIdle, TIMEOUT); 
        } catch {}
        if (scroll)
            await measure.scroll(recordPage);

        if (options.manual)
            await eventSync.waitForReady();
        else
            await sleep(1000);
        excepFF.afterInteraction('onload');
        
        // * Step 6: Collect the writes to the DOM
        // ? If seeing double-size writes, maybe caused by the same script in tampermonkey.
        if (options.write){
            await loadToChromeCTXWithUtils(recordPage, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
            const writeLog = await recordPage.evaluate(() => {
                return {
                    writes: __final_write_log_processed,
                    rawWrites: __raw_write_log_processed
                }
            });
            fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_requestStacks.json`, JSON.stringify(executionStacks.requestStacks, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_writeStacks.json`, JSON.stringify(executionStacks.writeStacks, null, 2));
            // fs.writeFileSync(`${dirname}/${filename}_resources.json`, JSON.stringify(executableResources.resources, null, 2));
        }

        // * Step 7: Collect the screenshots and all other measurement for checking fidelity
        if (options.screenshot){
            const rootFrame = recordPage.mainFrame();
            const renderInfo = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0});
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(recordPage, dirname, filename);
            fs.writeFileSync(`${dirname}/${filename}.html`, renderInfo.renderHTML.join('\n'));
            fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
        }

        // * Step 8: Interact with the webpage
        if (options.interaction){
            const allEvents = await interaction(recordPage, client, excepFF, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }
        const finalURL = recordPage.url();
        fs.writeFileSync(`${dirname}/${filename}_exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
        await recordPage.close();
        
        // * Step 9: Download recorded archive
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/replay/index.html",
            {waitUntil: 'load'}
        )
        await sleep(500);
        let ts = await clickDownload(page);
        
        // * Step 10: Remove recordings
        if (options.remove)
            await removeRecordings(page, 0)

        // ! Signal of the end of the program
        console.log("recorded page:", JSON.stringify({ts: ts, url: finalURL}));
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()