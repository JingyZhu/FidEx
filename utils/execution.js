/**
 * Functions for collecting execution information.
 */
const fs = require('fs');

/**
 * Parse stack trace into a list of call frames.
 * Async calls should also be included.
 * @param {Runtime.StackTrace} stack
 * @returns {Array} An array of call frames. 
 */
function parseStack(stack){
    let stackInfo = []
    while (stack) {
        let callFrames = [];
        for (const callFrame of stack.callFrames) {
            callFrames.push({
                functionName: callFrame.functionName,
                url: callFrame.url,
                // line and column numbers are 0-based
                lineNumber: callFrame.lineNumber,
                columnNumber: callFrame.columnNumber
            })
        }
        stackInfo.push({
            description: stack.description,
            callFrames: callFrames
        })
        stack = stack.parent;
    }
    return stackInfo;
}

/**
 * Filter stack trace to remove unnecessary information.
 * @param {Object} stackInfo stackInfo from parseStack 
 * @returns {Boolean} Whether the stack should be kept.
 */
function targetStack(stackInfo) {
    let bottomFrames = stackInfo[stackInfo.length-1];
    let bottomFrame = bottomFrames.callFrames[bottomFrames.callFrames.length-1];
    if (bottomFrame.url.includes('chrome-extension://'))
        return false;
    return true;
}

class ExecutionStacks {

    constructor(){
        this.requestStacks = new Map();
        this.writeStacks = new Map();
    }

    /**
     * Collect stack trace when a request is sent
     * @param {object} params from Network.requestWillBeSent
     */
    onRequestStack(params){
        const url = params.request.url;
        let stack = params.initiator.stack;
        let stackInfo = parseStack(stack);
        if (params.initiator.url) {
            stackInfo.unshift({
                description: 'initiator',
                callFrames: [{
                    functionName: '',
                    url: params.initiator.url,
                    lineNumber: params.initiator.lineNumber || 0,
                    columnNumber: params.initiator.columnNumber || 0,
                }]
            })
        }
        const stackStr = JSON.stringify(stackInfo);
        if (!this.requestStacks.has(stackStr))
            this.requestStacks.set(stackStr, []);
        this.requestStacks.get(stackStr).push(url);
    }

    /**
     * Collect stack trace when a request is sent
     * @param {object} params from Runtime.consoleAPICalled
     */
    onWriteStack(params){
        if (params.type !== 'warning')
            return;
        // "wid {num}: 1" --> num
        const match = params.args[0].value && params.args[0].value.match(/^wid (.*)/);
        if (!match)
            return;
        const wid = match[1];
        let stack = params.stackTrace;
        const stackInfo = parseStack(stack);
        if (!targetStack(stackInfo))
            return;
        const stackStr = JSON.stringify(stackInfo);
        if (!this.writeStacks.has(stackStr))
            this.writeStacks.set(stackStr, []);
        this.writeStacks.get(stackStr).push(wid);
    }

    splitWriteStacks(fileprefix, maxSplit=1000) {
        for (let i = 0; i < this.writeStacks.length; i += maxSplit) {
            let splitStacks = this.writeStacks.slice(i, i+maxSplit);
            const range = `${this.writeStacks[i].writeID}-${this.writeStacks[Math.min(i+maxSplit, this.writeStacks.length)-1].writeID}`;
            const filename = `${fileprefix}_${range}.json`;
            fs.writeFileSync(filename, JSON.stringify(splitStacks, null, 2));
        }
    }

    requestStacksToList() {
        let list = [];
        for (const [stack, urls] of this.requestStacks) {
            list.push({
                stackInfo: JSON.parse(stack),
                urls: urls
            })
        }
        return list;
    }

    writeStacksToList() {
        let list = [];
        for (const [stack, wids] of this.writeStacks) {
            list.push({
                stackInfo: JSON.parse(stack),
                wids: wids
            })
        }
        return list;
    }
}

// ?? Currently not used since execution matching query for executables itself
class ExecutableResources {
    resources = {};
    constructor(){
        this.resources = [];
        this.filterList = ['image', 'video', 'audio', 'application/pdf']
    }

    async onResponse(response) {
        const request = response.request();
        const statuscode = response.status();
        if (statuscode >= 300) // Redirection
            return;
        // Check mime type of the response, if image or video, skip adding to resources
        const mime = response.headers()['content-type'];
        if (mime) {
            for (const filter of this.filterList) {
                if (mime.includes(filter)){
                    console.log("Filtered", request.url());
                    return;
                }
            }
        }
        let responseObj = {
            url: request.url(),
            status: statuscode,
            method: request.method(),
        }

        try {
            const responseBody = await response.text();
            responseObj['body'] = responseBody;
        } catch (err) {
            // console.log("\tGot exception on response.body", err.message, request.url());
            return;
        }
        this.resources[responseObj.url] = responseObj;
    }
}

/**
 * Collect exceptions and failed fetches during loading the page.
 */
class ExcepFFHandler {
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
        if (detail.stackTrace)
            detailObj.stack = parseStack(detail.stackTrace);
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

    async onFailFetch(params) {
        const url = this.requestMap[params.requestId] && this.requestMap[params.requestId].url;
        if (!url)
            return;
        let failedObj = {
            url: url,
            mime: params.type,
            method: this.requestMap[params.requestId].method,
            errorText: params.errorText,
            canceled: params.canceled,
            blockedReason: params.blockedReason,
            corsErrorStatus: params.corsErrorStatus && params.corsErrorStatus.corsError,
        }
        // console.log(failedObj);
        this.failedFetches.push(failedObj)
    }

    /**
     * Batch all exceptions and failed fetches into a the delta array, and label them with the interaction name.
     * @param {string} stage Name of the interaction.
     * @param {object} interaction Info of the interaction.
     */
    afterInteraction(stage, interaction) {
        const exp_net_obj = {
            stage: stage,
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
    parseStack,
    ExecutionStacks,
    ExcepFFHandler,
}