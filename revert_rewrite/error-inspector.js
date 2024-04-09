const { logger } = require('../utils/logger');
const reverter = require('./reverter');
const { filterArchive } = require('../error_match/fix-decider');

function skipJS(url) {
    const skipKeywords = [
        'wombat.js'
    ]
    for (const keyword of skipKeywords) {
        if (url.includes(keyword))
            return true;
    }
    return false;
}

class ExceptionInfo {
    /**
     * 
     * @param {string} type from data.className
     * @param {string} description from data.description
     * @param {boolean} uncaught from data.uncaught
     * @param {boolean} onConsole If the exception is shown on the console
     */
    constructor(type, description, uncaught, onConsole){
        this.type = type;
        this.description = description;
        this.frames = []; // [frame[var]]
        this.uncaught = uncaught;
        this.onConsole = onConsole;
    }

    addFrame(url, scriptId, line, column) {
        this.frames.push({
            scriptId: scriptId,
            /* Will be assigned later on errorHandler.collectLoad
            format: {source, start, end}*/
            source: null,
            url: url,
            line: line, // 0 indexed
            column: column, // 0 indexed
            vars: []
        });
    }

    /**
     * 
     * @param {Runtime.PropertyDescriptor} property 
     * @param {Debugger.Scope.type} scopeType
     * @param {string} proxyType If the property is proxied, decide which type it is proxied on (window, document, etc...)
     */
    addVar(property, scopeType, proxyType) {
        let frameVar = this.frames[this.frames.length-1].vars;
        frameVar.push({
            name: property.name,
            scopeType: scopeType,
            proxyType: proxyType,
            value: property.value
        });
        // console.log("Added var", frameVar[frameVar.length-1])
    }
}


class ErrorInspector {
    /**
     * 
     * @param {Object} client created from page.target().createCDPSession() 
     */
    constructor(client, { decider=null} = null){
        this.client = client;
        this.scriptInfo = {};
        this.resources = {};
        this.exceptions = [];
        this._seenExceptions = new Set();
        this.recordVar = true;

        this._requestURL = {};
        this.responses = {}; // {url: {status, headers, body}}
    
        this.decider = decider;
    }

