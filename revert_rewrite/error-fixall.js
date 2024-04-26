const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const prettier = require('prettier');
const eventSync = require('../utils/event_sync');

const reverter = require('./reverter');
const { ErrorInspector, ExceptionInfo, initiatedBy } = require('./error-inspector');
const { Overrider } = require('./overrider');
const { topRewrittenFrameURL, FixDecider, fixDecider } = require('../error_match/fix-decider');
const { FixResult, PageRecorder } = require('./error-fix');

const { logger } = require('../utils/logger');

logger.level = 'verbose';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function fileSyntaxError(exception, {notInRuntime=false}={}) {
    const uncaughtSyntax = exception.type == 'SyntaxError' && exception.uncaught;
    // return uncaughtSyntax;
    if (!notInRuntime)
        return uncaughtSyntax;
    else
        return uncaughtSyntax && exception.frames[0].source == null;
}

function canBeTryCatch(exception) {
    if (!exception.uncaught)
        return false;
    if (exception.description && exception.description.includes('defined'))
        return false;
    return true;
}

async function collectWombat(url) {
    const archiveHost = new URL(url).host;
    const wombatURL = `http://${archiveHost}/static/wombat.js`;
    const code = await fetch(wombatURL).then(res => res.text());
    return {url: wombatURL, code: code};
}

async function formatCode(code, {verbose=true}={}) {
    if (verbose)
        return code;
    try {
        const formattedCode = await prettier.format(code, {
            semi: true, // Example of Prettier option, semicolons removed
            parser: "babel", // Specify the parser
            printWidth: 800,
        });
        return formattedCode;
    } catch(e) {
        logger.warn("ErrorFixerAll.formatCode:", "Error in formatting code", e.toString().split('\n')[0]);
        return code;
    }
}

class DefaultDict {
    constructor(defaultInit) {
        this.defaultInit = defaultInit;
        this.map = {};
    }

    get(key) {
        if (!this.map.hasOwnProperty(key)) {
            this.map[key] = this.defaultInit();
        }
        return this.map[key];
    }

    merge(other) {
        for (const [key, value] of Object.entries(other.map)) {
            this.get(key).push(...value);
        }
    }
}


