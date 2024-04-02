const fs = require('fs');
const reverter = require('../revert_rewrite/reverter');

function filterArchive(url) {
    return url.replace(/^https?:\/\/[^\/]+\/[^/]+\/[^\/]+\/(?:https?:\/{0,2})?(?:\/{0,2})?(.*)$/, "$1");
}

function topRewrittenFrameURL(frames) {
    // * This is Syntax Error with no source. No need to check isRewritten
    if (frames.length == 1 && frames[0].source == null) {
        const frame = frames[0];
        return `${filterArchive(frame.url)}:${frame.line}:${frame.column}`;
    }
    for (const frame of frames) {
        const source = frame.source.source;
        if (!source || !reverter.isRewritten(source))
            continue
        const startLine = frame.source.start ? frame.source.start.line: 0;
        const startColumn = frame.source.start ? frame.source.start.column: 0;
       return `${filterArchive(frame.url)}:${startLine+frame.line}:${startColumn+frame.column}`;
    }
    return null;
}

/**
 * 
 * @param {string} xpath1 
 * @param {string} xpath2 
 * @returns {int} Infinity if length not same
 */
function xpathDiff(xpath1, xpath2) {
    xpath1 = xpath1.split('/');
    xpath2 = xpath2.split('/');
    if (xpath1.length != xpath2.length)
        return Infinity;
    let diff = 0;
    for (let i = 0; i < xpath1.length; i++) {
        if (xpath1[i] != xpath2[i])
            diff++;
    }
    return diff;
}


/**
 * Decide if the exception is worth to fix/fixable
 */
class FixDecider {
    constructor({path=""} = {}) {
        this.rules = {};
        this.curLoadRules = this.rules;
        this.path = path;
        // {path: {event: {funcId: couldbeFixed}}}
        this.interactRules = {};
    }

    saveRules({path=null}={}) {
        const savePath = path || '.fix_decider_rules.json';
        fs.writeFileSync(savePath, JSON.stringify(this.rules, null, 2));
    }

    loadRules({path=null}={}) {
        const savePath = path || '.fix_decider_rules.json'
        if (!fs.existsSync(savePath))
            fs.writeFileSync(savePath, JSON.stringify({}, null, 2));
        this.rules = JSON.parse(fs.readFileSync(savePath));
        this.curLoadRules = this.rules;
    }

    /**
     * Try to collect exception's signature from 2 perspective
     * 1. Description
     * 2. Top frame (and location) of the file that is rewritten
     * @param {ExceptionInfo/object} exception 
     * @returns {Array} An array of signature
     */
    _collectExcepSig(exception) {
        let sigs = [];
        const desc = exception.description.split('\n')[0];
        sigs.push(desc);
        if ("rewrittenFrame" in exception)
            sigs.push(exception.rewrittenFrame);
        else if ("frames" in exception) {
            const rewrittenFrame = topRewrittenFrameURL(exception.frames);
            if (rewrittenFrame)
                sigs.push(rewrittenFrame);
        }
        return sigs;
    }

    _addtoFixPolicy(exception, fixResult, thisLoad=false) {
        let rules = thisLoad ? this.curLoadRules: this.rules;
        const sigs = this._collectExcepSig(exception);
        for (const sig of sigs) {
            if (sig in rules) {
                rules[sig].seen += 1;
                continue;
            }
            if (!fixResult)
                return;
            if (fixResult.fixedExcep) {
                const fixID = fixResult.fixedExcepID;
                rules[sig] = {
                    couldBeFixed: true,
                    fixID: fixID,
                    seen: 1
                }
            } else {
                if (!exception.uncaught) {
                    rules[sig] = {
                        couldBeFixed: false,
                        seen: 1
                    }
                }
            }
        }
    }

    _addtoInteractPolicy(interactResult) {
        let couldBeFixed = false;
        for (const log of interactResult.results) {
            if (log.type != "fidelity")
                continue
            if (log.fixedExcep) {
                couldBeFixed = true;
                break;
            }
        }
        const events = interactResult.events;
        const xpath = events.path;
        this.interactRules[xpath] = {}
        for (const [event, funcs] of Object.entries(events.events)) {
            this.interactRules[xpath][event] = {}
            for (const funcId of funcs)
                this.interactRules[xpath][event][funcId] = couldBeFixed;
        }
    }

