const mime = require('mime');
const fetch = require('node-fetch');

const reverter = require('./reverter');
const { logger } = require('../utils/logger');

class OverrideInfo {
    /**
     * 
     * @param {string} source 
     * @param {object/null} start 
     * @param {object/null} end 
     * @param {Boolean} plainText 
     */
    constructor(source, start, end, plainText=false){
        this.source = source;
        this.start = start;
        this.end = end;
        this.plainText = plainText;
    }
}

class Overrider {
    constructor(client){
        this.client = client;
        this.syntaxErrorOverrides = {}
        this.networkOverrides = {}
        this.seenResponses = {}
    }

    replaceContentType(url, headers) {
        const inferType = mime.getType(url);
        if (inferType !== null) {
            let newHeaders = headers.filter(header => header.name.toLowerCase() != 'content-type');
            newHeaders.push({
                name: 'Content-Type',
                value: inferType
            });
            return newHeaders;
        };
        return headers;
    }

    /**
     * Fetch the resources ourselves with the request from Fetch.requestPaused
     * @param {*} request 
     */ 
    async fetch(request) {
        let url = request.url;
        const response = await fetch(url, {
            method: request.method, 
            headers: request.headers,
            redirect: 'manual'
        });
        let headers = []
        for (const [key, value] of response.headers)
            headers.push({name: key, value: value})
        headers = this.addContentType(url, headers);
        const body = await response.buffer();
        return {
            statusCode: response.status,
            headers: headers,
            body: {body: body.toString('base64'), base64Encoded: true}
        }
    }


    /**
     * @param {Object} mapping 
     * {url: {
     *   source: string,
     *   start: {line, column}, (null if not set)
     *   end: {line, column} (null if not set)
     * }}
     */
    async overrideResources(mapping){
        let totalMapping = {};
        let urlPatterns = [];
        for (const [url, resource] of Object.entries(this.syntaxErrorOverrides))
            totalMapping[url] = resource;
        for (const [url, resource] of Object.entries(this.networkOverrides))
            totalMapping[url] = resource;
        for (const [url, resource] of Object.entries(mapping))
            totalMapping[url] = resource;
        for (const url in totalMapping){
            const resourceType = '';
            const requestStage = 'Request';
            urlPatterns.push({
                urlPattern: url,
                resourceType: resourceType,
                requestStage: requestStage
            });
        }
        await this.client.send('Fetch.enable', {
            patterns: urlPatterns
        });
        logger.log("Overrider.overrideResources:", "Overriding", urlPatterns);

        this.client.on('Fetch.requestPaused', async (params) => {
            const url = params.request.url;
            if (!(url in this.seenResponses)) {
                this.seenResponses[url] = await this.fetch(params.request);
            }
            let resource = totalMapping[url].source;
            if (totalMapping[url].start && totalMapping[url].end) {
                const { body, base64Encoded } = this.seenResponses[url];
                console.log(url, base64Encoded)
                let original = base64Encoded ? Buffer.from(body, 'base64').toString() : body;
                // * Replace original's start to end with resource
                const startIdx = reverter.loc2idx(original, totalMapping[url].start);
                const endIdx = reverter.loc2idx(original, totalMapping[url].end);
                resource = original.slice(0, startIdx) + resource + original.slice(endIdx);
            }
            let responseHeaders = params.responseHeaders ? params.responseHeaders : [];
            responseHeaders = this.replaceContentType(url, responseHeaders);
            try{
                // TODO: For responseHeaders, if the content-type doesn't exist, need to add the content-type for restrict MIME
                await this.client.send('Fetch.fulfillRequest', {
                    requestId: params.requestId,
                    responseCode: 200,
                    responseHeaders: responseHeaders,
                    body: totalMapping[url].plainText ? Buffer.from(resource).toString('base64') : resource
                });
                logger.verbose("Overrider.overrideResources:", "Sent Fetch.fulfillRequest", params.request.url);
            } catch (e) {
                logger.warn("Error: sending Fetch.fulfillRequest", e);
            }
        });
    }

    async clearOverrides(){
        await this.client.send('Fetch.disable');
        // Remove handler for Fetch.requestPause
        await this.client.removeAllListeners('Fetch.requestPaused');
    }
}


module.exports = {
    Overrider
}