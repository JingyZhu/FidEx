/*
    Get all elements dimensions
    Run within the browser context
*/
loadUtils = true;

archiveHosts = ["localhost:8080"];
archiveiFrame = "iframe#replay_iframe";

function isArchive() {
    let host = new URL(location.href).host;
    return archiveHosts.includes(host);
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
    // const pageDocument = isArchive() ? 
    //     document.querySelector(archiveiFrame).contentDocument: document;
    const pageDocument = document;
    const all_elements = pageDocument.querySelectorAll("*");
    const scrollWidth = pageDocument.documentElement.scrollWidth;
    const scrollHeight = pageDocument.documentElement.scrollHeight;
    let element_dimension = {};
    for (const element of all_elements) {
        const id = getElemId(element);
        const dimension = element.getBoundingClientRect();
        if (dimension.left > scrollWidth && dimension.top > scrollHeight)
            continue;
        element_dimension[id] = {
            xpath: getDomXPath(element, true),
            dimension: dimension
        }
    }
    return element_dimension
}