    /**
     * 
     * @param {object} result result from the results.json
     */
    parseFixResult(result) {
        let maxExcepNo = 0;
        let idxExceptions = {'SyntaxError': []}
        let idxFidelityRecords = {}
        for (const record of result) {
            if (record['type'] == 'exceptions') {
                maxExcepNo = record.exceptions.filter(excep => excep.idx != -1).length;
                idxExceptions = {'SyntaxError': []}
                idxFidelityRecords = {}
                for (let excep of record.exceptions) {
                    excep.url = filterArchive(excep.url);
                    if (excep.idx == -1) {
                        excep.idx = 'SyntaxError';
                        idxExceptions['SyntaxError'].push(excep);
                    }
                    else
                        idxExceptions[excep.idx] = excep;
                }
            } else if (record['type'] == 'fidelity') {
                idxFidelityRecords[record.exception] = record;
            }
        }
        for (const excep of idxExceptions['SyntaxError'])
            this._addtoFixPolicy(excep, idxFidelityRecords[excep.idx]);
        for (let i = 0; i < maxExcepNo; i++)
            this._addtoFixPolicy(idxExceptions[i], idxFidelityRecords[i]);
        this.curLoadRules = this.rules;
    }

    /**
     * This is used to parse a single fix result
     * The reason this is nececssary is because the within a single load, there could be duplicate errors
     */
    parseSingleFix(exception, fixResult) {
        this._addtoFixPolicy(exception, fixResult, true);
    }

    parseInteractionResult(result) {
        this._addtoInteractPolicy(result);
    }

    readLogs({path=this.path} = {}) {
        // List all the subdir of the given path
        if (fs.existsSync(`${path}/results.json`)) {
            console.log("Parse", `${path}/results.json`)
            const log = JSON.parse(fs.readFileSync(`${path}/results.json`));
            this.parseFixResult(log['results']);
        }
        const dirs = fs.readdirSync(path, {withFileTypes: true})
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name);
        for (const dir of dirs) {
            const logPath = `${path}/${dir}/results.json`;
            if (fs.existsSync(logPath)) {
                console.log("Parse", logPath)
                const log = JSON.parse(fs.readFileSync(logPath));
                this.parseFixResult(log['results']);
            }
        }
    }

    /**
     * 
     * @param {ExceptionInfo} exception
     * @returns {object} Info regarding if the exception is worth fixing, and if so, for which fixID
     */
    decide(exception) {
        const sigs = this._collectExcepSig(exception);
        for (const sig of sigs) {
            if (sig in this.curLoadRules) {
                return this.curLoadRules[sig];
            }
        }
        return {
            couldBeFixed: true,
            fixID: 0
        }
    }

    /**
     * 
     * @param {object} interaction events from results.events
     */
    decideInteract(interaction) {
        // Collect xpath from this.interactRules that has the longest prefix
        let xpath = '';
        for (const key of Object.keys(this.interactRules)) {
            if (interaction.path.startsWith(key) && key.length > xpath.length)
                xpath = key;
        }
        if (xpath == '') {
            // Try looking for xpath with only one component different
            for (const path of Object.keys(this.interactRules)) {
                const diff = xpathDiff(interaction.path, path);
                if (diff <= 1) {
                    xpath = path;
                    break;
                }
            }
        }
        if (!(xpath in this.interactRules))
            return {couldBeFixed: true};
        const pathRules = this.interactRules[xpath];
        let couldBeFixed = false;
        for (const [event, funcs] of Object.entries(interaction.events)) {
            if (!(event in pathRules))
                return {couldBeFixed: true};
            const eventRules = pathRules[event];
            for (const funcId of funcs) {
                if (!(funcId in eventRules))
                    return {couldBeFixed: true};
                couldBeFixed = couldBeFixed || eventRules[funcId];
            }
        }
        return {couldBeFixed: couldBeFixed}
    }
}

const fixDecider = new FixDecider();

module.exports = {
    filterArchive,
    topRewrittenFrameURL,
    FixDecider,
    fixDecider
}