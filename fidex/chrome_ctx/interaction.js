/*
    This script 1) fetches all event handlers registered
    2) define a class to trigger event handlers one by one
*/
loadUtils = true;

var all_handlers = [
    "abort",
    "blur",
    "change",
    "click",
    "close",
    "contextmenu",
    "dblclick",
    "focus",
    "input",
    "keydown",
    "keypress",
    "keyup",
    "mouseenter",
    "mousedown",
    "mouseleave",
    "mousemove",
    "mouseout",
    "mouseover",
    "mouseup",
    "reset",
    "resize",
    "scroll",
    "select",
    "submit",
];

var IGNORE_ELEMENTS = [
    "SCRIPT",
    "IFRAME",
    "BODY",
    "LINK",
    "IMG",
    "INPUT",
    "FORM",
    "HTML",

    "#document"
];

var IGNORE_ELEMENT_INTERACTIONS = {
    'A': ['click', 'mousedown', 'mouseup'],
}

let funcMap = new Map();
let funcCount = 0;

function getFuncId(func) {
    // * This could not work because even JS closure has the same function, the scoped variables may not have the same value.
    const funcStr = func.toString();
    if (funcMap.has(funcStr))
        return funcMap.get(funcStr);
    const value = `${funcCount}: ${funcStr.slice(0, 50)}`;
    funcMap.set(funcStr, value);
    funcCount += 1;
    return value;
}

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