class ErrorFixerAll {
    constructor(page, client, { dirname='.', 
                                timeout=30, 
                                manual=false, 
                                decider=false,
                                deciderPath=null, 
                                beforeReloadFunc=null,
                                reloadFunc=null,
                                recorder=null,
                                errorInspector=null}={}){
        this.page = page;
        this.client = client;
        this.overrider = new Overrider(client);
        this.recorder = recorder || new PageRecorder(page, client);
        this.dirname = dirname;
        this.timeout = timeout;
        this.manual = manual;
        this.exceptions = {}; // {loadType(interaction): Array[ExceptionInfo]}
        this.results = [];
        this.log = [];
        if (decider) {
            this.decider = fixDecider;
            this.deciderPath = deciderPath;
            this.decider.loadRules({path: deciderPath});
        }
        this.inspector = errorInspector || new ErrorInspector(client, {decider: this.decider});
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
        this.wombat = await collectWombat(url);
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
            // if (!fileSyntaxError(exception)) { 
            for (let frame of exception.frames) {
                if (frame.scriptId === null) { // console error frames, not scriptId
                    for (let [scriptId, info] of Object.entries(this.inspector.scriptInfo)) {
                        if (info.url === frame.url) {
                            frame.scriptId = scriptId;
                            break;
                        }
                    }
                }
                if (!frame.scriptId === null || !this.inspector.scriptInfo[frame.scriptId])
                    continue;
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
            // }
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
                idx: fileSyntaxError(exception) ? -1 : idx++,
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
        await this.overrider.overrideResources(overrideMap, {allowCSP: true});
        await this.inspector.unset();
        await Promise.all([this.client.send('Network.clearBrowserCookies'), 
                        this.client.send('Network.clearBrowserCache')]);
        
        await this.page.setBypassCSP(true);
        await this.beforeReloadFunc();
        await this.inspector.set(recordVar, this.exceptionType);
        
        try {
            if (this.manual)
                await eventSync.waitForReady();
            logger.log("ErrorFixerAll.reloadWithOverride:", "Reloading with override");
            await this.reloadFunc();
        } catch(e) {
            logger.warn("ErrorFixerAll.reloadWithOverride:", "Reload exception", e)
            return false;
        }
        await sleep(1000);
        return true
    }

    /**
     * 
     * @param {[ExceptionInfo]} origExceptions Exceptions on initial load
     * @param {[ExceptionInfo]} exceptions Exceptions on the target load
     * @returns 
     */
    _lessException(origExceptions, exceptions){
        const collectDesc = (excep) => {
            if (excep.type != 'SyntaxError')
                return excep.description.split('\n')[0];
            else
                return `${excep.description} ${excep.frames[0].url}`;
        }
        let origCaughtCounter = {}, origUncaughtCounter = {};
        for (const excep of origExceptions) {
            if (excep.uncaught)
                origUncaughtCounter[collectDesc(excep)] = origUncaughtCounter[collectDesc(excep)] ? origUncaughtCounter[collectDesc(excep)] + 1 : 1;
            else
                origCaughtCounter[collectDesc(excep)] = origCaughtCounter[collectDesc(excep)] ? origCaughtCounter[collectDesc(excep)] + 1 : 1;
        }
        let caughtCounter = {}, unCaughtCounter = {};
        for (const excep of exceptions) {
            if (excep.uncaught)
                unCaughtCounter[collectDesc(excep)] = unCaughtCounter[collectDesc(excep)] ? unCaughtCounter[collectDesc(excep)] + 1 : 1;
            else
                caughtCounter[collectDesc(excep)] = caughtCounter[collectDesc(excep)] ? caughtCounter[collectDesc(excep)] + 1 : 1;
        }
        // * Count if there are less exceptions
        for (const [desc, count] of Object.entries(origCaughtCounter)) {
            if (!caughtCounter[desc] || caughtCounter[desc] < count)
                return true;
        }
        for (const [desc, count] of Object.entries(origUncaughtCounter)) {
            if (!unCaughtCounter[desc] || unCaughtCounter[desc] < count)
                return true;
        }
        return false;
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
            logger.log("ErrorFixerAll.fixBase:", "Fixed fidelity issue");
            result.fix('N/A')
        }
        this.results.push(result);
        return result;
    }

    /**
     * Fix all the files that gives 404, 503, CSP
     * One reason found for 404 is that the path is not constructed correctly (e.g. ///)
     * Fix is done by adding the default hostname if URL doesn't look reasonable.
     * These fixes will be put in Overrider, and overide everytime
     * @returns {object} {url: [{source: string, start: loc/null, end: loc/null}]}
     */
    async fixNetwork() {
        let networkOverrides = new DefaultDict(() => []);
        let revert = new reverter.Reverter("");
        const revertMethods = {
            Font: revert.revertOutSrcResponse,
            404: revert.revert404response,
            503: revert.revertOutSrcResponse,
        }
        let promises = [];
        for (const [url, response] of Object.entries(this.inspector.responses)){
            const status = response.status;
            if (!(status in revertMethods))
                continue;
            const revertMethod = revertMethods[status];
            promises.push(revertMethod(url, this.hostname).then(overrideContent => {
                if (overrideContent !== null) {
                    const override = {
                        source: overrideContent, // overrideContent should be base64,
                        start: null,
                        end: null
                    }
                    networkOverrides.get(url).push({
                        fixType: "NW",
                        fixId: 0,
                        needCalcExcep: false,
                        override: override
                     });
                }
            }));
        }
        await Promise.all(promises);
        return networkOverrides;
    }


