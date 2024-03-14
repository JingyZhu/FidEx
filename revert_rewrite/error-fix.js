const fs = require('fs');
const { spawn } = require('child_process');

const reverter = require('./reverter');
const { ErrorInspector, ExceptionInfo } = require('./error-inspector');

const { loadToChromeCTXWithUtils } = require('../utils/load');
const measure = require('../utils/measure');
const { logger } = require('../utils/logger');

logger.level = 'verbose';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}

class Overrider {
    constructor(client){
        this.client = client;
        this.syntaxErrorOverrides = {}
        this.networkOverrides = {}
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
        for (const [url, resource] of Object.entries(this.networkOverrides))
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
                // TODO: For responseHeaders, if the content-type doesn't exist, need to add the content-type for restrict MIME
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
        this.inspector = new ErrorInspector(client);
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
     * @param {string} url The URL that will be loaded
     * @param {*} exceptionType 
     */
    async prepare(url, exceptionType='uncaught') {
        const origURL = new URL(url).pathname.split('/').slice(3).join('/');
        this.hostname = new URL(origURL).hostname;
        this.exceptionType = exceptionType;
        await this.inspector.setExceptionBreakpoint(exceptionType);
        this.inspector.setNetworkListener();
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

    /**
     * 
     * @param {string} source 
     * @param {ExceptionInfo.frame} frame
     * @param {ExceptionInfo} exception The exception the frame is from
     * @returns {Generator} generator that yields the updated code
     */
    *_findReverts(source, frame, exception) {
        let revert = null;
        try {
            revert = new reverter.Reverter(source);
        } catch {return source;}
        const startLoc = {line: frame.line+1, column: frame.column+1};
        logger.verbose("ExceptionHandler.fixException:", "Revert Variable. Location", startLoc, frame.url)
        const proxifiedVars = this.inspector._getProxifiedVars(frame.vars);
        let updatedCode = revert.revertVariable(startLoc, proxifiedVars);
        this.log.push({
            type: 'revertVariable',
            url: frame.url,
            startLoc: startLoc,
            updated: updatedCode
        })
        yield updatedCode;
        
        if (!exception.uncaught)
            return;
        updatedCode = revert.revertWithTryCatch(startLoc);
        logger.verbose("ExceptionHandler.fixException:", "Revert TryCatch. Location", startLoc, frame.url)
        this.log.push({
            type: 'revertTryCatch',
            url: frame.url,
            startLoc: startLoc,
            updated: updatedCode
        })
        yield updatedCode;
    }

    /**
     * @param {object} overrideMap {url: resourceText} 
     * @returns {Number} If the reload is successful 
     */
    async reloadWithOverride(overrideMap, recordVar=false) {
        await this.overrider.clearOverrides();
        await this.overrider.overrideResources(overrideMap);
        await this.inspector.reset(recordVar, this.exceptionType);
        try {
            await this.page.reload({waitUntil: 'networkidle0', timeout: this.timeout*1000})
        } catch(e) {
            logger.warn("ExceptionHandler.reloadWithOverride:", "Reload exception", e)
            return false;
        }
        await sleep(500);
        return true
    }

    /**
     * 
     * @param {string} desc Description of the exception
     * @param {[ExceptionInfo]} exceptions 
     * @param {Boolean} uncaught Is the desc excecpt is uncaught. 
     *                           If so, only count uncaught exception from exceptions as well
     * @returns 
     */
    _calcExceptionDesc(desc, exceptions, uncaught=false){
        let count = 0;
        for (const excep of exceptions){
            if (excep.description.split('\n')[0].includes(desc) && excep.uncaught >= uncaught)
                count++;
        }
        return count;
    }

    /**
     * Fix all the files that gives 404
     * One reason found for 404 is that the path is not constructed correctly (e.g. ///)
     * Fix is done by adding the default hostname if URL doesn't look reasonable.
     * These fixes will be put in Overrider, and overide everytime
     * @returns {Boolean} Whether the fix is successful
     */
    async fixNetwork() {
        let result = {
            fixed: false,
            fixedExcep: false
        }
        let revert = new reverter.Reverter("");
        for (const [url, status] of Object.entries(this.inspector.responseStatus)){
            if (status != 404)
                continue;
            const overrideContent = await revert.revert404response(url, this.hostname);
            if (overrideContent === null)
                continue;
            this.overrider.networkOverrides[url] = {
                source: overrideContent,
                start: null,
                end: null
            };
        }
        if (Object.keys(this.overrider.networkOverrides).length == 0)
            return result;
        const success = await this.reloadWithOverride({}, true);
        if (!success)
            return result;
        await this.recorder.record(this.dirname, 'exception_NW');
        const fidelity = await this.recorder.fidelityCheck(this.dirname, 'initial', `exception_NW`);
        // TODO: Need to check if any exception is fixed
        if (fidelity.different) {
            logger.log("ExceptionHandler.fixNetwork:", "Fixed fidelity issue");
            result.fixed = true;
        }
        this.log.push({
            type: 'fidelity',
            exception: 'Network404',
            fidelity: fidelity.different
        })
        return result;
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
        let newCount = this._calcExceptionDesc("SyntaxError", this.inspector.exceptions, true);        
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
     * 
     * @param {Array[ExceptionInfo]} exception 
     * @returns 
     */
    async fixException(exceptions, i) {
        let result = {
            fixed: false, 
            fixedExcep: false,
            fixedID: null // Index of fixes what works (fixed=true)
        }
        const exception = exceptions[i];
        const description = exception.description.split('\n')[0];
        logger.log("ExceptionHandler.fixException:", "Start fixing exception", i, 
                    'out of', exceptions.length-1, '\n  description:', description, 'uncaught', exception.uncaught);
        let targetCount = this._calcExceptionDesc(description, exceptions, exception.uncaught);
        // * Iterate throught frames
        // * For each frame, only try looking the top frame that can be reverted
        let frame = null;
        for (const checkFrame of exception.frames){
            const source = checkFrame.source.source;
            if (source !== null && reverter.isRewritten(source)) {
                frame = checkFrame;
                break;
            }
            else
                logger.verbose(`ExceptionHandler.fixException:", "Cannot find source for ${checkFrame.url}, or source is not rewritten`);   
        }
        if (frame === null)
            return result;

        // * Try fixes
        let fix_id = -1;
        for (const updatedCode of this._findReverts(frame.source.source, frame, exception)) {
            fix_id += 1;
            if (updatedCode === frame.source.source) {
                logger.verbose("ExceptionHandler.fixException:", "No revert found for the code");
                continue;
            }

            let overrideMap = {[frame.url]: {source: updatedCode, start: frame.source.start, end: frame.source.end}};
            const success = await this.reloadWithOverride(overrideMap);
            if (!success)
                continue;

            await this.recorder.record(this.dirname, `exception_${i}_${fix_id}`);
            let newCount = this._calcExceptionDesc(description, this.inspector.exceptions, exception.uncaught);
            // * Not fix anything
            if (newCount >= targetCount)
                continue;
            logger.log("ExceptionHandler.fixException:", "Fixed exception", i, "with fix", fix_id);
            result.fixedExcep = true;

            const fidelity = await this.recorder.fidelityCheck(this.dirname, 'initial', `exception_${i}_${fix_id}`);
            this.log.push({
                type: 'fidelity',
                exception: i,
                description: description,
                fidelity: fidelity.different
            })
            if (!fidelity.different)
                continue;
            result.fixed = true;
            result.fixedID = fix_id;
            logger.log("ExceptionHandler.fixException:", "Fixed fidelity issue");
            return result;
        }
        return result;
    }

    /**
     * Keep trying fix exceptions until seen first fixed exception
     * @returns Index of the fixed exception (-1) if nothing can be fixed
     */
    async fix() {
        const networkFix = await this.fixNetwork();
        if (networkFix.fixed)
            return "NW";
        await this.collectExceptions();
        const syntaxFix = await this.fixSyntaxError();
        if (syntaxFix.fixed)
            return "SE";
        const latestExceptions = this.exceptions[this.exceptions.length-1].filter(excep => excep.type != 'SyntaxError');
        for (let i = 0; i < latestExceptions.length; i++) {
            const excepFix = await this.fixException(latestExceptions, i);
            if (excepFix.fixed)
                return `${i}_${excepFix.fixedID}`;
        }
        return -1;
    }

}


module.exports = {
    PageRecorder,
    ExceptionHandler
};