/* 
    Follow the web extension's flow to download certain warc file
*/
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function _getparamValue(query, key) {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        
    urlParams = {};
    while (match = search.exec(query))
        urlParams[decode(match[1])] = decode(match[2]);
    return urlParams[key]
}

// archive needs to be passed on page.evaluate
async function firstPageClick(archive) {
    // * First Page Click
    let succeed = false;
    let retryTimes = 3, retrySleep = 1000, retries = 0;
    let target = null;
    while (!succeed && retries < retryTimes) {
        try {
            let archive_web_page_app = document.querySelector('archive-web-page-app').shadowRoot;
            let wr_rec_coll_index = archive_web_page_app.querySelector('wr-rec-coll-index');
            let archiveLists = wr_rec_coll_index.shadowRoot;
            let targetArchive;
            for (const al of archiveLists.querySelectorAll('wr-rec-coll-info')) {
                if (al.shadowRoot.querySelector('a').text.includes(archive)) {
                    targetArchive = al.shadowRoot;
                    break;
                }
            }
            target = targetArchive.querySelector('a');
            succeed = true
        } catch (e) {
            await sleep(retrySleep);
            retries++;
        }
    }
    // let lists = archiveLists.querySelectorAll('a')
    // let target = Array.from(lists).find(l => l.text.includes(archive))
    target.click()
}

async function secondPageDesc() {
    // * Second Page Download
    let succeed = false;
    const retryTimes = 3, retrySleep = 1000;
    let retries = 0;
    let wholePage = null;
    while (!succeed && retries < retryTimes) {
        try {
            wholePage = document.querySelector("archive-web-page-app").shadowRoot
                                .querySelector("wr-rec-coll").shadowRoot
                                .querySelector("#pages").shadowRoot
            succeed = true;
        } catch (e) {
            await sleep(retrySleep);
            retries++;
        }    
    }
    // Change the date of archives to date descending order
    let dateButton = Array.from(wholePage.querySelectorAll('a')).find(a => a.innerText.includes('Date'))
    while (!dateButton.className.includes('desc')){
        dateButton.click()
        await sleep(100)
    }
    return wholePage;
}

async function secondPageTarget(wholePage, url=null) {
    let succeed = false;
    const retryTimes = 3, retrySleep = 1000;
    let retries = 0;
    let targetPage = null, targetHostPage = null, targetDomainPage = null;
    let pageTs = null, pageURL = null; 
    while (!succeed && retries < retryTimes) {
        try {
            let pageLists = wholePage.querySelectorAll('wr-page-entry')
            // Select page that matches url if url is given
            // If no URL is given, try matching the first same host
            if (url) {
                for (const page of pageLists) {
                    let pageLink = new URL(page.shadowRoot.querySelector('a').href);
                    let pageQuery = new URL(pageLink).hash.replace('#', '?')
                    let pageURL = _getparamValue(pageQuery, 'url')
                    // Percent decode pageURL
                    pageURL = decodeURIComponent(pageURL)
                    let pageHost = new URL(pageURL).hostname
                    if (pageURL == url) {
                        targetPage = page.shadowRoot
                        break;
                    } else if (!targetHostPage && pageHost == new URL(url).hostname) {
                        targetHostPage = page.shadowRoot
                    }
                }
            }
            if (!targetPage) {
                targetPage = targetHostPage ? targetHostPage : pageLists[0].shadowRoot
            }
            let pageLink = new URL(targetPage.querySelector('a').href);
            let pageQuery = new URL(pageLink).hash.replace('#', '?')
            pageTs = _getparamValue(pageQuery, 'ts')
            pageURL = _getparamValue(pageQuery, 'url')
            pageURL = decodeURIComponent(pageURL)
            succeed = true
        } catch (e) {
            await sleep(retrySleep);
            retries++;
        }
    }
    targetPage.querySelector('input').click()
    await sleep(200);
    return {recordURL: pageURL, pageTs: pageTs};
}

async function secondPageDownload(wholePage) {
    let download = wholePage.querySelector('button')
    download.click()
    await sleep(200);
    let subDownloads = wholePage.querySelectorAll('a')
    let targetDownload = Array.from(subDownloads).find(s => s.text.includes("1.1"))
    targetDownload.click()
    return;
}