    /**
     * Decide which type is the variable proxied on (window, document, etc...)
     */
    async _decideProxyType(variable, callFrame){
        if (!variable.value || !variable.value.description || !variable.value.description.startsWith('Proxy('))
            return null;
        let template = (name) => {
            let tocheck = ['window', 'document', 'location', 'opener', 'self', 'parent', 'frames', 'top'];
            let code = '';
            for (const check of tocheck) {
                code += `
                if (typeof ${check} === 'object' && Object.getPrototypeOf(${check}) === Object.getPrototypeOf(${name}))
                    return '${check}';
                `
            }
            code += 'return "Unknown";'
            code = `(() => {
                try{
                    ${code}
                } catch { return "Unknown"; }
            })();`
            return code;
        }
       const result = await this.client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: callFrame.callFrameId,
            expression: template(variable.name)
        });
        // console.log("DecideProxyType", variable.name, result.result.value);
        return result.result.value;
    }

    /** 
     * Return only variables that are proxified
     * @returns [{name, type}]
     */
    _getProxifiedVars(variables) {
        let proxifiedVars = [];
        for (const variable of variables) {
            let {name, proxyType} = variable;
            // TODO: Currently very basic check, might need to do better check.
            if (![null, 'Unknown'].includes(proxyType)) 
                proxifiedVars.push({
                    name: name,
                    type: proxyType
                })
        }
        return proxifiedVars;
    }

    /**
     * 
     * @param {Debugger.Paused} params from debugger.Paused
     * @param {Boolean} recordVar Whether to record the variable status
     */
    async _recordException(params){
        const {callFrames, data} = params; // data looks similar to Runtime.RemoteObject
        const description = "description" in data ? data.description : "";
        let info = new ExceptionInfo(data.className, description, params.data.uncaught, false);
        // TODO: This could be merged into decider's functionality
        if (this._seenExceptions.has(description))
            return;
        const firstLine = description != "" ? description.split('\n')[0] : "";
        logger.log("ErrorInspector._recordException:", "Detected exception", firstLine, "uncaught", params.data.uncaught);
        let decision = {couldBeFixed: true}
        for (const frame of callFrames){
            const {location, scopeChain} = frame;
            let seenVars = new Set();
            // * Potential trailing handlers
            if (!(location.scriptId in this.scriptInfo)) return;
            const { url, startLine } = this.scriptInfo[location.scriptId];
            if (skipJS(url))
                continue;
            // TODO: If the location has the same line as startLine (both !=0), need also to calc column number
            // TODO: Currently doesn't look necessary.
            info.addFrame(url, location.scriptId, location.lineNumber-startLine, location.columnNumber);
            if (!this.recordVar)
                continue;

            // * Decide early if is necessary to look at the exceptions
            if (this.decider) {
                // Deepcopy info
                let infoCopy = JSON.parse(JSON.stringify(info));
                infoCopy.rewrittenFrame = `${filterArchive(url)}:${location.lineNumber}:${location.columnNumber}`;
                decision = this.decider.decide(infoCopy);
                if (!decision.couldBeFixed) {
                    logger.verbose("ErrorInspector._recordException:", "Decider decided not to look at the exception",
                                    url, `{line: ${location.lineNumber}, column: ${location.columnNumber}}`);
                    break;
                }
            }

            for (const scope of scopeChain) {
                // * Potential trailing handlers
                if (!this.recordVar)
                    continue;
                const {object, type} = scope;
                let properties = null;
                try {
                    properties = await this.client.send('Runtime.getProperties', {
                    objectId: object.objectId,
                    });
                } catch { continue; }
                for (const varProp of properties.result){
                    if (seenVars.has(varProp.name) || !this.recordVar)
                        continue;
                    const proxyType = await this._decideProxyType(varProp, frame);
                    info.addVar(varProp, type, proxyType);
                    seenVars.add(varProp.name);
                }
            }
            let source = this.scriptInfo[location.scriptId]?.source;
            if (source && reverter.isRewritten(source)) {
                logger.verbose("ErrorInspector._recordException:", "Found first script rewriten on stack",
                                url, `{line: ${location.lineNumber}, column: ${location.columnNumber}}`);
                break;
            }
        }
        if (decision.couldBeFixed)
            this.exceptions.push(info);
        this._seenExceptions.add(description);
    }
    /**
     * 
     * @param {string} type none, uncaught, caught, all
     */
    async setExceptionBreakpoint(type='uncaught'){
        this.client.on('Runtime.exceptionThrown', params => {
            let details = params.exceptionDetails;
            const description = details.exception.description;
            if (!description)
                return;
            logger.verbose("ErrorInspector:", "thrown exception", description.split('\n')[0], details.exception.className);
            
            const errorType = details.exception.className;
            let info = new ExceptionInfo(errorType, description, true, true);
            if (details.stackTrace) {
                for (const frame of details.stackTrace.callFrames) {
                    // Maybe need to deal with trailing handlers (similar to _recordException). Currently not implemented
                    if (!(frame.scriptId in this.scriptInfo)) return;
                    const { url, startLine } = this.scriptInfo[frame.scriptId];
                    if (skipJS(url))
                        continue;
                    info.addFrame(frame.url, frame.scriptId, frame.lineNumber-startLine, frame.columnNumber);
                }
            } else { // * Assume this is syntax error on parsing the whole resources
                info.addFrame(details.url, details.scriptId, details.lineNumber, details.columnNumber);
            }
            this.exceptions.push(info);
        })

        this.client.on('Runtime.consoleAPICalled', async params => {
            if (params.type != 'error')
                return
            const extractUrls = (str) => {
                const urlLocRegex = /(https?:\/\/[^\s]+)/g;
                // Get the first match
                const match1 = str.match(urlLocRegex);
                if (match1 == null)
                    return null;
                const urlWithLoc = match1[0];
                // Split urlWithLoc into url, line, column, by regex
                const urlRegex = /(.*):(\d+):(\d+)/;
                const match2 = urlWithLoc.match(urlRegex);
                if (match2 == null)
                    return null;
                const [url, line, column] = match2.slice(1);
                return [url, line, column];
            }
            // Check if the args have any exception
            for (const arg of params.args) {
                if (arg.type !== 'object' || arg.subtype !== 'error') 
                    continue;
                let description = arg.description;
                const errorType = arg.className;
                let info = new ExceptionInfo(errorType, description, true, true);
                // Parse description as each line there is a URL (stack of the error)
                const lines = description.split('\n');
                for (const line of lines) {
                    const match = extractUrls(line);
                    if (match == null)
                        continue;
                    const [url, lineNum, columnNum] = match;
                    if (skipJS(url))
                        continue;
                    info.addFrame(url, null, lineNum-1, columnNum-1);
                }
                console.log("ErrorInspector:", "console.error", description.split('\n')[0]);
                this.exceptions.push(info);
                break;
            }
        })

        await this.client.send('Debugger.setPauseOnExceptions', {state: type});
        
        await this.client.removeAllListeners('Debugger.paused');
        this.client.on('Debugger.paused', async params => {
            try {
                await this._recordException(params, this.recordVar);
            } catch (e) {
                logger.warn("Error:", "Debugger.pasued recording exception", e);
            }
            // await sleep(1000);
            try {
                await this.client.send('Debugger.resume');
            } catch (e) {}
        });
    }

    async unsetExceptionBreakpoint(){
        await this.client.send('Debugger.setPauseOnExceptions', {state: 'none'});
        await this.client.removeAllListeners('Debugger.paused');
        await this.client.removeAllListeners('Runtime.exceptionThrown');
        await this.client.removeAllListeners('Runtime.consoleAPICalled');
    }

    async initialize(){
        this.client.on('Debugger.scriptParsed', async params => {
            // * First add the URL, since getting the source is async
            this.scriptInfo[params.scriptId] = {
                url: params.url, 
                source: null, 
                startLine: params.startLine,
                startColumn: params.startColumn,
                endLine: params.endLine,
                endColumn: params.endColumn
            };
            try {
                const {scriptSource} = await this.client.send('Debugger.getScriptSource', {scriptId: params.scriptId});
                // * After coming back, the scriptInfo might be emptied.
                if (params.scriptId in this.scriptInfo) {
                    this.scriptInfo[params.scriptId].source = scriptSource;
                }
            } catch (e) {
                logger.warn("ErrorInspector:", "scriptParsed getting source", e.message.split('\n')[0]);
                return;
            }
        });

        this.client.on('Network.requestWillBeSent', params => {
            this._requestURL[params.requestId] = params.request.url;
        });
        this.client.on('Network.responseReceived', async params => {
            const url = this._requestURL[params.requestId];
            this.responses[url] = {
                requestId: params.requestId,
                status: params.response.status,
                headers: params.response.headers,
                body: null
            }
        })
    }

    setNetworkListener(){
        this.client.on('Network.requestWillBeSent', params => {
            this._requestURL[params.requestId] = params.request.url;
        });
        this.client.on('Network.responseReceived', async params => {
            const url = this._requestURL[params.requestId];
            this.responses[url] = {
                requestId: params.requestId,
                status: params.response.status,
                headers: params.response.headers,
                body: null
            }
        })
    }

    async collectResponseBody() {
        for (const [url, response] of Object.entries(this.responses)) {
            if (response.status != 200)
                continue;
            try {
                const respBody = await this.client.send('Network.getResponseBody', {requestId: response.requestId});
                this.responses[url].body = respBody;
            } catch {
                continue;
            }
           
        }
    }

    unsetNetworkListener(){
        this.client.removeAllListeners('Network.requestWillBeSent');
        this.client.removeAllListeners('Network.responseReceived');
    }

    async reset(recordVar=true, type='uncaught') {
        // Exception
        await this.unsetExceptionBreakpoint();
        this.exceptions = []
        this._seenExceptions = new Set();
        this.scriptInfo = {}
        this.recordVar = recordVar;
        await this.setExceptionBreakpoint(type=type)
        // Network
        // this.unsetNetworkListener();
        this._requestURL = {};
        this.responses = {};
        // this.setNetworkListener();
    }

    async unset() {
        await this.unsetExceptionBreakpoint();
        this.exceptions = []
        this._seenExceptions = new Set();
        this.scriptInfo = {}
        // this.unsetNetworkListener();
        this._requestURL = {};
        this.responses = {};
    }

    async set(recordVar=true, type='uncaught') {
        await this.setExceptionBreakpoint(type=type);
        this.recordVar = recordVar;
        // this.setNetworkListener();
    }
}

module.exports = {
    ExceptionInfo,
    ErrorInspector
}