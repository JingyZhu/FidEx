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
    return function(...args){
        const wid = __write_id++;
        let beforeDS = new DimensionSets();
        let record = null;
        const ableRecord = __recording_enabled && isNodeInDocument(this);
        // Deep copy arg in args if arg is a node
        let args_copy = [];
        for (const arg of args) {
            if (arg instanceof Node)
                args_copy.push(arg.cloneNode(true));
            else
                args_copy.push(arg);
        }
        if (ableRecord) {
            beforeDS.recordDimension(this, args);
            record = {
                target: this,
                method: method,
                args: args_copy,
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
            afterDS.recordDimension(this, args);
            // * Record only if the dimension changes
            if (!beforeDS.isDimensionMatch(afterDS)) {
                _debug_log("write", this, method, args);
                record.beforeDS = beforeDS;
                record.afterDS = afterDS;
                __write_log.push(record);
            }
            __raw_write_log.push(record);
        }
        return retVal;
    };
}

function newSetMethod(originalFn, property) {
    return function(value){
        const wid = __write_id++;
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
            // * Record only if the dimension changes
            if (!beforeDS.isDimensionMatch(afterDS)) {
                _debug_log("set", this, property, value);
                record.beforeDS = beforeDS;
                record.afterDS = afterDS;
                __write_log.push(record);
            }
            __raw_write_log.push(record);
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