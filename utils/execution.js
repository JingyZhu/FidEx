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

class executionStacks {
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

module.exports = {
    parseStack,
    executionStacks
}