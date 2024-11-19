/**
 * This file contains functions to measure the fidelity of a page.
 * Measurement mainly contains collecting screenshots info, 
 * and exceptions and failed fetches during loading the page. 
 */
const fs = require('fs');
const { loadToChromeCTX, loadToChromeCTXWithUtils} = require('./load');
const { Puppeteer } = require('puppeteer');
const { parse: HTMLParse } = require('node-html-parser');
const eventSync = require('./event_sync');

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

class IframeIDs {
    // Initialize iframeIDs from htmliframe
    fromHTMLIframe(tag) {
        this.url = tag.getAttribute('src');
        this.id = tag.getAttribute('id') || tag.getAttribute('name');
        this.title = tag.getAttribute('title');
        return this;
    }

    // Initialize iframeIDs from CDPFrame
    async fromCDPFrame(frame) {
        this.url = frame.url();
        this.id = frame.name();
        this.title = await frame.title();
        return this;
    }

    match(other) {
        return identicalURL(this.url, other.url) 
                || this.id === other.id 
                || this.title === other.title;
    }
}

async function getEvalIframeFromPage(page) {
    let evalIframe = page;
    const urlStr = await page.evaluate(() => location.href);
    if (urlStr.includes('replayweb.page')) {
        evalIframe = await page.evaluateHandle(() => 
            document.querySelector("body > replay-app-main")
                .shadowRoot.querySelector("wr-item")
                .shadowRoot.querySelector("#replay")
                .shadowRoot.querySelector("div > iframe")
        )
        evalIframe = await evalIframe.contentFrame();
    }
    return evalIframe;
}

async function getDimensions(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/get_elem_dimensions.js`)
    let evalIframe = await getEvalIframeFromPage(page);
    const result = await evalIframe.evaluate(() => JSON.stringify(getDimensions()))
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

async function getPageDimension(page) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/get_elem_dimensions.js`)
    let evalIframe = await getEvalIframeFromPage(page);
    const result = await evalIframe.evaluate(() => getPageDimension())
    return result;
}

/**
 * Scroll to the bottom of the page.
 * @param {*} page 
 */
