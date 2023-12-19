/*
    Experimental code to collect the stack when requests will be sent
*/
const puppeteer = require("puppeteer");
const { program } = require('commander');
const fs = require('fs');
const eventSync = require('../utils/event_sync');
const { loadToChromeCTXWithUtils } = require('../utils/load');
const execution = require('../utils/execution');

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
            '--user-data-dir=./chrome_data',
            '--enable-automation',
            // ! For debugging on a remote device (including host machine), need to set ssh forwarding
            '--remote-debugging-port=9222'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: false
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

/*
    Collect the stack when a request is sent
*/
function collectRequestStack(params){
    let requestStack = {
        url: params.request.url,
        stackInfo: []
    }
    let stack = params.initiator.stack;
    requestStack.stackInfo = execution.parseStack(stack);
    return requestStack;
}

/**
 * Collect stack trace when a node is written
 */
function collectWriteStack(params){
    let writeStack = {
        writeID: params.args[0].value,
        stackInfo: []
    }
    let stack = params.stackTrace;
    writeStack.stackInfo = execution.parseStack(stack);
    return writeStack;
}

(async function(){
    program
        .option('-u --url <url>', 'URL to load')
    program.parse();
    const options = program.opts();
    const browser = await startChrome();
    let page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 0,
        mobile: false
    });
    
    // * Enable different domains
    await client.send('Network.enable');
    await client.send('Debugger.enable');
    await client.send('Runtime.enable');
    await client.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });

    // * Log request stack
    let requestStacks = [];
    client.on('Network.requestWillBeSent', (params) => {
        const requestStack = collectRequestStack(params);
        requestStacks.push(requestStack);
    })

    // * Listening on console.trace
    let writeStacks = [];
    client.on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'trace'){
            const writeStack = collectWriteStack(params);
            writeStacks.push(writeStack);
        }
    })

    // * Override the node write function
    const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
    await page.evaluateOnNewDocument(script);
    await page.evaluateOnNewDocument("__trace_enabled = true");
    
    
    if (options.url){
        await page.goto(
            options.url,
            {waitUntil: 'load'}
        )
    }
    await eventSync.waitForReady();
    fs.writeFileSync(`requestStacks.json`, JSON.stringify(requestStacks, null, 2));
    fs.writeFileSync(`writeStacks.json`, JSON.stringify(writeStacks, null, 2));
    await browser.close();
    process.exit();
})()