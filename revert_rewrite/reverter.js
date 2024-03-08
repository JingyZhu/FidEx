/**
 * Includes functionality to revert the changes made by the archival systems
 * More specifically, given the start of the line and the variable name,
 * it needs to 1. add antoher statement(s) to make that variable into 
 * unproxied version before the line, and 2. then assign the variable back 
 * after the line.
 */
// TODO: Think about how to revert HTML rewriting (or is it even valuable?)
const esprima = require('esprima');
const fs = require('fs');
const { Logger } = require('../utils/logger');

let logger = new Logger();

const HEADER = `
let __document = document;
let __window = window;
let __self = self;
let __location = location;
let __parent = parent;
let __frames = frames;
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

class Reverter {
    constructor(code) {
        this.code = code;
        this.source = esprima.parseScript(code, { loc: true, range: true});
        // * BlockStatement is less ideal. It is used as the final backup
        this.statementType = ['ExpressionStatement', 'IfStatement', 'ReturnStatement'];
        this.parentType = ['SequenceExpression', 'BlockStatement'];
    }

    /**
     * Find all statements in the scope of start
     * @param {number} startIdx
     * @returns List of statements that are after startIdx (include the one that contains startIdx)
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
                    if (v.range[0] > startIdx || v.range[1] <= startIdx)
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
     * 
     * @param {object} startLoc {line: number, column: number} 1-indexed
     * @param {object} variables {name: string, type: string} Variables that we want to revert
     * @param {number} numStatements 
     * @returns 
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
            
            let header = `let __temp__${name} = null;\n`
            headers.push(header);

            let before =  `__temp__${name} = ${name}, ${name} = __${type}` 
                         + (statements.parentType === 'SequenceExpression' ? ',':'') 
            beforeLines.push(before);
            
            let after = statements.parentType === 'SequenceExpression' ? 
                        `,\n${name} = __temp__${name}` : `\n${name} = __temp__${name};`
            afterLines.push(after);
        }
        const customHeaders = headers.join('');
        const beforeRevert = `
            // Added by jingyz
            ${beforeLines.join('\n')}
            // End of addition
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
}

module.exports = {
    Reverter,
    isRewritten
}

function testReverter() {
    const code = fs.readFileSync('test/override.js', 'utf-8');
    let loc = {line: 393, column: 179};
    let variables = [
        {name: 'C', type: 'document'},
        {name: 'window', type: 'window'}
    ]
    const reverter = new Reverter(code);
    newCode = reverter.revertVariable(loc, variables, 1)
    console.log(newCode);
}

function testFindStatements(startLoc) {
    const code = fs.readFileSync('test/test.js', 'utf-8');
    const reverter = new Reverter(code);
    const startIdx = reverter._loc2idx(startLoc);
    console.log("line to override", reverter.code.slice(startIdx, startIdx+30), '...')
    let statements = reverter._findStatements(startIdx).value;
    console.log(reverter.code.slice(statements[0].range[0], statements[statements.length-1].range[1]));
}

// testReverter()
// testFindStatements({line: 1128, column: 15})