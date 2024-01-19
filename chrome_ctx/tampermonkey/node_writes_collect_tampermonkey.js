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
        this.parentDimension = null;
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
        this.parentDimension = this._getDimension(node.parentNode);
        for (const arg of args) {
            if (arg instanceof Node){
                this.argsDimension.push(this._getDimension(arg));
                this.argsText.push(arg.outerHTML);
            }
        }
    }

    // Check if the dimensions for both parent and this are visible
    // TODO: This is fairly strict (return false if any args dimension is 0). The reason to set it this way is to only focusing on element addition in liveweb. So false positives for fidelity check are filtered out as much as possible, and we don't care about false negatives.
    visible() {
        if (this.dimension == null || this.parentDimension == null)
            return false;
        if (this.dimension.width === 0 || this.dimension.height === 0)
            return false;
        if (this.parentDimension.width === 0 || this.parentDimension.height === 0)
            return false;
        for (const arg of this.argsDimension) {
            if (arg.width === 0 || arg.height === 0)
                return false;
        }
        return true;
    }

    /**
     * Check if the dimension match with another Dimension
     * @param {DimensionSets} other
     * @returns {boolean} true if the dimension match
     */
    isDimensionMatch(other) {
        if (this._isDimensionChanged(this.dimension, other.dimension)
            || this._isDimensionChanged(this.parentDimension, other.parentDimension))
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
unsafeWindow.__raw_write_log_processed = [];
unsafeWindow.__final_write_log = [];
unsafeWindow.__final_write_log_processed = [];

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
    unsafeWindow.__recording_enabled = false;
    // Process raw_args so that it can be stringified
    function process_args(raw_args) {
        let args = [];
        for (let arg of raw_args) {
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
        return args;
    }

    function visible(record, DS){
        if (!DS.visible())
            return false;
        const styleHidden = (element) => {
            if (!(element instanceof Node))
                return false
            const style = window.getComputedStyle(element);
            if (style.visibility == 'hidden' || style.display == 'none' || style.opacity == 0)
                return true;
            return false
        }
        if (styleHidden(record.target))
            return false
        for (const arg of record.args){
            if (styleHidden(arg))
                return false
        }
        return true
    }

    for (const record of unsafeWindow.__raw_write_log) {
        args = process_args(record.args);
        if (record.method === 'setAttribute' && args[0] === 'src')
            args[1] = record.target.src;

        unsafeWindow.__raw_write_log_processed.push({
            xpath: getDomXPath(record.target),
            method: record.method,
            arg: args
        })

        let currentDS = new DimensionSets();
        currentDS.recordDimension(record.target, record.args);
        // * Check if the dimension now is the same as before the write
        // * The reason for checking it now is to catch lazy loaded elements
        // * For example, if an image is written to the DOM, it might not be loaded immediately.
        if (record.beforeDS.isDimensionMatch(record.afterDS) && currentDS.isArgsDimensionMatch(record.beforeDS))
            continue
        // ? Only include the write if the argument is still visible now.
        // TODO: Think more about whether this is valid
        // if (!visible(record, currentDS))
        //     continue
        unsafeWindow.__final_write_log.push(record);
        // Handle img src
        unsafeWindow.__final_write_log_processed.push({
            wid: record.id,
            xpath: getDomXPath(record.target),
            method: record.method,
            arg: args
        })
    }
}

// Find writes that have target of element (or element's ancestors)
unsafeWindow.find_writes = function(log, element) {
    let writes = [];
    for (let i = 0; i < log.length; i++) {
        const target = log[i].target;
        // check if target is element or the ancestor of element
        if (target.contains(element)){
            let write = Object.assign({}, log[i]);
            write.idx = i;
            writes.push(write);
        }
    }
    return writes;
}