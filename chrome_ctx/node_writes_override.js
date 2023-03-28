/*
    Override (all) HTML Node's write methods to track the writes.
*/
__start_recording = true;
__write_log = [];

write_methods = [
    'appendChild',
    'insertBefore',
    'replaceChild',
    'removeChild',
    // 'setAttribute',
    // 'removeAttribute',
    // 'setAttributeNode',
    // 'removeAttributeNode',
    // 'setAttributeNS',
    // 'removeAttributeNS',
    // 'setAttributeNodeNS',
    // 'removeAttributeNodeNS',
    // 'insertData',
    // 'appendData',
    // 'deleteData',
    // 'replaceData',
    // 'insertText',
    // 'deleteText',
    // 'replaceText',
    // 'insertComment',
    // 'insertElement',
    // 'insertElementAt',
    // 'insertTextAt',
    // 'insertCommentAt',
    // 'replaceChildAt',
    // 'replaceChildNodes',
    // 'replaceWholeText',
    // 'removeChildAt',
    // 'removeChildNodes',
    // 'removeChildren',
    // 'removeAttributeAt',
    // 'removeAttributeNodeAt',
    // 'removeAttributeNSAt',
    // 'removeAttributeNodeNSAt',
    // 'removeNamedItem',
    // 'removeNamedItemNS',
    // 'removeItem',
    // 'removeItemNS'
];

// Override Node write methods
for(const method of write_methods) {
    const original = Node.prototype[method];
    Node.prototype[method] = function(...args) {
        if (__start_recording){
            // console.log("write", this, method, args);
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
properties = [
    'nodeValue',
    'textContent'
];

for (const property of properties) {
    const original_setter = Object.getOwnPropertyDescriptor(Node.prototype, property).set;
    Object.defineProperty(Node.prototype, property, {
        set: function(value) {
            if (__start_recording){
                // console.log("set", this, property, value);
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