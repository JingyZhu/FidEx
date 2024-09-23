/**
 * Overridee functions that add tasks to microtask and macrotask queues
 * When these functions are called, add a record to a log, and track when the function get executed
*/

__tasks = new class {
    constructor() {
        this.tasks = new Map();
        this.timeoutMap = new Map();
        this.timeIntervalMap = new Map();
        this.inRecord = true;
        this.seen = new Map();
        this.finished = 0;
    }

    addTask(task, value=null) {
        const currentTs = Date.now();
        if (this.seen.has(task))
            return;
        this.seen.set(task, true);
        if (!value) value = {}
        if (!this.tasks.has(task))
            this.tasks.set(task, {...value, ...{ts: currentTs, count: 0}});
        this.tasks.set(task, {...value, ...{count: this.tasks.get(task).count + 1, ts: currentTs}});
    }

    addCallback(cb) {
        const cbText = cb ? cb.toString() : cb;
        this.addTask(cbText, {callback: cb});
    }

    addPromise(pr) {
        const prExecutor = pr.executor ? pr.executor.toString() : pr;
        this.addTask(prExecutor, {promise: pr});
    }

    removeTask(task) {
        const currentTs = Date.now();
        if (!this.tasks.has(task)) {
            return;
        }
        this.tasks.set(task, {count: this.tasks.get(task).count - 1, ts: currentTs});
        if (this.tasks.get(task).count === 0)
            this.tasks.delete(task);
        if (this.inRecord)
            this.finished++;
    }

    removeCallback(cb) {
        const cbText = cb ? cb.toString() : cb;
        this.removeTask(cbText);
    }

    removePromise(pr) {
        this.removeTask(pr);
        return;
        const prExecutor = pr.executor ? pr.executor.toString() : pr;
        this.removeTask(prExecutor);
    }

    length() {
        // Return the sum of all tasks values
        return Array.from(this.tasks.values()).reduce((a, b) => a + b.count, 0);
    }

    clear() {
        this.tasks.clear();
    }

    start() {
        this.clear();
        this.inRecord = true;
        this.finished = 0;
    }

    stop() {
        this.inRecord = false;
    }

    stable() {
        return this.length() === 0;
    }

    removeTimeouts(delta=2000) {
        const currentTs = Date.now();
        for (let [task, value] of this.tasks) {
            if (currentTs - value.ts > delta) {
                this.removeTask(task);
            }
        }
    }
}

const originalSetTimeout = setTimeout;
setTimeout = function(callback, delay, ...args) {
    let trackedCallBack = function(...cargs) {
        __tasks.removeCallback(callback);
        callback(...cargs);
    }
    __tasks.addCallback(callback);
    const ticket = originalSetTimeout(trackedCallBack, delay, ...args);
    __tasks.timeoutMap.set(ticket, callback);
    return ticket;
};

const originalClearTimeout = clearTimeout;
clearTimeout = function(ticket) {
    __tasks.removeCallback(__tasks.timeoutMap.get(ticket));
    __tasks.timeoutMap.delete(ticket);
    return originalClearTimeout(ticket);
}

const originalSetInterval = setInterval;
// * Version 1: SetInterval --> Limited SetTimeout
// setInterval = function(callback, delay, ...args) {
//     let counter = 0; // To keep track of the number of times the callback is called
//     let maxCalls = 10; // Maximum number of times the callback can be called

//     let limitedCallback = function(...args) {
//         if (counter < maxCalls) {
//             counter++;
//             callback(...args); // Call the original callback
//             originalSetTimeout(limitedCallback, delay); // Schedule the next call
//         }
//         __tasks.removeCallback(callback);
//     }

//     __tasks.addCallback(callback);
//     // Start the first call
//     const ticket = originalSetTimeout(limitedCallback, delay, ...args);
//     return ticket;
// };


// * Version 2: SetInterval --> Tracked SetInterval
setInterval = function(callback, delay, ...args) {
    let trackedCallBack = function(...cargs) {
        __tasks.removeCallback(callback);
        callback(...cargs);
    }
    __tasks.addCallback(callback);
    const ticket = originalSetInterval(trackedCallBack, delay, ...args);
    __tasks.timeIntervalMap.set(ticket, callback);
    return ticket;
}

const originalClearInterval = clearInterval;
clearInterval = function(ticket) {
    __tasks.removeCallback(__tasks.timeIntervalMap.get(ticket));
    __tasks.timeIntervalMap.delete(ticket);
    return originalClearInterval(ticket);
}


const originalRequestAnimationFrame = requestAnimationFrame;
requestAnimationFrame = function(callback) {
    let trackedCallBack = function(...args) {
        callback(...args);
        __tasks.removeCallback(callback);
    }
    __tasks.addCallback(callback);
    return originalRequestAnimationFrame(trackedCallBack);
};


// * Promise overrides
const originalPromise = Promise;
class TrackedPromise extends Promise {
    constructor(executor) {
        super(executor); // Call the original Promise constructor
        this.executor = executor; // Store the executor function
    }
}
Promise = TrackedPromise;

/**
 * The reason we're only overriding then but not catch and finally is because the latter two are syntactic sugar for then
 * Basically, catch will call then(undefined, onRejected) and finally will call then(onFinally, onFinally)
*/
const originalPromiseThen = Promise.prototype.then;
Promise.prototype.then = function(onFulfilled, onRejected) {
    const fulFillIsFunction = typeof onFulfilled === 'function';
    const rejectIsFunction = typeof onRejected === 'function';
    let promiseInstance = this;
    this.stack = new Error().stack;
    let trackedOnFulfilled = function(...value) {
        let retval = value[0]
        if (fulFillIsFunction) {
            retval = onFulfilled.apply(promiseInstance, value);
        }
        __tasks.removePromise(promiseInstance);
        return retval;
    }
    let trackedOnRejected = function(...reason) {
        let retval = reason[0];
        __tasks.removePromise(promiseInstance);
        if (rejectIsFunction) {
            retval = onRejected.apply(promiseInstance, reason);
            return retval;
        }
        throw retval;
    }
    __tasks.addPromise(this);
    return originalPromiseThen.call(this, trackedOnFulfilled, trackedOnRejected);
};


const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this.requestMethod = method;
    this.requestUrl = url;
    originalOpen.apply(this, arguments);
};

const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('readystatechange', function() {
        if (this.readyState === 4 || this.readyState == 0) {
            __tasks.removeTask(this);
        }
    });
    __tasks.addTask(this);
    return originalXHRSend.apply(this, args);
};

if (window === window.top) {
    originalSetInterval(() => {
        // console.log("Remaining tasks", __tasks.length(), __tasks.tasks);
        // console.log("Remaining tasks", __tasks.length());
        __tasks.removeTimeouts();
    }, 300);
}