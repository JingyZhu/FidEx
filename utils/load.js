/**
 * Loading files from ../chrome_ctx to Chrome's execution context.
 */
const fs = require('fs');
const os = require('os');
const puppeteer = require("puppeteer");
const assert = require('assert');

var FRAME_CTXID_MAP = new (class FrameCtxMap extends Map {
    set(params) {
        if (!( params 
            && params.context 
            && params.context.auxData 
            && params.context.auxData.frameId)) {
                return;
        }
        if (!params.context.auxData.isDefault)
            return;
        super.set(params.context.auxData.frameId, params.context.id);
    }

    get(frame) {
        const key = frame instanceof puppeteer.Frame ? frame._id : frame;
        return super.get(key);
    }
})();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChrome(chromeData=null, headless=false, proxy=null) {
    const HOME = os.homedir();
    chromeData = chromeData || `${HOME}/chrome_data/${os.hostname()}`;
    browserSuffix = chromeData.endsWith('/') ? chromeData.slice(0, -1) : chromeData;
    browserSuffix = browserSuffix.split('/').pop();
    let args = [
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
    ]
    if (proxy)
        args.push(`--proxy-server=${proxy}`);
    const launchOptions = {
        // other options (headless, args, etc)
        // executablePath: '/usr/bin/chromium-browser',
        args: args,
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: headless
    }
    const browser = await puppeteer.launch(launchOptions);
    return { 
        browser: browser, 
        chromeData: chromeData,
    }
}

/**
 * Found Network.clearBrowserCookies and Network.clearBrowserCache doesn't work, has to rely on chrome's UI
 * Another alternative way is to create a new tmp user-data-dir everytime for replay   
 * @param {puppeteer.Browser} browser
 * @returns {String} "Success" if success, otherwise error message
 */
async function clearBrowserStorage(browser) {
    const page = await browser.newPage();
    await page.goto('chrome://settings/clearBrowserData?search=cache');
    await sleep(100);
    await loadToChromeCTX(page.mainFrame(), `${__dirname}/../chrome_ctx/clear_storage.js`);
    const result = await page.evaluate(() => deletaData());
    console.log("Clearing browser storage: ", result);
    page.close();
    return result;
}

/**
 * Prevent Navigation and Popup (the next function)
 * @param {puppeteer.Page} page 
 */
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

async function preventWindowPopup(page) {
    await page.evaluateOnNewDocument(() => {
        const originalOpen = window.open;
        window.open = function(url, windowName, windowFeatures) {
            return null; // Or you could open a new tab instead
        };
    });
}


/**
 * Transform the iframe to the page
 * @param {frame} frame Frame to be transformed into page. 
 * @returns {page} The page object of the iframe
 */
function frameToPage(frame) {
    assert(frame instanceof puppeteer.Frame, "frameToPage: frame is not an instance of Puppeteer.Frame");
    return frame.page();
}

/**
 * Need to load at the CDP level, since getEventListeners is command line API, which can only be used in the CDP level
 * @param {puppeteer.Frame} frame 
 * @param {String} file file path of the script to load
 */
async function loadToChromeCTX(frame, file) {
    const page = frameToPage(frame);
    const cdp = await page.target().createCDPSession();
    const script = fs.readFileSync(file, 'utf8');

    const contextId = FRAME_CTXID_MAP.get(frame);
    await cdp.send("Runtime.evaluate", {expression: "loadUtils = false", includeCommandLineAPI: true, ...(contextId && { contextId })});
    await cdp.send("Runtime.evaluate", {expression: script, includeCommandLineAPI: true, ...(contextId && { contextId })});
    
    // * Check if loadUtils is changed by the script. If so, need to load utils.js
    const { result: loadUtilsResult } = await cdp.send('Runtime.evaluate', {
        expression: 'loadUtils',
        returnByValue: true,
        ...(contextId && { contextId }),
    });
    let loadUtils = loadUtilsResult.value;
    if (loadUtils) {
        const utilScript = fs.readFileSync(`${__dirname}/../chrome_ctx/utils.js`, 'utf8')
        await cdp.send("Runtime.evaluate", {expression: utilScript, includeCommandLineAPI: true, ...(contextId && { contextId })});
    }
}

async function loadToChromeCTXWithUtils(frame, file) {
    const page = frameToPage(frame);
    const cdp = await page.target().createCDPSession();
    
    const contextId = FRAME_CTXID_MAP.get(frame);
    
    const utilScript = fs.readFileSync(`${__dirname}/../chrome_ctx/utils.js`, 'utf8');
    await cdp.send("Runtime.evaluate", {expression: utilScript, includeCommandLineAPI: true, ...(contextId && { contextId })});
    
    const script = fs.readFileSync(file, 'utf8');
    await cdp.send("Runtime.evaluate", {expression: script, includeCommandLineAPI: true, ...(contextId && { contextId })});

    // const utilScript = fs.readFileSync(`${__dirname}/../chrome_ctx/utils.js`, 'utf8');
    // await page.evaluate(utilScript);
    // const script = fs.readFileSync(file, 'utf8');
    // await page.evaluate(script);
}

class BrowserFetcher {
    constructor({page=null}={}) {
        this.page = page;
    }

    setPage(page) {
        this.page = page;
    }

    async fetch(url) {
        const response = await this.page.evaluate(async (url) => {
            const response = await fetch(url);
            return response.text();
        }, url);
        return response;
    }
}

let browserFetcher = new BrowserFetcher();

module.exports = {
    startChrome,
    clearBrowserStorage,
    preventNavigation,
    preventWindowPopup,

    frameToPage,
    loadToChromeCTX,
    loadToChromeCTXWithUtils,
    
    BrowserFetcher,
    browserFetcher,

    FRAME_CTXID_MAP,
}