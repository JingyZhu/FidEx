/**
 * Loading files from ../chrome_ctx to Chrome's execution context.
 */
const fs = require('fs');
const os = require('os');
const puppeteer = require("puppeteer");

async function startChrome(chromeData=null, headless=false) {
    const HOME = os.homedir();
    chromeData = chromeData || `${HOME}/chrome_data/${os.hostname()}`;
    browserSuffix = chromeData.endsWith('/') ? chromeData.slice(0, -1) : chromeData;
    browserSuffix = browserSuffix.split('/').pop();
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
            `--user-data-dir=${chromeData}`,
            '--enable-automation'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        // headless: 'new',
        headless: headless,
        downloadPath: `./downloads_${browserSuffix}/`
    }
    const browser = await puppeteer.launch(launchOptions);
    return { 
        browser: browser, 
        browserSuffix: browserSuffix
    }
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

    loadToChromeCTX,
    loadToChromeCTXWithUtils,
    
    BrowserFetcher,
    browserFetcher
}