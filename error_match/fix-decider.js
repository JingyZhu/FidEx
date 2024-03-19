const fs = require('fs');
const reverter = require('../revert_rewrite/reverter');

function filterArchive(url) {
    return url.replace(/^https?:\/\/[^\/]+\/[^/]+\/[^\/]+\/(?:https?:\/?\/?)?(.*)$/, "$1");
}

function topRewrittenFrameURL(frames) {
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
 * Decide if the exception is worth to fix/fixable
 */
class FixDecider {
    constructor({path=""} = {}) {
        this.rules = {};
        this.curLoadRules = this.rules;
        this.path = path;
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
        else if ("frames" in exception)
            sigs.push(topRewrittenFrameURL(exception.frames));
        return sigs;
    }

    _applyPolicy(exception, fixRecord, thisLoad=false) {
        let rules = thisLoad ? this.curLoadRules: this.rules;
        const sigs = this._collectExcepSig(exception);
        for (const sig of sigs) {
            if (sig in rules) {
                rules[sig].seen += 1;
                return
            }
            if (!fixRecord)
                return;
            if (fixRecord.fixedExcep) {
                const fixID = fixRecord.fixedExcepID;
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

    /**
     * 
     * @param {object} result result from the results.log 
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
            this._applyPolicy(excep, idxFidelityRecords[excep.idx]);
        for (let i = 0; i < maxExcepNo; i++)
            this._applyPolicy(idxExceptions[i], idxFidelityRecords[i]);
        this.curLoadRules = this.rules;
    }

    /**
     * This is used to parse a single fix result
     * The reason this is nececssary is because the within a single load, there could be duplicate errors
     */
    parseSingleFix(exception, fixRecord) {
        this._applyPolicy(exception, fixRecord, thisLoad=true);
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
}

module.exports = {
    topRewrittenFrameURL,
    FixDecider
}