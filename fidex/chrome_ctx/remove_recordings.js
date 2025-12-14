/*
    Remove recording(s) from the webrecorder, following the UI flow
*/

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// This function assumes that the archive collection is already opened
// i.e. click_download.js:firstPageClick should already be executed
async function removeRecording(topN=1) {
    let wholePage = document.querySelector("archive-web-page-app").shadowRoot
                        .querySelector("wr-rec-coll").shadowRoot
                        .querySelector("#pages").shadowRoot
    // Change the date of archives to date ascending order
    let dateButton = Array.from(wholePage.querySelectorAll('a')).find(a => a.innerText.includes('Date'))
    while (!dateButton.className.includes('asc')){
        dateButton.click()
        await sleep(100)
    }

    let pageLists = wholePage.querySelectorAll('wr-page-entry')
    let topPage = pageLists[0].shadowRoot

    if (topN == 0) {
        // Select all pages
        let checkBox = wholePage.querySelector('label.checkbox')
        checkBox.click()
        await sleep(100)
    } else {
        // Select top N pages
        for (let i = 0; i < topN; i++) {
            let page = pageLists[i].shadowRoot
            let checkBox = page.querySelector('label.checkbox')
            checkBox.click()
            await sleep(100)
        }
    }

    // Click remove button from topPage
    let removeButton = topPage.querySelector('button.delete')
    removeButton.click()
    await sleep(100)

    // Click confirm button
    // select tag with title: "Confirm Delete"
    let deleteButton = Array.from(wholePage.querySelectorAll('button')).find(b => b.innerText.includes('Delete'))
    deleteButton.click()
    await sleep(1000)
}    