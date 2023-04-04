/*
    Collect write logs
    Note: need to override Node write methods and setters using node_write_override.js
*/
__write_log_processed = [];
__recording_enabled = false;
// Normalize all href and src attributes in node
function _normalSRC(node){
    const _attrs = ['src', 'href', 'action'];
    for (let attr of _attrs){
        if (node.hasAttribute(attr))
            node[attr] = node[attr];
    }
    let allDescendants = node.querySelectorAll('*');
    for (let descendant of allDescendants){
        for (let attr of _attrs){
            if (descendant.hasAttribute(attr))
                descendant[attr] = descendant[attr];
        }
    }
    return node;
}

for (const record of __write_log){
    let args = [];
    for (let arg of record.args){
        if (args == null || arg == undefined)
            continue
        if (arg instanceof Element){
            arg = _normalSRC(arg);
            args.push(arg.outerHTML);
        } else if (arg instanceof Node){
            if (arg.nodeName !== undefined)
                args.push(arg.nodeName);
            else
                args.push(arg.nodeType);
        } else { // Assme it is a string
            args.push(arg);
        }
    }
    // Handle img src
    if (record.method === 'setAttribute' && args[0] === 'src')
        args[1] = record.target.src;
    __write_log_processed.push({
        xpath: getDomXPath(record.target, fullTree=true),
        method: record.method,
        arg: args
    })
}
__recording_enabled = true;