/**
 * Includes functionality to revert the changes made by the archival systems
 * More specifically, given the start of the line and the variable name,
 * it needs to 1. add antoher statement(s) to make that variable into 
 * unproxied version before the line, and 2. then assign the variable back 
 * after the line.
 */
// TODO: Think about how to revert HTML rewriting (or is it even valuable?)
const espree = require('espree');
const fs = require('fs');
const fetch = require('node-fetch');
const { Logger } = require('../utils/logger');
const path = require('path');
const DiffMatchPatch = require('diff-match-patch');

let logger = new Logger();
const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.3;

const HEADER = `
var __document = document;
var __window = window;
var __self = self;
var __location = location;
var __parent = parent;
var __frames = frames;
`

/**
 * Determine if the code has been rewritten
 * Currently it is just checking if certain keyword is in the code
 * In the future might need to do more fine-grained AST analysis
 * @param {String} code 
 */
function isRewritten(code) {
    const keywords = ['_____WB$wombat$assign$function_____', '__WB_pmw']
    for (const keyword of keywords) {
        if (!code.includes(keyword))
            return false;
    }
    return true;
}

function loc2idx(code, loc, one_indexed=true) {
    let lines = code.split('\n');
    let {line, column} = loc;
    let idx = 0;
    for (let i = 0; i < line-one_indexed; i++)
        idx += lines[i].length + 1;
    idx += column - one_indexed;
    return idx;
}

function addHostname(url, hostname) {
    let urlObj = new URL(url);
    // Collect path from the third slash
    const pathParts = urlObj.pathname.split('/');
    if (pathParts.length < 3) 
        return url;
    let origURL = pathParts.slice(3).join('/');
    // Remove the starting http(s):/ or http(s)://
    origURL = origURL.replace(/^(https?:\/\/?)/, '');
    if (!origURL.startsWith('/')) 
        return url;
    // Collect origURL from the first non-slash
    let idx = 0;
    while (origURL[idx] === '/') 
        idx++;
    origURL = origURL.slice(idx);
    origURL = `http://${hostname}/${origURL}`;
    urlObj.pathname = `${pathParts.slice(0, 3).join('/')}/${origURL}`;
    return urlObj.toString();
}

class Merger {
    constructor() {

    }

    createPatch(text1, text2) {
        const a = dmp.diff_linesToChars_(text1, text2);
        const lineText1 = a.chars1;
        const lineText2 = a.chars2;
        const lineArray = a.lineArray;
        const diffs = dmp.diff_main(lineText1, lineText2);
        dmp.diff_charsToLines_(diffs, lineArray);
        dmp.diff_cleanupSemantic(diffs);
        const patch = dmp.patch_make(text1, diffs);
        return dmp.patch_toText(patch);
    }
    
    applyPatch(text, patchesText) {
        let patches = [];
        for (const patchText of patchesText)
            patches.push(...dmp.patch_fromText(patchText));
        const [newText, results] = dmp.patch_apply(patches, text);
        return results.every(result => result) ? newText : null; // null if any patch fails
    }

    /**
     * 
     * @param {Array[string]} codes 
     * @returns {string | null} Merged code if successful, null if conflict detected
     */
    merge(codes) {
        let currentText = codes[0];
        let patches = []
        let seen = new Set([currentText]);
        for (let i = 1; i < codes.length; i++) {
            const text = codes[i];
            if (seen.has(text)) 
                continue;
            seen.add(text);
            const patch = this.createPatch(currentText, text);
            patches.push(patch);
        }

        const mergedText = this.applyPatch(currentText, patches);
        if (mergedText === null) {
            logger.verbose('Merger.merge', 'Conflict detected, merge aborted.');
            return null;
        }
        currentText = mergedText;
        return currentText;
    }
}

class Reverter {
    constructor(code, { parse=true, wombat=null }={}) {
        this.code = code;
        this.source = parse ? espree.parse(code, { loc: true, range: true, ecmaVersion: "latest"}): null;
        // * BlockStatement is less ideal. It is used as the final backup
        this.statementType = ['ExpressionStatement', 'IfStatement', 'ReturnStatement'];
        this.parentType = ['SequenceExpression', 'BlockStatement'];
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        this.revertRules = {
            ReferenceError: [
                {
                    from: escapeRegex('WB_wombat_runEval2((_______eval_arg, isGlobal) => { var ge = eval; return isGlobal ? ge(_______eval_arg) : eval(_______eval_arg); }).eval(this, (function() { return arguments })(),'),
                    to: 'eval('
                }
            ],
            TypeError: [
                {
                    from: escapeRegex('WB_wombat_runEval2((_______eval_arg, isGlobal) => { var ge = eval; return isGlobal ? ge(_______eval_arg) : eval(_______eval_arg); }).eval(this, (function() { return arguments })(),'),
                    to: 'eval('
                }
            ],
            SyntaxError: [
                {
                    from: `;?${escapeRegex('_____WB$wombat$check$this$function_____(this).')}`,
                    to: 'this.'
                }
            ],
            DOMException: [
                {
                    from: escapeRegex('__WB_pmw(self).postMessage'),
                    to: 'postMessage',
                    hint: 'revertWombatWrapScriptTextJsProxy'
                }
            ]
        }
        this.wombat = wombat || {url: '', code: fs.readFileSync(path.join(__dirname, 'static', 'defaultWombat.js'), 'utf-8')};
    }

