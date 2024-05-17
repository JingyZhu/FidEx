/**
 * Loading files from ../chrome_ctx to Chrome's execution context.
 */
const fs = require('fs');

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
    loadToChromeCTX,
    loadToChromeCTXWithUtils,
    BrowserFetcher,
    browserFetcher
}