/*
    Automated record phase for the web archive record-replay    

    Before recording, making sure that the collection 
    has already been created on the target browser extension
*/
const fs = require('fs');
const http = require('http');

const eventSync = require('../utils/event_sync');
const { startChrome, 
    loadToChromeCTX, 
    loadToChromeCTXWithUtils, 
    clearBrowserStorage 
  } = require('../utils/load');
const measure = require('../utils/measure');
const { recordReplayArgs } = require('../utils/argsparse');
const execution = require('../utils/execution');


// Dummy server for enable page's network and runtime before loading actual page
let PORT = null;
try{
    const server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('Hello World!');
    });
    server.listen(0, () => {
        PORT = server.address().port;       
    })
} catch(e){}

let Archive = null;
let ArchiveFile = null;
let downloadPath = null;
const TIMEOUT = 60*1000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}


async function clickDownload(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    await page.evaluate(archive => firstPageClick(archive), Archive)
    await sleep(500);
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    let pageTs = await page.evaluate(() => secondPageDownload());
    await eventSync.waitFile(`${downloadPath}/${ArchiveFile}.warc`);
    return pageTs;
}
// This function assumes that the archive collection is already opened
// i.e. click_download.js:firstPageClick should already be executed
async function removeRecordings(page, topN) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/remove_recordings.js`)
    await page.evaluate(topN => removeRecording(topN), topN)
}

async function dummyRecording(page) {
    await page.waitForSelector('archive-web-page-app');
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/start_recording.js`)
    while (!PORT) {
        await sleep(500);
    }
    const url = `http://localhost:${PORT}`
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
    console.log("Record:", "Number of events", numEvents);
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
        if (options.exetrace)
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
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, true);
            const renderInfoRaw = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
            await measure.collectNaiveInfo(page, dirname, `${filename}_${i}`)
            fs.writeFileSync(`${dirname}/${filename}_${i}_layout.json`, JSON.stringify(renderInfo.renderTree, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_${i}_dom.json`, JSON.stringify(renderInfoRaw.renderTree, null, 2));
        }
    }
    return allEvents;
}

/*
    Refer to README-->Record phase for the detail of this function
*/
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
    
    Archive = options.archive;
    ArchiveFile = (() => Archive.toLowerCase().replace(/ /g, '-'))();
    
    const headless = options.headless ? "new": false;
    const { browser } = await startChrome(options.chrome_data, headless);
    downloadPath = options.download;
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    if (!fs.existsSync(downloadPath))
        fs.mkdirSync(downloadPath, { recursive: true });
    if (fs.existsSync(`${downloadPath}/${ArchiveFile}.warc`))
        fs.unlinkSync(`${downloadPath}/${ArchiveFile}.warc`)
    
    let page = await browser.newPage();
    const client_0 = await page.target().createCDPSession();
    await  client_0.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    });
    await clearBrowserStorage(browser);
    try {
        
        // * Step 1-2: Input dummy URL to get the active page being recorded
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/index.html",
            {waitUntil: 'load'}
        )
        await sleep(1000);
        await dummyRecording(page, url);
        await sleep(1000);
        
        let recordPage = await getActivePage(browser);
        if (!recordPage)
            throw new Error('Cannot find active page')
        // ? Timeout doesn't alway work
        let networkIdle = recordPage.waitForNetworkIdle({
            timeout: 2*1000
        })
        await waitTimeout(networkIdle, 2*1000) 

        // * Step 3: Prepare and Inject overriding script
        const client = await recordPage.target().createCDPSession();
        // let executableResources = new execution.ExecutableResources();
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Debugger.enable');
        await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
        // Avoid puppeteer from overriding dpr
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1920,
            height: 1080,
            deviceScaleFactor: 0,
            mobile: false
        });

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
        // recordPage.on('response', async response => executableResources.onResponse(response));
        await sleep(1000);

        await preventNavigation(recordPage);
        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await recordPage.evaluateOnNewDocument(script);
        if (options.exetrace)
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
        console.log("Record: Start loading the actual page");
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
        if (options.exetrace)
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
        }

        // * Step 7: Collect execution traces
        if (options.exetrace) {
            fs.writeFileSync(`${dirname}/${filename}_requestStacks.json`, JSON.stringify(executionStacks.requestStacks, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_writeStacks.json`, JSON.stringify(executionStacks.writeStacks, null, 2));
            // fs.writeFileSync(`${dirname}/${filename}_resources.json`, JSON.stringify(executableResources.resources, null, 2));
        }

        // * Step 8: Collect the screenshots and all other measurement for checking fidelity
        if (options.screenshot){
            const rootFrame = recordPage.mainFrame();
            const renderInfo = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, true);
            const renderInfoRaw = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(recordPage, dirname, filename);
            fs.writeFileSync(`${dirname}/${filename}_layout.json`, JSON.stringify(renderInfo.renderTree, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_dom.json`, JSON.stringify(renderInfoRaw.renderTree, null, 2));
        }
        const onloadURL = recordPage.url();

        // * Step 9: Interact with the webpage
        if (options.interaction){
            const allEvents = await interaction(recordPage, client, excepFF, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }
        const finalURL = recordPage.url();
        if (options.exetrace)
            fs.writeFileSync(`${dirname}/${filename}_exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
        await recordPage.close();
        
        // * Step 10: Download recorded archive
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/index.html",
            {waitUntil: 'load'}
        )
        await sleep(500);
        let ts = await clickDownload(page);
        
        // * Step 11: Remove recordings
        if (options.remove)
            await removeRecordings(page, 0)

        // ! Signal of the end of the program
        console.log("recorded page:", JSON.stringify({ts: ts, url: onloadURL}));
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()