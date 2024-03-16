const { logger } = require('../utils/logger');
const reverter = require('./reverter');

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
     */
    constructor(type, description, uncaught){
        this.type = type;
        this.description = description;
        this.frames = []; // [frame[var]]
        this.uncaught = uncaught;
    }

    addFrame(url, scriptId, line, column) {
        this.frames.push({
            scriptId: scriptId,
            source: null, // WIll be assigned later on collectExceptions
            url: url,
            line: line,
            column: column,
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
    constructor(client){
        this.client = client;
        this.scriptInfo = {};
        this.resources = {};
        this.exceptions = [];
        this._seenExceptions = new Set();
        this.recordVar = true;

        this._requestURL = {};
        this.responses = {}; // {url: {status, headers, body}}
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
        const {callFrames, data} = params;
        const description = "description" in data ? data.description : "";
        let info = new ExceptionInfo(data.className, description, params.data.uncaught);
        if (this._seenExceptions.has(description))
            return;
        const firstLine = description != "" ? description.split('\n')[0] : "";
        logger.log("ErrorInspector._recordException:", "Detected exception", firstLine);
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
            for (const scope of scopeChain) {
                // * Potential trailing handlers
                if (!this.recordVar)
                    continue;
                const {object, type} = scope;
                const properties = await this.client.send('Runtime.getProperties', {
                  objectId: object.objectId,
                });
                for (const varProp of properties.result){
                    if (seenVars.has(varProp.name) || !this.recordVar)
                        continue;
                    const proxyType = await this._decideProxyType(varProp, frame);
                    info.addVar(varProp, type, proxyType);
                    seenVars.add(varProp.name);
                }
            }
            const source = this.scriptInfo[location.scriptId].source;
            if (source && reverter.isRewritten(source)) {
                logger.verbose("ErrorInspector._recordException:", "Found first script rewriten on stack",
                                url, `{line: ${location.lineNumber}, column: ${location.columnNumber}}`);
                break;
            }
        }
        this.exceptions.push(info);
        this._seenExceptions.add(description);
    }
    /**
     * 
     * @param {string} type none, uncaught, caught, all
     */
    async setExceptionBreakpoint(type='uncaught'){
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

        this.client.on('Runtime.exceptionThrown', params => {
            let detail = params.exceptionDetails;
            const description = detail.exception.description;
            logger.verbose("ErrorInspector:", "thrown exception", description.split('\n')[0]);
            if (!description || !description.startsWith('SyntaxError'))
                return;
            let info = new ExceptionInfo('SyntaxError', description, true);
            info.addFrame(detail.url, detail.scriptId, detail.lineNumber, detail.columnNumber);
            this.exceptions.push(info);
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
        await this.client.removeAllListeners('Debugger.scriptParsed');
        await this.client.removeAllListeners('Runtime.exceptionThrown');
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
        await this.unsetExceptionBreakpoint();
        this.exceptions = []
        this._seenExceptions = new Set();
        this.scriptInfo = {}
        this.recordVar = recordVar;
        await this.setExceptionBreakpoint(type=type)
        this.unsetNetworkListener();
        this._requestURL = {};
        this.responses = {};
    }
}

module.exports = {
    ExceptionInfo,
    ErrorInspector
}