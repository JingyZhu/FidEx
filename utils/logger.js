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

    console.log = (...args) => {
        originalLog(`[${getCurrentTimestamp()} INFO JS]`, ...args);
    };

    console.error = (...args) => {
        originalError(`[${getCurrentTimestamp()} ERROR JS]`, ...args);
    };

    console.warn = (...args) => {
        originalWarn(`[${getCurrentTimestamp()} WARN JS]`, ...args);
    };

    console.info = (...args) => {
        originalInfo(`[${getCurrentTimestamp()} INFO JS]`, ...args);
    };
}

module.exports = { 
    loggerizeConsole
};