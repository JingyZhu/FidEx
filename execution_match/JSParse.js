const ts = require("typescript");
const { JSDOM } = require("jsdom");

class ASTNode {
    constructor(node, info) {
        this.node = node;
        this.kind = ts.SyntaxKind[node.kind];
        this.start = node.pos;
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
                if (pos >= child.start && pos <= child.end) {
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
        return {start: curNode.start, end: curNode.end};
    }

    print(depth=0, index=0) {
        console.log(
            new Array(depth + 1).join('--'),
            `${index}`,
            `Kind: ${this.kind}`,
            `Start: ${this.start}`,
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
            `Start: ${this.start} ` +
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

class JSTextParser {
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

    getASTNode() {
        let traverseHelper = (node, depth=0) => {
            let info = this.collectNodeInfo(node);
            let astNode = new ASTNode(node, info);
            ts.forEachChild(node, child => {
                let childAST = traverseHelper(child, depth + 1);
                astNode.addChild(childAST);
            });
            return astNode;
        }
        return traverseHelper(this.sourceFile);
    }
}

function rowCol2Pos(file, rowCol, oneIdx=false) {
    let lines = file.split('\n');
    let pos = 0;
    for (let i = 0; i < rowCol[0]-oneIdx; i++) {
        pos += lines[i].length + 1; // +1 corresponds to newline
    }
    pos += rowCol[1]-oneIdx;
    return pos;
}

class JSParser {
    constructor(file, mime='javascript') {
        this.file = file;
        this.mime = mime;
        // Use for find path and pos
        this.jsfile = file;
        this.jsPos = {start: 0, end: file.length};
        this.jsdom = null;
    }

    /**
     * Extract the JS text that includes the pos
     * @param {Int} pos 
     * @returns {Object} {text: JS text, path: path to JS, start/end: start/end offset of the JS text}
     */
    extractJS(pos) {
        const scripts = this.jsdom.window.document.querySelectorAll('script');
        let targetScript = null;
        let result = {text: null, path: null, start: null, end: null}
        for (let script of scripts) {
            const location = this.jsdom.nodeLocation(script);
            if (pos >= location.startOffset && pos <= location.endOffset) {
                targetScript = script;
                result.start = location.startTag.endOffset;
                result.end = location.endTag.startOffset;
                break;
            }
        }
        // Get path to targetScript
        let jspath = []
        let curNode = targetScript;
        while (curNode !== this.jsdom.window.document) {
            let ix = 0;
            let siblings = curNode.parentNode.childNodes;
            for (let i = 0; i < siblings.length; i++) {
                let sibling = siblings[i];
                if (sibling === curNode) {
                    jspath.push({node: curNode.tagName, ix: ix});
                    curNode = curNode.parentNode;
                    break;
                }
                if (sibling.nodeType === 1 && sibling.tagName === curNode.tagName)
                    ix++;
            }
        }
        result.path = jspath.reverse();
        result.text = targetScript.textContent;
        return result;
    }

    /**
     * Adjust the path to JS in archive
     * @param {Array} jspath 
     */
    _adjustArchiveJSPath(jspath) {
        // If path includes head, add the offset for archive
        const offset = {'SCRIPT': 5, 'LINK': 1}
        let newjspath = [];
        for (let i = 0; i < jspath.length; i++) {
            if (i > 0 && jspath[i-1].node === 'HEAD' 
                      && jspath[i].node in offset) {
                newjspath.push({node: jspath[i].node, ix: jspath[i].ix+offset[jspath[i].node]});
                i++;
            }
            else
                newjspath.push(jspath[i]);
        }
        return newjspath;
    }

    /**
     * Find JS position with the given path
     * @param {Array} path path to JS
     * @returns {Object} {start: start offset, end: end offset}
     */
    locateJS(jspath) {
        let curNode = this.jsdom.window.document;
        for (let step of jspath) {
            let ix = 0;
            let siblings = curNode.childNodes;
            for (let i = 0; i < siblings.length; i++) {
                let sibling = siblings[i];
                if (sibling.nodeType === 1 && sibling.tagName === step.node) {
                    if (ix === step.ix) {
                        curNode = sibling;
                        break;
                    }
                    ix++;
                }
            }
        }
        const location = this.jsdom.nodeLocation(curNode);
        return {start: location.startTag.endOffset, end: location.endTag.startOffset};
    }

    /**
     * 
     * @param {Int} pos 
     * @param {Boolean} archive 
     * @returns {Object} {jspath: path to JS, astpath: path to AST
     */
    findPath(pos, archive=false) {
        let path = {jspath: null, astpath: null};
        if (this.mime.includes('html') && this.jsdom === null) {
            this.jsdom = new JSDOM(this.file, {includeNodeLocations: true});
            const jsInfo = this.extractJS(pos);
            this.jsPos = {start: jsInfo.start, end: jsInfo.end};
            this.jsfile = jsInfo.text;
            path.jspath = jsInfo.path;
        }
        const jsp = new JSTextParser(this.jsfile);
        let ast = jsp.getASTNode();
        if (archive)
            ast = ast.filterWayback();
        const astpath = ast.findPath(pos-this.jsPos.start);
        path.astpath = astpath;
        return path;
    }

    /**
     * 
     * @param {Object} path {jspath: path to JS, astpath: path to AST}
     * @param {Boolean} archive 
     * @returns {Object} {start: start offset, end: end offset}
     */
    findPos(path, archive=true) {
        if (this.mime.includes('html') && this.jsdom === null) {
            this.jsdom = new JSDOM(this.file, {includeNodeLocations: true});
            if (archive)
                path.jspath = this._adjustArchiveJSPath(path.jspath);
            this.jsPos = this.locateJS(path.jspath);
            this.jsfile = this.file.substring(this.jsPos.start, this.jsPos.end);
        }
        const jsp = new JSTextParser(this.jsfile);
        let ast = jsp.getASTNode();
        if (archive)
            ast = ast.filterWayback();
        const pos = ast.findPos(path.astpath);
        return {start: this.jsPos.start+pos.start, end: this.jsPos.start+pos.end};
    }

    getText() {
        // arguments can be either (start, end) or leaf ASTNode
        if (arguments[0] instanceof ASTNode) {
            return this.jsfile.substring(arguments[0].start, arguments[0].end);
        } else if (Number.isInteger(arguments[0]) && Number.isInteger(arguments[1])) {
            return this.file.substring(arguments[0], arguments[1]);
        }
        return null;
    }
}


module.exports = {
    JSTextParser,
    ASTNode,
    rowCol2Pos,
    JSParser
}