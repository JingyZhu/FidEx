/*
    Get all elements dimensions
    Run within the browser context
*/
loadUtils = true;

archiveHost = "localhost:8080";
archiveiFrame = "iframe#replay_iframe";

function isArchive() {
    let host = new URL(document.URL).host;
    return host == archiveHost;
}

function _normalURL(url) {
    try {
        let nurl = new URL(url);
        return nurl.toString();
    } catch(err) {
        return url;
    }
}

function getDimensions() {
    const pageDocument = isArchive() ? 
        document.querySelector(archiveiFrame).contentDocument: document;
    const all_elements = pageDocument.querySelectorAll("*");
    let element_dimension = {};
    for (const element of all_elements) {
        const id = getElemId(element);
        const dimension = element.getBoundingClientRect();
        element_dimension[id] = {
            xpath: getDomXPath(element, true),
            dimension: dimension
        }
    }
    return element_dimension
}