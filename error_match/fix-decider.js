const fs = require('fs');

function filterArchive(url) {
    return url.replace(/^https?:\/\/[^\/]+\/[^/]+\/[^\/]+\/(.*)$/, "$1");
}

/**
 * Decide if the exception is worth to fix/fixable
 */
class FixDecider {
    constructor({path=""} = {}) {
        this.rules = {};
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
    }

    _applyPolicy(exception, fidelityRecord) {
        const desc = exception.description.split('\n')[0];
        if (desc in this.rules) {
            this.rules[desc].seen += 1;
            return
        }
        if (!fidelityRecord)
            return;
        if (fidelityRecord.fixedExcep) {
            const fixID = fidelityRecord.fixedExcepID;
            this.rules[desc] = {
                couldBeFixed: true,
                fixID: fixID,
                seen: 1
            }
        } else {
            if (!exception.uncaught) {
                this.rules[desc] = {
                    couldBeFixed: false,
                    seen: 1
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
    }

    readLogs({path=this.path} = {}) {
        // List all the subdir of the given path
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
        const description = exception.description.split('\n')[0];
        if (description in this.rules) {
            return this.rules[description];
        } else 
            return {
                couldBeFixed: true,
                fixID: 0
            }
    }
}

module.exports = {
    FixDecider
}