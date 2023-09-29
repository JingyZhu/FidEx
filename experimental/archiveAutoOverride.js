/**
 * Experimental code to automatically override the resources for archived copy URLs.
 * The reason why archived copy URLs need to be deliberately overridden is that it has double slashes in the URL, which will be treated as a single slash by the browser.
 * The way to override the resources is to use the Fetch.enable API to override the resources.
 * To run this, first start a Chrome instance with remote debugging port enabled (at 9222), then run this script.
 */
const puppeteer = require("puppeteer");
const fs = require('fs');

const HOSTNAME = "http://localhost";
const OVERRIDE_DIR = '/home/jingyz/chrome-overrides';
const PATH_MAP = {};

// Get all overrides in the directory used by Chrome
function getAllOverrides(dir){
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
            files.push('http://' + file);
            PATH_MAP['http://' + file] = filePath;
            if (file.endsWith('index.html')){
                files.push('http://' + file.substring(0, file.length - 10));
                PATH_MAP['http://' + file.substring(0, file.length - 10)] = filePath
            }
        }
    }
    return files;
}

async function overrideArchives(client) {
    const archivedCopyURLs = getAllOverrides(OVERRIDE_DIR);
    const urlPatterns = [];
    for (let i = 0; i < archivedCopyURLs.length; i++) {
        let url = archivedCopyURLs[i];
        const resourcePath = PATH_MAP[url];
        if (url.startsWith(HOSTNAME)) {
            // Replace URL's http:/ with http://, and https:/ with https:// only after the hostname
            // For example, "http://localhost:8080/eot/20230912213801/https:/nimhd.nih.gov/" should be "http://localhost:8080/eot/20230912213801/https://nimhd.nih.gov/"
            url = url.replace(/(https?:)(\/)([^/])/, '$1//$3');
        }
        PATH_MAP[url] = resourcePath;
        // Replace the first http: or https: with http?:
        url = url.replace(/^(https?:)/, 'http?:');
        urlPatterns.push({
            urlPattern: url,
            resourceType: "",
            requestStage: "Response"
        })
    }
    console.log("Send Fetch.enable", urlPatterns);
    await client.send("Fetch.enable", {
        patterns: urlPatterns
    });
    console.log("Finished sending");
    // * For debugging
    client.on('Fetch.requestPaused', async (params) => {
        console.log("ReqeustPaused", params.request.url);
        console.log(PATH_MAP, params.request.url)
        const resource = fs.readFileSync(PATH_MAP[params.request.url]);
        await client.send('Fetch.fulfillRequest', {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: params.responseHeaders,
            body: Buffer.from(resource).toString('base64')
        });
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
        await overrideArchives(client);
        // Whenever a page is navigated, override the archived copy URLs
        client.on('Page.frameNavigated', async (frame) => {
            console.log("Frame navigated 0")
            // Only run if the frame is the main frame
            if (!frame.parentId)
                await overrideArchives(client);
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
        await overrideArchives(client);
        client.on('Page.frameNavigated', async (frame) => {
            console.log("Frame navigated 1")
            // if (!frame.parentId)
            //     await overrideArchives(client);
        });
    });
})()