// ==UserScript==
// @name         node_writes_override
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @include      http://*
// @include      https://*
// @icon         https://t3.ftcdn.net/jpg/03/48/77/66/360_F_348776635_H2XrTmUb3HNv9TOhcFcDXXaAeT5CBLLJ.jpg
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==


/*
   Contains functions that are commonly used by multiple other files
   For files that require this file, set loadUtils=true before execution
*/


Error.stackTraceLimit = Infinity;

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

// * chrome_ctx version of the code starts from here
// * To chrome_ctx: Replace unsafeWindow. with empty string
// * From chrome_ctx: Replace __ with unsafdeWindow.__
/**
 * Override (all) HTML Node's write methods to track the writes.
 */
unsafeWindow.__debug = false;
unsafeWindow.__recording_enabled = true;
unsafeWindow.__trace_enabled = false;
unsafeWindow.__write_log = [];
unsafeWindow.__raw_write_log = [];
unsafeWindow.__write_id = 0;
unsafeWindow.__current_stage = 'onload';
unsafeWindow.__console_message = console.warn;


function _debug_log(...args) {
    if (unsafeWindow.__debug)
        console.log(...args);
}

function _get_wid() {
    if (window === window.top)
        return `${unsafeWindow.__write_id++}`;
    else {
        const frameName = window.name;
        return `${unsafeWindow.__write_id++}:${frameName}`;
    }
}

// Check if the node is in the document
function isNodeInDocument(node) {
    return node.isConnected;
}

// Light version of chrome_ctx/render_tree_collect.js
function getNodeTextLight(node) {
    if (node.nodeType === Node.ELEMENT_NODE){
        let tag = node.outerHTML;
        match = tag.match(/<[^>]+>/);
        return match ? match[0] : tag;
    } else if (node.nodeType === Node.TEXT_NODE){
        return node.textContent;
    } else
        return null;
}

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
        if (before.width * before.height === 0 && after.width * after.height === 0) {
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
    // Not used at this point
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

    getSelfDimension() {
        return this.dimension ? {
            left: this.dimension.left,
            top: this.dimension.top,
            width: this.dimension.width,
            height: this.dimension.height,
        } : null;
    }

}

/**
 *
 * @param {Function} originalFn
 * @param {String} method
 * @param {object} contextNode If provided, will be the actual node that this write is applied to. If not, this will be the node that the write method is called on.
 * @returns
 */
function newWriteMethod(originalFn, method, contextNode=null) {
    return function (...args) {
        let thisNode = contextNode;
        if (thisNode == null) {
            thisNode = this;
        }
        const wid = _get_wid();
        let beforeDS = new DimensionSets();
        let record = null;
        const ableRecord = unsafeWindow.__recording_enabled && isNodeInDocument(thisNode);
        // Deep copy arg in args if arg is a node
        let viable_args = [];
        let args_copy = []
        for (const arg of args) {
            // ? Seen document fragment being empty after insertion (probably destroyed by jQuery)
            // ? Need to unwrap it before apply originalFn
            // * Seen errors on "right hand side of 'instanceof' is not an object" when arg is a DocumentFragment. So try first
            let instanceofDF = false;
            try {instanceofDF = arg instanceof DocumentFragment;} catch(e) {}
            if (instanceofDF) {
                let children = arg.childNodes;
                viable_args.push([])
                for (const child of children) {
                    viable_args[viable_args.length - 1].push(child);
                }
            }
            else
                viable_args.push(arg);

            if (arg instanceof Node)
                args_copy.push(arg.cloneNode(true));
        }
        if (ableRecord) {
            beforeDS.recordDimension(thisNode, args);
            record = {
                target: thisNode,
                method: method,
                args: viable_args,
                args_snapshot: args_copy,
                beforeDS: beforeDS,
                beforeText: getNodeTextLight(thisNode),
                trace: Error().stack,
                id: wid,
                currentStage: unsafeWindow.__current_stage,
            }
        }

        // * Record current stack trace.
        if (unsafeWindow.__trace_enabled)
            unsafeWindow.__console_message("wid " + wid);

        retVal = originalFn.apply(this, args);
        if (ableRecord) {
            let afterDS = new DimensionSets();
            afterDS.recordDimension(thisNode, args);
            record.afterDS = afterDS;
            record.afterText = getNodeTextLight(thisNode);
            // * Record only if the dimension changes
            // ! One thing to note is that the dimension of the node might not immediately change after the write (e.g. if write an image to the DOM, the dimension of the image might not be available immediately)
            // ! Might need to wait till the end of the page load for comparing the dimension
            if (!beforeDS.isDimensionMatch(afterDS)) {
                _debug_log("write", thisNode, method, args);
                unsafeWindow.__write_log.push(record);
            }
            unsafeWindow.__raw_write_log.push(record);
        }
        return retVal;
    };
}

