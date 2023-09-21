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

// Check if the node's parent has any dimension
function getDimension(node) {
    if (node == null || typeof node.getBoundingClientRect !== 'function') {
        return {width: 0, height: 0};
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

for(const method of node_write_methods) {
    const original = Node.prototype[method];
    Node.prototype[method] = function(...args) {
        const wid = __write_id++;
        let beforeDimension = null, beforeParentDimension = null;
        let afterDimension = null, afterParentDimension = null;
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
        if (ableRecord){
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
        if (__trace_enabled)
            console.trace(wid);
        
        retVal = original.apply(this, args);
        if (ableRecord){
            afterDimension = getDimension(this);
            afterParentDimension = getDimension(this.parentNode);
            // * Record only if the dimension changes
            if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)){
                _debug_log("write", this, method, args);
                record.beforeDimension = beforeDimension
                record.afterDimension = afterDimension
                record.beforeParentDimension = beforeParentDimension
                record.afterParentDimension = afterParentDimension
                __write_log.push(record);
            }
            __raw_write_log.push(record);
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
        set: function(value) {
            const wid = __write_id++;
            let beforeDimension = null, beforeParentDimension = null;
            let afterDimension = null, afterParentDimension = null;
            let record = null;
            const ableRecord = __recording_enabled && isNodeInDocument(this);
            // Deep copy value if value is a node
            value_copy = value;
            if (value instanceof Node)
                value_copy = value.cloneNode(true);
            if (ableRecord){
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
            if (__trace_enabled)
                console.trace(wid);
        
            retVal = original_setter.apply(this, [value]);
            if (ableRecord){
                afterDimension = getDimension(this);
                afterParentDimension = getDimension(this.parentNode);
                // * Record only if the dimension changes
                if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)){
                    _debug_log("set", this, property, value);
                    record.beforeDimension = beforeDimension
                    record.afterDimension = afterDimension
                    record.beforeParentDimension = beforeParentDimension
                    record.afterParentDimension = afterParentDimension
                    __write_log.push(record);
                }
                __raw_write_log.push(record);
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

for(const method of element_write_methods) {
    const original = Element.prototype[method];
    Element.prototype[method] = function(...args) {
        const wid = __write_id++;
        let beforeDimension = null, beforeParentDimension = null;
        let afterDimension = null, afterParentDimension = null;
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
        if (ableRecord){
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
        if (__trace_enabled)
            console.trace(wid);
        
        retVal = original.apply(this, args);
        if (ableRecord){
            afterDimension = getDimension(this);
            afterParentDimension = getDimension(this.parentNode);
            // * Record only if the dimension changes
            if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)){
                _debug_log("write2", this, method, args);
                record.beforeDimension = beforeDimension
                record.afterDimension = afterDimension
                record.beforeParentDimension = beforeParentDimension
                record.afterParentDimension = afterParentDimension
                __write_log.push(record);
            }
            __raw_write_log.push(record);
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
        set: function(value) {
            const wid = __write_id++;
            let beforeDimension = null, beforeParentDimension = null;
            let afterDimension = null, afterParentDimension = null;
            let record = null;
            const ableRecord = __recording_enabled && isNodeInDocument(this);
            // Deep copy value if value is a node
            value_copy = value;
            if (value instanceof Node)
                value_copy = value.cloneNode(true);
            if (ableRecord){
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
            if (__trace_enabled)
                console.trace(wid);

            retVal = original_setter.apply(this, [value]);
            if (ableRecord){
                afterDimension = this.getBoundingClientRect();
                afterParentDimension = getDimension(this.parentNode);
                // * Record only if the dimension changes
                if (isDimensionChanged(beforeDimension, afterDimension) || isDimensionChanged(beforeParentDimension, afterParentDimension)){
                    _debug_log("set2", this, property, value);
                    record.beforeDimension = beforeDimension
                    record.afterDimension = afterDimension
                    record.beforeParentDimension = beforeParentDimension
                    record.afterParentDimension = afterParentDimension
                    __write_log.push(record);
                }
                __raw_write_log.push(record);
            }
            return retVal;
        }
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