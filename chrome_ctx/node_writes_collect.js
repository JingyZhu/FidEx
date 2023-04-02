/*
    Collect write logs
    Note: need to override Node write methods and setters using node_write_override.js
*/
__write_log_processed = [];
for (const record of __write_log){
    const firstArg = record.args[0];
    let argName = null;
    if (firstArg instanceof Element){
        argName = firstArg.outerHTML;
    } else if (firstArg instanceof Node){
        if (firstArg.nodeName !== undefined)
            argName = firstArg.nodeName;
        else
            argName = firstArg.nodeType;
    } else { // Assme it is a string
        argName = firstArg;
    }
    __write_log_processed.push({
        xpath: getDomXPath(record.target, fullTree=true),
        method: record.method,
        arg: argName
    })
}