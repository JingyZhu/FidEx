/**
 * Loading files from ../chrome_ctx to Chrome's execution context.
 */
const { clear } = require('console');
const fs = require('fs');
const os = require('os');
const puppeteer = require("puppeteer");

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
        browserSuffix: browserSuffix
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
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/clear_storage.js`);
    const result = await page.evaluate(() => deletaData());
    console.log("Clearing browser storage: ", result);
    page.close();
    return result;
}


async function loadToChromeCTX(page, file) {
    await page.evaluate(() => {loadUtils = false});
    const cdp = await page.target().createCDPSession();
    const script = fs.readFileSync(file, 'utf8');
    await cdp.send("Runtime.evaluate", {expression: script, includeCommandLineAPI:true});
    let loadUtils = await page.evaluate(() => loadUtils);
    if (loadUtils) {
        const utilScript = fs.readFileSync(`${__dirname}/../chrome_ctx/utils.js`, 'utf8')
        await page.evaluate(utilScript);
    }
}

async function loadToChromeCTXWithUtils(page, file) {
    const utilScript = fs.readFileSync(`${__dirname}/../chrome_ctx/utils.js`, 'utf8')
    await page.evaluate(utilScript);
    // const cdp = await page.target().createCDPSession();
    const script = fs.readFileSync(file, 'utf8');
    await page.evaluate(script);
    // await cdp.send("Runtime.evaluate", {expression: script, includeCommandLineAPI:true, contextId: contextId});
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

    loadToChromeCTX,
    loadToChromeCTXWithUtils,
    
    BrowserFetcher,
    browserFetcher
}