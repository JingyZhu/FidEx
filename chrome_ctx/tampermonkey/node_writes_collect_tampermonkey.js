// ==UserScript==
// @name         node_writes_collect
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @include      http://*
// @include      https://*
// @icon         https://static.thenounproject.com/png/424422-200.png
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

/*
   Contains functions that are commonly used by multiple other files
   For files that require this file, set loadUtils=true before execution
*/

function getElemId(elem) {
    var id =
        elem.nodeName +
        (elem.id ? `#${elem.id}` : "") +
        (elem.className && typeof (elem.className) === 'string' ? `.${elem.className.replace(/ /g, '.')}` : "");
    if (elem.nodeName == "A" && elem.hasAttribute('href')) id += `[href="${elem.href}"]`;
    return id;
};

function getDomXPath(elm, fullTrace = false) {
    var xPathsList = [];
    let segs = [];
    for (; elm && elm.nodeType == 1; elm = elm.parentNode)
    // for (; elm ; elm = elm.parentNode)  // curently using this will cause exception
    {
        let withID = false;
        // if (elm.hasAttribute('id')) {
        //     withID = true;
        //     segs.unshift(elm.localName.toLowerCase() + '[@id="' + elm.getAttribute('id') + '"]');
        // }
        // else if (elm.hasAttribute('class')) {
        //     segs.unshift(elm.localName.toLowerCase() + '[@class="' + elm.getAttribute('class') + '"]');
        // }
        // else {
        let i = 1;
        for (let sib = elm.previousSibling; sib; sib = sib.previousSibling) {
            if (sib.localName == elm.localName) i++;
        };
        segs.unshift(`${elm.localName.toLowerCase()}[${i}]`);
        // };
        if (withID) // Only push new path if it has an ID
            xPathsList.push('/' + segs.join('/'));
    };
    xPathsList.push('/' + segs.join('/'));

    return fullTrace ? xPathsList : xPathsList[xPathsList.length - 1];
};

/**
 * Class for sets of recorded dimensions of different nodes.
 */
class DimensionSets {
    constructor() {
        this.dimension = null;
        this.parentDimention = null;
        this.argsDimension = [];
        // args' outerHTML if it is a node, else just the args value
        this.argsText = [];
    }

    // Check if the node has any dimension
    _getDimension(node) {
        if (node == null || typeof node.getBoundingClientRect !== 'function') {
            return { width: 0, height: 0 };
        }
        return node.getBoundingClientRect();
    }

    // Check if dimensions are valid and changes
    _isDimensionChanged(before, after) {
        if (before == null || after == null) {
            return false;
        }
        if (before.left < 0 || before.top < 0 || after.left < 0 || after.top < 0) {
            return false;
        }
        return before.width !== after.width || before.height !== after.height;
    }

    // Record the dimension of the node before the write
    recordDimension(node, args) {
        this.dimension = this._getDimension(node);
        this.parentDimention = this._getDimension(node.parentNode);
        for (const arg of args) {
            if (arg instanceof Node){
                this.argsDimension.push(this._getDimension(arg));
                this.argsText.push(arg.outerHTML);
            }
        }
    }

    /**
     * Check if the dimension match with another Dimension
     * @param {DimensionSets} other
     * @returns {boolean} true if the dimension match
     */
    isDimensionMatch(other) {
        if (this._isDimensionChanged(this.dimension, other.dimension)
            || this._isDimensionChanged(this.parentDimention, other.parentDimention))
            return false
        if (this.argsDimension.length !== other.argsDimension.length) {
            return false;
        }
        for (let i = 0; i < this.argsDimension.length; i++) {
            if (this._isDimensionChanged(this.argsDimension[i], other.argsDimension[i])) {
                return false;
            }
        }
        return true;
    }

    // Similar to isDimensionMatch, but only check if the dimension of the args match
    isArgsDimensionMatch(other) {
        if (this.argsDimension.length !== other.argsDimension.length) {
            return false;
        }
        for (let i = 0; i < this.argsDimension.length; i++) {
            if (this.argsText[i] !== other.argsText[i])
                continue
            if (this._isDimensionChanged(this.argsDimension[i], other.argsDimension[i])) {
                return false;
            }
        }
        return true;
    }

}

// * chrome_ctx version of the code starts from here
// * Replace unsafeWindow. with empty string
/**
 * Collect write logs after loading the page.
 * Note: need to override Node write methods and setters using node_write_override.js
 */
unsafeWindow.__write_log_processed = [];
unsafeWindow.__final_write_log = [];
unsafeWindow.__recording_enabled = false;

// Normalize all href and src attributes in node
function _normalSRC(node) {
    const _attrs = ['src', 'href', 'action'];
    const setSrcSet = (n) => {
        return; // * srcset seems to have bug for archive, not sure how broad the issue is
        // Change srcset to absolute path
        if (n.hasAttribute('srcset')) {
            let srcset = n.getAttribute('srcset');
            let srcsetList = srcset.split(', ');
            let newSrcSet = [];
            for (const srcRes of srcsetList) {
                const src = srcRes.split(' ')[0];
                let newSrc = new URL(src, window.location.href).href;
                newSrcSet.push(`${newSrc} ${srcRes.split(' ')[1]}`);
            }
            n.setAttribute('srcset', newSrcSet.join(', '));
        }
    }
    for (let attr of _attrs) {
        if (node.hasAttribute(attr))
            node[attr] = node[attr];
        setSrcSet(node)
    }
    let allDescendants = node.querySelectorAll('*');
    for (let descendant of allDescendants) {
        for (let attr of _attrs) {
            if (descendant.hasAttribute(attr))
                descendant[attr] = descendant[attr];
        }
        setSrcSet(descendant)
    }
    return node;
}

unsafeWindow.collect_writes = function () {
    for (const record of unsafeWindow.__raw_write_log) {
        let currentDS = new DimensionSets();
        currentDS.recordDimension(record.target, record.args);
        // * Check if the dimension now is the same as before the write
        // * The reason for checking it now is to catch lazy loaded elements
        // * For example, if an image is written to the DOM, it might not be loaded immediately.
        if (record.beforeDS.isDimensionMatch(record.afterDS) && currentDS.isArgsDimensionMatch(record.beforeDS))
            continue
        unsafeWindow.__final_write_log.push(record);
        let args = [];
        for (let arg of record.args) {
            if (args == null || arg == undefined)
                continue
            if (arg instanceof Element) {
                arg = _normalSRC(arg);
                args.push(arg.outerHTML);
            } else if (arg instanceof Node) {
                if (arg.nodeName !== undefined)
                    args.push(arg.nodeName);
                else
                    args.push(arg.nodeType);
            } else { // Assme it is a string
                args.push(arg);
            }
        }
        // Handle img src
        if (record.method === 'setAttribute' && args[0] === 'src')
            args[1] = record.target.src;
        unsafeWindow.__write_log_processed.push({
            xpath: getDomXPath(record.target, fullTree = true),
            method: record.method,
            arg: args
        })
    }
}
unsafeWindow.__recording_enabled = true;