/**
 * Adapter for different environments when crawling the web
 */

const fs = require('fs');
const {FRAME_CTXID_MAP} = require('./load');
const eventSync = require('./event_sync');

class BaseAdapter {
    constructor(client) {
        this.client = client;
    }

    async initialize() {
        this.client.on('Runtime.executionContextCreated', params => { FRAME_CTXID_MAP.set(params) });
        // Adapter-specific initialization
    }

    async onloadSleep(start) {
        // Adapter-specific sleep after onload
    }

    async getMainFrame(page) {
        let frame = await page.mainFrame();
        return { mainFrame: frame }
    }

    writeAdapterInfo() {
        // Adapter-specific info writing
    }
}

class ReplayWebAdapter extends BaseAdapter {
    constructor(client, options={hostname: 'localhost:9990' }) {
        super(client);
        this.hostname = options.hostname;
        this.webResources = {};
    }

    async initialize() {
        await super.initialize();
        await this._collectWebResources();
    }

    async onloadSleep(start) {
        await eventSync.sleep(10000 - Date.now() + start);
    }

    async _collectWebResources() {
        let requestIDMaps = new Map();
        this.client.on('Network.requestWillBeSent', (params) => {
            const { requestId, request } = params;
            if (request.url.includes('chrome-extension://'))
                return;
            if (request.url.includes('blob:'))
                return;
            if (request.url.includes('https://replayweb.page') || request.url.includes(`http://${this.hostname}`)) {
                if (!request.url.includes('_/http'))  // hardcode to exclude replayweb.page resources
                    return;
            }
            requestIDMaps.set(requestId, request.url);
        });
        this.client.on('Network.responseReceived', (params) => {
            const { requestId, response } = params;
            const mimeType = response.mimeType;
            if (!mimeType.includes('text/html') && !mimeType.includes('application/javascript')){
                requestIDMaps.delete(requestId);
            }
        });
        this.client.on('Network.loadingFinished', async (params) => {
            const { requestId } = params;
            if (!requestIDMaps.has(requestId))
                return;
            try{
                const { body, base64Encoded } = await this.client.send('Network.getResponseBody', { requestId });
                if (base64Encoded) // skip media
                    return;
                if (requestIDMaps.get(requestId).includes('https://replayweb.page') || requestIDMaps.get(requestId).includes(`http://${this.hostname}`)) {
                    if (body.includes("<p>Sorry, this page was not found in this archive:</p>"))  // real-time 404 not-found resources have html responses
                        return;
                }
                this.webResources[requestIDMaps.get(requestId)] = body;
            } catch (e) { console.error(`!!! ${requestId} Error: ${e}`)};
        });
    }

    /**
     * Get main frame to eval from the page
     * Since replayweb.page is replaying within an iframe, need to catch it first
     * @param {Puppeteer.Page} page 
     */
    async getMainFrame(page) {
        const urlStr = await page.evaluate(() => location.href);
        let evalIframe = page;
        if (urlStr.includes('replayweb.page') || urlStr.includes(this.hostname)) {
            await evalIframe.waitForSelector("body > replay-app-main");
            evalIframe = await evalIframe.$("body > replay-app-main");
            evalIframe = await evalIframe.evaluateHandle(el => el.shadowRoot);

            await evalIframe.waitForSelector("wr-item");
            evalIframe = await evalIframe.$("wr-item");
            evalIframe = await evalIframe.evaluateHandle(el => el.shadowRoot);

            await evalIframe.waitForSelector("#replay");
            evalIframe = await evalIframe.$("#replay");
            evalIframe = await evalIframe.evaluateHandle(el => el.shadowRoot);

            await evalIframe.waitForSelector("div > iframe");
            evalIframe = await evalIframe.$("div > iframe");
            evalIframe = await evalIframe.contentFrame();
        }

        await page.evaluate(`document.querySelector("body > replay-app-main").shadowRoot.querySelector("nav").style.display = "none";`);
        await page.evaluate(`document.querySelector("body > replay-app-main").shadowRoot.querySelector("wr-item").shadowRoot.querySelector("nav").style.display = "none"`);
    
        return { mainFrame: evalIframe }
    }

    writeAdapterInfo(dirname, filename) {
        fs.writeFileSync(`${dirname}/${filename}_resources.json`, JSON.stringify(this.webResources, null, 2));
    }

}


module.exports = {
    BaseAdapter,
    ReplayWebAdapter,
}