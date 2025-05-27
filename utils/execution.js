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

    constructor(cdp){
        this.client = cdp;
        this.reqTraceOn = false;
        this.writeTraceOn = false;
        this.requestStacks = new Map();
        this.writeStacks = new Map();
    }

    turnOnRequestTrace(){
        if (this.reqTraceOn)
            return;
        this.reqTraceOn = true;
        this.client.on('Network.requestWillBeSent', params => {
            this.onRequestStack(params);
        });
    }

    turnOnWriteTrace(){
        if (this.writeTraceOn)
            return;
        this.writeTraceOn = true;
        this.client.on('Runtime.consoleAPICalled', params => {
            this.onWriteStack(params);
        });
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

/**
 * Collect exceptions and failed fetches during loading the page.
 */
class ExcepFFHandler {

    constructor(cdp){
        this.client = cdp;
        this.excepTraceOn = false;
        this.ffTraceOn = false;

        this.exceptions = [];
        this.requestMap = {};
        this.failedFetches = [];
        this.excepFFDelta = [];
        this.excepFFTotal = {
            exceptions: [],
            failedFetches: []
        }
    }

    turnOnExcepTrace(){
        if (this.excepTraceOn)
            return;
        this.excepTraceOn = true;
        this.client.on('Runtime.exceptionThrown', params => this.onException(params))
    }

    turnOnFFTrace(){
        if (this.ffTraceOn)
            return;
        this.ffTraceOn = true;
        this.client.on('Network.requestWillBeSent', params => this.onRequest(params))
        this.client.on('Network.responseReceived', params => this.onFetch(params))
        this.client.on('Network.loadingFailed', params => this.onFailFetch(params))
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
        const method = this.requestMap[params.requestId] && this.requestMap[params.requestId].method;
        if (!method)
            return;
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

class FetchedResources {

    constructor(cdp){
        this.client = cdp;
        this.fetchTraceOn = false;
        this.requestMap = {}; // {requestId: Network.Request}
        this.responseMap = {}; // {requestId: Network.Response}

        this.receivedResources = [];
        this.textualResources = {};
        
    }

    turnOnFetchTrace(){
        if (this.fetchTraceOn)
            return;
        this.fetchTraceOn = true;

        const includeTypes = ['html', 'javascript', 'css', 'json', 'plain']
        this.client.on('Network.requestWillBeSent', (params) => {
            const { requestId, request } = params;
            if (request.url.includes('chrome-extension://'))
                return;
            if (request.url.includes('blob:'))
                return;
            this.requestMap[requestId] = request;
        });

        this.client.on('Network.responseReceived', (params) => {
            const { requestId, response } = params;
            const method = this.requestMap[params.requestId] && this.requestMap[params.requestId].method;
            if (!method)
                return;
            if (response.status / 100 > 2)
                return;
            const successObj = {
                url: response.url,
                method: method,
                status: response.status,
                mime: response.mimeType,
                resourceType: params.type,
                headers: response.headers
            }
            this.receivedResources.push(successObj);

            const mimeType = response.mimeType;
            let mimeToInclude = false;
            for (const targetType of includeTypes) {
                if (mimeType.includes(targetType)){
                    mimeToInclude = true;
                    break
                }
            }
            if (mimeToInclude)
                this.responseMap[requestId] = response;
        });

        this.client.on('Network.loadingFinished', async (params) => {
            const { requestId } = params;
            if (!this.responseMap[requestId])
                return;
            try {
                const { body, base64Encoded } = await this.client.send('Network.getResponseBody', { requestId });
                this.textualResources[this.responseMap[requestId].url] = body;
            } catch (e) { console.error(`Error on getResponseBody ${this.responseMap[requestId].url}: ${e}`)};
        });
    }
}


class InvariantObserver {
    constructor(){
        this.violations = [];
    }

    /**
     * 
     * @param {object} params from Runtime.consoleAPICalled
     */
    onViolation(params){
        const match = params.args[0].value && params.args[0].value.toString().match(/^Fidex .*/);
        if (!match)
            return;
        let ts = params.timestamp;
        const violation = params.args[0].value;
        const topFrame = params.stackTrace.callFrames[0]
        this.violations.push({
            ts: ts,
            description: violation,
            scriptURL: topFrame.url,
            line: topFrame.lineNumber,
            column: topFrame.columnNumber,
            stack: parseStack(params.stackTrace)        
        })
    }
}

module.exports = {
    parseStack,
    ExecutionStacks,
    ExcepFFHandler,
    FetchedResources,
    InvariantObserver,
}