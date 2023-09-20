/*
    Contains functions that are commonly used by multiple other files
    For files that require this file, set loadUtils=true before execution
*/

function getElemId (elem) {
    var id =
        elem.nodeName +
        (elem.id ? `#${elem.id}` : "") +
        (elem.className && typeof(elem.className) === 'string' ? `.${elem.className.replace(/ /g, '.')}` : "");
    if (elem.nodeName == "A" && elem.hasAttribute('href')) id += `[href="${elem.href}"]`;
    return id;
};

function getDomXPath(elm, fullTrace=false) {
    var xPathsList = [];
    let segs = [];
    for (; elm && elm.nodeType == 1; elm = elm.parentNode)
    // for (; elm ; elm = elm.parentNode)  // curently using this will cause exception
    { 
        let withID = false;
        // if (elm.hasAttribute('id')) {
        //     withID = true;
        //     segs.unshift(elm.localName.toLowerCase() + '[@id="' + elm.getAttribute('id') + '"]'); 
        // } 
        // else if (elm.hasAttribute('class')) { 
        //     segs.unshift(elm.localName.toLowerCase() + '[@class="' + elm.getAttribute('class') + '"]'); 
        // }
        // else {
            let i = 1;
            for (sib = elm.previousSibling; sib; sib = sib.previousSibling) { 
                if (sib.localName == elm.localName)  i++; }; 
                segs.unshift(`${elm.localName.toLowerCase()}[${i}]`); 
        // };
        if (withID) // Only push new path if it has an ID
            xPathsList.push('/' + segs.join('/') );
    };
    xPathsList.push('/' + segs.join('/') );
    
    return fullTrace ? xPathsList : xPathsList[xPathsList.length-1];
};

