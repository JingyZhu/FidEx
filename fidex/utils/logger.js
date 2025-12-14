const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

function loggerizeConsole() {
    function getCurrentTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');  // Months are 0-based, so add 1
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function getCallLocation() {
        const stack = new Error().stack;
        if (!stack) return '';
        const lines = stack.split('\n');
        // The third line in the stack trace is usually the caller
        if (lines.length >= 4) {
            let callerLine = lines[3].trim().replace(/\s*at\s*/, '');
            // Example stack line: at Object.<anonymous> (/path/to/file.js:10:15)
            const match = callerLine.match(/^(.*?) \((.*):(\d+):(\d+)\)$/) || callerLine.match(/^(.*):(\d+):(\d+)$/);
            if (match) {
                if (match.length === 5) {
                    // With function name
                    const func = match[1].split(' ')[0];
                    const file = match[2].split('/').pop();
                    const line = match[3];
                    return `${file}:${line}`;
                } else if (match.length === 4) {
                    // Without function name
                    const file = match[1].split('/').pop();
                    const line = match[2];
                    return `${file}:${line}`;
                }
            }
        }
        return '';
    }

    console.log = (...args) => {
        originalLog(`[${getCurrentTimestamp()} INFO ${getCallLocation()}]`, ...args);
    };

    console.error = (...args) => {
        originalError(`[${getCurrentTimestamp()} ERROR ${getCallLocation()}]`, ...args);
    };

    console.warn = (...args) => {
        originalWarn(`[${getCurrentTimestamp()} WARN ${getCallLocation()}]`, ...args);
    };

    console.info = (...args) => {
        originalInfo(`[${getCurrentTimestamp()} INFO JS]`, ...args);
    };
}

module.exports = { 
    loggerizeConsole
};