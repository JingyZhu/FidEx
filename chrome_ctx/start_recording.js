/* 
    Follow the web extension's flow start recording certain URLs
*/

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startRecord(archive, url) {
    let archiveLists = document.querySelector('archive-web-page-app').shadowRoot
                        .querySelector('wr-rec-coll-index').shadowRoot;
    let targetArchive;
    for (const al of archiveLists.querySelectorAll('wr-rec-coll-info')) {
        if (al.shadowRoot.querySelector('a').text.includes(archive)) {
            targetArchive = al.shadowRoot;
            break;
        }
    }
    let button = targetArchive.querySelector('button[title*="Start Archiving"]');
    button.click();
    await sleep(200);

    let recordingInput = document.querySelector('archive-web-page-app').shadowRoot
                                .querySelector('input#url')

    recordingInput.value = url;
    await sleep(200);
    button = document.querySelector('archive-web-page-app').shadowRoot
                    .querySelector('button[type=submit]')
    button.click();
}