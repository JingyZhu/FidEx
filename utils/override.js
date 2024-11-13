const puppeteer = require('puppeteer');
const fs  = require('fs');

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
        this.overrides = {};
    }

    async overriderHandler(params) {
        const { requestId, request, responseStatusCode } = params;
        const url = request.url;
        if (this.overrides[url]) {
            const overrideInfo = this.overrides[url];
            let resource = overrideInfo.source;
            let responseHeaders = params.responseHeaders ? params.responseHeaders : [];
            try{
                await this.client.send('Fetch.fulfillRequest', {
                    requestId: params.requestId,
                    responseCode: responseStatusCode,
                    responseHeaders: responseHeaders,
                    body: overrideInfo.plainText ? Buffer.from(resource).toString('base64') : resource
                });
                console.info("Overrider.overrideResources:", "Sent Fetch.fulfillRequest", url);
            } catch (e) {
                console.warn("Error: sending Fetch.fulfillRequest", e);
            }
        } else {
            await this.client.send('Fetch.continueRequest', { requestId: requestId })
        }
    }

    /**
     * @param {Object} mapping { url: OverrideInfo }
     */
    async overrideResources(mapping){
        this.overrides = mapping;
        await this.client.send('Fetch.enable', {
            patterns: [{
                urlPattern: '*',
                requestStage: 'Response',
            }]
        });
        console.log("Overrider.overrideResources:", "Overriding", Object.keys(this.overrides));

        this.client.on('Fetch.requestPaused', async (params) => {
            await this.overriderHandler(params);
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
    readOverrideInfo
}