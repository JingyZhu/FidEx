const reverter = require('./reverter');
const fs = require('fs');
const { spawn } = require('child_process');

const { loadToChromeCTXWithUtils } = require('../utils/load');
const measure = require('../utils/measure');
const { Logger } = require('../utils/logger');

const logger = new Logger();
logger.level = 'verbose';

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


class ExceptionInspector {
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
        logger.log("ExceptionInspector._recordException:", "Detected exception", firstLine);
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
                    // TODO: Currently, this is just including the first variable found.
                    // TODO: But this should actually be ranked on scope (block > global, etc). Might need to revisit this.
                    if (seenVars.has(varProp.name) || !this.recordVar)
                        continue;
                    const proxyType = await this._decideProxyType(varProp, frame);
                    info.addVar(varProp, type, proxyType);
                    seenVars.add(varProp.name);
                }
            }
            const source = this.scriptInfo[location.scriptId].source;
            if (source && reverter.isRewritten(source)) {
                logger.verbose("ExceptionInspector._recordException:", "Found first script rewriten on stack", url);
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
            const {scriptSource} = await this.client.send('Debugger.getScriptSource', {scriptId: params.scriptId});
            // * After coming back, the scriptInfo might be emptied.
            if (params.scriptId in this.scriptInfo) {
                this.scriptInfo[params.scriptId].source = scriptSource;
            }
        });

        this.client.on('Runtime.exceptionThrown', params => {
            let detail = params.exceptionDetails;
            const description = detail.exception.description;
            logger.verbose("ExceptionInspector:", "thrown exception", description.split('\n')[0]);
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

    async reset(recordVar=true, type='uncaught') {
        await this.unsetExceptionBreakpoint();
        this.exceptions = []
        this._seenExceptions = new Set();
        this.scriptInfo = {}
        this.recordVar = recordVar;
        await this.setExceptionBreakpoint(type=type)
    }
}

class Overrider {
    constructor(client){
        this.client = client;
        this.syntaxErrorOverrides = {}
    }

    /**
     * @param {Object} mapping 
     * {url: {
     *   source: string,
     *   start: {line, column}, (null if not set)
     *   end: {line, column} (null if not set)
     * }}
     */
    async overrideResources(mapping){
        let totalMapping = {};
        let urlPatterns = [];
        for (const [url, resource] of Object.entries(this.syntaxErrorOverrides))
            totalMapping[url] = resource;
        for (const [url, resource] of Object.entries(mapping))
            totalMapping[url] = resource;
        for (const url in totalMapping){
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
        logger.log("Overrider.overrideResources:", "Overriding", urlPatterns);

        this.client.on('Fetch.requestPaused', async (params) => {
            const url = params.request.url;
            let resource = totalMapping[url].source;
            if (totalMapping[url].start && totalMapping[url].end) {
                const { body, base64Encoded } = await this.client.send('Fetch.getResponseBody', {
                    requestId: params.requestId
                });
                let original = base64Encoded ? Buffer.from(body, 'base64').toString() : body;
                // * Replace original's start to end with resource
                const startIdx = reverter.loc2idx(original, totalMapping[url].start);
                const endIdx = reverter.loc2idx(original, totalMapping[url].end);
                resource = original.slice(0, startIdx) + resource + original.slice(endIdx);
            }
            try{
                await this.client.send('Fetch.fulfillRequest', {
                    requestId: params.requestId,
                    responseCode: 200,
                    responseHeaders: params.responseHeaders,
                    body: Buffer.from(resource).toString('base64')
                });
                logger.verbose("Overrider.overrideResources:", "Sent Fetch.fulfillRequest", params.request.url);
            } catch (e) {
                logger.warn("Error: sending Fetch.fulfillRequest", e);
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

    /**
     * 
     * @returns {object} {has_issue: boolean, left_unique: Array, right_unique: Array}
     */
    async fidelityCheck(dirname, left, right) {
        const pythonProcess = spawn('python', ['../fidelity_check/js_fidelity_check.py']);
        pythonProcess.stdin.write(JSON.stringify({
            'dir': dirname,
            'left': left,
            'right': right
        }));
        pythonProcess.stdin.end();
        let data = await new Promise((resolve, reject) => {
            let outputData = '';
            pythonProcess.stdout.on('data', (dataChunk) => {
                outputData += dataChunk.toString();
            });

            let errorData = '';
            pythonProcess.stderr.on('data', (errorChunk) => {
                errorData += errorChunk.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(outputData);
                } else {
                    console.log(errorData); // Log the complete error message
                    reject(new Error(`Process exited with code ${code}: ${errorData}`));
                }
            });
        });
        data = JSON.parse(data.toString());
        return data;
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
        this.log = [];
    }
    
    /**
     * Register inspect for exception
     * Override node write method to log
     * @param {*} exceptionType 
     */
    async prepare(exceptionType='uncaught') {
        this.exceptionType = exceptionType;
        await this.inspector.setExceptionBreakpoint(exceptionType);
        await this.recorder.prepareLogging();
    }

    async collectExceptions() {
        this.exceptions.push([]);
        for (let exception of this.inspector.exceptions){
            if (exception.type !== 'SyntaxError') { 
                for (let frame of exception.frames) {
                    const sourceObj = this.inspector.scriptInfo[frame.scriptId];
                    frame.source = {
                        source: sourceObj.source,
                        start: null,
                        end: null
                    }
                    const numLines = sourceObj.source.split('\n').length;
                    // * Script is part of the file not the whole page.
                    if (sourceObj.startLine != 0 || sourceObj.endLine != numLines-1) {
                        frame.source.start = {line: sourceObj.startLine, column: sourceObj.startColumn},
                        frame.source.end = {line: sourceObj.endLine, column: sourceObj.endColumn}
                    }
                }
            }
            this.exceptions[this.exceptions.length-1].push(exception);
        }
        // Sort the exceptions by their type, uncaught first, then caught
        this.exceptions[this.exceptions.length-1].sort((a, b) => b.uncaught-a.uncaught);
        this.log.push({
            type: 'exception_dist',
            uncaught: this.exceptions[this.exceptions.length-1].filter(excep => excep.uncaught).length,
            caught: this.exceptions[this.exceptions.length-1].filter(excep => !excep.uncaught).length,
            syntaxError: this.exceptions[this.exceptions.length-1].filter(excep => excep.type == 'SyntaxError').length 
        })
        await this.recorder.record(this.dirname, 'initial');
    }

    findRevert(source, frame) {
        let revert = null;
        try {
            revert = new reverter.Reverter(source);
        } catch {return source;}
        const startLoc = {line: frame.line+1, column: frame.column+1};
        logger.verbose("ExceptionHandler.fixException:", "Revert location", startLoc, frame.url)
        const proxifiedVars = this.inspector._getProxifiedVars(frame.vars);
        const updatedCode = revert.revertVariable(startLoc, proxifiedVars);
        this.log.push({
            type: 'revert',
            url: frame.url,
            startLoc: startLoc,
            original: source,
            updated: updatedCode
        })
        return updatedCode;
    }

    /**
     * @param {object} overrideMap {url: resourceText} 
     * @returns {Number} If the reload is successful 
     */
    async reloadWithOverride(overrideMap) {
        await this.overrider.clearOverrides();
        await this.overrider.overrideResources(overrideMap);
        await this.inspector.reset(false, this.exceptionType);
        try {
            await this.page.reload({waitUntil: 'networkidle0', timeout: this.timeout*1000})
        } catch(e) {
            logger.warn("ExceptionHandler.fixException:", "Reload exception", e)
            return false;
        }   
        return true
    }

    _calcExceptionDesc(desc, exceptions){
        let count = 0;
        for (const excep of exceptions){
            if (excep.description.split('\n')[0].includes(desc))
                count++;
        }
        return count;
    }

    /**
     * Fix all the files that invoke SyntaxError
     * These fixes will be put in Overrider, and overide everytime
     * @returns {Boolean} Whether the fix is successful
     */
    async fixSyntaxError() {
        let result = {
            fixed: false,
            fixedExcep: false
        }

        const latestExceptions = this.exceptions[this.exceptions.length-1];
        const syntaxErrorExceptions = latestExceptions.filter(excep => excep.type == 'SyntaxError');
        if (syntaxErrorExceptions.length == 0)
            return result;

        let revert = new reverter.Reverter("");
        for (const syntaxExcep of syntaxErrorExceptions) {
            const url = syntaxExcep.frames[0].url;
            const overrideContent = await revert.revertFile2Original(url);
            this.overrider.syntaxErrorOverrides[url] = {
                source: overrideContent,
                start: null,
                end: null
            };
        }
        
        const success = await this.reloadWithOverride({});
        if (!success)
            return result;
        await this.recorder.record(this.dirname, 'exception_SE');
        let newCount = this._calcExceptionDesc("SyntaxError", this.inspector.exceptions);        
        if (newCount >= syntaxErrorExceptions.length)
            return result;
        result.fixedExcep = true;
        const fidelity = await this.recorder.fidelityCheck(this.dirname, 'initial', `exception_SE`);
        if (fidelity.different) {
            logger.log("ExceptionHandler.fixSyntaxError:", "Fixed fidelity issue");
            result.fixed = true;
        }
        this.log.push({
            type: 'fidelity',
            exception: 'SyntaxError',
            fidelity: fidelity.different
        })
        return result;
    }

    /**
     * Keep trying fixing exceptions until seen first fixed exception
     * @returns Index of the fixed exception (-1) if nothing can be fixed
     */
    async fixException() {
        const syntaxFix = await this.fixSyntaxError();
        if (syntaxFix.fixed)
            return "SE";
        const latestExceptions = this.exceptions[this.exceptions.length-1].filter(excep => excep.type != 'SyntaxError');
        // for (const excep of latestExceptions){ console.log(excep.uncaught)}
        // * 1: Iterate throught exceptions
        for (let i = 0; i < latestExceptions.length; i++) {
            const exception = latestExceptions[i];
            // Debug use
            // if (i < 6) continue
            const description = exception.description.split('\n')[0];
            logger.log("ExceptionHandler.fixException:", "Start fixing exception", i, 'out of', latestExceptions.length-1, '\n  description:', description);
            let targetCount = this._calcExceptionDesc(description, latestExceptions);
            // * 2: Iterate throught frames
            // * For each frame, only try looking the top frame that can be reverted
            // * Break the loop no matter what the result of the loop is
            for (const frame of exception.frames){
                const source = frame.source.source;
                if (source == null || !reverter.isRewritten(source)) {
                    logger.verbose(`ExceptionHandler.fixException:", "Cannot find source for ${frame.url}, or source is not rewritten`);
                    continue;
                }
                
                const updatedCode = this.findRevert(source, frame);
                if (updatedCode === source) {
                    logger.verbose("ExceptionHandler.fixException:", "No revert found for the code");
                    continue;
                }

                let overrideMap = {[frame.url]: frame.source}
                const success = await this.reloadWithOverride(overrideMap);
                if (!success)
                    continue;

                await this.recorder.record(this.dirname, `exception_${i}`);
                let newCount = this._calcExceptionDesc(description, this.inspector.exceptions);
                // * Not fix anything
                if (newCount >= targetCount)
                    break;
                logger.log("ExceptionHandler.fixException:", "Fixed exception", i);
                
                const fidelity = await this.recorder.fidelityCheck(this.dirname, 'initial', `exception_${i}`);
                this.log.push({
                    type: 'fidelity',
                    exception: i,
                    description: description,
                    fidelity: fidelity.different
                })
                if (!fidelity.different)
                    break;
                logger.log("ExceptionHandler.fixException:", "Fixed fidelity issue");
                return i;
            }
        }
        return -1;
    }

}


module.exports = {
    PageRecorder,
    ExceptionHandler
};