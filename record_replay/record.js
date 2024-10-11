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
    clearBrowserStorage,
    preventNavigation,
    preventWindowPopup, 
  } = require('../utils/load');
const measure = require('../utils/measure');
const { recordReplayArgs } = require('../utils/argsparse');
const execution = require('../utils/execution');
const { loggerizeConsole } = require('../utils/logger');

loggerizeConsole();
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


async function clickDownload(page, url=null) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    await page.evaluate(archive => firstPageClick(archive), Archive)
    await eventSync.sleep(500);
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/click_download.js`)
    let {recordURL, pageTs} = await page.evaluate((url) => secondPageDownload(url), url);
    await eventSync.waitFile(`${downloadPath}/${ArchiveFile}.warc`);
    return {ts: pageTs, recordURL: recordURL};
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
        await eventSync.sleep(500);
    }
    const url = `http://localhost:${PORT}`
    await page.evaluate((archive, url) => startRecord(archive, url), 
                        Archive, url);
}

async function getActivePage(browser) {
    var pages = await browser.pages();
    var arr = [];
    for (const p of pages) {
        let visible = await eventSync.waitTimeout(
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
    const { browser, chromeData } = await startChrome(options.chrome_data, headless);
    downloadPath = options.download ? options.download : `${chromeData}/Downloads`;
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
        await eventSync.sleep(1000);
        await dummyRecording(page, url);
        await eventSync.sleep(1000);
        
        let recordPage = await getActivePage(browser);
        if (!recordPage)
            throw new Error('Cannot find active page')
        // ? Timeout doesn't alway work
        let networkIdle = recordPage.waitForNetworkIdle({
            timeout: 2*1000
        })
        await eventSync.waitTimeout(networkIdle, 2*1000) 

        // * Step 3: Prepare and Inject overriding script
        const client = await recordPage.createCDPSession();
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
        await eventSync.sleep(1000);

        await preventNavigation(recordPage);
        await preventWindowPopup(recordPage);
        const nwoScript = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        const csScript = fs.readFileSync( `${__dirname}/../chrome_ctx/capture_sync.js`, 'utf8');
        await recordPage.evaluateOnNewDocument(nwoScript);
        await recordPage.evaluateOnNewDocument(csScript);
        if (options.exetrace)
            await recordPage.evaluateOnNewDocument("__trace_enabled = true");
        // // Seen clearCache Cookie not working, can pause here to manually clear them
        Error.stackTraceLimit = Infinity;

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
            await eventSync.waitTimeout(networkIdle, TIMEOUT); 
        } catch {}
        if (scroll)
            await measure.scroll(recordPage);

        if (options.manual)
            await eventSync.waitForReady();
        else
            await eventSync.waitCaptureSync(recordPage);
        if (options.exetrace)
            excepFF.afterInteraction('onload');


        // * Step 6: Collect the screenshots and all other measurement for checking fidelity
        if (options.rendertree){
            const rootFrame = recordPage.mainFrame();
            const renderInfoRaw = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
            fs.writeFileSync(`${dirname}/${filename}_dom.json`, JSON.stringify(renderInfoRaw.renderTree, null, 2));
        }
        if (options.screenshot)
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(recordPage, dirname, filename);

        const onloadURL = recordPage.url();

        // * Step 7: Interact with the webpage
        if (options.interaction){
            const allEvents = await measure.interaction(recordPage, client, excepFF, url, dirname, filename, options);
            if (options.manual)
                await eventSync.waitForReady();
            fs.writeFileSync(`${dirname}/${filename}_events.json`, JSON.stringify(allEvents, null, 2));
        }

        // * Step 8: Collect the writes to the DOM
        // ? If seeing double-size writes, maybe caused by the same script in tampermonkey.
        if (options.write){
            await loadToChromeCTXWithUtils(recordPage, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
            const writeLog = await recordPage.evaluate(() => { 
                collect_writes();
                return __write_log_processed;
            });
            fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
        }

        const finalURL = recordPage.url();
        await recordPage.close();

        // * Step 9: Collect execution traces
        if (options.exetrace) {
            fs.writeFileSync(`${dirname}/${filename}_exception_failfetch.json`, JSON.stringify(excepFF.excepFFDelta, null, 2));
            fs.writeFileSync(`${dirname}/${filename}_requestStacks.json`, JSON.stringify(executionStacks.requestStacksToList(), null, 2));
            fs.writeFileSync(`${dirname}/${filename}_writeStacks.json`, JSON.stringify(executionStacks.writeStacksToList(), null, 2));
            // fs.writeFileSync(`${dirname}/${filename}_resources.json`, JSON.stringify(executableResources.resources, null, 2));
        }
        
        // * Step 10: Download recorded archive
        await page.goto(
            "chrome-extension://fpeoodllldobpkbkabpblcfaogecpndd/index.html",
            {waitUntil: 'load'}
        )
        await eventSync.sleep(500);
        let {recordURL, ts} = await clickDownload(page, finalURL);
        
        // * Step 11: Remove recordings
        if (options.remove)
            await removeRecordings(page, 0)

        // ! Signal of the end of the program
        console.log("recorded page:", JSON.stringify({ts: ts, url: recordURL}));
    } catch (err) {
        console.error(`Record exception on ${urlStr}: ${err.stack}`);
    } finally {
        await browser.close();
        process.exit();
    }
})()