/**
 * This file contains functions to measure the fidelity of a page.
 * Measurement mainly contains collecting screenshots info, 
 * and exceptions and failed fetches during loading the page. 
 */
const { fail } = require('assert');
const fs = require('fs');
const { loadToChromeCTX, loadToChromeCTXWithUtils} = require('./load');
const { execSync } = require("child_process");
const { Puppeteer } = require('puppeteer');
const { parse: HTMLParse } = require('node-html-parser');

function identicalURL(liveURL, archiveURL){
    if (liveURL == archiveURL)
        return true;
    try {
        let _ = new URL(liveURL);
        _ = new URL(archiveURL);
    } catch { return false }
    
    let archiveURLObj = new URL(archiveURL);
    if (archiveURLObj.pathname.includes('http:') || archiveURLObj.pathname.includes('https:'))
        // Collect the last http:// or https:// part
        archiveURL = archiveURLObj.pathname.match(/(http:\/\/|https:\/\/)([\s\S]+)/)[0] + archiveURLObj.search;
    archiveURLObj = new URL(archiveURL);
    let liveURLObj = new URL(liveURL);
    if (archiveURLObj.hostname !== liveURLObj.hostname)
        return false;
    let archivePath = archiveURLObj.pathname.endsWith('/') ? archiveURLObj.pathname.slice(0, -1) : archiveURLObj.pathname;
    let livePath = liveURLObj.pathname.endsWith('/') ? liveURLObj.pathname.slice(0, -1) : liveURLObj.pathname;
    if (archivePath !== livePath)
        return false;
    if (archiveURLObj.search !== liveURLObj.search)
        return false;
    return true;
}

