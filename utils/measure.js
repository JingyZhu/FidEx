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
        width = Math.max(width, d.right);
        height = Math.max(height, d.bottom);
    }
    return [width, height];
}

/**
 * Collect fidelity info of a page in a naive way.
 * @param {Puppeteer.page} page Page object of puppeteer.
 * @param {string} url URL of the page. 
 * @param {string} dirname 
 * @param {string} filename 
 * @param {object} options 
 */
async function collectFidelityInfo(page, url, dirname,
    filename = "dimension",
    options = { html: false, dimension: false }) {
    const dimensions = await getDimensions(page);
    let [width, height] = await maxWidthHeight(dimensions);
    // console.log(width, height);

    if (options.html) {
        const html = await page.evaluate(() => {
            return document.documentElement.outerHTML;
        });
        fs.writeFileSync(`${dirname}/${filename}.html`, html);
    }

    if (options.dimension) {
        const results = {
            "url": url,
            "dimensions": JSON.parse(dimensions)
        }
        fs.writeFileSync(`${dirname}/${filename}.json`, JSON.stringify(results, null, 2));
    }

    // * Method 1: Capture screenshot of the whole page
    for (let i = 1; i * 1080 < height; i += 1) {
        await page.evaluate(() => window.scrollBy(0, 1080));
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({
        path: `${dirname}/${filename}.png`,
        clip: {
            x: 0,
            y: 0,
            width: width,
            height: height,
        }
    })

    // * Method 2: Capture screenshot viewpoint by viewpoint, and merge
    // let all_images = [];
    // await page.screenshot({
    //     path: `${dirname}/${filename}_0.png`,
    //     clip: { 
    //         x: 0, 
    //         y: 0, 
    //         width: width, 
    //         height: 1080,
    //     }
    // })
    // all_images.push(`${dirname}/${filename}_0.png`);
    // // Scroll for lazy loading
    // for (let i = 1; i*1080 < height; i += 1) {
    //     await page.evaluate(() => window.scrollBy(0, 1080));
    //     await new Promise(resolve => setTimeout(resolve, 5000));
    //     await page.screenshot({
    //         path: `${dirname}/${filename}_${i}.png`,
    //         clip: { 
    //             x: 0, 
    //             y: i*1080, 
    //             width: width, 
    //             height: Math.min(1080, height - i*1080)
    //         }
    //     })
    //     all_images.push(`${dirname}/${filename}_${i}.png`);
    // }

    // // Merge all images vertically
    // execSync(`magick ${all_images.join(" ")} -append ${dirname}/${filename}.png`);

    // // Remove all images from disk
    // execSync(`rm ${all_images.join(" ")}`);
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
 */
async function collectRenderTree(iframe, parentInfo, replay=false){
    await loadToChromeCTXWithUtils(iframe, `${__dirname}/../chrome_ctx/render_tree_collect.js`);
    let renderHTML = await iframe.evaluate(() => _render_tree_text);
    let renderList = await iframe.evaluate(() => _node_info);
    // * Update attributes by considering relative dimension to parent frame
    for (const i in renderList){
        let element = renderList[i]
        let updateAttr = {
            xpath: parentInfo.xpath + element.xpath,
            dimension: element.dimension? {
                left: parentInfo.dimension.left + element.dimension.left,
                top: parentInfo.dimension.top + element.dimension.top,
                width: element.dimension.width,
                height: element.dimension.height
            } : null
        }
        renderList[i] = Object.assign(renderList[i], updateAttr);
    }
    // * Collect child frames
    let htmlIframes = {};
    for (let idx = 0; idx < renderHTML.length; idx++){
        const line = renderHTML[idx];
        // split line with first ":" to get tag name
        // console.log(line, line.split(/:([\s\S]+)/))
        const tag = HTMLParse(line.split(/:([\s\S]+)/)[1].trim()).childNodes[0];
        const info = renderList[idx]
        if (tag.rawTagName === 'iframe'){
            htmlIframes[tag.getAttribute('src')] = {
                html: line,
                idx: idx,
                info: info
            }
        }
    }
    const childFrames = await iframe.childFrames();
    let childHTMLs = [], childLists = [], childidx = [];
    for (const childFrame of childFrames){
        const childURL = replay ? _origURL(childFrame.url()) :  childFrame.url();
        if (!(childURL in htmlIframes))
            continue
        let prefix = htmlIframes[childURL].html.match(/^\s+/)
        prefix = prefix ? prefix[0] : '';
        let currentInfo = htmlIframes[childURL].info;
        currentInfo = {
            xpath: parentInfo.xpath + currentInfo.xpath,
            dimension: {
                left: parentInfo.dimension.left + currentInfo.dimension.left,
                top: parentInfo.dimension.top + currentInfo.dimension.top,
            },
            prefix: parentInfo.prefix + '  ' + prefix
        }
        const childInfo = await collectRenderTree(childFrame, currentInfo, replay);
        childHTMLs.push(childInfo.renderHTML);
        childLists.push(childInfo.renderList)
        childidx.push(htmlIframes[childURL].idx);
    }
    childidx.push(renderHTML.length-1)
    for (let idx = 0; idx < renderHTML.length; idx++)
        renderHTML[idx] = parentInfo.prefix + renderHTML[idx];
    let newRenderHTML = renderHTML.slice(0, childidx[0]+1)
    let newRenderList = renderList.slice(0, childidx[0]+1)
    for(let i = 0; i < childHTMLs.length; i++){
        newRenderHTML = newRenderHTML.concat(childHTMLs[i], renderHTML.slice(childidx[i]+1, childidx[i+1]+1));
        newRenderList = newRenderList.concat(childLists[i], renderList.slice(childidx[i]+1, childidx[i+1]+1));
    }
    return {
        renderHTML: newRenderHTML,
        renderList: newRenderList
    }
}

/**
 * Collect exceptions and failed fetches during loading the page.
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
     * @param {string} interaction Name of the interaction 
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
    collectFidelityInfo,
    collectRenderTree,
    excepFFHandler
}