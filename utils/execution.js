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
    requestStacks = [];
    writeStacks = [];
    
    constructor(){
        this.requestStacks = [];
        this.writeStacks = [];
    }

    /**
     * Collect stack trace when a request is sent
     * @param {object} params from Network.requestWillBeSent
     */
    onRequestStack(params){
        let requestStack = {
            url: params.request.url,
            stackInfo: []
        }
        let stack = params.initiator.stack;
        requestStack.stackInfo = parseStack(stack);
        this.requestStacks.push(requestStack);
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
        let writeStack = {
            writeID: wid,
            stackInfo: []
        }
        let stack = params.stackTrace;
        const stackInfo = parseStack(stack);
        if (!targetStack(stackInfo))
            return;
        writeStack.stackInfo = stackInfo;
        this.writeStacks.push(writeStack);
    }

    splitWriteStacks(fileprefix, maxSplit=1000) {
        for (let i = 0; i < this.writeStacks.length; i += maxSplit) {
            let splitStacks = this.writeStacks.slice(i, i+maxSplit);
            const range = `${this.writeStacks[i].writeID}-${this.writeStacks[Math.min(i+maxSplit, this.writeStacks.length)-1].writeID}`;
            const filename = `${fileprefix}_${range}.json`;
            fs.writeFileSync(filename, JSON.stringify(splitStacks, null, 2));
        }
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

module.exports = {
    parseStack,
    ExecutionStacks
}