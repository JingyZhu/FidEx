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
unsafeWindow.__raw_log = [];
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

    // Check if the node's parent has any dimension
    function getDimension(node) {
        if (node == null || typeof node.getBoundingClientRect !== 'function') {
            return { width: 0, height: 0 };
        }
        return node.getBoundingClientRect();
    }

    // Check if dimensions are valid and changes
    function isDimensionChanged(before, after) {
        if (before == null || after == null) {
            return false;
        }
        if (before.left < 0 || before.top < 0 || after.left < 0 || after.top < 0) {
            return false;
        }
        return before.width !== after.width || before.height !== after.height;
    }

    // Override Node write methods
    node_write_methods = [
        'appendChild',
        'insertBefore',
        'replaceChild',
        'removeChild'
    ];

    for (const method of node_write_methods) {
        const original = Node.prototype[method];
        Node.prototype[method] = function (...args) {
            const wid = unsafeWindow.__write_id++;
            let beforeDimension = null, beforeParentDimension = null;
            let afterDimension = null, afterParentDimension = null;
            let record = null;
            const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(this);
            // Deep copy arg in args if arg is a node
            let args_copy = [];
            for (const arg of args) {
                if (arg instanceof Node)
                    args_copy.push(arg.cloneNode(true));
                else
                    args_copy.push(arg);
            }
            if (ableRecord) {
                beforeDimension = getDimension(this);
                beforeParentDimension = getDimension(this.parentNode);
                record = {
                    target: this,
                    method: method,
                    args: args_copy,
                    trace: Error().stack,
                    id: wid
                }
            }
            // if (['appendChild', 'insertBefore', 'replaceChild'].includes(method)){
            //     for (let arg of args){
            //         if (arg instanceof Element){
            //             console.log("AHA")
            //             arg.style.transition = 'all 0s ease 0s'
            //         }
            //     }
            // }

            // * Record current stack trace.
            if (unsafeWindow.__trace_enabled)
                console.trace(wid);

            retVal = original.apply(this, args);
            if (ableRecord) {
                afterDimension = getDimension(this);
                afterParentDimension = getDimension(this.parentNode);
                // * Record only if the dimension changes
                if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)) {
                    _debug_log("write", this, method, args);
                    record.beforeDimension = beforeDimension
                    record.afterDimension = afterDimension
                    record.beforeParentDimension = beforeParentDimension
                    record.afterParentDimension = afterParentDimension
                    unsafeWindow.__write_log.push(record);
                }
                unsafeWindow.__raw_log.push(record);
            }
            return retVal;
        }
    }


    // Override Node setter
    node_properties = [
        'nodeValue',
        'textContent'
    ];

    for (const property of node_properties) {
        const original_setter = Object.getOwnPropertyDescriptor(Node.prototype, property).set;
        Object.defineProperty(Node.prototype, property, {
            set: function (value) {
                const wid = unsafeWindow.__write_id++;
                let beforeDimension = null, beforeParentDimension = null;
                let afterDimension = null, afterParentDimension = null;
                let record = null;
                const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(this);
                // Deep copy value if value is a node
                value_copy = value;
                if (value instanceof Node)
                    value_copy = value.cloneNode(true);
                if (ableRecord) {
                    beforeDimension = getDimension(this);
                    beforeParentDimension = getDimension(this.parentNode);
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

                retVal = original_setter.apply(this, [value]);
                if (ableRecord) {
                    afterDimension = getDimension(this);
                    afterParentDimension = getDimension(this.parentNode);
                    // * Record only if the dimension changes
                    if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)) {
                        _debug_log("set", this, property, value);
                        record.beforeDimension = beforeDimension
                        record.afterDimension = afterDimension
                        record.beforeParentDimension = beforeParentDimension
                        record.afterParentDimension = afterParentDimension
                        unsafeWindow.__write_log.push(record);
                    }
                    unsafeWindow.__raw_log.push(record);
                }
                return retVal;
            }
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
        const original = Element.prototype[method];
        Element.prototype[method] = function (...args) {
            const wid = unsafeWindow.__write_id++;
            let beforeDimension = null, beforeParentDimension = null;
            let afterDimension = null, afterParentDimension = null;
            let record = null;
            const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(this);
            // Deep copy arg in args if arg is a node
            let args_copy = [];
            for (const arg of args) {
                if (arg instanceof Node)
                    args_copy.push(arg.cloneNode(true));
                else
                    args_copy.push(arg);
            }
            if (ableRecord) {
                beforeDimension = getDimension(this);
                beforeParentDimension = getDimension(this.parentNode);
                record = {
                    target: this,
                    method: method,
                    args: args_copy,
                    trace: Error().stack,
                    id: wid
                }
            }
            // if (['append', 'after', 'before'].includes(method)){
            //     for (let arg of args){
            //         if (arg instanceof Element){
            //             console.log("OHO")
            //             arg.style.transition = 'all 0s ease 0s'
            //         }
            //     }
            // }

            // * Record current stack trace.
            if (unsafeWindow.__trace_enabled)
                console.trace(wid);

            retVal = original.apply(this, args);
            if (ableRecord) {
                afterDimension = getDimension(this);
                afterParentDimension = getDimension(this.parentNode);
                // * Record only if the dimension changes
                if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)) {
                    _debug_log("write2", this, method, args);
                    record.beforeDimension = beforeDimension
                    record.afterDimension = afterDimension
                    record.beforeParentDimension = beforeParentDimension
                    record.afterParentDimension = afterParentDimension
                    unsafeWindow.__write_log.push(record);
                }
                unsafeWindow.__raw_log.push(record);
            }
            return retVal;
        }
    }

    // Override Element setter
    element_properties = [
        'className',
        'id',
        'innerHTML',
        // aria attributes
    ]

    for (const property of element_properties) {
        const original_setter = Object.getOwnPropertyDescriptor(Element.prototype, property).set;
        Object.defineProperty(Element.prototype, property, {
            set: function (value) {
                const wid = unsafeWindow.__write_id++;
                let beforeDimension = null, beforeParentDimension = null;
                let afterDimension = null, afterParentDimension = null;
                let record = null;
                const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(this);
                // Deep copy value if value is a node
                value_copy = value;
                if (value instanceof Node)
                    value_copy = value.cloneNode(true);
                if (ableRecord) {
                    beforeDimension = getDimension(this);
                    beforeParentDimension = getDimension(this.parentNode);
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

                retVal = original_setter.apply(this, [value]);
                if (ableRecord) {
                    afterDimension = this.getBoundingClientRect();
                    afterParentDimension = getDimension(this.parentNode);
                    // * Record only if the dimension changes
                    if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)) {
                        _debug_log("set2", this, property, value);
                        record.beforeDimension = beforeDimension
                        record.afterDimension = afterDimension
                        record.beforeParentDimension = beforeParentDimension
                        record.afterParentDimension = afterParentDimension
                        unsafeWindow.__write_log.push(record);
                    }
                    unsafeWindow.__raw_log.push(record);
                }
                return retVal;
            }
        });
    }

})();