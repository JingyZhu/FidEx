const { fail } = require('assert');
const fs = require('fs');
const { loadToChromeCTX } = require('./load');

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

async function collectFidelityInfo(page, url, dirname, 
                                    filename="dimension", 
                                    options={html: false, dimension: false}) {
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
    // Lazy loading
    await page.evaluate(() => window.scrollTo(0, Number.MAX_SAFE_INTEGER));
    // Here I'd love to use page.waitForNetworkIdle() instead of something similar
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.screenshot({
        path: `${dirname}/${filename}.png`,
        // fullPage: true,
        clip: { 
            x: 0, 
            y: 0, 
            width: width, 
            height: height,
        }
    })
}


class excepFFHandler {
    exceptions = [];
    requestMap = {};
    failedFetches = [];
    excepFFDelta = [];
    excepFFTotal = {
        exceptions: [], 
        failedFetches: []
    }

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

    async onFetch(params) {
        let response = params.response;
        if (response.status / 100 < 4 )
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
    excepFFHandler
}