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

async function overrideResponses(client) {
    getFileOverrides(OVERRIDE_DIR);
    const urlPatterns = [];
    // Iterate k, v of PATH_MAP
    for (const [file_path, resource] of Object.entries(PATH_MAP)){
        let url = 'https?://' + file_path;
        urlPatterns.push({
            urlPattern: url,
            resourceType: "",
            requestStage: "Response"
        })
    }
    console.log("Finished sending Fetch.enable");
    // * For debugging
    client.on('Fetch.requestPaused', async (params) => {
        debug("ReqeustPaused on response", params.request.url);
        // If stage is reqeust stage, return
        if (!params.responseStatusText)
            return;
        // Remove the beginning  http:// or https://
        file = params.request.url.replace(/^https?:\/\//, '');
        if (!PATH_MAP[file]) {
            try {
                await client.send("Fetch.continueRequest", {requestId: params.requestId});
                debug("continueRequest success on response", params.request.url);
            } catch (e) {}
            return;
        }
        const resource = fs.readFileSync(PATH_MAP[file]);
        try{
            await client.send('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: 200,
                responseHeaders: params.responseHeaders,
                body: Buffer.from(resource).toString('base64')
            });
            console.log("Sent Fetch.fulfillRequest", params.request.url);
        } catch (e) {
            console.warn("Error sending Fetch.fulfillRequest", e);
        }
    });
    return urlPatterns;
}

async function overrideHeaderTS(client){
    let patterns = [{
        urlPattern: '*',
        requestStage: 'Request',
    }]
    const timestamp = moment.utc(TIMESTAMP, "YYYYMMDDHHmmss").format("ddd, DD MMM YYYY HH:mm:ss [GMT]");
    console.log(`Overrider.overrideReqestTS: Overriding requests headers with Accept-Datetime: ${timestamp}`);
    client.on('Fetch.requestPaused', async (params) => {
        debug("ReqeustPaused on headers", params.request.url);
        const { requestId, request } = params;
        let headers = request.headers;
        headers['Accept-Datetime'] = timestamp;
        let fetchHeaders = []
        for (const [key, value] of Object.entries(headers))
            fetchHeaders.push({name: key, value: value});
        try {
            await client.send('Fetch.continueRequest', { requestId: requestId, headers: fetchHeaders });
            debug("continueRequest success on headers", params.request.url);
        } catch (e) {}
    });
    return patterns;
}

async function overrideResources(client){
    p1 = await overrideHeaderTS(client);
    p2 = await overrideResponses(client);
    const patterns = [...p1, ...p2];
    console.log("Send Fetch.enable", patterns);
    await client.send('Fetch.enable', {patterns: patterns});
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