/*
    Collect write logs
    Note: need to override Node write methods and setters using node_write_override.js
*/
__write_log_prcessed = [];
for (const record of __write_log){
    __write_log_prcessed.push({
        xpath: getDomXPath(record.target, fullTree=true),
        method: record.method,
    })
}