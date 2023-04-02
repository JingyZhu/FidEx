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
    while (node = node.parentNode) {
        if (node == document) {
            return true;
        }
    }
    return false;
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
        if (isNodeInDocument(this) && __recording_enabled){
            _debug_log("write1", this, method, args);
            __write_log.push({
                target: this,
                method: method,
                args: args
            })
        }
        return original.apply(this, args);
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
            if (isNodeInDocument(this) && __recording_enabled){
                _debug_log("set", this, property, value);
                __write_log.push({
                    target: this,
                    method: 'set:' + property,
                    args: [value]
                })
            }
            return original_setter.apply(this, [value]);
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
        if (isNodeInDocument(this) && __recording_enabled){
            _debug_log("write2", this, method, args);
            __write_log.push({
                target: this,
                method: method,
                args: args
            })
        }
        return original.apply(this, args);
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
            if (isNodeInDocument(this) && __recording_enabled){
                _debug_log("set2", this, property, value);
                __write_log.push({
                    target: this,
                    method: 'set:' + property,
                    args: [value]
                })
            }
            return original_setter.apply(this, [value]);
        }
    });
}