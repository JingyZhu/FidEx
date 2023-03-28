/*
    Collect write logs
    Note: need to override Node write methods and setters using node_write_override.js
*/
__write_log_prcessed = [];
for (const record of __write_log){
    const firstArg = record.args[0];
    let argName = null;
    if (firstArg instanceof Node){
        if (firstArg.tagName !== undefined)
            argName = firstArg.tagName;
        else if (firstArg.nodeName !== undefined)
            argName = firstArg.nodeName;
        else
            argName = firstArg.nodeType;
    } else { // Assme it is a string
        argName = firstArg;
    }
    __write_log_prcessed.push({
        xpath: getDomXPath(record.target, fullTree=true),
        method: record.method,
        arg: argName
    })
}