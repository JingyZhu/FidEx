/**
 * Override (all) HTML Node's write methods to track the writes.
 */
__debug = false;
__recording_enabled = true;
__trace_enabled = false;
__write_log = [];
__raw_write_log = [];
__write_id = 0;


function _debug_log(...args) {
    if (__debug)
        console.log(...args);
}

function _get_wid() {
    const frameName = window.name;
    if (window.name === '')
        return `${__write_id++}`;
    else
        return `${__write_id++}:${frameName}`;
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

// Not used at this point.
class CSSOverrider {
    constructor() {
        this.overriddenElement = new Set();
    }

    _overrideStyleProperties(element) {
        for (const property of __CSSStyleProperties) {
            // TODO: Override all CSS properties.
        }

    }

    /**
     * Override CSS of the element and all its children
     * @param {HTMLElement} element
     */
    overrideElements(element) {
        // TODO: Write this function
        this._overrideStyleProperties(element);
        const elements = element.querySelectorAll('*');
        for (const element of elements) {
            this._overrideStyleProperties(element);
        }
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
        const ableRecord = __recording_enabled && isNodeInDocument(thisNode);
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
                id: wid
            }
        }

        // * Record current stack trace.
        if (__trace_enabled)
            console.trace(wid);

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
                __write_log.push(record);
            }
            __raw_write_log.push(record);
        }
        return retVal;
    };
}

function newSetMethod(originalFn, property) {
    return function (value) {
        const wid = _get_wid();
        let beforeDS = new DimensionSets();
        let record = null;
        const ableRecord = __recording_enabled && isNodeInDocument(this);
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
                beforeDS: beforeDS,
                beforeText: getNodeTextLight(this),
                trace: Error().stack,
                id: wid
            }
        }

        // * Record current stack trace.
        if (__trace_enabled)
            console.trace(wid);

        retVal = originalFn.apply(this, [value]);
        if (ableRecord) {
            let afterDS = new DimensionSets();
            afterDS.recordDimension(this, [value]);
            record.afterDS = afterDS;
            record.afterText = getNodeTextLight(this);
            // * Record only if the dimension changes
            if (!beforeDS.isDimensionMatch(afterDS)) {
                _debug_log("set", this, property, value);
                __write_log.push(record);
            }
            __raw_write_log.push(record);
        }
        return retVal;
    }
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
            set: newSetMethod(originalFn, property)
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

// // * Override setTimeout and setInterval
// const original_setTimeout = window.setTimeout;
// window.setTimeout = function(callback, delay, ...args) {
//     const original_callback = callback;
//     callback = function(...args) {
//         _debug_log("setTimeout", original_callback, args);
//         return original_callback.apply(this, args);
//     }
//     return original_setTimeout(callback, delay/10, ...args);
// }

// const original_setInterval = window.setInterval;
// window.setInterval = function(callback, delay, ...args) {
//     const original_callback = callback;
//     callback = function(...args) {
//         _debug_log("setInterval", original_callback, args);
//         return original_callback.apply(this, args);
//     }
//     return original_setInterval(callback, delay/10, ...args);
// }