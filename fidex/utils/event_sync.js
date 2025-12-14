/**
 * Utils for events synchronization.
 */
const fs = require('fs')
const readline = require('readline')

function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
}

const sleep = delay;

function waitTimeout(event, ms) {
    return Promise.race([event, sleep(ms)]);
}

async function waitForReady() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve, reject) => {
        console.log("ready? ")
        rl.question("", (answer) => {
          resolve(answer);
        });
    });
}

async function waitFile (filename) {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(filename)) {
            await delay(500);    
            await waitFile(filename);
            resolve();
        }else{
          resolve();
        }

    })   
}

/**
 * 
 * @param {Puppeteer.Page} page 
 * @param {Object} options {interval: 500, timeout: 3000}
 * If change timeout, also need to change capture_sync.js and measure.js correspondingly
 */
async function waitCaptureSync(page, options={interval: 500, timeout: 3000}) {
    let ready = false;
    let totalTime = 0;
    while (totalTime <= options.timeout && !ready) {
        await delay(options.interval);
        ready = await page.evaluate(() => window.__tasks.stable());
        totalTime += options.interval;
    }
}

module.exports = {
    sleep,
    delay,
    waitTimeout,
    waitFile,
    waitForReady,
    waitCaptureSync,
}