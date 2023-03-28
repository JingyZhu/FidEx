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
    var allNodes = document.getElementsByTagName('*'); 
    var xPathsList = [];
    for (var segs = []; elm && elm.nodeType == 1; elm = elm.parentNode) 
    { 
        if (elm.hasAttribute('id')) {
            segs.unshift(elm.localName.toLowerCase() + '[@id="' + elm.getAttribute('id') + '"]'); 
        } 
        // else if (elm.hasAttribute('class')) { 
        //     segs.unshift(elm.localName.toLowerCase() + '[@class="' + elm.getAttribute('class') + '"]'); 
        // }
        else { 
            for (i = 1, sib = elm.previousSibling; sib; sib = sib.previousSibling) { 
                if (sib.localName == elm.localName)  i++; }; 
                segs.unshift(elm.localName.toLowerCase() + '[' + i + ']'); 
        }; 
        xPathsList.push('//' + segs.join('/') );
    };
    
    return fullTrace ? xPathsList : xPathsList[xPathsList.length-1];
};