async function scroll(page) {
    /* The problem that timeout here is not directly related to scoll.
    Instead, it is very likely caused by previous JS execution (probably wirte_overrides)
    The JS is stuck in the page, so here there is the timeout.
    */
    let { height } = await getPageDimension(page);
    let evalIframe = await getEvalIframeFromPage(page);
    for (let i = 1; i * 1080 < height; i += 1) {
        await evalIframe.evaluate(() => window.scrollBy(0, 1080));
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    await evalIframe.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 500));
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
    // // ! TEMP
    // return;
    const start = new Date().getTime();
    const { width, height } = await getPageDimension(page);
    
    if (options.html) {
        let evalIframe = await getEvalIframeFromPage(page);    
        const html = await evalIframe.evaluate(() => {
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

    await page.setViewport({
        width: Math.max(width, 1920),
        height: Math.max(height, 1080)
    });

    await page.screenshot({
        path: `${dirname}/${filename}.jpg`,
        clip: {
            x: 0,
            y: 0,
            width: width,
            height: height,
        },
        optimizeForSpeed: true,
    })
    const end = new Date().getTime();
    console.log(`Measure: Collect Naive Info, Time: ${(end - start)/1000}s, width: ${width}, height: ${height}`);
}


async function interaction(page, cdp, excepFF, url, dirname, filename, options) {
    await loadToChromeCTX(page, `${__dirname}/../chrome_ctx/interaction.js`)
    // await cdp.send("Runtime.evaluate", {expression: "let eli = new eventListenersIterator();", includeCommandLineAPI:true});
    const urlStr = await page.evaluate(() => location.href);
    let contextId = null;
    if (urlStr.includes('replayweb.page')) 
        contextId = 5;

    const { exceptionDetails } = await cdp.send("Runtime.evaluate", {
        expression: "let eli = new eventListenersIterator();",
        includeCommandLineAPI: true,
        returnByValue: true,
        ...(contextId && { contextId }),
    });
    if (exceptionDetails) {
        console.error(`Exception: Interaction on Runtime.evaluate ${exceptionDetails.text}`);
        return [];
    }

    if (contextId) {
        const { result: eliDataResult } = await cdp.send("Runtime.evaluate", {
            expression: `
                (function() {
                    return {
                        listeners: eli.listeners,
                        origPath: eli.origPath
                    };
                })()
            `,
            contextId,
            returnByValue: true,
        });

        const eliData = eliDataResult.value;
        await page.evaluate(({ listeners, origPath }) => {
            window.eli = {
                listeners,
                origPath,
            };
        }, eliData);

        const { result: getElemIdCodeResult } = await cdp.send("Runtime.evaluate", {
            expression: `getElemId.toString()`, 
            contextId: global.__eval_iframe_exec_ctx_id, 
            returnByValue: true, 
        });

        const getElemIdCode = getElemIdCodeResult.value;
        await page.evaluate((funcCode) => {
            window.getElemId = eval(`(${funcCode})`);
        }, getElemIdCode);
    }
    const allEvents = await page.evaluate(() => {
        let serializedEvents = [];
        for (let idx = 0; idx < eli.listeners.length; idx++) {
            const event = eli.listeners[idx];
            let [elem, handlers] = event;
            orig_path = eli.origPath[idx]
            const serializedEvent = {
                idx: idx,
                element: getElemId(elem),
                path: orig_path,
                events: handlers,
                url: window.location.href,
             }
            serializedEvents.push(serializedEvent);
        }
        return serializedEvents;
    });
    const numEvents = allEvents.length;
    console.log("Interaction:", "Number of events", numEvents);
    if (typeof options.interaction === 'string')
        options.interaction = parseInt(options.interaction);
    console.log("Number of interactions", options.interaction);
    let numInteractions = typeof options.interaction === 'number' ? Math.min(options.interaction, 20) : 20;
    // * Incur a maximum of 20 events, as ~80% of URLs have less than 20 events.
    for (let i = 0; i < numEvents && i < numInteractions; i++) {
        let startTime = new Date().getTime();
        try {
            await page.waitForFunction(async (idx) => {
                    __tasks && __tasks.start();
                    await eli.triggerNth(idx);
                    return true;
                }, {timeout: 2000}, i)
        } catch(e) {}
        try {
            // If change timeout, also need to change capture_sync.js and event_sync.js correspondingly
            await eventSync.waitTimeout(Promise.all([page.waitForNetworkIdle(), eventSync.waitCaptureSync(page)]), 3000);
            if (options.manual)
                await eventSync.waitForReady();
        } catch(e) {
            console.error(`Exception: Interaction ${i} for ${url} \n ${e}`);
        }
        let t1 = new Date().getTime();
        // if (options.scroll)
        //     await measure.scroll(page);
        if (options.rendertree) {
            const rootFrame = page.mainFrame();
            const renderInfoRaw = await collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, false);
            fs.writeFileSync(`${dirname}/${filename}_${i}_dom.json`, JSON.stringify(renderInfoRaw.renderTree, null, 2));    
        }
        if (options.screenshot)
            await collectNaiveInfo(page, dirname, `${filename}_${i}`)
        let t2 = new Date().getTime();
        if (options.exetrace)
            excepFF.afterInteraction(`interaction_${allEvents[i].idx}`, allEvents[i]);
        console.log(`Interaction: Triggered interaction ${i}, Total: ${(t1 - startTime)/1000}s, URL: ${url}`);
    }
    return allEvents;
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
 * @param {boolean} visibleOnly If only visible elements are collected
 * @returns {object} renderTree {renderTree: [], renderHTML: string}
 */
async function collectRenderTree(iframe, parentInfo, visibleOnly=true) {
    // Wait until document.body is ready
    // await iframe.evaluate(async () => {
    //     while (document.body === null)
    //         await new Promise(resolve => setTimeout(resolve, 200));
    // });
    iframe = await getEvalIframeFromPage(iframe);

    await loadToChromeCTXWithUtils(iframe, `${__dirname}/../chrome_ctx/render_tree_collect.js`);
    let renderTree = await iframe.evaluate(async (visibleOnly) => {
        let waitCounter = 0;
        while (document.body === null) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCounter++;
            if (waitCounter > 1)
                return [];
        }
        const render_tree = visibleOnly? dfsVisible(document.body) : dfsAll(document.body);
        const render_tree_info = serializeRenderTree(render_tree);
        return render_tree_info;
    }, visibleOnly);
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
    let htmlIframes = [];
    for (let idx = 0; idx < renderTree.length; idx++){
        const element = renderTree[idx];
        const line = element['text'];
        // split line with first ":" to get tag name
        // console.log(line, line.split(/:([\s\S]+)/))
        // const tag = HTMLParse(line.split(/:([\s\S]+)/)[1].trim()).childNodes[0];
        const tag = HTMLParse(line.trim()).childNodes[0];
        if (tag && tag.rawTagName === 'iframe'){
            const iframeIDs = new IframeIDs().fromHTMLIframe(tag);
            htmlIframes.push([iframeIDs, {
                html: line,
                idx: idx,
                info: element
            }])
        }
    }
    const childFrames = await iframe.childFrames();
    let childRenderTrees = [];
    for (const childFrame of childFrames){
        let childFrameIDs = new IframeIDs();
        if (childFrame.isDetached())
            continue;
        await childFrameIDs.fromCDPFrame(childFrame);
        let htmlIframeIdx = -1;
        for (let i = 0; i < htmlIframes.length; i++){
            // url is suffix of childURL
            if (htmlIframes[i][0].match(childFrameIDs)){
                htmlIframeIdx = i;
                break;
            }
        }
        if (htmlIframeIdx == -1)
            continue;
        const htmlIframe = htmlIframes[htmlIframeIdx][1];
        let prefix = htmlIframe.html.match(/^\s+/)
        prefix = prefix ? prefix[0] : '';
        let currentInfo = htmlIframe.info;
        currentInfo.prefix = parentInfo.prefix + '  ' + prefix;
        try {
            const childInfo = await collectRenderTree(childFrame, currentInfo);
            // Potentially, idx could be overlapped
            childRenderTrees.push({idx: htmlIframe.idx, renderTree: childInfo.renderTree});
        } catch {}
    }
    childRenderTrees.sort((a, b) => a.idx - b.idx);
    childRenderTrees.push({idx: renderTree.length-1, renderTree: []});
    let newRenderTree = renderTree.slice(0, childRenderTrees[0].idx+1);
    for(let i = 0; i < childRenderTrees.length-1; i++){
        const childRenderTree = childRenderTrees[i].renderTree;
        const childIdx = childRenderTrees[i].idx, childIdxNext = childRenderTrees[i+1].idx;
        newRenderTree = newRenderTree.concat(childRenderTree, renderTree.slice(childIdx+1, childIdxNext+1));
    }
    let returnObj = {
        renderTree: newRenderTree
    }
    if (parentInfo.depth == 0) { // At top level
        let renderHTML = [];
        for (let i = 0; i < newRenderTree.length; i++){
            let element = newRenderTree[i];
            let line = element['text'];
            renderHTML.push(`${'  '.repeat(element.depth)}${i}:${line}`)
        }
        returnObj['renderHTML'] = renderHTML
        // * Switch stage to next
        iframe.evaluate(() => {
            if (!__current_stage)
                __current_stage = 'onload';
            else if (__current_stage == 'onload')
                __current_stage = 'interaction_0'
            else if (__current_stage.startsWith('interaction_'))
                __current_stage = `interaction_${parseInt(__current_stage.split('_')[1]) + 1}`
        });
    }

    return returnObj;
}


module.exports = {
    getEvalIframeFromPage,
    getDimensions,
    maxWidthHeight,
    scroll,
    collectNaiveInfo,
    collectRenderTree,
    interaction,
}