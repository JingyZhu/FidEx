const ts = require("typescript");
const fs = require('fs');

class ASTNode {
    constructor(node, info) {
        this.node = node;
        this.kind = ts.SyntaxKind[node.kind];
        this.pos = node.pos;
        this.end = node.end;
        this.info = info;
        this.children = [];
        this.parent = null;
    }

    addChild(child) {
        child.parent = this;
        this.children.push(child);
    }

    findPath(pos) {
        let curNode = this;
        let path = [];
        let found = true;
        while (found == true) {
            found = false;
            for (let idx = 0; idx < curNode.children.length; idx++) {
                let child = curNode.children[idx];
                if (pos >= child.pos && pos <= child.end) {
                    path.push({idx: idx, node: child});
                    curNode = child;
                    found = true;
                    break;
                }
            }
        }
        return path;
    }

    findPos(path) {
        let curNode = this;
        for (let step of path) {
            curNode = curNode.children[step.idx];
        }
        return {pos: curNode.pos, end: curNode.end};
    }

    print(depth=0, index=0) {
        console.log(
            new Array(depth + 1).join('--'),
            `${index}`,
            `Kind: ${this.kind}`,
            `Pos: ${this.pos}`,
            `End: ${this.end}`,
            `info: ${JSON.stringify(this.info)}` 
        );
        let childIndex = 0;
        for (let child of this.children) {
            child.print(depth + 1, childIndex++);
        }
    }

    toString() {
        return `Kind: ${this.kind} ` +
            `Pos: ${this.pos} ` +
            `End: ${this.end} ` +
            `info: ${JSON.stringify(this.info)}` 
    }

    /**
     * Filter out nodes that are added/rewritten by archival tools.
     */
    filterWayback() {
        // * First, strip all the headers and block added by rewriting tools
        let actualRoot = this.children[2].children[9];
        // * Second, traverse through the tree and skip all the nodes that follows the rewriting pattern
        let chooseSkipNode = (node) => {
            // * Skip "_____WB$wombat$check$this$function_____(this)"
            if (node.kind === 'CallExpression' 
                && node.info.text.includes('_____WB$wombat$check$this$function_____')
                && node.info.argument[0] === 'this') {
                // Remove self from parent's children
                node.parent.children.splice(node.parent.children.indexOf(node), 1, node.children[1]);
                node.children[1].parent = node.parent;
            }
            // * Skip ".__WB_pmw(self)" (CallExpression)
            if (node.kind === 'CallExpression' 
                && node.info.text.includes('__WB_pmw')
                && node.info.argument[0] === 'self') {
                // Remove self from parent's children
                node.parent.children.splice(node.parent.children.indexOf(node), 1, node.children[0]);
                node.children[0].parent = node.parent;
            }
            // * Skip ".__WB_pmw(self)" (PropertyAccessExpression)
            if (node.kind === 'PropertyAccessExpression'
                && node.info.property === '___WB_pmw') {
                // Remove self from parent's children
                node.parent.children.splice(node.parent.children.indexOf(node), 1, node.children[0]);
                node.children[0].parent = node.parent;
            }
            for (let child of node.children)
                chooseSkipNode(child);
        }
        chooseSkipNode(actualRoot);
        return actualRoot;
    }
}

class JSParser {
    constructor(jsFile) {
        this.sourceFile = ts.createSourceFile('jsparsed.js', jsFile, ts.ScriptTarget.Latest, true);
        this.text = this.sourceFile.text;
    }

    getText(start, end) {
        return this.text.substring(start, end);
    }

    collectNodeInfo(node) {
        const kind = ts.SyntaxKind[node.kind];
        let textStart = node.pos;
        // Collect trailing text till the last delimite: "\n", "." or ";"
        const delimiters = ['\n', '.', ';'];
        for (let i = node.end-1; i >= node.pos; i--) {
            if (delimiters.includes(this.text[i])) {
                textStart = i + 1;
                break;
            }
        }
        const trailingText = this.getText(textStart, node.end);
        let info = {
            text: trailingText
        };
        switch (kind) {
            case 'CallExpression':
                info['argument'] = [];
                for (let arg of node.arguments) {
                    info['argument'].push(this.getText(arg.pos, arg.end));
                }
                break;
            case 'PropertyAccessExpression':
                info['property'] = node.name.escapedText;
                break;
            default:
                break;
        }
        return info;
    }

    traverse() {
        let traverseHelper = (node, depth=0) => {
            let info = this.collectNodeInfo(node);
            let astNode = new ASTNode(node, info);
            ts.forEachChild(node, child => {
                // console.log(ts.SyntaxKind[child.kind], depth);
                let childAST = traverseHelper(child, depth + 1);
                astNode.addChild(childAST);
            });
            return astNode;
        }
        return traverseHelper(this.sourceFile);
    }
}

function rowCol2Pos(file, rowCol) {
    let lines = file.split('\n');
    let pos = 0;
    for (let i = 0; i < rowCol[0]-1; i++) {
        pos += lines[i].length + 1;
    }
    pos += rowCol[1];
    return pos;
}

module.exports = {
    JSParser,
    ASTNode,
    rowCol2Pos
}