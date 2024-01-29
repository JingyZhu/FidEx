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
    
    /**
     * 
     * @param {Int} pos 
     * @returns {Array} [{idx: index of the child, node: child}]
     */
    findPath(pos) {
        let curNode = this;
        let path = [];
        let found = true;
        while (found == true) {
            found = false;
            for (let idx = 0; idx < curNode.children.length; idx++) {
                let child = curNode.children[idx];
                if (pos >= child.start && pos < child.end) {
                    path.push({idx: idx, node: child});
                    curNode = child;
                    found = true;
                    break;
                }
            }
            if (!found && ts.isCallExpression(curNode.node)) {
                // * Case for IIFE (Immediately Invoked Function Expression)
                const lastChild = curNode.children[curNode.children.length-1];
                if (pos == lastChild.end) {
                    const dummyInvocation = ts.factory.createParenthesizedExpression(ts.factory.createIdentifier(''), undefined, []);
                    let dummyNode = new ASTNode(dummyInvocation, {text: ''});
                    dummyNode.start = lastChild.end;
                    dummyNode.end = curNode.end;
                    curNode.addChild(dummyNode);
                    path.push({idx: curNode.children.length-1, node: dummyNode});
                    curNode = dummyNode;
                    break;
                }
            }
        }
        return path;
    }

    findPos(path) {
        let curNode = this;
        for (let step of path) {
            if (step.idx >= curNode.children.length) {
                const dummyInvocation = ts.factory.createCallExpression(ts.factory.createIdentifier(''), undefined, []);
                let dummyNode = new ASTNode(dummyInvocation, {text: ''});
                dummyNode.start = curNode.children[curNode.children.length-1].end;
                dummyNode.end = curNode.end;
                curNode.addChild(dummyNode);
            }
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
                && node.info.text.startsWith('_____WB$wombat$check$this$function_____')
                && node.info.argument.length == 1
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
        this.astNode = null;
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
        const fullText = this.getText(node.pos, node.end);
        let info = {
            text: fullText
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

    getASTNode(archive=false) {
        if (this.astNode)
            return this.astNode;
        let traverseHelper = (node, depth=0) => {
            let info = this.collectNodeInfo(node);
            let astNode = new ASTNode(node, info);
            ts.forEachChild(node, child => {
                let childAST = traverseHelper(child, depth + 1);
                astNode.addChild(childAST);
            });
            return astNode;
        }
        this.astNode = traverseHelper(this.sourceFile);
        if (archive){
            this.astNode = this.astNode.filterWayback();
        }
        return this.astNode;
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

function pos2RowCol(file, pos, oneIdx=false) {
    let lines = file.split('\n');
    let curPos = 0;
    for (let i = 0; i < lines.length; i++) {
        if (curPos + lines[i].length + 1 > pos) {
            return [i+oneIdx, pos-curPos+oneIdx];
        }
        curPos += lines[i].length + 1;
    }
    return null;
}

class JSParser {
    constructor(file, mime='javascript') {
        this.file = file;
        this.mime = mime;
        this.jsdom = null;
        this.javascripts = [];
        if (mime.includes('html'))
            this.jsdom = new JSDOM(this.file, {includeNodeLocations: true});
        else if (mime.includes('javascript')) {
            this.javascripts.push({
                text: file, 
                pos: [0, file.length],
                jstextparser: new JSTextParser(file)
            });
        }
    }

    /**
     * Extract the JS text that includes the pos
     * @param {Int} pos 
     * @returns {Object} {text: JS text, path: path to JS, start/end: start/end offset of the JS text}
     */
    getJavascript(pos) {
        // See if the pos is included in this.jsfiles.pos
        for (let javascript of this.javascripts) {
            if (pos >= javascript.pos[0] && pos < javascript.pos[1])
                return javascript;
        }
        const scripts = this.jsdom.window.document.querySelectorAll('script');
        let targetScript = null;
        let javascript = {
            text: null, 
            pos: null, 
            jstextparser: null, 
            path: null
        }
        for (let script of scripts) {
            const location = this.jsdom.nodeLocation(script);
            // ?? Why <= endOffset?
            if (pos >= location.startOffset && pos <= location.endOffset) {
                targetScript = script;
                javascript.pos = [location.startTag.endOffset, location.endTag.startOffset];
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
        javascript.path = jspath.reverse();
        javascript.text = targetScript.textContent;
        javascript.jstextparser = new JSTextParser(javascript.text);
        this.javascripts.push(javascript);
        return javascript;
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
        const javascript = this.getJavascript(pos);
        const jsp = javascript.jstextparser;
        path.jspath = javascript.path;
        let ast = jsp.getASTNode(archive);
        const astpath = ast.findPath(pos-javascript.pos[0]);
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
        // Create a deep copy of the path object
        let pathCopy = {astpath: path.astpath, jspath: []};

        let jsStart = 0;
        if (this.mime.includes('html')) {
            if (archive)
                pathCopy.jspath = this._adjustArchiveJSPath(path.jspath);
            jsStart = this.locateJS(pathCopy.jspath).start;
        }
        const javascript = this.getJavascript(jsStart);
        const jsp = javascript.jstextparser;
        let ast = jsp.getASTNode(archive);
        const pos = ast.findPos(pathCopy.astpath);
        return {start: jsStart+pos.start, end: jsStart+pos.end};
    }

    getTextFromPos(start, end) {
        return this.file.substring(start, end);
    }

    getTextFromPath(path, origPos=null) {
        let jsStart = 0;
        if (this.mime.includes('html'))
            jsStart = this.locateJS(path.jspath).start;
        const lastNode = path.astpath[path.astpath.length-1].node;
        const javascript = this.getJavascript(jsStart);
        const jsp = javascript.jstextparser;
        const actualStart = origPos ? origPos - jsStart : lastNode.start;
        return jsp.getText(actualStart, lastNode.end);
    }
}


module.exports = {
    JSTextParser,
    ASTNode,
    rowCol2Pos,
    pos2RowCol,
    JSParser
}