// Override Node write methods
node_write_methods = [
    'appendChild',
    'insertBefore',
    'replaceChild',
    'removeChild'
];

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
        set: newWriteMethod(origianlFn, `set:${property}`)
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


element_properties = {
    Element: ['className', 'id', 'innerHTML'],
    HTMLElement: ['hidden', 'style'],
    HTMLImageElement: ['src', 'srcset'],
    HTMLAnchorElement: ['href'],
    HTMLScriptElement: ['src'],
    HTMLIFrameElement: ['src'],
}

for (const [element, properties] of Object.entries(element_properties)) {
    for (const property of properties) {
        const originalDesc = Object.getOwnPropertyDescriptor(window[element].prototype, property);
        // if (originalDesc == null || originalDesc.set == null)
        //     continue;
        const originalFn = originalDesc.set;
        Object.defineProperty(window[element].prototype, property, {
            set: newWriteMethod(originalFn, `set:${property}`)
        });
    }
}

// Override classList methods
classList_methods = [
    'add',
    'remove',
    'toggle'
]

for (const method of classList_methods) {
    const originalFn = DOMTokenList.prototype[method];
    DOMTokenList.prototype[method] = function(...args) {
        // Look for node in the document that has this classList
        let node = null;
        for (const element of document.querySelectorAll('*')) {
            if (element.classList === this) {
                node = element;
                break;
            }
        }
        return node ? newWriteMethod(originalFn, `classList.${method}`, node).apply(this, args) : originalFn.apply(this, args);
    }
}

// Override CSSStyleDeclaration set
cssstyle_methods = [
    'setProperty'
]

for (const method of cssstyle_methods) {
    const originalFn = CSSStyleDeclaration.prototype[method];
    CSSStyleDeclaration.prototype.setProperty = function (...args) {
        // Look for node in the document that has this classList
        let node = null;
        for (const element of document.querySelectorAll('*')) {
            if (element.style === this) {
                node = element;
                break;
            }
        }
        return node ? newWriteMethod(originalFn, `CSSStyleDeclaration.${method}`, node).apply(this, args) : originalFn.apply(this, args);
    }
}

const originalStyleDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
const originalStyleGet = originalStyleDesc.get;

function proxyStyle(style) {
    return new Proxy(style, {
        set: function(target, property, value, receiver) {
            const originalSet = (property, value) => {target[property] = value; return true};
            // Look for node in the document that has this classList
            let node = null;
            for (const element of document.querySelectorAll('*')) {
                if (element._style === target) {
                    node = element;
                    break;
                }
            }
            return node && typeof property == 'string' ? newWriteMethod(originalSet, `set:CSSStyleDeclaration.${property}`, node).apply(target, [property, value]) : originalSet(property, value);
        },
        get: function(target, property, receiver) {
            const value = Reflect.get(target, property);
            // If the value is a function, bind it to the target object to maintain context
            if (typeof value === "function")
                return value.bind(target);
            return value;
        },
    });
}

Object.defineProperty(HTMLElement.prototype, "style", {
    get: function () {
        if (this._proxyStyle)
          return this._proxyStyle;
        const originalStyle = originalStyleGet.call(this);
        this._style = originalStyle;
        this._proxyStyle = proxyStyle(originalStyle);
        return this._proxyStyle;
      },
    configurable: true, // Allows the property to be reconfigured later if needed
    enumerable: true, // Makes the property show up in enumeration (e.g., for-in)
});