async function getDimensions(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/get_elem_dimensions.js`)
    const result = await page.evaluate(() => JSON.stringify(getDimensions()))
    return result;
}

async function maxWidthHeight(dimen) {
    dimensions = JSON.parse(dimen);
    let width = 0, height = 0;
    for (const k in dimensions) {
        const d = dimensions[k].dimension;
        if (d.width * d.height <= 0)
            continue;
        width = Math.max(width, d.right);
        height = Math.max(height, d.bottom);
    }
    return [width, height];
}

/**
 * Scroll to the bottom of the page.
 * @param {*} page 
 */
async function scroll(page) {
    const dimensions = await getDimensions(page);
    let [_, height] = await maxWidthHeight(dimensions);
    for (let i = 1; i * 1080 < height; i += 1) {
        await page.evaluate(() => window.scrollBy(0, 1080));
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Collect fidelity info of a page in a naive way.
 * @param {Puppeteer.page} page Page object of puppeteer.
 * @param {string} url URL of the page. 
 * @param {string} dirname 
 * @param {string} filename 
 * @param {object} options 
 */
async function collectNaiveInfo(page, dirname,
    filename = "dimension",
    options = { html: false }) {
    const dimensions = await getDimensions(page);
    let [width, height] = await maxWidthHeight(dimensions);
    
    if (options.html) {
        const html = await page.evaluate(() => {
            return document.documentElement.outerHTML;
        });
        fs.writeFileSync(`${dirname}/${filename}.html`, html);
    }

    // * Capture screenshot of the whole page
    // Scroll down the bottom of the page
    // for (let i = 1; i * 1080 < height; i += 1) {
    //     await page.evaluate(() => window.scrollBy(0, 1080));
    //     await new Promise(resolve => setTimeout(resolve, 1000));
    // }
    // await page.evaluate(() => window.scrollTo(0, 0));
    // await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({
        path: `${dirname}/${filename}.png`,
        clip: {
            x: 0,
            y: 0,
            width: width,
            height: height,
        }
    })
}


function _origURL(url){
    // Get part of URL that is after the last http:// or https://
    const matches = url.split(/(http:\/\/|https:\/\/)/);
    if (matches.length > 2) {
        const lastMatchIndex = matches.length - 2;
        const lastUrl = matches[lastMatchIndex] + matches[lastMatchIndex + 1];
        return lastUrl;
    }
    return '';
}

/**
 * Collect the render tree from the page
 * @param {iframe} iframe 
 * @param {object} parentInfo 
 * @param {boolean} replay Whether the render tree is collected on replay
 * @returns {object} renderTree {renderTree: [], renderHTML: string}
 */
async function collectRenderTree(iframe, parentInfo){
    // Wait until document.body is ready
    // await iframe.evaluate(async () => {
    //     while (document.body === null)
    //         await new Promise(resolve => setTimeout(resolve, 200));
    // });
    await loadToChromeCTXWithUtils(iframe, `${__dirname}/../chrome_ctx/render_tree_collect.js`);
    let renderTree = await iframe.evaluate(async () => {
        let waitCounter = 0;
        while (document.body === null) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCounter++;
            if (waitCounter > 1)
                return [];
        }
        _render_tree = _dfsVisible(document.body);
        _serializeRenderTree();
        return _render_tree_info;
    });
    // * Update attributes by considering relative dimension to parent frame
    for (const i in renderTree){
        let element = renderTree[i]
        let updateAttr = {
            xpath: parentInfo.xpath + element.xpath,
            dimension: element.dimension? {
                left: parentInfo.dimension.left + element.dimension.left,
                top: parentInfo.dimension.top + element.dimension.top,
                width: element.dimension.width,
                height: element.dimension.height
            } : null,
            depth: parentInfo.depth + element.depth,
        }
        renderTree[i] = Object.assign(renderTree[i], updateAttr);
    }
    // * Collect child frames
    let htmlIframes = {};
    for (let idx = 0; idx < renderTree.length; idx++){
        const element = renderTree[idx];
        const line = element['text'];
        // split line with first ":" to get tag name
        // console.log(line, line.split(/:([\s\S]+)/))
        // const tag = HTMLParse(line.split(/:([\s\S]+)/)[1].trim()).childNodes[0];
        const tag = HTMLParse(line.trim()).childNodes[0];
        if (tag.rawTagName === 'iframe'){
            htmlIframes[tag.getAttribute('src')] = {
                html: line,
                idx: idx,
                info: element
            }
        }
    }
    const childFrames = await iframe.childFrames();
    let childRenderTrees = [], childidx = [];
    for (const childFrame of childFrames){
        const childURL = childFrame.url();
        let htmlIframeURL = null;
        for (const url in htmlIframes){
            // url is suffix of childURL
            if (identicalURL(url, childURL)){
                htmlIframeURL = url;
                break;
            }
        }
        if (!htmlIframeURL)
            continue;
        let prefix = htmlIframes[htmlIframeURL].html.match(/^\s+/)
        prefix = prefix ? prefix[0] : '';
        let currentInfo = htmlIframes[htmlIframeURL].info;
        currentInfo = {
            xpath: parentInfo.xpath + currentInfo.xpath,
            dimension: {
                left: parentInfo.dimension.left + currentInfo.dimension.left,
                top: parentInfo.dimension.top + currentInfo.dimension.top,
            },
            prefix: parentInfo.prefix + '  ' + prefix,
            depth: parentInfo.depth + currentInfo.depth + 1,
        }
        try {
            const childInfo = await collectRenderTree(childFrame, currentInfo);
            childRenderTrees.push(childInfo.renderTree)
            childidx.push(htmlIframes[htmlIframeURL].idx);
        } catch {}
    }
    childidx.push(renderTree.length-1)
    let newRenderTree = renderTree.slice(0, childidx[0]+1)
    for(let i = 0; i < childRenderTrees.length; i++){
        newRenderTree = newRenderTree.concat(childRenderTrees[i], renderTree.slice(childidx[i]+1, childidx[i+1]+1));
    }
    let returnObj = {
        renderTree: newRenderTree
    }
    if (parentInfo.depth == 0) {
        let renderHTML = [];
        for (let i = 0; i < newRenderTree.length; i++){
            let element = newRenderTree[i];
            let line = element['text'];
            renderHTML.push(`${'  '.repeat(element.depth)}${i}:${line}`)
        }
        returnObj['renderHTML'] = renderHTML
    }

    return returnObj;
}

/**
 * Collect exceptions and failed fetches during loading the page.
 * TODO: Doesn't fit well with the current file. Might need to move to another file.
 */
class excepFFHandler {
    exceptions = [];
    requestMap = {};
    failedFetches = [];
    excepFFDelta = [];
    excepFFTotal = {
        exceptions: [],
        failedFetches: []
    }

    /**
     * Append exception details to the array when it is thrown.
     * @param {object} params from Runtime.exceptionThrown
     */
    async onException(params) {
        let ts = params.timestamp;
        let detail = params.exceptionDetails;
        let detailObj = {
            ts: ts,
            description: detail.exception.description,
            // text: detail.text,
            // script: detail.scriptId,
            id: detail.exceptionId,
            scriptURL: detail.url,
            line: detail.lineNumber,
            column: detail.columnNumber
        }
        // console.log(detailObj);
        this.exceptions.push(detailObj);
    }

    async onRequest(params) {
        this.requestMap[params.requestId] = params.request;
    }

    /**
     * Check if the fetch is a failed fetch.
     * @param {object} params from Network.responseReceived 
     */
    async onFetch(params) {
        let response = params.response;
        if (response.status / 100 < 4)
            return
        let failedObj = {
            url: response.url,
            mime: params.type,
            method: this.requestMap[params.requestId].method,
            status: response.status,
        }
        // console.log(failedObj);
        this.failedFetches.push(failedObj)
    }

    /**
     * Batch all exceptions and failed fetches into a the delta array, and label them with the interaction name.
     * @param {string/object} interaction Name of the interaction 
     */
    afterInteraction(interaction) {
        const exp_net_obj = {
            interaction: interaction,
            exceptions: this.exceptions,
            failedFetches: this.failedFetches
        }
        this.excepFFDelta.push(exp_net_obj);
        this.excepFFTotal.exceptions = this.excepFFTotal.exceptions
            .concat(this.exceptions);
        this.excepFFTotal.failedFetches = this.excepFFTotal.failedFetches
            .concat(this.failedFetches);
        this.exceptions = [];
        this.failedFetches = [];
    }
}


module.exports = {
    getDimensions,
    maxWidthHeight,
    scroll,
    collectNaiveInfo,
    collectRenderTree,
    excepFFHandler
}