    /**
     *  
     * @param {[ExceptionInfo]} exceptions
     * @returns {Generator} generator that yields {url: updatedCode} everytime
     */
    async *_findSyntaxReverts(exceptions) {
        // * RevertLines
        let updatedCodes = {};
        for (const exception of exceptions) {
            const frame = exception.frames[0];
            const startLoc = {line: frame.line+1, column: frame.column+1};
            let source = this.overrider.seenResponses[frame.url].body;
            source = source.base64Encoded ? Buffer.from(source.body, 'base64').toString() : source.body;
            const revert = new reverter.Reverter(source, {parse: false, wombat: this.wombat});
            const description = exception.description.split('\n')[0];
            let {updatedCode, hint} = revert.revertLines(startLoc, description);
            if (updatedCode === source)
                continue
            logger.verbose("ErrorFixerAll.fixSyntaxError:", "Revert Lines. Location", startLoc, frame.url)
            this.log.push({
                type: 'revertLines',
                url: frame.url,
                startLoc: startLoc,
                updated: await formatCode(updatedCode)
            })
            updatedCodes[frame.url] = updatedCode;
            if (hint) {
                let {upadteURL, updateCode} = revert[hint]()
                updatedCodes[upadteURL] = updateCode;
            }
        }
        yield updatedCodes;

        // * Revert to original file
        updatedCodes = {}
        for (const exception of exceptions) {
            const frame = exception.frames[0];
            const revert = new reverter.Reverter("", {wombat: this.wombat});
            let updatedCode = await revert.revertFile2Original(frame.url);
            updatedCodes[frame.url] = updatedCode;
            logger.verbose("ErrorFixerAll.fixSyntaxError:", "Revert file to original.", frame.url)
            this.log.push({
                type: 'revertFile2Original',
                url: frame.url,
                updated: await formatCode(updatedCode)
            })
        }
        yield updatedCodes;
    }

