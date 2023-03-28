/*
    Get screenshot for both the whole page and certain elemment
*/
const puppeteer = require("puppeteer")
const fs = require('fs')
const eventSync = require('../utils/event_sync');
const measure = require('../utils/measure');
const { program } = require('commander');

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
            '--enable-automation'
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        defaultViewport: {width: 1920, height: 1080},
        // defaultViewport: null,
        headless: false,
        downloadPath: './downloads/'
    }
    const browser = await puppeteer.launch(launchOptions);
    return browser;
}

(async function(){
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-m, --manual');
    program
        .argument("<url>")
        .action(url => urlStr=url);
    program.parse();
    const options = program.opts();
    let dirname = options.dir;
    let filename = options.file;
    const browser = await startChrome();
    const url = new URL(urlStr);
    
    if (!fs.existsSync(dirname))
        fs.mkdirSync(dirname, { recursive: true });
    
    let page = await browser.newPage();
    await  page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/',
    });
    // Avoid puppeteer from overriding dpr
    await page._client().send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 0,
        mobile: false
    });
    
    try {
         
        await page.goto(url, {
            waitUntil: 'networkidle2'
        })
        // await page.evaluate(() => document.querySelector("body > header").remove())
        await sleep(3000);
        if (options.manual)
            await eventSync.waitForReady();
        // for (let i = 0; i < 5; i++){
        //     // console.log(await page.evaluate('window.devicePixelRatio'));
        //     // await page.screenshot({
        //     //     path: `${dirname}/element_${i}.png`,
        //     //     fullPage: true
        //     // })
        //     await measure.collectFidelityInfo(page, url, dirname, filename=`element_${i}`);
        // }
        await measure.collectFidelityInfo(page, url, dirname);
        // if (options.manual)
        //     await eventSync.waitForReady();

        // let [dimension, src] = await page.evaluate(() => {
        //     let selector = 
        //     'body > div.main_container > div.content_container > div:nth-child(1) > div > div:nth-child(2) > div.page.container.container_width > bodycopy > div > div.image-gallery.initialized > div:nth-child(1) > div.gallery_card_image > img'
        //     let elem = document.querySelector(selector);
        //     let dimen = elem.getBoundingClientRect();
        //     let src = elem.src;
        //     return [JSON.stringify(dimen), src];
        // })
        // dimension = JSON.parse(dimension);
        // console.log(dimension);
        // console.log(src);
        // await page.screenshot({
        //     path: `${dirname}/element.png`,
        //     clip: { x: dimension.x, y: dimension.y, width: dimension.width, height: dimension.height }
        // })
        
    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
        process.exit();
    }
})()

// http://localhost:8080/carta/20221216065733/https://stovallworkshop.com/
// document.querySelector("body > div.main_container > div.content_container > div:nth-child(1) > div > div:nth-child(2) > div.page.container.container_width > bodycopy").getBoundingClientRect()