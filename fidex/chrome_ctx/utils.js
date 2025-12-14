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
    const origElm = elm;
    for (; elm && [1,3].includes(elm.nodeType); elm = elm.parentNode)
    // for (; elm ; elm = elm.parentNode)  // curently using this will cause exception
    { 
        // let withID = false;
        // if (elm.hasAttribute('id')) {
        //     withID = true;
        //     segs.unshift(elm.localName.toLowerCase() + '[@id="' + elm.getAttribute('id') + '"]'); 
        // } 
        // else if (elm.hasAttribute('class')) { 
        //     segs.unshift(elm.localName.toLowerCase() + '[@class="' + elm.getAttribute('class') + '"]'); 
        // }
        // else {
        //    let i = 1;
        //    for (sib = elm.previousSibling; sib; sib = sib.previousSibling) { 
        //        if (sib.nodeName == elm.nodeName)  
        //            i++;
        //    };
        //    segs.unshift(`${elm.nodeName.toLowerCase()}[${i}]`); 
        // };
        // if (withID) // Only push new path if it has an ID
        //     xPathsList.push('/' + segs.join('/') );
        let i = 1;
        for (sib = elm.previousSibling; sib; sib = sib.previousSibling) { 
            if (sib.nodeName == elm.nodeName)  
                i++;
        };
        segs.unshift(`${elm.nodeName.toLowerCase()}[${i}]`); 
    };
    xPathsList.push('/' + segs.join('/') );
    const retval = fullTrace ? xPathsList : xPathsList[xPathsList.length-1];
    
    if (!origElm) return retval;
    if (!origElm._fidex_xpaths) origElm._fidex_xpaths = {};
    if (typeof __current_stage != 'undefined' && retval && !origElm._fidex_xpaths[__current_stage])
        origElm._fidex_xpaths[__current_stage] = retval;
    return retval;
};

function getDomStageXPath(elm, stage, fullTrace=false) {
    if (!elm._fidex_xpaths) return getDomXPath(elm, fullTrace);
    return elm._fidex_xpaths[stage] || getDomXPath(elm, fullTrace);
}