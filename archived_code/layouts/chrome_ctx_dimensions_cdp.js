/*
    Wrapper for get_elem_dimensions.js
    Start the browser and load certain page
*/
const CDP = require('chrome-remote-interface');
const fs = require('fs')

const chromeLauncher = require('chrome-launcher');
const assert = require('assert');
const argv = require('yargs').argv;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChrome(){
    const os = process.platform;
    assert(os == 'linux' | os == 'darwin')
    const path = os == 'linux' ? '/opt/google/chrome/chrome' : '/Applications/Chromium.app/Contents/MacOS/Chromium'
    
    let chromeFlags = [
        '--disk-cache-size=1', 
        // '-disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--window-size=1920,1080',
        '--disable-web-security',
        // '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
        // '--autoplay-policy=no-user-gesture-required',
        `--user-data-dir=/tmp/chrome/${Date.now()}`
    ];
    
    // if (process.env.ROOT_USER) {
    //     chromeFlags.push('--no-sandbox');
    // }

    // if (os == 'linux') chromeFlags.push('--headless')
    const chrome = await chromeLauncher.launch({
        chromeFlags: chromeFlags,
        // chromePath: path,
        // userDataDir: '/tmp/nonexistent' + Date.now(), 
    })
    return chrome;
}


async function getDimensions(Runtime) {
    const script = fs.readFileSync("get_elem_dimensions.js", 'utf8');
    const result = await Runtime.evaluate({
        expression: script,
        awaitPromise: true,
        returnByValue: true,
    });
    return result.result.value;
}


(async function(){
    const chrome = await startChrome();
    const urlStr = process.argv[2];
    const url = new URL(urlStr);
    let dirname = argv.dirname != undefined ? argv.dirname : "test"
    let filename = argv.filename != undefined ? argv.filename : "dimensions"
    // let filename = url.pathname.replace(/\//g, '_')
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
     
    const client = await CDP({port: chrome.port});
    const { Network, Page, Security, Runtime, DOM, DOMDebugger, Media} = client;
    
    try {
        await Security.setIgnoreCertificateErrors({ ignore: true });
        //Security.disable();

        await Network.enable();
        await Page.enable();
        await Media.enable();
        
        await DOM.enable();
        await Runtime.enable();
        await Page.navigate({ url: url });
        await Page.loadEventFired();
        await sleep(5000);
        
        const dimensions = await getDimensions(Runtime);
        const pic = await Page.captureScreenshot({captureBeyondViewport: true});
        fs.writeFileSync(`${dirname}/${filename}.png`, Buffer.from(pic.data, 'base64'));
        const results = {
            "url": url,
            "dimensions": JSON.parse(dimensions)
        }
        fs.writeFileSync(`${dirname}/${filename}.json`, JSON.stringify(results, null, 2));      

    } catch (err) {
        console.error(err);
    } finally {
        if (client){
            client.close();
            await chrome.kill();
            process.exit(0);
        }
    }

})()