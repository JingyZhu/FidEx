/**
 * Functions for collecting execution information.
 */

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
        if (params.type !== 'trace')
            return;
        let writeStack = {
            writeID: params.args[0].value,
            stackInfo: []
        }
        let stack = params.stackTrace;
        writeStack.stackInfo = parseStack(stack);
        this.writeStacks.push(writeStack);
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