    /**
     * Find all statements in the scope of start
     * @param {number} startIdx
     * @returns {parentType: nodeType, value: [ASTNode]} List of statements that are after startIdx (include the one that contains startIdx)
     */
    _findStatements(startIdx) {
        let statements = null;
        let findMinimal = (node) => {
            for (const key of Object.keys(node)) {
                if ([ 'range', 'loc', 'type' ].includes(key)) 
                    continue;
                let value = node[key];
                if (typeof value !== 'object' || value === null)
                    continue
                let value_list = Array.isArray(value) ? value : [value];
                for (const v of value_list) {
                    if (v === null || v.range[0] > startIdx || v.range[1] <= startIdx)
                        continue;
                    // * First recurse to the lowest level so that we can get the minimal statements
                    findMinimal(v);
                    // Statements already set. No need to continue
                    if (statements !== null)
                        continue;
                    if (this.statementType.includes(v.type)) {
                        statements = {parentType: null, value: value_list};
                    }
                    else if (this.parentType.includes(node.type)) {
                        statements = {parentType: node.type, value: value_list};
                    }
                }
            }
        }
        findMinimal(this.source);
        let afterStatements = [];
        for (let i = 0; i < statements.value.length; i++) {
            if (statements.value[i].range[1] > startIdx) {
                afterStatements.push(statements.value[i]);
            }
        }
        statements.value = afterStatements;
        return statements;
    }

    /**
     * Currently directly do string match between variable and statements text
     * In the future might need to do more fine-grained AST analysis
     * @param {Array} variables 
     * @param {Array} statements 
     */
    _variablesInStatements(variables, statements) {
        let statementText = this.code.slice(statements[0].range[0], statements[statements.length-1].range[1]);
        let varInStms = [];
        for (const variable of variables) {
            if (statementText.includes(variable.name)) {
                varInStms.push(variable);
            }
        }
        return varInStms;
    }
    
    _loc2idx(loc, one_indexed=true) {
        let lines = this.code.split('\n');
        let {line, column} = loc;
        let idx = 0;
        for (let i = 0; i < line - one_indexed; i++)
            idx += lines[i].length + 1;
        idx += column - one_indexed;
        return idx;
    }

    /**
     * @returns {string} Updated wombat code
     */
    revertWombatWrapScriptTextJsProxy() {
        const from = /\.replace\(this\.DotPostMessageRe,\s*"\.__WB_pmw\(self\.window\)\$1"\)/g;
        const to = '.replace(this.DotPostMessageRe,"$1")';
        const updatedWombat = this.wombat.code.replace(from, to);
        if (updatedWombat === this.wombat.code) {
            return {}
        } else {
            return {[this.wombat.url]: updatedWombat}
        }
    }

    /**
     * 
     * @param {object} startLoc {line: number, column: number} 1-indexed
     * @param {object} variables {name: string, type: string} Variables that we want to revert
     * @param {number} numStatements 
     */
    revertVariable(startLoc, variables, numStatements=1) {
        const startIdx = this._loc2idx(startLoc);
        logger.log("Reverter.revertVariable:", "line to override", this.code.slice(startIdx, startIdx+30), '...')
        let statements = this._findStatements(startIdx);
        statements.value = statements.value.slice(0, numStatements);
        let varInStms = this._variablesInStatements(variables, statements.value);
        // * If no variable to revert, return the original code
        if (varInStms.length === 0) {
            logger.log("Reverter.revertVariable:", "No variable to revert");
            return this.code;
        }
        let headers = [], beforeLines = [], afterLines = [];
        for (const variable of varInStms) {
            let {name, type} = variable;
            
            let header = `var __temp__${name} = null;\n`
            headers.push(header);

            let before =  `__temp__${name} = ${name}, ${name} = __${type}` 
                         + (statements.parentType === 'SequenceExpression' ? ',':'') 
            beforeLines.push(before);
            
            let after = statements.parentType === 'SequenceExpression' ? 
                        `,\n${name} = __temp__${name}` : `\n${name} = __temp__${name};`
            afterLines.push(after);
        }
        const customHeaders = headers.join('');
        const beforeRevert = ` /* Added by jingyz */ ${beforeLines.join('\n')}
            /* End of addition */
        `
        const afterRevert = `
            // Added by jingyz
            ${afterLines.join('')}
            // End of addition
        `
        const start = statements.value[0].range[0];
        const end = statements.value[numStatements-1].range[1];
        let newCode = this.code.slice(0, start) 
                  + beforeRevert 
                  + this.code.slice(start, end) 
                  + afterRevert 
                  + this.code.slice(end);
        return HEADER + customHeaders + newCode;
    }

