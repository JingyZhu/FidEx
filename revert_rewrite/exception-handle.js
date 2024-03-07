const reverter = require('./reverter');
const fs = require('fs');
const execution = require('../utils/execution');
const { loadToChromeCTXWithUtils } = require('../utils/load');
const measure = require('../utils/measure');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}

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
     */
    constructor(type, description){
        this.type = type;
        this.description = description;
        this.frames = []; // [frame[var]]
    }

    addFrame(url, scriptId, line, column) {
        this.frames.push({
            scriptId: scriptId,
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


class ExceptionInspector {
    /**
     * 
     * @param {Object} client created from page.target().createCDPSession() 
     */
    constructor(client){
        this.client = client;
        this.scriptInfo = {};
        this.exceptions = [];
        this._seenExceptions = new Set();
        this.recordVar = true;
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
    async _recordException(params, recordVar){
        const {callFrames, data} = params;
        let info = new ExceptionInfo(data.className, data.description);
        if (this._seenExceptions.has(data.description))
            return;
        console.log("Detected exception", params.data.description.split('\n')[0]);
        for (const frame of callFrames){
            const {location, scopeChain} = frame;
            let seenVars = new Set();
            const url = this.scriptInfo[location.scriptId].url;
            if (skipJS(url))
                continue;
            info.addFrame(url, location.scriptId, location.lineNumber, location.columnNumber);
            if (!recordVar)
                continue;
            for (const scope of scopeChain) {
                const {object, type} = scope;
                const properties = await this.client.send('Runtime.getProperties', {
                  objectId: object.objectId,
                });
                for (const varProp of properties.result){
                    // TODO: Currently, this is just including the first variable found.
                    // TODO: But this should actually be ranked on scope (block > global, etc). Might need to revisit this.
                    if (seenVars.has(varProp.name))
                        continue;
                    const proxyType = await this._decideProxyType(varProp, frame);
                    info.addVar(varProp, type, proxyType);
                    seenVars.add(varProp.name);
                }
            }
        }
        this.exceptions.push(info);
        this._seenExceptions.add(data.description);
    }
    /**
     * 
     * @param {string} type none, uncaught, caught, all
     */
    async setExceptionBreakpoint(type='uncaught'){
        this.client.on('Debugger.scriptParsed', async params => {
            // * First add the URL, since getting the source is async
            this.scriptInfo[params.scriptId] = {url: params.url, source: null};
            const {scriptSource} = await this.client.send('Debugger.getScriptSource', {scriptId: params.scriptId});
            this.scriptInfo[params.scriptId].source = scriptSource;
        });

        await this.client.send('Debugger.setPauseOnExceptions', {state: type});
        
        await this.client.removeAllListeners('Debugger.paused');
        this.client.on('Debugger.paused', async params => {
            try {
                await this._recordException(params, this.recordVar);
            } catch (e) {
                console.log("Error recording exception", e);
            }
            // await sleep(1000);
            await this.client.send('Debugger.resume');
        });
    }

    getSource(scriptId) {
        return this.scriptInfo[scriptId].source;
    }

    reset(recordVar=true) {
        this.exceptions = []
        this._seenExceptions = new Set();
        this.scriptInfo = {}
        this.recordVar = recordVar;
    }
}

class Overrider {
    constructor(client){
        this.client = client;
    }

    /**
     * @param {Object} mapping {url: resourceText}
     */
    async overrideResources(mapping){
        let urlPatterns = [];
        for (const url in mapping){
            const resourceType = '';
            const requestStage = 'Response';
            urlPatterns.push({
                urlPattern: url,
                resourceType: resourceType,
                requestStage: requestStage
            });
        }
        await this.client.send('Fetch.enable', {
            patterns: urlPatterns
        });
        console.log("Overriding", urlPatterns);

        this.client.on('Fetch.requestPaused', async (params) => {
            const url = params.request.url;
            const resource = mapping[url];
            try{
                await this.client.send('Fetch.fulfillRequest', {
                    requestId: params.requestId,
                    responseCode: 200,
                    responseHeaders: params.responseHeaders,
                    body: Buffer.from(resource).toString('base64')
                });
                console.log("Sent Fetch.fulfillRequest", params.request.url);
                fs.writeFileSync('test/overrided.js', resource);
            } catch (e) {
                console.log("Error sending Fetch.fulfillRequest", e);
            }
        });
    }

    async clearOverrides(){
        await this.client.send('Fetch.disable');
        // Remove handler for Fetch.requestPause
        await this.client.removeAllListeners('Fetch.requestPaused');
    }
}

class PageRecorder {
    constructor(page, client) {
        this.page = page;
        this.client = client;
    }

    async prepareLogging() {
        const script = fs.readFileSync( `${__dirname}/../chrome_ctx/node_writes_override.js`, 'utf8');
        await this.page.evaluateOnNewDocument(script);
        // await this.page.evaluateOnNewDocument("__trace_enabled = true");
    }

    async record(dirname, filename) {
        await loadToChromeCTXWithUtils(this.page, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
        const writeLog = await this.page.evaluate(() => {
            return {
                writes: __final_write_log_processed,
                rawWrites: __raw_write_log_processed
            }
        });
        fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
        
        const rootFrame = this.page.mainFrame();
        const renderInfo = await measure.collectRenderTree(rootFrame,
            {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, true);
        // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
        await measure.collectNaiveInfo(this.page, dirname, filename);
        fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));
    }
}

class ExceptionHandler {
    constructor(page, client, dirname='.', timeout=60){
        this.page = page;
        this.client = client;
        this.inspector = new ExceptionInspector(client);
        this.overrider = new Overrider(client);
        this.recorder = new PageRecorder(page, client);
        this.dirname = dirname;
        this.timeout = timeout;
        this.exceptions = [];
    }
    
    /**
     * Register inspect for exception
     * Override node write method to log
     * @param {*} exceptionType 
     */
    async prepare(exceptionType='uncaught') {
        await this.inspector.setExceptionBreakpoint(exceptionType);
        await this.recorder.prepareLogging();
    }

    async collectExceptions() {
        this.exceptions.push([]);
        for (let exception of this.inspector.exceptions){
            for (let frame of exception.frames)
                frame.source = this.inspector.getSource(frame.scriptId);
            this.exceptions[this.exceptions.length-1].push(exception);
        }
        await this.recorder.record(this.dirname, 'initial');
    }

    /**
     * Keep trying fixing exceptions until seen first fixed exception
     * @returns Index of the fixed exception (-1) if nothing can be fixed
     */
    async fixException() {
        let calcNumDesc = (desc, exceptions) => {
            let count = 0;
            for (const excep of exceptions){
                if (excep.description.split('\n')[0] == desc)
                    count++;
            }
            return count;
        }
        const latestExceptions = this.exceptions[this.exceptions.length-1];
        for (let i = 0; i < latestExceptions.length; i++) {
            const exception = latestExceptions[i];
            const description = exception.description.split('\n')[0];
            console.log("Start fixing exception:", i, 'out of', latestExceptions.length-1, '\ndescription:', description);
            let targetCount = calcNumDesc(description, latestExceptions);
            let j = 0
            for (const frame of exception.frames){
                // j += 1;
                // if (j < 5) continue
                const source = frame.source;
                if (source == null || !reverter.isRewritten(source)) {
                    console.log(`Cannot find source for ${frame.url}, or source is not rewritten`);
                    continue;
                }
                const revert = new reverter.Reverter(source);
                const startLoc = {line: frame.line+1, column: frame.column+1};
                console.log("Revert location", startLoc, frame.url)
                const proxifiedVars = this.inspector._getProxifiedVars(frame.vars);
                const updatedCode = revert.revertVariable(startLoc, proxifiedVars);
                if (updatedCode === source)
                    continue;
                await this.overrider.clearOverrides();
                await this.overrider.overrideResources({[frame.url]: updatedCode});
                this.inspector.reset({recordVar: false});
                try {
                    let networkIdle = this.page.reload({waitUntil: 'networkidle0',timeout: 0})
                    await waitTimeout(networkIdle, this.timeout*1000);
                } catch(e) {console.log("Reload exception", e)}
                await this.recorder.record(this.dirname, `exception_${i}`);
                let newCount = calcNumDesc(description, this.inspector.exceptions);
                this.inspector.reset({recordVar: false});
                if (newCount < targetCount) {
                    console.log("Fixed exception", i);
                    return i;
                }
                break;
            }
        }
        return -1;
    }

}


module.exports = {
    ExceptionHandler
};