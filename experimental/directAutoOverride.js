/**
 * Experimental code to automatically override the resources directly/
 * The way to override the resources is to use the Fetch.enable API to override the resources.
 * Compared to archiveAutoOverride.js, this script stores URLs directly in the directory instead of the needing to transform archifved URLs
 * Used more for proxy-mode or live web page crawls. Also offers request header override, and URLs "redirection".
 * To run this, first start a Chrome instance with remote debugging port enabled (at 9222), then run this script.
 */
const puppeteer = require("puppeteer");
const fs = require('fs');
const moment = require('moment');

const OVERRIDE_DIR = 'D:\\chrome-win64_130\\chrome-overrides';
const TIMESTAMP = '20241231'
const PATH_MAP = {};
const DEBUG = false;

function debug(...args){
    if (DEBUG)
        console.log(...args);
}

// Get all overrides in the directory used by Chrome
function getFileOverrides(dir){
    const files = [];
    let stack = fs.readdirSync(dir);
    while (stack.length > 0) {
        const file = stack.pop();
        const filePath = dir + '/' + file;
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            const subFiles = fs.readdirSync(filePath);
            stack = stack.concat(subFiles.map(f => file + '/' + f));
        } else {
            files.push(file);
            PATH_MAP[file] = filePath;
            if (file.endsWith('index.html'))
                PATH_MAP[file.substring(0, file.length - 10)] = filePath
        }
    }
}

async function overrideResponsesInDir(client) {
    getFileOverrides(OVERRIDE_DIR);
    const patterns = [];
    // Iterate k, v of PATH_MAP
    for (const [file_path, resource] of Object.entries(PATH_MAP)){
        let url = 'https?://' + file_path;
        patterns.push({
            urlPattern: url,
            resourceType: "",
            requestStage: "Response"
        })
    }
    const callback = (params) => {
        debug("ReqeustPaused on overrideResponsesInDir", params.request.url);
        // Remove the beginning  http:// or https://
        file = params.request.url.replace(/^https?:\/\//, '');
        if (!PATH_MAP[file])
            return {};
        const resource = fs.readFileSync(PATH_MAP[file]);
        return {
            responseCode: 200,
            responseHeaders: params.responseHeaders,
            body: Buffer.from(resource).toString('base64')
        };
    }
    return {
        patterns: patterns,
        callback: callback,
        stage: "Response"
    }
}

async function overrideHeaderTS(client){
    let patterns = [{
        urlPattern: '*',
        requestStage: 'Request',
    }]
    const timestamp = moment.utc(TIMESTAMP, "YYYYMMDDHHmmss").format("ddd, DD MMM YYYY HH:mm:ss [GMT]");
    console.log(`Overrider.overrideReqestTS: Overriding requests headers with Accept-Datetime: ${timestamp}`);
    const callback = (params) => {
        debug("ReqeustPaused on overrideHeaderTS", params.request.url);
        const { request } = params;
        let headers = request.headers;
        headers['Accept-Datetime'] = timestamp;
        let fetchHeaders = []
        for (const [key, value] of Object.entries(headers))
            fetchHeaders.push({name: key, value: value});
        return {
            headers: fetchHeaders
        }
    };
    return {
        patterns: patterns,
        callback: callback,
        stage: "Request"
    }
}

async function overrideResponsesMap(client) {
    const resourceMap = {
        "https://cdn.userway.org/widgetapp/2025-01-06-11-33-33/widget_app_base_1736163213276.js xxx": "https://cdn.userway.org/widgetapp/2024-12-23-09-27-55/widget_app_base_1734946075448.js",
        "https://static.klaviyo.com/onsite/js/runtime.c2fa93361c4305723baf.js?cb=1&v2-route=1": "https://static.klaviyo.com/onsite/js/runtime.2e57d1c55b996b57fc0b.js?cb=1&v2-route=1"
    }
    patterns = [];
    for (const url of Object.keys(resourceMap)){
        patterns.push({
            urlPattern: url,
            resourceType: "",
            requestStage: "Request"
        })
    }
    const callback = (params) => {
        debug("ReqeustPaused on overrideResponsesMap", params.request.url);
        if (!resourceMap[params.request.url])
            return {};
        const toURL = resourceMap[params.request.url];
        return {url: toURL};
    }
    return {
        patterns: patterns,
        callback: callback,
        stage: "Request"
    }
}


const overrideLists = [
    // overrideHeaderTS,
    overrideResponsesMap,
    // overrideResponsesInDir
];
async function overrideResources(client){
    let allPatterns = [], allCallbacks = {'Request': [], 'Response': []};
    let patterns, callback, stage;
    for (const override of overrideLists){
        ({patterns, callback, stage} = await override(client));
        allPatterns = allPatterns.concat(patterns);
        allCallbacks[stage].push(callback);
    }
    console.log("Send Fetch.enable", allPatterns);
    await client.send('Fetch.enable', {patterns: allPatterns});
    await client.on('Fetch.requestPaused', async (params) => {
        stage = params.requestStatusText ? "Response" : "Request";
        debug(`Request paused on ${stage}`, params.request.url);
        let overrideObj = {};
        for (const callback of allCallbacks[stage]){
            callbackObj = callback(params);
            overrideObj = {...overrideObj, ...callbackObj};
        }
        call = stage == 'Request' ? 'Fetch.continueRequest' : 'Fetch.fulfillRequest';
        try {
            await client.send(call, { requestId: params.requestId, ...overrideObj });
        } catch (e){
            if (stage == 'Response')
                console.error("Error on", call, e);
        }
    });
}

/**
 * Attach to an existing browser instance, scan all tha tabs and for every tab whenever gets navigated, add Fetch.enable to put all archived copy URLs into double slashes.
 */
(async function(){
    const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null
    });
    const pages = await browser.pages();
    for(let i = 0; i < pages.length; i++){
        const page = pages[i];
        console.log("Page " + i)
        const client = await page.target().createCDPSession();
        await client.send('Page.enable');
        await overrideResources(client);
        // Whenever a page is navigated, override the archived copy URLs
        client.on('Page.frameNavigated', async (frame) => {
            console.log("Frame navigated (existing)", `frame ${i}`)
            // Only run if the frame is the main frame
            if (!frame.parentId)
                await overrideResources(client);
        });
    }
    // for new page created, override the archived copy URLs
    browser.on('targetcreated', async (target) => {
        const page = await target.page();
        if (!page)
            return;
        console.log("New page created");
        const client = await page.target().createCDPSession();
        await client.send('Page.enable');
        await overrideResources(client);
        client.on('Page.frameNavigated', async (frame) => {
            console.log("Frame navigated (new)")
            if (!frame.parentId)
                await overrideResources(client);
        });
    });
})()