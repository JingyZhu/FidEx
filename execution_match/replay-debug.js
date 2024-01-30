const assert = require("assert");

function filter_archive(url) {
    return url.replace(/^https?:\/\/[^\/]+\/[^/]+\/[^\/]+\/(https?.*)$/, "$1");
}

function skipJS(url) {
    const skipKeywords = [
        'static/wombat.js'
    ]
    for (const keyword of skipKeywords) {
        if (url.includes(keyword))
            return true;
    }
    return false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class ReplayDebugger {
    /**
     * 
     * @param {Object} CDPSession created from page.target().createCDPSession() 
     */
    constructor(client){
        this.client = client;
        this.breakpoints = {};
        this.debugStack = null; // Currently debug one stack at a time. May extend to multiple ones.
        this.maxMatchStack = {matched: [0, 0], stack: null};
        this.scriptURL = {};

        this.reason = null;
        this.keyLinesEntered = false;
    }

    /**
     * 
     * @param {Debugger.CallFrame} callFrames 
     * @param {Runtime.StackTrace} asyncTrace 
     * @returns 
     */
    _generateTraceSig(callFrames, asyncTrace) {
        let sig = [[]];
        for (const callFrame of callFrames) {
            const sciprtId = callFrame.location.scriptId;
            const url = filter_archive(this.scriptURL[sciprtId]);
            // Not considering wombat's file in stack
            if (skipJS(url))
                continue;
            const lineNumber = callFrame.location.lineNumber;
            const columnNumber = callFrame.location.columnNumber;
            sig[0].push(`${url}:${lineNumber}:${columnNumber}`)
        }
        let currentStack = asyncTrace;
        while (currentStack) {
            sig.push([]);
            for (const callFrame of currentStack.callFrames) {
                const url = filter_archive(callFrame.url);
                if (skipJS(url))
                    continue;
                const lineNumber = callFrame.lineNumber;
                const columnNumber = callFrame.columnNumber;
                sig[sig.length-1].push(`${url}:${lineNumber}:${columnNumber}`);
            }
            currentStack = currentStack.parent;
        }
        return sig;
    }

    /**
     * Match the input sig with the debugStack sig
     * @param {Array} sig 
     * @return {Array} Array of two values, 
     *                the first one is the number of totally matched stack frames,
     *                the second one is the number of matched call frames on the top overlapped stack.
     */
    matchSig(sig) {
        const equal = (a, b) => {
            if (a.length !== b.length)
                return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i])
                    return false;
            }
            return true;
        }
        let matched = [0, 0];
        for (let i = 0; i < sig.length && i < this.debugStack.length; i++) {
            let si = sig.length - i - 1, di = this.debugStack.length - i - 1;   
            if (equal(sig[si], this.debugStack[di])) {
                matched[0]++;
                continue;
            }
            for (let j = 0; j < sig[si].length && j < this.debugStack[di].length; j++) {
                let sj = sig[si].length - j - 1, dj = this.debugStack[di].length - j - 1;
                if (sig[si][sj] != this.debugStack[di][dj])
                    break;
                matched[1]++;
            }
            break;
        }
        return matched;
    }
    
    /**
     * Register function for event handlers and other preparations.
     */
    async register(targetWrite) {
        // Initialize debugStack
        this.debugStack = [];
        for (const stackInfo of targetWrite.stackInfo) {
            this.debugStack.push([]);
            for (const callFrame of stackInfo.callFrames) {
                const url = callFrame.live_url;
                const lineNumber = callFrame.archive_start[0];
                const columnNumber = callFrame.archive_start[1];
                this.debugStack[this.debugStack.length-1].push(`${url}:${lineNumber}:${columnNumber}`)
            }
        }

        console.log("debugStack", this.debugStack);
        this.client.on('Debugger.paused', async params => {
            this._handlePaused(params);
            await this.client.send('Debugger.resume');
        });

        this.client.on('Debugger.scriptParsed', params => {
            this.scriptURL[params.scriptId] = params.url;
        });

        await this.setBreakPoints([targetWrite]);
    }

    _handlePaused(params) {
        const {callFrames, asyncStackTrace} = params;
        const sig = this._generateTraceSig(callFrames, asyncStackTrace);
        const match = this.matchSig(sig);
        let maxMatch = this.maxMatchStack.matched;
        // console.log("Paused", sig, match)
        if (match[0] > maxMatch[0] || 
            (match[0] == maxMatch[0] && match[1] > maxMatch[1])) {
            this.maxMatchStack = {matched: match, stack: sig};
        }
    }

    /**
     * Set breakpoints from the writeStacks.
     * The writeStacks will also be parsed and stored with live stack trace.
     * @param {Array} writeStacks 
     */
    async setBreakPoints(writeStacks) {
        for (let write of writeStacks) {
            for (let stackInfo of write.stackInfo) {
                for (let callFrame of stackInfo.callFrames) {
                    const url = callFrame.live_url;
                    const lineNumber = callFrame.archive_start[0];
                    const columnNumber = callFrame.archive_start[1];
                    const sig = `${url}:${lineNumber}:${columnNumber}`;
                    if (sig in this.breakpoints)
                        continue
                    const args = {
                        lineNumber: lineNumber,
                        columnNumber: columnNumber,
                        urlRegex: `^https?://[^/]+/[^/]+/[^/]+/${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
                    }
                    const {breakpointId, locations} = await this.client.send('Debugger.setBreakpointByUrl', args)
                    this.breakpoints[sig] = {
                        breakpointId: breakpointId,
                        args: args
                    }
                }
            }
        }
    }

    async registerDebug() {
        const topMatched = this._getTopMatched();
        console.log("Reset breakpoints", topMatched);
        await this.resetBreakPoints([topMatched]);

        this.client.removeAllListeners('Debugger.paused');
        this.client.on('Debugger.paused', async params => {
            const { reason } = params;
            // * This should only be triggered after _handlePausedDebug is run
            if (reason == 'exception') {
                if (this.keyLinesEntered) {
                    const {callFrames, asyncStackTrace} = params;
                    const sig = this._generateTraceSig(callFrames, asyncStackTrace);
                    console.log("Seen exception", sig)
                    this.reason = {sig: sig, exception: params.data.description};
                    await this.client.send('Debugger.setBreakpointsActive', {active: false});
                    await this.client.send('Debugger.setPauseOnExceptions', {state: 'none'});
                }
                await this.client.send('Debugger.resume');
                return;
            }

            if (reason == 'other' && !this.keyLinesEntered) { // * Only resume if key lines are not entered
                const sig = this._generateTraceSig(params.callFrames, params.asyncStackTrace);
                if (this._sameSig(sig))
                    this._handlePausedDebug(params);
                else
                    await this.client.send('Debugger.resume');
            }
        });
    }

    async _handlePausedDebug(params) {
        this.keyLinesEntered = true;
        const {callFrames, asyncStackTrace, reason} = params;
        const sig = this._generateTraceSig(callFrames, asyncStackTrace);
        console.log("Paused Debug", reason, sig)
        // * This should be run once and only once.
        // // This prevent entering another pause handler while stepping.
        // this.client.removeAllListeners('Debugger.paused');
        await this.client.send('Debugger.setPauseOnExceptions', {state: 'all'});
        await sleep(1000);
        await this.client.send('Debugger.stepInto');
        while (this.reason == null) {
            await sleep(500);
            await this.client.send('Debugger.stepOver');
        }
        await this.client.send('Debugger.setBreakpointsActive', {active: false});
        this.keyLinesEntered = false;
        this.client.send('Debugger.resume');
    }

    /**
     * @return {String} Return the top matched stack trace.
     */
    _getTopMatched() {
        const m = this.maxMatchStack.matched;
        const lastMatchedTrace = this.debugStack[this.debugStack.length - m[0] - 1];
        console.log('lastMatchedTrace', lastMatchedTrace)
        return lastMatchedTrace[lastMatchedTrace.length - m[1]];
    }

    /**
     * Set only sig in sigs to be active, remove all other breakpoints.
     * @param {Array} sigs 
     */
    async resetBreakPoints(sigs) {
        for (const sig in this.breakpoints) {
            if (!sigs.includes(sig))
                await this.client.send(`Debugger.removeBreakpoint`, {breakpointId: this.breakpoints[sig].breakpointId});
        }
    }

    _sameSig(sig) {
        const stack = this.maxMatchStack.stack;
        if (stack.length != sig.length)
            return false;
        for (let i = 0; i < stack.length; i++) {
            if (stack[i].length != sig[i].length)
                return false;
            for (let j = 0; j < stack[i].length; j++) {
                if (stack[i][j] != sig[i][j])
                    return false;
            }
        }
        return true;
    }
}

module.exports = {
    ReplayDebugger
}

function testMatchSig() {
    const testcases = [
        {
            debugStack:[['1', '2', '3']],
            sig: [['2', '3']],
        },
        {
            debugStack:[['2', '3'], ['1', '2', '3']],
            sig: [['2'], ['1', '2', '3']],
        },
        {
            debugStack:[['2', '3'], ['1', '2', '3']],
            sig: [['3'], ['1', '2', '3']],
        }
    ]
    for (const testcase of testcases) {
        const rd = new ReplayDebugger({});
        rd.debugStack = testcase.debugStack;
        let match = rd.matchSig(testcase.sig);
        console.log(match);
    }
}