    /**
     * Revert the code by adding try-catch block
     */
    revertWithTryCatch(startLoc, numStatements=1) {
        // * Try catch cannot be used within SequenceExpression, need to throw it away
        this.parentType = this.parentType.filter((type) => type !== 'SequenceExpression');
        const startIdx = this._loc2idx(startLoc);
        let statements = this._findStatements(startIdx);
        statements.value = statements.value.slice(0, numStatements);
        const start = statements.value[0].range[0];
        const end = statements.value[numStatements-1].range[1];
        const tryStatement = `/* Added by jingyz */ try {`;
        const catchStatement = `} catch {} /* End of addition */`;
        let newCode = this.code.slice(0, start) 
                  + tryStatement 
                  + this.code.slice(start, end) 
                  + catchStatement
                  + this.code.slice(end);
        this.parentType.push('SequenceExpression');
        return newCode;
    }

    /**
     * Revert the code by revert some lines that are rewritten
     * More details refer to pywb's regex_rewriter
     * @param {string} exception Exception lines to hint with revert should be done 
     * @returns {object} {updatedCode: updateCode, hint: hint} New code(s) after revert, and hint for another revert
     */
    revertLines(startLoc, exception) {
        const startIdx = this._loc2idx(startLoc);
        let closestMatch = null, closestMatchIdx = Infinity;
        for (const [errorType, rules] of Object.entries(this.revertRules)) {
            if (!exception.includes(errorType))
                continue
            // * Try to see what is the closest match index
            for (const rule of rules) {
                // Regex match to collect all index including rule.from
                let matches = this.code.matchAll(new RegExp(rule.from, 'g'));
                for (const match of matches) {
                    if (Math.abs(match.index-startIdx) < Math.abs(closestMatchIdx-startIdx)
                    || Math.abs(match.index + rule.from.length - startIdx) < Math.abs(closestMatchIdx-startIdx)) {
                        closestMatchIdx = match.index;
                        closestMatch = rule;
                    }
                }
            }
        }
        if (closestMatch === null)
            return {updatedCode: this.code, hint: null};
        // Apply the replace for the whole code
        let newCode = this.code.replace(new RegExp(closestMatch.from, 'g'), closestMatch.to);
        return {updatedCode: newCode, hint: closestMatch.hint || null};
    }

    _addId(url) {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        if (pathParts.length < 3) {
            throw new Error(`URL does not contain a collection`);
        }
        let ts = pathParts[2];
        if (isNaN(parseInt(ts[ts.length - 1]))) {
            ts = ts.replace(/[^0-9]*$/, 'id_');
        } else {
            ts += 'id_';
        }
        pathParts[2] = ts;
        urlObj.pathname = pathParts.join('/');
        return urlObj.toString();
    }

    async revertFile2Original(url) {
        const origURL = this._addId(url);
        // Fetch origURL and return the content
        const res = await fetch(origURL);
        return await res.text();
    }


    /**
     *  
     * @returns {string/null} Base64 encoded content of the original file
     */
    async revert404response(url, hostname) {
        const newURL = addHostname(url, hostname);
        if (newURL === url) 
            return null;
        // Fetch origURL and return the content
        const res = await fetch(newURL);
        // If the response is 404, return null
        if (res.status === 404) 
            return null;
        const buffer = await res.buffer();
        return buffer.toString('base64');
    }

    /**
     *  
     * @returns {string/null} Base64 encoded content of the original file
     */
    async revertOutSrcResponse(url, hostname) {
        // Replace the archive hostname with web.archive.org
        let urlObj = new URL(url);
        urlObj.host = 'web.archive.org';
        let pathname = urlObj.pathname.split('/');
        pathname[1] = 'web';
        urlObj.pathname = pathname.join('/');
        urlObj.port = '';
        const waybackURL = urlObj.toString();
        let retry = 0;
        while (retry < 3) {
            let res = await fetch(waybackURL);
            let resURL = new URL(res.url);
            if (res.status === 429) {
                retry += 1
                await new Promise(resolve => setTimeout(resolve, Math.exp(2, retry+1)*1000));
                continue
            } else if (res.status !== 200 || ['/', ''].includes(resURL.pathname)) { // Redirected to web.archive.org/
                break;
            } else {
                const buffer = await res.buffer();
                return buffer.toString('base64');
            }
        }

        // Go to liveweb
        urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        if (pathParts.length >= 3) {
            try {
                let origURL = pathParts.slice(3).join('/');
                if (origURL.startsWith('//'))
                    origURL = 'http:' + origURL;
                let res = await fetch(origURL);
                if (res.status === 200) {
                    const buffer = await res.buffer();
                    return buffer.toString('base64');
                }
            } catch {return;}
        }
        return; 
    }
}

module.exports = {
    loc2idx,
    addHostname,
    Reverter,
    isRewritten,

    Merger,
}