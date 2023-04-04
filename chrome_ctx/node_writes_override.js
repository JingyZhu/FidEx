/*
    Override (all) HTML Node's write methods to track the writes.
*/
__debug = false;
__recording_enabled = true;
__write_log = [];


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
        let beforeDimension = null, beforeParentDimension = null;
        let afterDimension = null, afterParentDimension = null;
        let record = null;
        const ableRecord = __recording_enabled && isNodeInDocument(this);
        if (ableRecord){
            beforeDimension = getDimension(this);
            beforeParentDimension = getDimension(this.parentNode);
            record = {
                target: this,
                method: method,
                args: args
            }
        }
        retVal = original.apply(this, args);
        if (ableRecord){
            afterDimension = getDimension(this);
            afterParentDimension = getDimension(this.parentNode);
            // * Record only if the dimension changes
            if (beforeDimension.width !== afterDimension.width || beforeDimension.height !== afterDimension.height
                || beforeParentDimension.width !== afterParentDimension.width || beforeParentDimension.height !== afterParentDimension.height){
                _debug_log("write", this, method, args);
                __write_log.push(record);
            }
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
            let beforeDimension = null, beforeParentDimension = null;
            let afterDimension = null, afterParentDimension = null;
            let record = null;
            const ableRecord = __recording_enabled && isNodeInDocument(this);
            if (ableRecord){
                beforeDimension = getDimension(this);
                beforeParentDimension = getDimension(this.parentNode);
                record = {
                    target: this,
                    method: 'set:' + property,
                    args: [value]
                }
            }
            retVal = original_setter.apply(this, [value]);
            if (ableRecord){
                afterDimension = getDimension(this);
                afterParentDimension = getDimension(this.parentNode);
                // * Record only if the dimension changes
                if (beforeDimension.width !== afterDimension.width || beforeDimension.height !== afterDimension.height
                    || beforeParentDimension.width !== afterParentDimension.width || beforeParentDimension.height !== afterParentDimension.height){
                    _debug_log("set", this, property, value);
                    __write_log.push(record);
                }
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
        let beforeDimension = null, beforeParentDimension = null;
        let afterDimension = null, afterParentDimension = null;
        let record = null;
        const ableRecord = __recording_enabled && isNodeInDocument(this);
        if (ableRecord){
            beforeDimension = getDimension(this);
            beforeParentDimension = getDimension(this.parentNode);
            record = {
                target: this,
                method: method,
                args: args
            }
        }
        retVal = original.apply(this, args);
        if (ableRecord){
            afterDimension = getDimension(this);
            afterParentDimension = getDimension(this.parentNode);
            // * Record only if the dimension changes
            if (beforeDimension.width !== afterDimension.width || beforeDimension.height !== afterDimension.height
                || beforeParentDimension.width !== afterParentDimension.width || beforeParentDimension.height !== afterParentDimension.height){
                _debug_log("write2", this, method, args);
                __write_log.push(record);
            }
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
            let beforeDimension = null, beforeParentDimension = null;
            let afterDimension = null, afterParentDimension = null;
            let record = null;
            const ableRecord = __recording_enabled && isNodeInDocument(this);
            if (ableRecord){
                beforeDimension = getDimension(this);
                beforeParentDimension = getDimension(this.parentNode);
                record = {
                    target: this,
                    method: 'set:' + property,
                    args: [value]
                }
            }
            retVal = original_setter.apply(this, [value]);
            if (ableRecord){
                afterDimension = this.getBoundingClientRect();
                afterParentDimension = getDimension(this.parentNode);
                // * Record only if the dimension changes
                if (beforeDimension.width !== afterDimension.width || beforeDimension.height !== afterDimension.height
                    || beforeParentDimension.width !== afterParentDimension.width || beforeParentDimension.height !== afterParentDimension.height){
                    _debug_log("set2", this, property, value);
                    __write_log.push(record);
                }
            }
            return retVal;
        }
    });
}