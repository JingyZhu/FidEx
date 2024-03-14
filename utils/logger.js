class Logger {
    constructor() {
        this.levels = ['debug', 'verbose', 'log', 'warn', 'error'];
        this.colors = ['\x1b[34m', '\x1b[36m', '\x1b[32m', '\x1b[33m', '\x1b[31m']
        this.level = 'log';
    }

    _colorize(msg, color) {
        if (process.stdout.isTTY)
            return `${color}${msg}\x1b[0m`;
        else
            return msg
    }

    log(...args) {
        let idx = this.levels.indexOf('log');
        if (idx < this.levels.indexOf(this.level))
            return;
        const [firstArg, ...remainingArgs] = args;
        console.log(this._colorize(firstArg, this.colors[idx]), ...remainingArgs);
    }

    debug(...args) {
        let idx = this.levels.indexOf('debug');
        if (idx < this.levels.indexOf(this.level))
            return;
        const [firstArg, ...remainingArgs] = args;
        console.log(this._colorize(firstArg, this.colors[idx]), ...remainingArgs);
    }

    verbose(...args) {
        let idx = this.levels.indexOf('verbose');
        if (idx < this.levels.indexOf(this.level))
            return;
        const [firstArg, ...remainingArgs] = args;
        console.log(this._colorize(firstArg, this.colors[idx]), ...remainingArgs);
    }

    warn(...args) {
        let idx = this.levels.indexOf('warn');
        if (idx < this.levels.indexOf(this.level))
            return;
        const [firstArg, ...remainingArgs] = args;
        console.log(this._colorize(firstArg, this.colors[idx]), ...remainingArgs);
    }

    error(...args) {
        let idx = this.levels.indexOf('error');
        if (idx < this.levels.indexOf(this.level))
            return;
        const [firstArg, ...remainingArgs] = args;
        console.log(this._colorize(firstArg, this.colors[idx]), ...remainingArgs);
    }
}

const logger = new Logger();

module.exports = { 
    Logger,
    logger
};