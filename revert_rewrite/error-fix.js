const fs = require('fs');
const { spawn } = require('child_process');
const eventSync = require('../utils/event_sync');

const reverter = require('./reverter');
const { ErrorInspector, ExceptionInfo } = require('./error-inspector');
const { Overrider } = require('./overrider');
const { topRewrittenFrameURL, FixDecider, fixDecider } = require('../error_match/fix-decider');

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

class FixResult {
    constructor(exception) {
        this.type = 'fidelity';
        this.exception = exception;
        this.fixed = false;
        this.fixedID = null;
        this.fixedExcep = false;
        this.fixedExcepID = Infinity;
        this.skipped = true;
        this.reloadCount = 0;
    }

    addDescrption(description) {
        this.description = description;
    }

    unSkip() {
        this.skipped = false;
    }

    fixException(fixId) {
        this.fixedExcep = true;
        this.fixedExcepID = Math.min(fixId, this.fixedExcepID);
    } 

    fix(fixId) {
        this.fixed = true;
        this.fixedID = fixId;
    }

    reloaded() {
        this.reloadCount += 1;
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

    async record(dirname, filename, {responses={}}={}) {
        let recordResponses = {};
        for (const [url, response] of Object.entries(responses))
            recordResponses[url] = response.status
        fs.writeFileSync(`${dirname}/${filename}_requests.json`, JSON.stringify(recordResponses, null, 2))

        await loadToChromeCTXWithUtils(this.page, `${__dirname}/../chrome_ctx/node_writes_collect.js`);
        const writeLog = await this.page.evaluate(() => {
            return {
                writes: __final_write_log_processed,
                rawWrites: __raw_write_log_processed
            }
        });
        fs.writeFileSync(`${dirname}/${filename}_writes.json`, JSON.stringify(writeLog, null, 2));
        
        const rootFrame = this.page.mainFrame();
        try {
            // // * Just used for better recording, might need to optimize in the future
            // No longer using sleep, since it's not reliable
            // await sleep(1000);
            const renderInfo = await measure.collectRenderTree(rootFrame,
                {xpath: '', dimension: {left: 0, top: 0}, prefix: "", depth: 0}, true);
            fs.writeFileSync(`${dirname}/${filename}_elements.json`, JSON.stringify(renderInfo.renderTree, null, 2));    
            // ? If put this before pageIfameInfo, the "currentSrc" attributes for some pages will be missing
            await measure.collectNaiveInfo(this.page, dirname, filename);
            await sleep(500);
        }  catch(e) {
            logger.warn("PageRecorder.record:", "Error in collecting render tree", e.toString().split('\n')[0]);
        }
    }

    /**
     * 
     * @returns {object} {has_issue: boolean, left_unique: Array, right_unique: Array}
     */
    async fidelityCheck(dirname, left, right) {
        // Couldn't find the target files, something might went wrong with recorder.record.
        // Skip to the next checl=k
        if (!(fs.existsSync(`${dirname}/${left}_elements.json`)) || !(fs.existsSync(`${dirname}/${right}_writes.json`)))
            return {has_issue: false};
        const pythonProcess = spawn('python', ['../fidelity_check/js_fidelity_check.py']);
        pythonProcess.stdin.write(JSON.stringify({
            'dir': dirname,
            'left': left,
            'right': right,
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
        logger.verbose("PageRecoder.fidelityCheck:", left, data.left_writes, right, data.right_writes, data.different);
        data.different = data.different && (data.left_writes <= data.right_writes)
        return data;
    }
}

class ErrorFixer {
    constructor(page, client, { dirname='.', 
                                timeout=30, 
                                manual=false, 
                                decider=false, 
                                beforeReloadFunc=null,
                                reloadFunc=null}={}){
        this.page = page;
        this.client = client;
        this.overrider = new Overrider(client);
        this.recorder = new PageRecorder(page, client);
        this.dirname = dirname;
        this.timeout = timeout;
        this.manual = manual;
        this.exceptions = {}; // {loadType(interaction): Array[ExceptionInfo]}
        this.results = [];
        this.log = [];
        if (decider) {
            this.decider = fixDecider;
            this.decider.loadRules();
        }
        this.inspector = new ErrorInspector(client, {decider: this.decider});
        this.stage = '';
        this.beforeReloadFunc = beforeReloadFunc ? beforeReloadFunc : async () => {};
        this.reloadFunc = reloadFunc ? reloadFunc : async () => {await this.page.goto(this.url, {waitUntil: 'networkidle0', timeout: this.timeout*1000})};
    }
    
    /**
     * Register inspect for exception
     * Override node write method to log
     * @param {string} url The URL that will be loaded
     * @param {string} stage The stage of the exception
     * @param {string} exceptionType 
     */
    async prepare(url, stage, exceptionType='uncaught') {
        this.url = url;
        this.stage = stage;
        const origURL = new URL(url).pathname.split('/').slice(3).join('/');
        this.hostname = new URL(origURL).hostname;
        this.overrider.hostname = this.hostname;
        this.exceptionType = exceptionType;
        await this.inspector.initialize();
        await this.inspector.reset(true, exceptionType);
    }

    /**
     * stage
     * @param {Boolean} record Whether we need to record with PageRecorder
     */
    async collectLoadInfo(record=true) {
        const stage = this.stage;
        this.exceptions[stage] = [];
        for (let exception of this.inspector.exceptions){
            if (!(exception.type == 'SyntaxError' && exception.onConsole)) { 
                for (let frame of exception.frames) {
                    if (frame.scriptId === null) { // console error frames, not scriptId
                        for (let [scriptId, info] of Object.entries(this.inspector.scriptInfo)) {
                            if (info.url === frame.url) {
                                frame.scriptId = scriptId;
                                break;
                            }
                        }
                    }
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
            this.exceptions[stage].push(exception);
        }
        // Sort the exceptions by their type, uncaught first, then caught
        const priority = excep => excep.onConsole*10 + excep.uncaught;
        this.exceptions[stage].sort((a, b) => priority(b) - priority(a));
        let exceptionsInfo = {
            type: 'exceptions',
            stage: stage,
            exceptions: []
        }
        let idx = 0;
        for (const exception of this.exceptions[stage]) {
            exceptionsInfo.exceptions.push({
                type: exception.type,
                uncaught: exception.uncaught,
                description: exception.description,
                idx: (exception.type == 'SyntaxError' && exception.onConsole) ? -1 : idx++,
                url: exception.frames[0].url,
            })
            const rewrittenFrame = topRewrittenFrameURL(exception.frames);
            if (rewrittenFrame !== null)
                exceptionsInfo.exceptions[exceptionsInfo.exceptions.length-1].rewrittenFrame = rewrittenFrame;
        }
        this.results.push(exceptionsInfo);
        // Collect network response
        await this.inspector.collectResponseBody();
        for (const [url, response] of Object.entries(this.inspector.responses)){
            if (!(url in this.overrider.seenResponses))
                this.overrider.seenResponses[url] = response;
        }
        // * No need to record if collectLoadInfo is called after Network fix
        if (record)
            await this.recorder.record(this.dirname, `${stage}_initial`, {responses: this.inspector.responses});
    }

    /**
     * @param {object} overrideMap {url: {source: string, start: loc/null, end: loc/null, plainText: boolean}}
     * @returns {Number} If the reload is successful 
     */
    async reloadWithOverride(overrideMap, recordVar=false) {
        await this.overrider.clearOverrides();
        await this.overrider.overrideResources(overrideMap);
        await this.inspector.unset();
        await Promise.all([this.client.send('Network.clearBrowserCookies'), 
                        this.client.send('Network.clearBrowserCache')]);
        await this.beforeReloadFunc();
        await this.inspector.set(recordVar, this.exceptionType);
        
        try {
            if (this.manual)
                await eventSync.waitForReady();
            logger.log("ErrorFix.reloadWithOverride:", "Reloading with override");
            await this.reloadFunc();
        } catch(e) {
            logger.warn("ExceptionHandler.reloadWithOverride:", "Reload exception", e)
            return false;
        }
        await sleep(1000);
        return true
    }

    /**
     * 
     * @param {[ExceptionInfo]} targetExceps target exceptions to match
     * @param {[ExceptionInfo]} exceptions All exceptions that will be matched on
     * @param {Boolean} uncaught Are the target excecptions necessary to be uncaught. 
     *                           If so, only count uncaught exception from exceptions as well
     * @returns 
     */
    _calcExceptionDesc(targetExcep, exceptions, uncaught=false){
        let count = 0;
        let targetDescs = [];
        const collectDesc = (excep) => {
            if (excep.type != 'SyntaxError')
                return excep.description.split('\n')[0];
            else
                return `${excep.description} ${excep.frames[0].url}`;
        }
        for (const excep of targetExcep) {
            if (excep.uncaught >= uncaught)
                targetDescs.push(collectDesc(excep));
        }
        let allDescs = [];
        for (const excep of exceptions){
            if (excep.uncaught >= uncaught)
                allDescs.push(collectDesc(excep));
        }
        // * Calculate how many descrition from allDescs are in the targetDescs
        for (const desc of allDescs){
            if (targetDescs.includes(desc))
                count += 1;
        }
        return count;
    }

    /**
     * Check if the fidelity has any changes after apply overrider.baseOverrides
     * Mainly used for interaction
     */
    async fixBase() {
        const stage = this.stage;
        let result = new FixResult('Base');
        if (Object.keys(this.overrider.baseOverrides).length == 0)
            return result;
        const success = await this.reloadWithOverride({}, true);
        result.reloaded();
        if (!success)
            return result;
        await this.recorder.record(this.dirname, `${stage}_exception_Base`, {responses: this.inspector.responses});
        const fidelity = await this.recorder.fidelityCheck(this.dirname, `${stage}_initial`, `${stage}_exception_Base`);
        if (fidelity.different) {
            logger.log("ExceptionHandler.fixBase:", "Fixed fidelity issue");
            result.fix('N/A')
        }
        this.results.push(result);
        return result;
    }

    /**
     * Fix all the files that gives 404
     * One reason found for 404 is that the path is not constructed correctly (e.g. ///)
     * Fix is done by adding the default hostname if URL doesn't look reasonable.
     * These fixes will be put in Overrider, and overide everytime
     * @returns {Boolean} Whether the fix is successful
     */
    async fixNetwork() {
        const stage = this.stage;
        let result = new FixResult('Network404');
        let revert = new reverter.Reverter("");
        let promises = [];
        for (const [url, response] of Object.entries(this.inspector.responses)){
            const status = response.status;
            if (status != 404)
                continue;
            if (url in this.overrider.baseOverrides)
                continue;
            promises.push(revert.revert404response(url, this.hostname).then(overrideContent => {
                if (overrideContent !== null) {
                    this.overrider.networkOverrides[url] = {
                        source: overrideContent,
                        start: null,
                        end: null
                    };
                }
            }));
        }
        await Promise.all(promises);
        if (Object.keys(this.overrider.networkOverrides).length == 0)
            return result;
        const success = await this.reloadWithOverride({}, true);
        if (!success)
            return result;
        result.reloaded();
        await this.recorder.record(this.dirname, `${stage}_exception_NW`, {responses: this.inspector.responses});
        const fidelity = await this.recorder.fidelityCheck(this.dirname, `${stage}_initial`, `${stage}_exception_NW`);
        // TODO: Need to check if any exception is fixed
        if (fidelity.different) {
            logger.log("ExceptionHandler.fixNetwork:", "Fixed fidelity issue");
            result.fix('N/A')
        }
        this.results.push(result);
        return result;
    }


    /**
     *  
     * @param {[ExceptionInfo]} exceptions
     * @returns {Generator} generator that yields {url: updatedCode} everytime
     */
    async *_findSyntaxReverts(exceptions) {
        let updatedCodes = {};
        for (const exception of exceptions) {
            const frame = exception.frames[0];
            const startLoc = {line: frame.line+1, column: frame.column+1};
            let source = this.overrider.seenResponses[frame.url].body;
            source = source.base64Encoded ? Buffer.from(source.body, 'base64').toString() : source.body;
            const revert = new reverter.Reverter(source, {parse: false});
            const description = exception.description.split('\n')[0];
            let updatedCode = revert.revertLines(startLoc, description);
            if (updatedCode === source)
                continue
            logger.verbose("ExceptionHandler.fixSyntaxError:", "Revert Lines. Location", startLoc, frame.url)
            this.log.push({
                type: 'revertLines',
                url: frame.url,
                startLoc: startLoc,
                updated: updatedCode
            })
            updatedCodes[frame.url] = updatedCode;
        }
        yield updatedCodes;

        updatedCodes = {}
        for (const exception of exceptions) {
            const frame = exception.frames[0];
            const revert = new reverter.Reverter("");
            let updatedCode = await revert.revertFile2Original(frame.url);
            updatedCodes[frame.url] = updatedCode;
            logger.verbose("ExceptionHandler.fixSyntaxError:", "Revert file to original.", frame.url)
            this.log.push({
                type: 'revertFile2Original',
                url: frame.url,
                updated: updatedCode
            })
        }
        yield updatedCodes;
    }

    /**
     * Fix all the files that invoke SyntaxError
     * These fixes will be put in Overrider, and overide everytime
     * @returns {FixResult} Whether the fix is successful
     */
    async fixSyntaxError() {
        const stage = this.stage;
        let result = new FixResult('SyntaxError');
        const latestExceptions = this.exceptions[stage];
        const syntaxErrorExceptions = latestExceptions.filter(excep => excep.type == 'SyntaxError' && excep.onConsole);
        if (syntaxErrorExceptions.length == 0)
            return result;
        
        let fix_id = -1;
        for await (const updatedCodes of this._findSyntaxReverts(syntaxErrorExceptions)) {
            fix_id += 1
            if (this.decider) {
                const decision = this.decider.decide(syntaxErrorExceptions[0]);
                if (!decision.couldBeFixed)
                    continue;
                else if (decision.fixID > fix_id)
                    continue
            }
            result.unSkip();
            this.overrider.syntaxErrorOverrides = {};
            for (const [url, updatedCode] of Object.entries(updatedCodes)) {
                this.overrider.syntaxErrorOverrides[url] = {
                    source: updatedCode,
                    start: null,
                    end: null,
                    plainText: true
                };
            }
            if (Object.keys(this.overrider.syntaxErrorOverrides).length == 0)
                continue;
            
            const success = await this.reloadWithOverride({});
            if (!success)
                continue;
            await this.recorder.record(this.dirname, `${stage}_exception_SE_${fix_id}`, {responses: this.inspector.responses});
            let newCount = this._calcExceptionDesc(syntaxErrorExceptions, this.inspector.exceptions, false);        
            if (newCount >= syntaxErrorExceptions.length)
                continue;
            logger.log("ExceptionHandler.fixSyntaxError:", "Fixed syntax exception with fix", fix_id);
            result.fixException(fix_id);
            this.overrider.recordCurrentOverrides();
            const fidelity = await this.recorder.fidelityCheck(this.dirname, `${stage}_initial`, `${stage}_exception_SE_${fix_id}`);
            if (fidelity.different) {
                logger.log("ExceptionHandler.fixSyntaxError:", "Fixed fidelity issue");
                result.fix(fix_id);
                break;
            }
        }
        if (this.decider) {
            for (const exception of syntaxErrorExceptions)
                this.decider.parseSingleFix(exception, result);
        }
        this.results.push(result);
        return result;
    }

    /**
     * 
     * @param {string} source 
     * @param {ExceptionInfo.frame} frame
     * @param {ExceptionInfo} exception The exception the frame is from
     * @returns {Generator} generator that yields the updated code
     */
    *_findExceptionReverts(source, frame, exception) {
        let revert = null;
        const startLoc = {line: frame.line+1, column: frame.column+1};
        revert = new reverter.Reverter(source, {parse: false});
        const description = exception.description.split('\n')[0];
        let updatedCode = revert.revertLines(startLoc, description);
        logger.verbose("ExceptionHandler.fixException:", "Revert Lines. Location", startLoc, frame.url)
        this.log.push({
            type: 'revertLines',
            url: frame.url,
            startLoc: startLoc,
            updated: updatedCode
        })
        yield {
            updatedCode: updatedCode,
            needCalcExcep: true
        };

        try {
            revert = new reverter.Reverter(source);
        } catch(e) {
            logger.warn("ExceptionHandler.fixException:", "Error in parsing source", e);
            return { updatedCode: source, needCalcExcep: true };
        }
        logger.verbose("ExceptionHandler.fixException:", "Revert Variable. Location", startLoc, frame.url)
        const proxifiedVars = this.inspector._getProxifiedVars(frame.vars);
        updatedCode = revert.revertVariable(startLoc, proxifiedVars);
        this.log.push({
            type: 'revertVariable',
            url: frame.url,
            startLoc: startLoc,
            updated: updatedCode
        })
        yield {
            updatedCode: updatedCode,
            needCalcExcep: true
        };
        
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
        yield {
            updatedCode: updatedCode,
            needCalcExcep: true // No need to check since try catch always solves the problem
        };
    }

    /**
     * 
     * @param {Array[ExceptionInfo]} exception 
     * @returns {FixResult}
     */
    async fixException(exceptions, i) {
        const stage = this.stage;
        const exception = exceptions[i];
        const description = exception.description.split('\n')[0];
        let result = new FixResult(i);
        result.addDescrption(description);
        logger.log("ExceptionHandler.fixException:", "Start fixing exception", i, 
                    'out of', exceptions.length-1, '\n  description:', description, '\n',
                    'onConsole', exception.onConsole, 'uncaught', exception.uncaught);
        let targetCount = this._calcExceptionDesc([exception], exceptions, exception.uncaught);
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
        for (const { updatedCode, needCalcExcep } of this._findExceptionReverts(frame.source.source, frame, exception)) {
            fix_id += 1;
            if (this.decider) {
                const decision = this.decider.decide(exception);
                if (!decision.couldBeFixed)
                    continue;
                else if (decision.fixID > fix_id)
                    continue
            }
            result.unSkip();
            if (updatedCode === frame.source.source) {
                logger.verbose("ExceptionHandler.fixException:", "No revert found for the code");
                continue;
            }

            let overrideMap = {[frame.url]: {
                source: updatedCode, 
                start: frame.source.start, 
                end: frame.source.end, 
                plainText: true
            }};
            const success = await this.reloadWithOverride(overrideMap);
            if (!success)
                continue;

            await this.recorder.record(this.dirname, `${stage}_exception_${i}_${fix_id}`, {responses: this.inspector.responses});
            if (needCalcExcep) {
                let newCount = this._calcExceptionDesc([exception], this.inspector.exceptions, exception.uncaught);
                // * Not fix anything
                if (newCount >= targetCount)
                    continue;
            }
            logger.log("ExceptionHandler.fixException:", "Fixed exception", i, "with fix", fix_id);
            result.fixException(fix_id);
            this.overrider.recordCurrentOverrides();
            const fidelity = await this.recorder.fidelityCheck(this.dirname, `${stage}_initial`, `${stage}_exception_${i}_${fix_id}`);
            if (!fidelity.different)
                continue;
            result.fix(fix_id);
            logger.log("ExceptionHandler.fixException:", "Fixed fidelity issue");
            break;
        }
        if (this.decider)
            this.decider.parseSingleFix(exception, result);
        this.results.push(result);
        return result;
    }

    /**
     * Keep trying fix exceptions until seen first fixed exception
    * @returns Index of the fixed exception (-1) if nothing can be fixed
     */
    async fix() {
        const stage = this.stage;
        const baseFix = await this.fixBase();
        if (baseFix.fixed)
            return "Base";
        const networkFix = await this.fixNetwork();
        if (networkFix.fixed)
            return "NW";
        if (networkFix.reloadCount) {
            // console.log("Network reloaded", networkFix.reloaded)
            await this.collectLoadInfo(false);
        }
        const syntaxFix = await this.fixSyntaxError(stage);
        if (syntaxFix.fixed)
            return `SE_${syntaxFix.fixedID}`;
        const latestExceptions = this.exceptions[stage].filter(excep => !(excep.type == 'SyntaxError' && excep.onConsole) );
        for (let i = 0; i < latestExceptions.length; i++) {
            const excepFix = await this.fixException(latestExceptions, i);
            if (excepFix.fixed)
                return `${i}_${excepFix.fixedID}`;
        }
        return -1;
    }

    updateRules({ save=true, path=null }={}) {
        this.decider.parseFixResult(this.results);
        if (save)
            this.decider.saveRules({path: path});
    }

    finish() {
        this.inspector.unset();
        this.overrider.clearOverrides();
    }

}


module.exports = {
    FixResult,
    PageRecorder,
    ErrorFixer
};