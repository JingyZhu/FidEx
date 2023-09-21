// ==UserScript==
// @name         node_override
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @include      http://*
// @include      https://*
// @icon         https://cdn-icons-png.flaticon.com/512/4436/4436481.png
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
        for (let i = 1, sib = elm.previousSibling; sib; sib = sib.previousSibling) {
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

unsafeWindow.__debug = false;
unsafeWindow.__recording_enabled = true;
unsafeWindow.__trace_enabled = false;
unsafeWindow.__write_log = [];
unsafeWindow.__raw_write_log = [];
unsafeWindow.__write_id = 0;

(function () {
    // 'use strict';

    // Your code here...

    /*
        Override (all) HTML Node's write methods to track the writes.
    */


    function _debug_log(...args) {
        if (unsafeWindow.__debug)
            console.log(...args);
    }

    // Check if the node is in the document
    function isNodeInDocument(node) {
        return node.isConnected;
    }

    /**
     * Class for sets of recorded dimensions of different nodes.
     */
    class DimensionSets {
        constructor() {
            this.dimension = null;
            this.parentDimention = null;
            this.argsDimension = [];
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
                if (arg instanceof Node)
                    this.argsDimension.push(this._getDimension(arg));
            }
        }

        /**
         * Check if the dimension match with another Dimension
         * @param {DimensionSets} other 
         * @returns {boolean} true if the dimension match
         */
        isDimensionMatch(other) {
            if (this._isDimensionChanged(this.dimension, other.dimension) || this._isDimensionChanged(this.parentDimention, other.parentDimention)) {
                return false;
            }
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
    }

    // Override Node write methods
    node_write_methods = [
        'appendChild',
        'insertBefore',
        'replaceChild',
        'removeChild'
    ];

    function newWriteMethod(originalFn, method) {
        return function (...args) {
            const wid = unsafeWindow.__write_id++;
            let beforeDS = new DimensionSets();
            let record = null;
            const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(this);
            // Deep copy arg in args if arg is a node
            let viable_args = [];
            let args_copy = []
            for (const arg of args) {
                // ? Seen document fragment being empty after insertion (probably destroyed by jQuery)
                // ? Need to unwrap it before apply originalFn
                if (arg instanceof DocumentFragment) {
                    let children = arg.childNodes;
                    for (const child of children) {
                        viable_args.push(child);
                    }
                }
                else
                    viable_args.push(arg);

                if (arg instanceof Node)
                    args_copy.push(arg.cloneNode(true));
            }
            if (ableRecord) {
                beforeDS.recordDimension(this, args);
                record = {
                    target: this,
                    method: method,
                    args: viable_args,
                    args_snapshot: args_copy,
                    trace: Error().stack,
                    id: wid
                }
            }

            // * Record current stack trace.
            if (unsafeWindow.__trace_enabled)
                console.trace(wid);

            retVal = originalFn.apply(this, args);
            if (ableRecord) {
                let afterDS = new DimensionSets();
                afterDS.recordDimension(this, args);
                // * Record only if the dimension changes
                // ! One thing to note is that the dimension of the node might not immediately change after the write (e.g. if write an image to the DOM, the dimension of the image might not be available immediately)
                // ! Might need to wait till the end of the page load for comparing the dimension
                if (!beforeDS.isDimensionMatch(afterDS)) {
                    _debug_log("write", this, method, args);
                    record.beforeDS = beforeDS;
                    record.afterDS = afterDS;
                    unsafeWindow.__write_log.push(record);
                }
                unsafeWindow.__raw_write_log.push(record);
            }
            return retVal;
        };
    }

    function newSetMethod(originalFn, property) {
        return function (value) {
            const wid = unsafeWindow.__write_id++;
            let beforeDS = new DimensionSets();
            let record = null;
            const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(this);
            // Deep copy value if value is a node
            value_copy = value;
            if (value instanceof Node)
                value_copy = value.cloneNode(true);
            if (ableRecord) {
                beforeDS.recordDimension(this, [value]);
                record = {
                    target: this,
                    method: 'set:' + property,
                    args: [value_copy],
                    trace: Error().stack,
                    id: wid
                }
            }

            // * Record current stack trace.
            if (unsafeWindow.__trace_enabled)
                console.trace(wid);

            retVal = originalFn.apply(this, [value]);
            if (ableRecord) {
                let afterDS = new DimensionSets();
                afterDS.recordDimension(this, [value]);
                // * Record only if the dimension changes
                if (!beforeDS.isDimensionMatch(afterDS)) {
                    _debug_log("set", this, property, value);
                    record.beforeDS = beforeDS;
                    record.afterDS = afterDS;
                    unsafeWindow.__write_log.push(record);
                }
                unsafeWindow.__raw_write_log.push(record);
            }
            return retVal;
        }
    }


    for (const method of node_write_methods) {
        const originalFn = Node.prototype[method];
        Node.prototype[method] = newWriteMethod(originalFn, method);
    }

    // Override Node setter
    node_properties = [
        'nodeValue',
        'textContent'
    ];

    for (const property of node_properties) {
        const origianlFn = Object.getOwnPropertyDescriptor(Node.prototype, property).set;
        Object.defineProperty(Node.prototype, property, {
            set: newSetMethod(origianlFn, property)
        });
    }


    // Override Element write methods
    element_write_methods = [
        'after',
        'append',
        'before',
        // "insertAdjacentElement",
        // "insertAdjacentHTML",
        // "insertAdjacentText",
        // "prepend",
        'remove',
        'removeAttribute',
        'removeAttributeNode',
        'removeAttributeNS',
        'replaceChildren',
        'replaceWith',
        'setAttribute',
        'setAttributeNode',
        'setAttributeNodeNS',
        'setAttributeNS',
        'setHTML'
    ]

    for (const method of element_write_methods) {
        const originalFn = Element.prototype[method];
        Element.prototype[method] = newWriteMethod(originalFn, method);
    }

    // Override Element setter
    element_properties = [
        'className',
        'id',
        'innerHTML',
        // aria attributes
    ]

    for (const property of element_properties) {
        const originalFn = Object.getOwnPropertyDescriptor(Element.prototype, property).set;
        Object.defineProperty(Element.prototype, property, {
            set: newSetMethod(originalFn, property)
        });
    }

})();