function shuffle(array) {
    var currentIndex = array.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function getDomPath(el) {
    try {
        var stack = [];
        while (el.parentNode != null) {
            var sibCount = 0;
            var sibIndex = 0;
            for (var i = 0; i < el.parentNode.childNodes.length; i++) {
                var sib = el.parentNode.childNodes[i];
                if (sib.nodeName == el.nodeName) {
                    if (sib === el) {
                        sibIndex = sibCount;
                    }
                    sibCount++;
                }
            }
            if (el.hasAttribute('id') && el.id != '') {
                stack.unshift(el.nodeName.toLowerCase() + '#' + CSS.escape(el.id));
            } else if (sibCount > 1) {
                stack.unshift(el.nodeName.toLowerCase() + ':nth-child(' + (sibIndex+1) + ')');
            } else {
                stack.unshift(el.nodeName.toLowerCase());
            }
            el = el.parentNode;
        }
        return stack.slice(1).join(' > '); // removes the html element
    } catch (e) {
        return "#"
    }
}


/**
 * Takes in the listeners and returns only the source of each handler
 * @param { response from getEventListeners} listeners
 */
var processListeners = function (listeners) {
    var pr = {};
    Object.keys(listeners).forEach((evt) => {
        pr[evt] = [];
        var evtHndlr = listeners[evt];
        evtHndlr.forEach((h) => {
            pr[evt].push(h.listener.toString());
        });
    });
    return pr;
};

function isHidden(elem) {
    try {
        var rect = elem.getBoundingClientRect();
        return (
            elem.style.display == "none" ||
            elem.style.visibility == "hidden" ||
            rect.left >= window.innerWidth ||
            rect.right <= 0 ||
            rect.top >= window.innerHeight ||
            rect.bottom <= 0 ||
            rect.width * rect.height == 0
        );
    } catch (e) {
        return true;
    }
}

function getEventId(el, evt) {
    //construct event id from element and event information
    return `${getElemId(el)}_on${evt}`;
}

var extractJqueryEvents = function (elem) {
    var res = []; //array of elements and event listener dictioanry.
    var hasJquery = typeof jQuery == "function" ? true : false;
    if (!hasJquery) return res;

    var jqueryEvts = jQuery.data(elem, "events");
    if (!jqueryEvts)
        return res;
    for (const evt in jqueryEvts){
        if (all_handlers.indexOf(evt) < 0) 
            continue;
        for (const data of jqueryEvts[evt]){
            try {
                var elemSelector = data.selector;
                if (!elemSelector) continue;
                var elem = jQuery(elemSelector).get()[0];
                if (!elem) continue;
                var _d = {};
                _d[evt] = function () { };
                res.push([elem, _d]);
            } catch (e) {
                console.error("error while collecting jquery events", e);
            }
        }
    }
    // jqueryEvts && Object.keys(jqueryEvts).forEach((evt) => {
    //     if (all_handlers.indexOf(evt) < 0) return;
    //     jqueryEvts[evt].forEach((data) => {
    //         try {
    //             var elemSelector = data.selector;
    //             if (!elemSelector) return;
    //             var elem = jQuery(elemSelector).get()[0];
    //             if (!elem) return;
    //             var _d = {};
    //             _d[evt] = function () { };
    //             res.push([elem, _d]);
    //         } catch (e) {
    //             console.error("error while collecting jquery events", e);
    //         }
    //     });
    // });
    if (res.length > 0)
        console.log('extractJquery:', elem, res);
    return res;
};

function listAllEventListeners() {
    var _merge_events = function (listeners, events) {
        for (const event of events) {
            let [ element, evt ] = event;
            let path = getDomXPath(element);
            if (!(path in listeners))
                listeners[path] = {element: element, events: {}}
            for (const e in evt) {
                listeners[path]['events'][e] = evt[e]
            }
        }
        return listeners
    }
    var _to_list = function (listeners) {
        let res = [];
        for (const key in listeners) {
            r = [listeners[key]['element'], listeners[key]['events']]
            res.push(r);
        }
        return res
    }
    
    // * listeners: {path: {element: element, events: {event: handler}}
    let listeners = {},
    pl = processListeners;

    let allElements = document.querySelectorAll("*"); 
    for (let i = 0; i < allElements.length; i++) {
        const currentElement = allElements[i];
        let eventListeners = getEventListeners(currentElement);
        if (Object.keys(eventListeners).length != 0)
            listeners = _merge_events(listeners, [[currentElement, eventListeners]]);
            
        let jqueryListeners = extractJqueryEvents(currentElement);
        listeners = _merge_events(listeners, jqueryListeners);
    }
    // var eventListeners = getEventListeners(document);
    // Object.keys(eventListeners).length != 0 &&
    //     listeners.push([document, eventListeners]);
    var jqueryListeners = extractJqueryEvents(document);
    listeners = _merge_events(listeners, jqueryListeners);
    listeners = _to_list(listeners);
    // * listeners: [ [element, {event: handlers}] ]
    return listeners;
}

/** 
  * @param loadEvents [[xpath, [events]]] 
**/
function loadEventListeners(loadEvents) {
    let listeners = [];
    for (const _le of loadEvents) {
        let [sel, events] = _le;
        let elem = $x(sel);
        if (elem != null && elem.length)
            listeners.push([elem[0], events])
    }
    return listeners;
}

function filterByClassName(listeners) {
    let filtered = {};
    for (let eli of listeners){
        let key = eli[0].className;
        if (!filtered[key]){
            filtered[key] = eli;
        }
    }
    return Object.values(filtered);
}

function getCandidateElements(listeners) {
    var elems = []; // each entry is a two-tupe [1st,2nd] where 1st is element, and 2nd is list of events
    listeners.forEach((l) => {
        var [el, handler] = l;
        // * el: element, handler: {event: [handlers]}
        if (IGNORE_ELEMENTS.filter((e) => el.nodeName == e).length == 0) {
            // * If element is not taking any area, ignore it
            // ! Currently ignore this check because depend on the timing, we could get different result
            // if (isHidden(el))
            //     return;

            // * Filtration of tag pointing to other URLs
            if (el && el.href && el.href != ""){
                // If el.href is not the same as the current URL, ignore it
                // Taking fragments into account
                // Check if el.href is a valid URL
                let url = null;
                try {
                    url = new URL(el.href);
                } catch {return;}
                // * Need to consider in archived copy, the location needs to be get from window.WB_wombat_location
                const windowLocation = 'WB_wombat_location' in window ? window.WB_wombat_location : window.location;
                if (url.origin != windowLocation.origin 
                   || url.pathname != windowLocation.pathname 
                   || url.search != windowLocation.search) 
                    return;
            }

            var e = [el, {}];
            Object.keys(handler).forEach((h) => {
                // if (IGNORE_ELEMENT_INTERACTIONS[el.nodeName] && IGNORE_ELEMENT_INTERACTIONS[el.nodeName].indexOf(h) >= 0)
                //     return;
                if (all_handlers.indexOf(h) >= 0) { 
                    e[1][h] = [];
                    for (const f of handler[h]) {
                        const funcId = getFuncId(f.listener);
                        e[1][h].push(funcId);
                    }
                }
            });
            if (Object.keys(e[1]).length <= 0) {
                // console.log("No candidate handlers", el);
                return;
            }
            elems.push(e);
        } else {
            // console.log("Filtered out node", el);
        }
    });
    return elems;
}

function getClickableElements(listeners) {
    var elems = [];
    listeners.forEach((l) => {
        var [el, handler] = l;
        if (
            el.click &&
            Object.keys(handler).indexOf("click") >= 0 &&
            el.nodeName != "A" &&
            !isHidden(el)
        )
            elems.push(el);
    });
    return elems;
}

function _triggerEvent(el, evt) {
    var event = new Event(evt, {
        bubbles: true,
        cancelable: true,
    });
    //enable cacheinit when trying to get state access of event handlers
    // window.__tracer.cacheInit(getEventId(el, evt));
    // enable set event id and __enter__ for getting cg of events
    // window.__tracer.setEventId(getEventId(el, evt));
    // window.__tracer.__enter__(getEventId(el, evt));
    if (evt == "click") {
        el.click();
        // el.click();
        // window.__tracer.__exit__();
        return;
    }
    el.dispatchEvent && el.dispatchEvent(event);
    // Find and dispatch the event on all descendant elements
    let descendants = el.querySelectorAll("*");
    descendants.forEach(descendant => {
        descendant.dispatchEvent && descendant.dispatchEvent(event);
    });
    //__exit__ for cg of events
    // window.__tracer.__exit__();
    //exitfunction for state access
    // window.__tracer.exitFunction();
}

async function triggerEvents(elems) {
    //shuffle elements array
    shuffle(elems);

    // turn on the tracer logging and set the capture mode for cg of event handlers
    // window.__tracer.setTracingMode(true);
    // window.__tracer.setCaptureMode("postload");

    //clear custom storage only when getting state access
    //   window.__tracer.clearCustomStorage();
    for (const _e of elems) {
        try {
            var [elem, handlers] = _e;
            for (const h of handlers) {
                _triggerEvent(elem, h);
                // if (h == 'click')
                // _triggerEvent(elem, h);
            };
        } catch (e) {
            /**no op */
        }
    };
    //only set this when getting cg for events, like how you turn it on above
    // window.__tracer.setTracingMode(false);
}

/**
 * Filter one of the two handlers that will cancel the effect of each other
 * e.g. mouseover and mouseout will only have mouseover 
 */
function _filter_handlers(handlers) {
    let uncancel_handlers = [];
    let cancel_pairs = [
        ['mouseover', 'mouseout'],
        ['mouseenter', 'mouseleave'],
        ['focus', 'blur'],
        ['focusin', 'focusout'],
        ['pointerenter', 'pointerleave'],
        ['pointerover', 'pointerout'],
        ['mouseenter', 'mouseleave'],
        ['pointerdown', 'pointerup'],
        ['mousedown', 'mouseup'],
        ['touchstart', 'touchend'],
        ['touchenter', 'touchleave'],
        ['touchcancel', 'touchend'],
        ['dragenter', 'dragleave'],
        ['dragover', 'dragleave'],
        ['dragstart', 'dragend'],
        ['drag', 'dragend']
    ]
    for (const h of handlers) {
        let [keep, cancel] = cancel_pairs.find((pair) => pair.indexOf(h) >= 0) || [null, null];
        if (cancel == null || keep == h)
            uncancel_handlers.push(h);
    }
    return uncancel_handlers;
}

class eventListenersIterator {
    constructor(options={loadEvents: null, grouping: false}) {
        let loadEvents = options.loadEvents;
        let grouping = options.grouping;

        this.verbose_listeners = listAllEventListeners();
        // if (loadEvents == null)
        this.listeners = getCandidateElements(this.verbose_listeners)
        // else
        //     this.listeners = loadEventListeners(loadEvents);
        if (grouping) {
            this.listeners = filterByClassName(this.listeners);
        }
        this.origPath = [];
        for (const _e of this.listeners)
            this.origPath.push(getDomXPath(_e[0]));
        this.orders = [];
        for (let idx = 0; idx < this.listeners.length; idx++) this.orders.push(idx)
        this.iter = 0
    }

    init() {
        this.iter = 0;
    }

    shuffle() {
        this.orders = shuffle(this.orders);
    }

    async triggerNext() {
        if (this.iter >= this.listeners.length)
            return null;
        let idx = this.orders[this.iter]
        let _e = this.listeners[idx];
        let orig_path = this.origPath[idx]
        try {
            var [elem, handlers] = _e;
            handlers = Object.keys(handlers);
            let uncancel_handlers = _filter_handlers(handlers);
            for (const h of uncancel_handlers) {
                _triggerEvent(elem, h);
                await delay(300);
            };
            await delay(1000);
            this.iter += 1;
            return {
                element: getElemId(elem),
                path: orig_path,
                events: uncancel_handlers,
                url: window.location.href,
                _verbose_length: this.listeners.length
            };
        } catch (e) {
            this.iter += 1;
            return {}
        }
    }

    async triggerNth(idx) {
        if (idx >= this.listeners.length)
            return null;
        let _e = this.listeners[idx];
        let orig_path = this.origPath[idx]
        try {
            var [elem, handlers] = _e;
            handlers = Object.keys(handlers);
            let uncancel_handlers = _filter_handlers(handlers);
            for (const h of uncancel_handlers) {
                _triggerEvent(elem, h);
                // await delay(300);
            };
            // await delay(1000);
            return {
                element: getElemId(elem),
                path: orig_path,
                events: uncancel_handlers,
                url: window.location.href,
                _verbose_length: this.listeners.length
            };
        } catch (e) {
            return {}
        }
    }

    async triggerAll() {
        const idxs = Math.min(20, this.listeners.length);
        let events = []
        for (const idx of idxs) {
            let _e = this.listeners[idx];
            let orig_path = this.origPath[idx]
            try {
                var [elem, handlers] = _e;
                handlers = Object.keys(handlers);
                let uncancel_handlers = _filter_handlers(handlers);
                for (const h of uncancel_handlers) {
                    _triggerEvent(elem, h);
                };
                events.push({
                    element: getElemId(elem),
                    path: orig_path,
                    events: uncancel_handlers,
                    url: window.location.href,
                    _verbose_length: this.listeners.length
                });
            } catch (e) {
                events.push(null);
            }
        }
        await delay(1000);
        return events;
    }
}

// let eli = new eventListenersIterator(options={grouping: true});
// for (const _e of eli.listeners) {
//     [elem, _] = _e;
//     console.log(elem, getDomXPath(elem))
// }
// eli.init();
// eli.shuffle();
// while (await eli.triggerNext() != null) {}

// var elems = getClickableElements(verbose_listeners);
// elems.forEach((e)=>{
//     e.click();
// });