    /**
     * Fix all the files that invoke SyntaxError
     * These fixes will be put in Overrider, and overide everytime
     * @returns {object} {url: {source: string, start: loc/null, end: loc/null}}
     */
    async fixSyntaxError() {
        const stage = this.stage;
        const latestExceptions = this.exceptions[stage];
        const syntaxErrorExceptions = latestExceptions.filter(excep => fileSyntaxError(excep, {notInRuntime: true}));
        let syntaxOverrides = new DefaultDict(() => []);
        if (syntaxErrorExceptions.length == 0)
            return syntaxErrorExceptions;
        
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
            for (const [url, updatedCode] of Object.entries(updatedCodes)) {
                let originalSource = this.overrider.seenResponses[url]?.body;
                if (originalSource)
                    originalSource = originalSource.base64Encoded ? Buffer.from(originalSource.body, 'base64').toString() : originalSource.body;
                const override = {
                    originalSource: originalSource,
                    source: updatedCode,
                    start: null,
                    end: null,
                    plainText: true
                };
                syntaxOverrides.get(url).push({
                    fixType: "SE",
                    fixId: fix_id,
                    needCalcExcep: true,
                    override: override
                });
            }
        }
        return syntaxOverrides;
    }

    /**
     * 
     * @param {string} source 
     * @param {ExceptionInfo.frame} frame
     * @param {ExceptionInfo} exception The exception the frame is from
     * @returns {Generator} generator that yields {{url: updatedCode}, needCalcExcep: boolean}
     */
    async *_findExceptionReverts(source, frame, exception) {
        let revert = null;
        // * RevertLines
        let updatedCodes = {}
        const startLoc = {line: frame.line+1, column: frame.column+1};
        revert = new reverter.Reverter(source, {parse: false, wombat: this.wombat});
        const description = exception.description.split('\n')[0];
        let {updatedCode, hint} = revert.revertLines(startLoc, description);
        logger.verbose("ErrorFixerAll.fixException:", "Revert Lines. Location", startLoc, frame.url)
        this.log.push({
            type: 'revertLines',
            url: frame.url,
            startLoc: startLoc,
            updated: await formatCode(updatedCode)
        })
        updatedCodes[frame.url] = updatedCode;
        if (hint) {
            const updates = revert[hint]();
            for (const [updatedURL, updatedCode] of Object.entries(updates)) {
                updatedCodes[updatedURL] = updatedCode;
                this.log.push({
                    type: 'revertLines',
                    url: updatedURL,
                    updated: await formatCode(updatedCode)
                })
            }
        }
        yield {
            updatedCodes: updatedCodes,
            needCalcExcep: true
        };

        // * Revert variables
        updatedCodes = {};
        try {
            revert = new reverter.Reverter(source);
        } catch(e) {
            logger.warn("ErrorFixerAll.fixException:", "Error in parsing source", e);
            return { updatedCodes: {[frame.url]: source}, needCalcExcep: true };
        }
        logger.verbose("ErrorFixerAll.fixException:", "Revert Variable. Location", startLoc, frame.url)
        const proxifiedVars = this.inspector._getProxifiedVars(frame.vars);
        updatedCode = revert.revertVariable(startLoc, proxifiedVars);
        this.log.push({
            type: 'revertVariable',
            url: frame.url,
            startLoc: startLoc,
            updated: await formatCode(updatedCode)
        })
        yield {
            updatedCodes: {[frame.url]: updatedCode},
            needCalcExcep: true
        };

        // * Revert fetch
        if (exception.type == 'SyntaxError') {
            updatedCodes = {};
            let initiateResources = [];
            for (const [url, response] of Object.entries(this.overrider.seenResponses)){
                if (initiatedBy(response.initiator, frame.url))
                    initiateResources.push(url);
            }
            for (const url of initiateResources){
                updatedCode = await revert.revertFile2Original(url);
                logger.verbose("ErrorFixerAll.fixException:", "Revert Fetch ", url)
                this.log.push({
                    type: 'revertFetch',
                    url: url,
                    updated: await formatCode(updatedCode)
                })
                updatedCodes[url] = updatedCode;
            }
            yield {
                updatedCodes: updatedCodes,
                needCalcExcep: true
            };
        } else {
            yield {
                updatedCodes: {},
                needCalcExcep: true
            };
        }

        
        // * Revert try-catch
        if (!canBeTryCatch(exception))
            return
        updatedCode = revert.revertWithTryCatch(startLoc);
        logger.verbose("ErrorFixerAll.fixException:", "Revert TryCatch. Location", startLoc, frame.url)
        this.log.push({
            type: 'revertTryCatch',
            url: frame.url,
            startLoc: startLoc,
            updated: await formatCode(updatedCode)
        })
        yield {
            updatedCodes: {[frame.url]: updatedCode},
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
        let overrides = new DefaultDict(() => []);
        const description = exception.description.split('\n')[0];
        logger.log("ErrorFixer.fixException:", "Start fixing exception", i, 
                    'out of', exceptions.length-1, '\n  description:', description, '\n',
                    'onConsole', exception.onConsole, 'uncaught', exception.uncaught);
        // * Iterate throught frames
        // * For each frame, only try looking the top frame that can be reverted
        let frame = null;
        for (const checkFrame of exception.frames){
            const source = checkFrame.source.source;
            if (source !== null && reverter.isRewritten(source)) {
                frame = checkFrame;
                break;
            }
        }
        if (frame === null)
            return overrides;

        // * Try fixes
        let fix_id = -1;
        for await (const { updatedCodes, needCalcExcep } of this._findExceptionReverts(frame.source.source, frame, exception)) {
            fix_id += 1;
            if (this.decider) {
                const decision = this.decider.decide(exception);
                if (!decision.couldBeFixed)
                    continue;
                else if (decision.fixID > fix_id)
                    continue
            }
            const updatedCode = updatedCodes[frame.url];
            if (updatedCode === frame.source.source && Object.keys(updatedCodes).length == 1){
                logger.verbose("ErrorFixerAll.fixException:", "No revert found for the code");
                continue;
            }

            let overrideMap = updatedCode && updatedCode != frame.source.source ?
                                {[frame.url]: {
                                    originalSource: frame.source.source,
                                    source: updatedCode, 
                                    start: frame.source.start, 
                                    end: frame.source.end, 
                                    plainText: true
                                }} : {}
            for (const [updatedURL, updatedCode]of Object.entries(updatedCodes)) {
                if (updatedURL !== frame.url) {
                    let originalSource = this.overrider.seenResponses[updatedURL]?.body;
                    if (originalSource)
                        originalSource = originalSource.base64Encoded ? Buffer.from(originalSource.body, 'base64').toString() : originalSource.body;
                    overrideMap[updatedURL] = {
                        originalSource: originalSource,
                        source: updatedCode,
                        start: null,
                        end: null,
                        plainText: true
                    }
                }
            }
            for (const [url, override] of Object.entries(overrideMap)) {
                overrides.get(url).push({
                    fixType: "Exception",
                    fixId: fix_id,
                    needCalcExcep: needCalcExcep,
                    override: override
                });
            }
        }
        return overrides;
    }

    /**
     * Batch overrides based on how they can be combined
     * @param {object} overrides {url: [{fixType: string, fixId: number, override: {source: string, start: loc/null, end: loc/null}}]}]} 
     * @returns 
     */
    batchOverrides(overrides) {
        let batches = [];
        let batchInfo = [];
        for (let [url, overrideList] of Object.entries(overrides.map)){
            let seenCode = new Set();
            let counter = 0;
            for (const value of overrideList) {
                const {fixType, fixId, override, needCalcExcep} = value;
                if (seenCode.has(override.source))
                    continue;
                seenCode.add(override.source);
                if (batches.length <= counter) {
                    batches.push({overrides: {}, needCalcExcep: true});
                    batchInfo.push([]);
                }
                batches[counter]['overrides'][url] = override;
                batches[counter]['needCalcExcep'] = batches[counter]['needCalcExcep'] && needCalcExcep;
                batchInfo[counter].push({url: url, fixType: fixType, needCalcExcep: needCalcExcep, fixId: fixId});
                counter += 1;
            }
            logger.log("ErrorFixerAll.batchOverrides:", "Spliting", url, "into", counter, "batches");
        }
        this.results.push({
            type: 'batchInfo',
            stage: this.stage,
            batches: batchInfo
        })
        return batches;
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
        let allOverrides = new DefaultDict(() => []), overrides = new DefaultDict(() => []);
        overrides = await this.fixNetwork();
        allOverrides.merge(overrides);
        overrides = await this.fixSyntaxError(stage);
        allOverrides.merge(overrides);
        const latestExceptions = this.exceptions[stage].filter(excep => !fileSyntaxError(excep, {notInRuntime: true}) );
        for (let i = 0; i < latestExceptions.length; i++) {
            overrides = await this.fixException(latestExceptions, i);
            allOverrides.merge(overrides);
        }
        let batches = await this.batchOverrides(allOverrides);
        for (let i = 0; i < batches.length; i++) {
            let result = new FixResult(`batch_${i}`);
            const batchOverride = batches[i].overrides;
            const needCalcExcep = batches[i].needCalcExcep;
            // * Reload with overrides
            const success = await this.reloadWithOverride(batchOverride);
            if (!success)
                continue;
            await this.recorder.record(this.dirname, `${stage}_exception_batch_${i}`, {responses: this.inspector.responses});
            if (needCalcExcep && !this._lessException(this.exceptions[stage], this.inspector.exceptions)) {
                this.results.push(result);
                continue
            }
            result.fixException(i);
            this.overrider.recordCurrentOverrides();
            const fidelity = await this.recorder.fidelityCheck(this.dirname, `${stage}_initial`, `${stage}_exception_batch_${i}`);
            if (!fidelity.different) {
                this.results.push(result);
                continue;
            }
            result.fix(i);
            this.results.push(result);
            logger.log("ErrorFixerAll.fix:", "Fixed fidelity issue", `batch_${i}`);
            return `batch_${i}`;
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
    ErrorFixerAll
};