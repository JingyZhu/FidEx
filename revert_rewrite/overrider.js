const mime = require('mime');
const fetch = require('node-fetch');
const fs = require('fs');
const https = require('https');

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
    constructor(client, {wayback=false, overrides={}} = {}){
        this.client = client;
        this.syntaxErrorOverrides = {};
        this.networkOverrides = {};
        this.seenResponses = {};

        // * currentOverrides: Used to record the current overrides
        // * workingOverrides: If currentOverrideMapping can fix some errors, it will be merged into workingOverrides
        this.baseOverrides = overrides;
        this.currentOverrides = {};
        this.workingOverrides = {};
        this.wayback = wayback;
        if (wayback) {
            this.httpsAgent = new https.Agent({
                keepAlive: true, // Enable connection pooling
                maxSockets: 10,  // Maximum number of sockets to allow per host
            });
            if (!fs.existsSync('/tmp/.wayback_cache.json'))
                fs.writeFileSync('/tmp/.wayback_cache.json', JSON.stringify({}));
            this.waybackCache = JSON.parse(fs.readFileSync('/tmp/.wayback_cache.json'));
        }
    }

    replaceContentType(url, headers) {
        const path = new URL(url).pathname;
        const inferType = mime.getType(path);
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
        headers = this.replaceContentType(url, headers);
        const body = await response.buffer();
        return {
            statusCode: response.status,
            headers: headers,
            body: {body: body.toString('base64'), base64Encoded: true}
        }
    }

    /**
     * Fetch from Wayback
     * @returns {Object/null} response if fetch is successful, otherwise null
     */
    async fetchFromWayback(request) {
        let url = request.url;
        if (url in this.waybackCache) {
            return this.waybackCache[url];
        }
        url = reverter.addHostname(url, this.hostname);
        // Replace the https?://{hostname}/{coll}/ with http://web.archive.org/web/
        const waybackUrl = url.replace(/https?:\/\/[^/]+\/[^/]+\//, 'https://web.archive.org/web/');
        logger.verbose("Overrider.fetchFromWayback:", "Fetching", waybackUrl);
        let retry = 0
        while (retry < 3) {
            let response = null;
            try {
                response = await fetch(waybackUrl, {
                    agent: this.httpsAgent,
                    method: request.method, 
                    headers: request.headers
                });
                if (response.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retry++;
                    continue;
                }
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                retry++;
                continue;
            }
            let headers = []
            for (const [key, value] of response.headers)
                headers.push({name: key, value: value})
            const body = await response.buffer();
            this.waybackCache[url] = {
                statusCode: response.status,
                headers: headers,
                body: {body: body.toString('base64'), base64Encoded: true}
            }
            return this.waybackCache[url];
        }
        return null 
    }

    flushCache() {
        if (this.wayback)
            fs.writeFileSync('/tmp/.wayback_cache.json', JSON.stringify(this.waybackCache));
    }


    async nonOverrideHandler(params) {
        let url = params.request.url;
        let toFulFillRequest = {
            requestId: params.requestId,
            responseCode: params.responseCode ? params.responseCode : 200,
        };
        let toContinueRequest = {
            requestId: params.requestId
        }
        let ifFulFill = false;
        if (url in this.seenResponses) {
            const newUrl = reverter.addHostname(url, this.hostname);
            if (newUrl != url)
                toContinueRequest.url = newUrl;
        }
        if (this.wayback){
            // Fetch from Wayback
            const response = await this.fetchFromWayback(params.request);
            if (response !== null) {
                ifFulFill = true;
                toFulFillRequest = {
                    requestId: params.requestId,
                    responseCode: response.statusCode,
                    responseHeaders: response.headers,
                    body: response.body.body
                };
            }
        }
        if (!ifFulFill) {
            try {
                await this.client.send('Fetch.continueRequest', toContinueRequest);
            } catch {}
        } else {
            try {
                console.log("FULLFILL", toFulFillRequest)
                await this.client.send('Fetch.fulfillRequest', toFulFillRequest);
            } catch {}
        }
    }

    async overriderHandler(params, override) {
        const url = params.request.url;
        let resource = override.source;
        if (override.start && override.end) {
            const { body, base64Encoded } = this.seenResponses[url].body;
            let original = base64Encoded ? Buffer.from(body, 'base64').toString() : body;
            // * Replace original's start to end with resource
            const startIdx = reverter.loc2idx(original, override.start);
            const endIdx = reverter.loc2idx(original, override.end);
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
                body: override.plainText ? Buffer.from(resource).toString('base64') : resource
            });
            logger.verbose("Overrider.overrideResources:", "Sent Fetch.fulfillRequest", params.request.url);
        } catch (e) {
            logger.warn("Error: sending Fetch.fulfillRequest", e);
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
        let overrideMapping = {};
        let urlPatterns = [];
        for (const [url, resource] of Object.entries(this.baseOverrides))
            overrideMapping[url] = resource;
        for (const [url, resource] of Object.entries(this.syntaxErrorOverrides))
            overrideMapping[url] = resource;
        for (const [url, resource] of Object.entries(this.networkOverrides))
            overrideMapping[url] = resource;
        for (const [url, resource] of Object.entries(mapping))
            overrideMapping[url] = resource;
        this.currentOverrides = overrideMapping;
        if (this.wayback) {
            urlPatterns.push({
                urlPattern: '*',
                resourceType: '',
                requestStage: 'Request'
            })
        }
        for (const url in overrideMapping){
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
        logger.log("Overrider.overrideResources:", "Overriding", Object.keys(overrideMapping));

        this.client.on('Fetch.requestPaused', async (params) => {
            const url = params.request.url;
            if (!(url in overrideMapping))
                await this.nonOverrideHandler(params);
            else
                await this.overriderHandler(params, overrideMapping[url]);
        });
    }

    async clearOverrides(){
        await this.client.send('Fetch.disable');
        // Remove handler for Fetch.requestPause
        await this.client.removeAllListeners('Fetch.requestPaused');
        this.currentOverrides = {};
    }

    recordCurrentOverrides() {
        for (const [url, override] of Object.entries(this.currentOverrides)) {
            this.workingOverrides[url] = url in this.workingOverrides ? this.workingOverrides[url] : [];
            // If override contains only part of the resource, need to combine together for popWorkingOverrides
            // Deep copy the override
            let combinedOverride = JSON.parse(JSON.stringify(override));
            let resource = override.source;
            if (combinedOverride.start && combinedOverride.end) {
                const { body, base64Encoded } = this.seenResponses[url].body;
                let original = base64Encoded ? Buffer.from(body, 'base64').toString() : body;
                // * Replace original's start to end with resource
                const startIdx = reverter.loc2idx(original, override.start);
                const endIdx = reverter.loc2idx(original, override.end);
                resource = original.slice(0, startIdx) + resource + original.slice(endIdx);
                combinedOverride.source = resource;
                combinedOverride.start = null;
                combinedOverride.end = null;
            }
            this.workingOverrides[url].push(combinedOverride);
        }
    }

    popWorkingOverrides() {
        let workingOverrides = {};
        for (const [url, resources] of Object.entries(this.workingOverrides)) {
            // * Currently just pick the first resource to override
            // * A more ideal way is to merge the revert result from different overrides (if possible)
            workingOverrides[url] = resources[0]
        }
        return workingOverrides;
    }
} 


module.exports = {
    Overrider
}