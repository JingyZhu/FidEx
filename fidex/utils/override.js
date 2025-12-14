const puppeteer = require('puppeteer');
const fs  = require('fs');
const moment = require('moment');

class OverrideInfo {
    /**
     * 
     * @param {string} source 
     * @param {Boolean} plainText 
     */
    constructor(source, plainText=false){
        this.source = source;
        this.plainText = plainText;
    }
}

class Overrider {
    constructor(client){
        this.client = client;
        this.url = null;
        this.documentSeen = 0;
        this.overrides = {};
    }

    async overriderHandler(params) {
        const { requestId, request, responseStatusCode } = params;
        let responseCode = responseStatusCode ? responseStatusCode : 200;
        const url = request.url;
        if (this.overrides[url]) {
            const overrideInfo = this.overrides[url];
            let resource = overrideInfo.source;
            let responseHeaders = params.responseHeaders ? params.responseHeaders : [];
            try{
                await this.client.send('Fetch.fulfillRequest', {
                    requestId: params.requestId,
                    responseCode: responseCode,
                    responseHeaders: responseHeaders,
                    body: overrideInfo.plainText ? Buffer.from(resource).toString('base64') : resource
                });
                console.info("Overrider.overrideResources:", "Sent Fetch.fulfillRequest", url);
            } catch (e) {
                console.warn("Error: sending Fetch.fulfillRequest", e);
            }
        } else {
            try {
               await this.client.send('Fetch.continueRequest', { requestId: requestId });
            } catch (e) {
                console.warn("Error: sending Fetch.continueRequest", e);
            }
        }
    }

    /**
     * @param {Object} mapping { url: OverrideInfo }
     */
    async overrideResources(mapping){
        this.overrides = mapping;
        let patterns = [];
        for (const url in this.overrides){
            patterns.push({
                urlPattern: url,
                requestStage: 'Response',
            })
        }
        await this.client.send('Fetch.enable', {patterns: patterns});
        console.log("Overrider.overrideResources:", "Overriding", Object.keys(this.overrides));

        this.client.on('Fetch.requestPaused', async (params) => {
            await this.overriderHandler(params);
        });
    }

    /**
     * 
     * @param {Fetch.requestPaused} requestPausedParams 
     */
    isPatchResource(requestPausedParams){
        const getDomain = (url) => {
            let domain = new URL(url).hostname;
            // Some domain could have more than 1 tld (e.g. co.uk) But just to be preservative
            return domain.split('.').slice(-2).join('.');
        }
        if (["Script"].includes(requestPausedParams.resourceType))
            return true;
        if (requestPausedParams.resourceType == 'Document' && this.url) {
            let reqURL = requestPausedParams.request.url;
            // if reqURL is different domain as this.URL
            let thisURLDomain = getDomain(this.url);
            let reqURLDomain = getDomain(reqURL);
            if (this.documentSeen > 0 && thisURLDomain != reqURLDomain) {
                this.documentSeen++;
                return true;
            }
        }
        return false;
    }

    /**
     * Add Accept-Datetime header to request
     * @param {str} timestamp 
     */
    async overrideReqestTS(timestamp, options={patchTimestamp: null}){
        let patterns = [{
            urlPattern: '*',
            requestStage: 'Request',
        }]
        let patchTimestamp = options.patchTimestamp || timestamp;
        await this.client.send('Fetch.enable', {patterns: patterns});
        console.log(`Overrider.overrideReqestTS: Overriding requests headers with Accept-Datetime: ${timestamp} & ${patchTimestamp}`);
        this.client.on('Fetch.requestPaused', async (params) => {
            this.documentSeen += params.resourceType == 'Document';
            const { requestId, request } = params;
            let headers = request.headers;
            if (this.isPatchResource(params))
                headers['Accept-Datetime'] = patchTimestamp;
            else
                headers['Accept-Datetime'] = timestamp;
            let fetchHeaders = []
            for (const [key, value] of Object.entries(headers))
                fetchHeaders.push({name: key, value: value});
            await this.client.send('Fetch.continueRequest', { requestId: requestId, headers: fetchHeaders });
        });
    }

    async clearOverrides(){
        await this.client.send('Fetch.disable');
        // Remove handler for Fetch.requestPause
        await this.client.removeAllListeners('Fetch.requestPaused');
        this.overrides = {};
    }
} 

/**
 * @param {puppeteer.CDPSession} client
 * @param {Object} mapping { url: OverrideInfo }
 */
async function overrideResources(client, mapping){
    let overrider = new Overrider(client);
    await overrider.overrideResources(mapping);
}

async function overrideReqestTS(client, timestamp, options={patchTimestamp: null, url: null}){
    let overrider = new Overrider(client);
    overrider.url = options.url;
    timestamp = moment.utc(timestamp, "YYYYMMDDHHmmss").format("ddd, DD MMM YYYY HH:mm:ss [GMT]");
    let patchTimestamp = options.patchTimestamp ? 
                moment.utc(options.patchTimestamp, "YYYYMMDDHHmmss").format("ddd, DD MMM YYYY HH:mm:ss [GMT]")
                : null;
    await overrider.overrideReqestTS(timestamp, {patchTimestamp});
    return overrider;
}

/**
 * @param {String} path
 * @returns {Object} {url: OverrideInfo} 
 */
function readOverrideInfo(path) {
    overrideJSON = JSON.parse(fs.readFileSync(path));
    let overrideInfos = {};
    for (const [url, overrideInfo] of Object.entries(overrideJSON)) {
        overrideInfos[url] = new OverrideInfo(overrideInfo.source, overrideInfo.plainText);
    }
    return overrideInfos;
}


module.exports = {
    Overrider,
    overrideResources,
    overrideReqestTS,
    readOverrideInfo
}