/**
 * Includes functionality to revert the changes made by the archival systems
 * More specifically, given the start of the line and the variable name,
 * it needs to 1. add antoher statement(s) to make that variable into 
 * unproxied version before the line, and 2. then assign the variable back 
 * after the line.
 */
const esprima = require('esprima');
const fs = require('fs');

const HEADER = `
let __document = document;
let __window = window;
let __self = self;
let __location = location;
let __parent = parent;
let __frames = frames;
`

class Reverter {
    constructor(code) {
        this.code = code;
        this.source = esprima.parseScript(code, { loc: true, range: true});
        this.targetType = ['ExpressionStatement', 'IfStatement'];
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
                    if (statements === null && this.targetType.includes(v.type))
                        statements = value_list;
                }
            }
        }
        findMinimal(this.source);
        let afterStatements = [];
        for (let i = 0; i < statements.length; i++) {
            if (statements[i].range[1] > startIdx) {
                afterStatements.push(statements[i]);
            }
        }
        return afterStatements;
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
     * @param {object} variables {name: string, type: string} 
     * @param {number} numStatements 
     * @returns 
     */
    revertVariable(startLoc, variables, numStatements=1) {
        const startIdx = this._loc2idx(startLoc);
        console.log("line", this.code.slice(startIdx, startIdx+30))
        let afterStatements = this._findStatements(startIdx);
        afterStatements = afterStatements.slice(0, numStatements);
        let varInStms = this._variablesInStatements(variables, afterStatements);
        let beforeLines = [], afterLines = [];
        for (const variable of varInStms) {
            let {name, type} = variable;
            let before = `
            let __temp__${name} = ${name};
            ${name} = __${type};`
            beforeLines.push(before);
            let after = `${name} = __temp__${name};`
            afterLines.push(after);
        }
        const beforeRevert = `
            // Added by jingyz
            ${beforeLines.join('')}
            // End of addition
        `
        const afterRevert = `
            // Added by jingyz
            ${afterLines.join(' ')}
            // End of addition
        `
        const start = afterStatements[0].range[0];
        const end = afterStatements[numStatements-1].range[1];
        let newCode = this.code.slice(0, start) 
                  + beforeRevert 
                  + this.code.slice(start, end) 
                  + afterRevert 
                  + this.code.slice(end);
        return HEADER + newCode;
    }
}

module.exports = {
    Reverter
}

function testReverter() {
    const code = fs.readFileSync('test/funcall.js', 'utf-8');

    let loc = {line: 22, column: 5};
    let variables = [
        {name: 'document', type: 'document'},
        {name: 'window', type: 'window'}
    ]
    const reverter = new Reverter(code);
    newCode = reverter.revertVariable(loc, variables, 1)
    fs.writeFileSync('test/funcall_reverted.js', newCode);
}

// testReverter()