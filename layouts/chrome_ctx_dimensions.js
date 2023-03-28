/*
    Wrapper for get_elem_dimensions.js
    Start the browser and load certain page
*/
const puppeteer = require("puppeteer")
const fs = require('fs')
const readline = require('readline');
const assert = require('assert');
const argv = require('yargs').argv;

const FRMAMENAME = 'replay_iframe';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChrome(){
    const launchOptions = {
        // other options (headless, args, etc)
        executablePath: '/usr/bin/chromium-browser',
        args: [
            '--disk-cache-size=1', 
            // '-disable-features=IsolateOrigins,site-per-process',
            // '--disable-site-isolation-trials',
            '--window-size=1920,1080',
            // '--disable-web-security',
            // '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
            // '--autoplay-policy=no-user-gesture-required',
            // `--user-data-dir=/tmp/chrome/${Date.now()}`
            '--user-data-dir=../chrome_data',
            '--load-extension=../chrome_data/webrecorder',
            '--enable-automation'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: false
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

async function waitForReady() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve, reject) => {
        rl.question("ready? ", (answer) => {
          resolve(answer);
        });
    });
}

async function getDimensions(page) {
    const script = fs.readFileSync("../chrome_ctx/get_elem_dimensions.js", 'utf8');
    const result = await page.evaluate(script);
    return result;
}

async function maxWidthHeight(dimen) {
    dimensions = JSON.parse(dimen);
    let width = 0, height = 0;
    for (const d of Object.values(dimensions)) {
        width = Math.max(width, d.right);
        height = Math.max(height, d.bottom);
    }
    return [width, height];
}

async function screenShot(page, path) {
    let [height, width] = await page.evaluate(() => {
        return [
          document.getElementsByTagName('html')[0].offsetHeight,
          document.getElementsByTagName('html')[0].offsetWidth
        ]
    })
    console.log("height, width", height, width)
    await page.screenshot({
        path: path,
        clip: { x: 0, y: 0, width, height }
    })
}

(async function(){
    const chrome = await startChrome();
    const urlStr = process.argv[2];
    const url = new URL(urlStr);
    let dirname = argv.dirname != undefined ? argv.dir : "test"
    let filename = argv.filename != undefined ? argv.file : "dimensions"
    // let archive = argv.archive != undefined ? argv.archive == 'true' : false;
    // let filename = url.pathname.replace(/\//g, '_')
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
     
    let page = await chrome.newPage();
    const client = await page.target().createCDPSession();
    
    try {
        await page.goto(url, {
            timeout: 60*1000,
            waitUntil: 'networkidle2'
        });

        // await sleep(5000);
        await waitForReady();
        
        const dimensions = await getDimensions(page);
        let [width, height] = await maxWidthHeight(dimensions);
        console.log(width, height)
        // if (archive) 
        //     page = page.frames().find(f => f.name().includes(FRMAMENAME));
        // await screenShot(page, `${dirname}/${filename}.png`)
        await page.screenshot({
            path: `${dirname}/${filename}.png`,
            clip: { x: 0, y: 0, width, height }
        })

        const results = {
            "url": url,
            "dimensions": JSON.parse(dimensions)
        }
        fs.writeFileSync(`${dirname}/${filename}.json`, JSON.stringify(results, null, 2));      

        const html = await page.evaluate(() => {
            return document.documentElement.outerHTML;
        });
        fs.writeFileSync(`${dirname}/index.html`, html);      
    } catch (err) {
        console.error(err);
    } finally {
        await chrome.close();
        process.exit();
    }
})()