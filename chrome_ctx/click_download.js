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
function firstPageClick(archive) {
    // * First Page Click
    let archiveLists = document.querySelector('archive-web-page-app').shadowRoot
                        .querySelector('wr-rec-coll-index').shadowRoot
    let targetArchive;
    for (const al of archiveLists.querySelectorAll('wr-rec-coll-info')) {
        if (al.shadowRoot.querySelector('a').text.includes(archive)) {
            targetArchive = al.shadowRoot;
            break;
        }
    }
    // let lists = archiveLists.querySelectorAll('a')
    // let target = Array.from(lists).find(l => l.text.includes(archive))
    let target = targetArchive.querySelector('a');
    target.click()
}

async function secondPageDownload() {
    // * Second Page Download
    let wholePage = document.querySelector("archive-web-page-app").shadowRoot
                        .querySelector("wr-rec-coll").shadowRoot
                        .querySelector("#pages").shadowRoot
    // Change the date of archives to date descending order
    let dateButton = Array.from(wholePage.querySelectorAll('a')).find(a => a.innerText.includes('Date'))
    while (!dateButton.className.includes('desc')){
        dateButton.click()
        await sleep(100)
    }
    let pageLists = wholePage.querySelectorAll('wr-page-entry')
    let topPage = pageLists[0].shadowRoot
    let pageLink = new URL(topPage.querySelector('a').href)
    let pageQuery = new URL(pageLink).hash.replace('#', '?')
    let pageTs = _getparamValue(pageQuery, 'ts')
    topPage.querySelector('input').click()
    await sleep(200);
    
    let download = wholePage.querySelector('button')
    download.click()
    await sleep(200);
    let subDownloads = wholePage.querySelectorAll('a')
    let targetDownload = Array.from(subDownloads).find(s => s.text.includes("1.1"))
    targetDownload.click()
    return pageTs;
}