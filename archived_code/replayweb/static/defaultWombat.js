/*
Wombat.js client-side rewriting engine for web archive replay
Copyright (C) 2014-2023 Webrecorder Software, Rhizome, and Contributors. Released under the GNU Affero General Public License.

This file is part of wombat.js, see https://github.com/webrecorder/wombat.js for the full source
Wombat.js is part of the Webrecorder project (https://github.com/webrecorder)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
(function() {
    function FuncMap() {
        this._map = []
    }
    function ensureNumber(maybeNumber) {
        try {
            switch (typeof maybeNumber) {
            case "number":
            case "bigint":
                return maybeNumber;
            }
            var converted = Number(maybeNumber);
            return isNaN(converted) ? null : converted
        } catch (e) {}
        return null
    }
    function addToStringTagToClass(clazz, tag) {
        typeof self.Symbol !== "undefined" && typeof self.Symbol.toStringTag !== "undefined" && Object.defineProperty(clazz.prototype, self.Symbol.toStringTag, {
            value: tag,
            enumerable: false
        })
    }
    function autobind(clazz) {
        for (var prop, propValue, proto = clazz.__proto__ || clazz.constructor.prototype || clazz.prototype, clazzProps = Object.getOwnPropertyNames(proto), len = clazzProps.length, i = 0; i < len; i++)
            prop = clazzProps[i],
            propValue = clazz[prop],
            prop !== "constructor" && typeof propValue === "function" && (clazz[prop] = propValue.bind(clazz))
    }
    function Storage(wombat, type, initData) {
        if (ThrowExceptions.yes)
            throw new TypeError("Illegal constructor");
        if (initData && initData.length)
            for (var i = 0; i < initData.length; i++)
                this[initData[i][0]] = initData[i][1].toString();
        Object.defineProperty(this, WOMBAT, {
            value: wombat,
            enumerable: false
        }),
        Object.defineProperty(this, TYPE, {
            value: type,
            enumerable: false
        })
    }
    function storageProxyHandler() {
        return {
            get: function(target, prop) {
                var proto = target.__proto__;
                if (prop === "__proto__")
                    return proto;
                if (proto.hasOwnProperty(prop) || proto.__proto__ && proto.__proto__.hasOwnProperty(prop)) {
                    var res = target[prop];
                    return typeof res === "function" && (res = res.bind(target)),
                    res
                }
                return target.hasOwnProperty(prop) ? target.getItem(prop) : undefined
            },
            set: function(target, prop, value) {
                return target.__proto__.hasOwnProperty(prop) ? (target[prop] = value,
                true) : (target.setItem(prop, value),
                true)
            }
        }
    }
    function createStorage(wombat, type, initData) {
        var storage = new Storage(wombat,type,initData);
        return wombat.$wbwindow.Proxy && (storage = new wombat.$wbwindow.Proxy(storage,storageProxyHandler())),
        wombat.defGetterProp(wombat.$wbwindow, type, function() {
            return storage
        }),
        storage
    }
    function WombatLocation(orig_loc, wombat) {
        for (var prop in Object.defineProperties(this, {
            _orig_loc: {
                configurable: true,
                enumerable: false,
                value: orig_loc
            },
            wombat: {
                configurable: true,
                enumerable: false,
                value: wombat
            },
            orig_getter: {
                enumerable: false,
                value: function(prop) {
                    return this._orig_loc[prop]
                }
            },
            orig_setter: {
                enumerable: false,
                value: function(prop, value) {
                    this._orig_loc[prop] = value
                }
            }
        }),
        wombat.initLocOverride(this, this.orig_setter, this.orig_getter),
        wombat.setLoc(this, orig_loc.href),
        orig_loc)
            this.hasOwnProperty(prop) || typeof orig_loc[prop] === "function" || (this[prop] = orig_loc[prop])
    }
    function AutoFetcher(wombat, config) {
        return this instanceof AutoFetcher ? void (this.elemSelector = "img[srcset], img[data-srcset], img[data-src], video[srcset], video[data-srcset], video[data-src], audio[srcset], audio[data-srcset], audio[data-src], picture > source[srcset], picture > source[data-srcset], picture > source[data-src], video > source[srcset], video > source[data-srcset], video > source[data-src], audio > source[srcset], audio > source[data-srcset], audio > source[data-src]",
        this.wombat = wombat,
        this.$wbwindow = wombat.$wbwindow,
        this.worker = null,
        autobind(this),
        this._initWorker(config)) : new AutoFetcher(wombat,config)
    }
    function wrapSameOriginEventListener(origListener, win) {
        return function wrappedSameOriginEventListener(event) {
            return window == win ? origListener(event) : void 0
        }
    }
    function wrapEventListener(origListener, obj, wombat) {
        var origListenerFunc;
        return origListenerFunc = typeof origListener === "function" ? origListener : typeof origListener === "object" ? origListener.handleEvent.bind(origListener) : function() {}
        ,
        function wrappedEventListener(event) {
            var ne;
            if (event.data && event.data.from && event.data.message) {
                if (event.data.to_origin !== "*" && obj.WB_wombat_location && !wombat.startsWith(event.data.to_origin, obj.WB_wombat_location.origin))
                    return void console.warn("Skipping message event to " + event.data.to_origin + " doesn't start with origin " + obj.WB_wombat_location.origin);
                var source = event.source;
                event.data.from_top ? source = obj.__WB_top_frame : event.data.src_id && obj.__WB_win_id && obj.__WB_win_id[event.data.src_id] && (source = obj.__WB_win_id[event.data.src_id]),
                ne = new MessageEvent("message",{
                    bubbles: event.bubbles,
                    cancelable: event.cancelable,
                    data: event.data.message,
                    origin: event.data.from,
                    lastEventId: event.lastEventId,
                    source: wombat.proxyToObj(source),
                    ports: event.ports
                }),
                ne._target = event.target,
                ne._srcElement = event.srcElement,
                ne._currentTarget = event.currentTarget,
                ne._eventPhase = event.eventPhase
            } else
                ne = event;
            return origListenerFunc(ne)
        }
    }
    function u(t) {
        let e;
        e = typeof t == "string" ? t : t && t.length ? t.reduce((r,n)=>(r += String.fromCharCode(n),
        r), "") : t ? t.toString() : "";
        try {
            return "__wb_post_data=" + btoa(e)
        } catch {
            return "__wb_post_data="
        }
    }
    function w(t) {
        function o(a) {
            return a instanceof Uint8Array && (a = new TextDecoder().decode(a)),
            a
        }
        let {method: e, headers: r, postData: n} = t;
        if (e === "GET")
            return !1;
        let i = (r.get("content-type") || "").split(";")[0]
          , s = "";
        switch (i) {
        case "application/x-www-form-urlencoded":
            s = o(n);
            break;
        case "application/json":
            s = c(o(n));
            break;
        case "text/plain":
            try {
                s = c(o(n), !1)
            } catch {
                s = u(n)
            }
            break;
        case "multipart/form-data":
            {
                let a = r.get("content-type");
                if (!a)
                    throw new Error("utils cannot call postToGetURL when missing content-type header");
                s = g(o(n), a);
                break
            }
        default:
            s = u(n);
        }
        return s !== null && (t.url = f(t.url, s, t.method),
        t.method = "GET",
        t.requestBody = s,
        !0)
    }
    function f(t, e, r) {
        if (!r)
            return t;
        let n = t.indexOf("?") > 0 ? "&" : "?";
        return `${t}${n}__wb_method=${r}&${e}`
    }
    function p(t, e=!0) {
        if (typeof t == "string")
            try {
                t = JSON.parse(t)
            } catch {
                t = {}
            }
        let r = new URLSearchParams
          , n = {}
          , i = o=>r.has(o) ? (o in n || (n[o] = 1),
        o + "." + ++n[o] + "_") : o;
        try {
            JSON.stringify(t, (o,s)=>(["object", "function"].includes(typeof s) || r.set(i(o), s),
            s))
        } catch (o) {
            if (!e)
                throw o
        }
        return r
    }
    function y(t, e) {
        let r = new URLSearchParams;
        t instanceof Uint8Array && (t = new TextDecoder().decode(t));
        try {
            let n = e.split("boundary=")[1]
              , i = t.split(new RegExp("-*" + n + "-*","mi"));
            for (let o of i) {
                let s = o.trim().match(/name="([^"]+)"\r\n\r\n(.*)/im);
                s && r.set(s[1], s[2])
            }
        } catch {}
        return r
    }
    function c(t, e=!0) {
        return p(t, e).toString()
    }
    function g(t, e) {
        return y(t, e).toString()
    }
    function Wombat($wbwindow, wbinfo) {
        if (!(this instanceof Wombat))
            return new Wombat($wbwindow,wbinfo);
        this.debug_rw = false,
        this.$wbwindow = $wbwindow,
        this.WBWindow = Window,
        this.origHost = $wbwindow.location.host,
        this.origHostname = $wbwindow.location.hostname,
        this.origProtocol = $wbwindow.location.protocol,
        this.HTTP_PREFIX = "http://",
        this.HTTPS_PREFIX = "https://",
        this.REL_PREFIX = "//",
        this.VALID_PREFIXES = [this.HTTP_PREFIX, this.HTTPS_PREFIX, this.REL_PREFIX],
        this.IGNORE_PREFIXES = ["#", "about:", "data:", "blob:", "mailto:", "javascript:", "{", "*"],
        "ignore_prefixes"in wbinfo && (this.IGNORE_PREFIXES = this.IGNORE_PREFIXES.concat(wbinfo.ignore_prefixes)),
        this.WB_CHECK_THIS_FUNC = "_____WB$wombat$check$this$function_____",
        this.WB_ASSIGN_FUNC = "_____WB$wombat$assign$function_____",
        this.wb_setAttribute = $wbwindow.Element.prototype.setAttribute,
        this.wb_getAttribute = $wbwindow.Element.prototype.getAttribute,
        this.wb_funToString = Function.prototype.toString,
        this.WBAutoFetchWorker = null,
        this.wbUseAFWorker = wbinfo.enable_auto_fetch && $wbwindow.Worker != null && wbinfo.is_live,
        this.wb_rel_prefix = "",
        this.wb_wombat_updating = false,
        this.message_listeners = new FuncMap,
        this.storage_listeners = new FuncMap,
        this.linkAsTypes = {
            script: "js_",
            worker: "js_",
            style: "cs_",
            image: "im_",
            document: "if_",
            fetch: "mp_",
            font: "oe_",
            audio: "oe_",
            video: "oe_",
            embed: "oe_",
            object: "oe_",
            track: "oe_",
            "": "mp_",
            null: "mp_",
            undefined: "mp_"
        },
        this.linkTagMods = {
            linkRelToAs: {
                import: this.linkAsTypes,
                preload: this.linkAsTypes
            },
            stylesheet: "cs_",
            null: "mp_",
            undefined: "mp_",
            "": "mp_"
        },
        this.tagToMod = {
            A: {
                href: "mp_"
            },
            AREA: {
                href: "mp_"
            },
            AUDIO: {
                src: "oe_",
                poster: "im_"
            },
            BASE: {
                href: "mp_"
            },
            EMBED: {
                src: "oe_"
            },
            FORM: {
                action: "mp_"
            },
            FRAME: {
                src: "fr_"
            },
            IFRAME: {
                src: "if_"
            },
            IMAGE: {
                href: "im_",
                "xlink:href": "im_"
            },
            IMG: {
                src: "im_",
                srcset: "im_"
            },
            INPUT: {
                src: "oe_"
            },
            INS: {
                cite: "mp_"
            },
            META: {
                content: "mp_"
            },
            OBJECT: {
                data: "oe_",
                codebase: "oe_"
            },
            Q: {
                cite: "mp_"
            },
            SCRIPT: {
                src: "js_",
                "xlink:href": "js_"
            },
            SOURCE: {
                src: "oe_",
                srcset: "oe_"
            },
            TRACK: {
                src: "oe_"
            },
            VIDEO: {
                src: "oe_",
                poster: "im_"
            },
            image: {
                href: "im_",
                "xlink:href": "im_"
            }
        },
        this.URL_PROPS = ["href", "hash", "pathname", "host", "hostname", "protocol", "origin", "search", "port"],
        this.wb_info = wbinfo,
        this.wb_opts = wbinfo.wombat_opts,
        this.wb_replay_prefix = wbinfo.prefix,
        this.wb_is_proxy = this.wb_info.proxy_magic || !this.wb_replay_prefix,
        this.wb_info.top_host = this.wb_info.top_host || "*",
        this.wb_curr_host = $wbwindow.location.protocol + "//" + $wbwindow.location.host,
        this.wb_info.wombat_opts = this.wb_info.wombat_opts || {},
        this.wb_orig_scheme = this.wb_info.wombat_scheme + "://",
        this.wb_orig_origin = this.wb_orig_scheme + this.wb_info.wombat_host,
        this.wb_abs_prefix = this.wb_replay_prefix,
        this.wb_capture_date_part = "",
        !this.wb_info.is_live && this.wb_info.wombat_ts && (this.wb_capture_date_part = "/" + this.wb_info.wombat_ts + "/"),
        this.BAD_PREFIXES = ["http:" + this.wb_replay_prefix, "https:" + this.wb_replay_prefix, "http:/" + this.wb_replay_prefix, "https:/" + this.wb_replay_prefix],
        this.hostnamePortRe = /^[\w-]+(\.[\w-_]+)+(:\d+)(\/|$)/,
        this.ipPortRe = /^\d+\.\d+\.\d+\.\d+(:\d+)?(\/|$)/,
        this.workerBlobRe = /__WB_pmw\(.*?\)\.(?=postMessage\()/g,
        this.rmCheckThisInjectRe = /_____WB\$wombat\$check\$this\$function_____\(.*?\)/g,
        this.STYLE_REGEX = /(url\s*\(\s*[\\"']*)([^)'"]+)([\\"']*\s*\))/gi,
        this.IMPORT_REGEX = /(@import\s*[\\"']*)([^)'";]+)([\\"']*\s*;?)/gi,
        this.IMPORT_JS_REGEX = /^(import\s*\(['"]+)([^'"]+)(["'])/i,
        this.no_wombatRe = /WB_wombat_/g,
        this.srcsetRe = /\s*(\S*\s+[\d.]+[wx]),|(?:\s*,(?:\s+|(?=https?:)))/,
        this.cookie_path_regex = /\bPath='?"?([^;'"\s]+)/i,
        this.cookie_domain_regex = /\bDomain=([^;'"\s]+)/i,
        this.cookie_expires_regex = /\bExpires=([^;'"]+)/gi,
        this.SetCookieRe = /,(?![|])/,
        this.IP_RX = /^(\d)+\.(\d)+\.(\d)+\.(\d)+$/,
        this.FullHTMLRegex = /^\s*<(?:html|head|body|!doctype html)/i,
        this.IsTagRegex = /^\s*</,
        this.DotPostMessageRe = /(\.postMessage\s*\()/,
        this.extractPageUnderModifierRE = /\/(?:[0-9]{14})?([a-z]{2, 3}_)\//,
        this.write_buff = "";
        var eTargetProto = ($wbwindow.EventTarget || {}).prototype;
        this.utilFns = {
            cspViolationListener: function(e) {
                if (console.group("CSP Violation"),
                console.log("Replayed Page URL", window.WB_wombat_location.href),
                console.log("The documentURI", e.documentURI),
                console.log("The blocked URL", e.blockedURI),
                console.log("The directive violated", e.violatedDirective),
                console.log("Our policy", e.originalPolicy),
                e.sourceFile) {
                    var fileInfo = "File: " + e.sourceFile;
                    e.lineNumber && e.columnNumber ? fileInfo += " @ " + e.lineNumber + ":" + e.columnNumber : e.lineNumber && (fileInfo += " @ " + e.lineNumber),
                    console.log(fileInfo)
                }
                console.groupEnd()
            },
            addEventListener: eTargetProto.addEventListener,
            removeEventListener: eTargetProto.removeEventListener,
            objToString: Object.prototype.toString,
            wbSheetMediaQChecker: null,
            XHRopen: null,
            XHRsend: null
        },
        this.showCSPViolations = {
            yesNo: false,
            added: false
        },
        autobind(this)
    }
    FuncMap.prototype.set = function(fnKey, fnValue) {
        this._map.push([fnKey, fnValue])
    }
    ,
    FuncMap.prototype.get = function(fnKey) {
        for (var i = 0; i < this._map.length; i++)
            if (this._map[i][0] === fnKey)
                return this._map[i][1];
        return null
    }
    ,
    FuncMap.prototype.find = function(fnKey) {
        for (var i = 0; i < this._map.length; i++)
            if (this._map[i][0] === fnKey)
                return i;
        return -1
    }
    ,
    FuncMap.prototype.add_or_get = function(func, initter) {
        var fnValue = this.get(func);
        return fnValue || (fnValue = initter(),
        this.set(func, fnValue)),
        fnValue
    }
    ,
    FuncMap.prototype.remove = function(func) {
        var idx = this.find(func);
        if (idx >= 0) {
            var fnMapping = this._map.splice(idx, 1);
            return fnMapping[0][1]
        }
        return null
    }
    ,
    FuncMap.prototype.map = function(param) {
        for (var i = 0; i < this._map.length; i++)
            this._map[i][1](param)
    }
    ;
    var ThrowExceptions = {
        yes: false
    }
      , WOMBAT = Symbol("__wb__storage_WOMBAT")
      , TYPE = Symbol("__wb__storage_TYPE");
    Storage.prototype.getItem = function getItem(name) {
        return this.hasOwnProperty(name) ? this[name] : null
    }
    ,
    Storage.prototype.setItem = function setItem(name, value) {
        var sname = String(name)
          , svalue = String(value)
          , old = this.getItem(sname);
        return this[sname] = value,
        this.fireEvent(sname, old, svalue),
        undefined
    }
    ,
    Storage.prototype._deleteItem = function(item) {
        delete this[item]
    }
    ,
    Storage.prototype.removeItem = function removeItem(name) {
        var old = this.getItem(name);
        return this._deleteItem(name),
        this.fireEvent(name, old, null),
        undefined
    }
    ,
    Storage.prototype.clear = function clear() {
        for (var member in this)
            delete this[member];
        return this.fireEvent(null, null, null),
        undefined
    }
    ,
    Storage.prototype.key = function key(index) {
        var n = ensureNumber(index);
        if (n == null || n < 0)
            return null;
        var keys = Object.keys(this);
        return n < keys.length ? keys[n] : null
    }
    ,
    Storage.prototype.fireEvent = function fireEvent(key, oldValue, newValue) {
        var sevent = new StorageEvent("storage",{
            key: key,
            newValue: newValue,
            oldValue: oldValue,
            url: this[WOMBAT].$wbwindow.WB_wombat_location.href
        });
        Object.defineProperty(sevent, "storageArea", {
            value: this,
            writable: false,
            configurable: false
        }),
        sevent._storageArea = this,
        this[WOMBAT].storage_listeners.map(sevent)
    }
    ,
    Storage.prototype.valueOf = function valueOf() {
        return this[WOMBAT].$wbwindow[this[TYPE]]
    }
    ,
    Storage.prototype.toString = function() {
        return "[object Storage]"
    }
    ,
    Object.defineProperty(Storage.prototype, "length", {
        enumerable: false,
        get: function length() {
            return Object.keys(this).length
        }
    }),
    addToStringTagToClass(Storage, "Storage"),
    WombatLocation.prototype.replace = function replace(url) {
        var new_url = this.wombat.rewriteUrl(url)
          , orig = this.wombat.extractOriginalURL(new_url);
        return orig === this.href ? orig : this._orig_loc.replace(new_url)
    }
    ,
    WombatLocation.prototype.assign = function assign(url) {
        var new_url = this.wombat.rewriteUrl(url)
          , orig = this.wombat.extractOriginalURL(new_url);
        return orig === this.href ? orig : this._orig_loc.assign(new_url)
    }
    ,
    WombatLocation.prototype.reload = function reload(forcedReload) {}
    ,
    WombatLocation.prototype.toString = function toString() {
        return this.href
    }
    ,
    WombatLocation.prototype.valueOf = function valueOf() {
        return this
    }
    ,
    addToStringTagToClass(WombatLocation, "Location"),
    AutoFetcher.prototype._initWorker = function(config) {
        var wombat = this.wombat;
        if (config.isTop) {
            try {
                this.worker = new Worker(config.workerURL,{
                    type: "classic",
                    credentials: "include"
                })
            } catch (e) {
                console.error("Failed to create auto fetch worker\n", e)
            }
            return
        }
        this.worker = {
            postMessage: function(msg) {
                msg.wb_type || (msg = {
                    wb_type: "aaworker",
                    msg: msg
                }),
                wombat.$wbwindow.__WB_replay_top.__orig_postMessage(msg, "*")
            },
            terminate: function() {}
        }
    }
    ,
    AutoFetcher.prototype.extractMediaRulesFromSheet = function(sheet) {
        var rules, media = [];
        try {
            rules = sheet.cssRules || sheet.rules
        } catch (e) {
            return media
        }
        for (var rule, i = 0; i < rules.length; ++i)
            rule = rules[i],
            rule.type === CSSRule.MEDIA_RULE && media.push(rule.cssText);
        return media
    }
    ,
    AutoFetcher.prototype.deferredSheetExtraction = function(sheet) {
        var afw = this;
        Promise.resolve().then(function() {
            var media = afw.extractMediaRulesFromSheet(sheet);
            media.length > 0 && afw.preserveMedia(media)
        })
    }
    ,
    AutoFetcher.prototype.terminate = function() {
        this.worker.terminate()
    }
    ,
    AutoFetcher.prototype.justFetch = function(urls) {
        this.worker.postMessage({
            type: "fetch-all",
            values: urls
        })
    }
    ,
    AutoFetcher.prototype.fetchAsPage = function(url, originalUrl, title) {
        if (url) {
            var headers = {
                "X-Wombat-History-Page": originalUrl
            };
            if (title) {
                var encodedTitle = encodeURIComponent(title.trim());
                title && (headers["X-Wombat-History-Title"] = encodedTitle)
            }
            var fetchData = {
                url: url,
                options: {
                    headers: headers,
                    cache: "no-store"
                }
            };
            this.justFetch([fetchData])
        }
    }
    ,
    AutoFetcher.prototype.postMessage = function(msg, deferred) {
        if (deferred) {
            var afWorker = this;
            return void Promise.resolve().then(function() {
                afWorker.worker.postMessage(msg)
            })
        }
        this.worker.postMessage(msg)
    }
    ,
    AutoFetcher.prototype.preserveSrcset = function(srcset, mod) {
        this.postMessage({
            type: "values",
            srcset: {
                value: srcset,
                mod: mod,
                presplit: true
            }
        }, true)
    }
    ,
    AutoFetcher.prototype.preserveDataSrcset = function(elem) {
        this.postMessage({
            type: "values",
            srcset: {
                value: elem.dataset.srcset,
                mod: this.rwMod(elem),
                presplit: false
            }
        }, true)
    }
    ,
    AutoFetcher.prototype.preserveMedia = function(media) {
        this.postMessage({
            type: "values",
            media: media
        }, true)
    }
    ,
    AutoFetcher.prototype.getSrcset = function(elem) {
        return this.wombat.wb_getAttribute ? this.wombat.wb_getAttribute.call(elem, "srcset") : elem.getAttribute("srcset")
    }
    ,
    AutoFetcher.prototype.rwMod = function(elem) {
        switch (elem.tagName) {
        case "SOURCE":
            return elem.parentElement && elem.parentElement.tagName === "PICTURE" ? "im_" : "oe_";
        case "IMG":
            return "im_";
        }
        return "oe_"
    }
    ,
    AutoFetcher.prototype.extractFromLocalDoc = function() {
        var afw = this;
        Promise.resolve().then(function() {
            for (var msg = {
                type: "values",
                context: {
                    docBaseURI: document.baseURI
                }
            }, media = [], i = 0, sheets = document.styleSheets; i < sheets.length; ++i)
                media = media.concat(afw.extractMediaRulesFromSheet(sheets[i]));
            var elem, srcv, mod, elems = document.querySelectorAll(afw.elemSelector), srcset = {
                values: [],
                presplit: false
            }, src = {
                values: []
            };
            for (i = 0; i < elems.length; ++i)
                elem = elems[i],
                srcv = elem.src ? elem.src : null,
                mod = afw.rwMod(elem),
                elem.srcset && srcset.values.push({
                    srcset: afw.getSrcset(elem),
                    mod: mod,
                    tagSrc: srcv
                }),
                elem.dataset.srcset && srcset.values.push({
                    srcset: elem.dataset.srcset,
                    mod: mod,
                    tagSrc: srcv
                }),
                elem.dataset.src && src.values.push({
                    src: elem.dataset.src,
                    mod: mod
                }),
                elem.tagName === "SOURCE" && srcv && src.values.push({
                    src: srcv,
                    mod: mod
                });
            media.length && (msg.media = media),
            srcset.values.length && (msg.srcset = srcset),
            src.values.length && (msg.src = src),
            (msg.media || msg.srcset || msg.src) && afw.postMessage(msg)
        })
    }
    ,
    Wombat.prototype._internalInit = function() {
        this.initTopFrame(this.$wbwindow),
        this.initWombatLoc(this.$wbwindow),
        this.initWombatTop(this.$wbwindow);
        var wb_origin = this.$wbwindow.__WB_replay_top.location.origin
          , wb_host = this.$wbwindow.__WB_replay_top.location.host
          , wb_proto = this.$wbwindow.__WB_replay_top.location.protocol;
        this.wb_rel_prefix = this.wb_replay_prefix && this.wb_replay_prefix.indexOf(wb_origin) === 0 ? this.wb_replay_prefix.substring(wb_origin.length) : this.wb_replay_prefix,
        this.wb_prefixes = [this.wb_abs_prefix, this.wb_rel_prefix];
        var rx = "((" + wb_proto + ")?//" + wb_host + ")?" + this.wb_rel_prefix + "[^/]+/";
        this.wb_unrewrite_rx = new RegExp(rx,"g"),
        this.wb_info.is_framed && this.wb_info.mod !== "bn_" && this.initTopFrameNotify(this.wb_info),
        this.initAutoFetchWorker()
    }
    ,
    Wombat.prototype._addRemoveCSPViolationListener = function(yesNo) {
        this.showCSPViolations.yesNo = yesNo,
        this.showCSPViolations.yesNo && !this.showCSPViolations.added ? (this.showCSPViolations.added = true,
        this._addEventListener(document, "securitypolicyviolation", this.utilFns.cspViolationListener)) : (this.showCSPViolations.added = false,
        this._removeEventListener(document, "securitypolicyviolation", this.utilFns.cspViolationListener))
    }
    ,
    Wombat.prototype._addEventListener = function(obj, event, fun) {
        return this.utilFns.addEventListener ? this.utilFns.addEventListener.call(obj, event, fun) : void obj.addEventListener(event, fun)
    }
    ,
    Wombat.prototype._removeEventListener = function(obj, event, fun) {
        return this.utilFns.removeEventListener ? this.utilFns.removeEventListener.call(obj, event, fun) : void obj.removeEventListener(event, fun)
    }
    ,
    Wombat.prototype.getPageUnderModifier = function() {
        try {
            var pageUnderModifier = this.extractPageUnderModifierRE.exec(location.pathname);
            if (pageUnderModifier && pageUnderModifier[1]) {
                var mod = pageUnderModifier[1].trim();
                return mod || "mp_"
            }
        } catch (e) {}
        return "mp_"
    }
    ,
    Wombat.prototype.isNativeFunction = function(funToTest) {
        if (!funToTest || typeof funToTest !== "function")
            return false;
        var str = this.wb_funToString.call(funToTest);
        return str.indexOf("[native code]") != -1 && (!(funToTest.__WB_is_native_func__ !== undefined) || !!funToTest.__WB_is_native_func__)
    }
    ,
    Wombat.prototype.isString = function(arg) {
        return arg != null && Object.getPrototypeOf(arg) === String.prototype
    }
    ,
    Wombat.prototype.blobUrlForIframe = function(iframe, string) {
        var blob = new Blob([string],{
            type: "text/html"
        })
          , url = URL.createObjectURL(blob);
        iframe.__wb_blobSrc = url,
        iframe.addEventListener("load", function() {
            iframe.__wb_blobSrc && (URL.revokeObjectURL(iframe.__wb_blobSrc),
            iframe.__wb_blobSrc = null)
        }, {
            once: true
        }),
        iframe.__wb_origSrc = iframe.src;
        var blobIdUrl = url.slice(url.lastIndexOf("/") + 1) + "/" + this.wb_info.url;
        iframe.src = this.wb_info.prefix + this.wb_info.request_ts + "mp_/blob:" + blobIdUrl
    }
    ,
    Wombat.prototype.isSavedSrcSrcset = function(elem) {
        switch (elem.tagName) {
        case "IMG":
        case "VIDEO":
        case "AUDIO":
            return true;
        case "SOURCE":
            if (!elem.parentElement)
                return false;
            switch (elem.parentElement.tagName) {
            case "PICTURE":
            case "VIDEO":
            case "AUDIO":
                return true;
            default:
                return false;
            }
        default:
            return false;
        }
    }
    ,
    Wombat.prototype.isSavedDataSrcSrcset = function(elem) {
        return !!(elem.dataset && elem.dataset.srcset != null) && this.isSavedSrcSrcset(elem)
    }
    ,
    Wombat.prototype.isHostUrl = function(str) {
        if (str.indexOf("www.") === 0)
            return true;
        var matches = str.match(this.hostnamePortRe);
        return !!(matches && matches[0].length < 64) || (matches = str.match(this.ipPortRe),
        !!matches && matches[0].length < 64)
    }
    ,
    Wombat.prototype.isArgumentsObj = function(maybeArgumentsObj) {
        if (!maybeArgumentsObj || typeof maybeArgumentsObj.toString !== "function")
            return false;
        try {
            return this.utilFns.objToString.call(maybeArgumentsObj) === "[object Arguments]"
        } catch (e) {
            return false
        }
    }
    ,
    Wombat.prototype.deproxyArrayHandlingArgumentsObj = function(maybeArgumentsObj) {
        if (!maybeArgumentsObj || maybeArgumentsObj instanceof NodeList || !maybeArgumentsObj.length)
            return maybeArgumentsObj;
        for (var args = this.isArgumentsObj(maybeArgumentsObj) ? new Array(maybeArgumentsObj.length) : maybeArgumentsObj, i = 0; i < maybeArgumentsObj.length; ++i) {
            const res = this.proxyToObj(maybeArgumentsObj[i]);
            res !== args[i] && (args[i] = res)
        }
        return args
    }
    ,
    Wombat.prototype.startsWith = function(string, prefix) {
        return string ? string.indexOf(prefix) === 0 ? prefix : undefined : undefined
    }
    ,
    Wombat.prototype.startsWithOneOf = function(string, prefixes) {
        if (!string)
            return undefined;
        for (var i = 0; i < prefixes.length; i++)
            if (string.indexOf(prefixes[i]) === 0)
                return prefixes[i];
        return undefined
    }
    ,
    Wombat.prototype.endsWith = function(str, suffix) {
        return str ? str.indexOf(suffix, str.length - suffix.length) === -1 ? undefined : suffix : undefined
    }
    ,
    Wombat.prototype.shouldRewriteAttr = function(tagName, attr) {
        switch (attr) {
        case "href":
        case "src":
        case "xlink:href":
            return true;
        }
        return !!(tagName && this.tagToMod[tagName] && this.tagToMod[tagName][attr] !== undefined) || tagName === "VIDEO" && attr === "poster" || tagName === "META" && attr === "content"
    }
    ,
    Wombat.prototype.skipWrapScriptBasedOnType = function(scriptType) {
        return !!scriptType && !(scriptType.indexOf("javascript") >= 0 || scriptType.indexOf("ecmascript") >= 0) && (!!(scriptType.indexOf("json") >= 0) || !!(scriptType.indexOf("text/") >= 0))
    }
    ,
    Wombat.prototype.skipWrapScriptTextBasedOnText = function(text) {
        if (!text || text.indexOf(this.WB_ASSIGN_FUNC) >= 0 || text.indexOf("<") === 0)
            return true;
        for (var override_props = ["window", "self", "document", "location", "top", "parent", "frames", "opener"], i = 0; i < override_props.length; i++)
            if (text.indexOf(override_props[i]) >= 0)
                return false;
        return true
    }
    ,
    Wombat.prototype.nodeHasChildren = function(node) {
        if (!node)
            return false;
        if (typeof node.hasChildNodes === "function")
            return node.hasChildNodes();
        var kids = node.children || node.childNodes;
        return !!kids && kids.length > 0
    }
    ,
    Wombat.prototype.rwModForElement = function(elem, attrName) {
        if (!elem)
            return undefined;
        var mod = "mp_";
        if (!(elem.tagName === "LINK" && attrName === "href")) {
            var maybeMod = this.tagToMod[elem.tagName];
            maybeMod != null && (mod = maybeMod[attrName])
        } else if (elem.rel) {
            var relV = elem.rel.trim().toLowerCase()
              , asV = this.wb_getAttribute.call(elem, "as");
            if (asV && this.linkTagMods.linkRelToAs[relV] != null) {
                var asMods = this.linkTagMods.linkRelToAs[relV];
                mod = asMods[asV.toLowerCase()]
            } else
                this.linkTagMods[relV] != null && (mod = this.linkTagMods[relV])
        }
        return mod
    }
    ,
    Wombat.prototype.removeWBOSRC = function(elem) {
        elem.tagName !== "SCRIPT" || elem.__$removedWBOSRC$__ || (elem.hasAttribute("__wb_orig_src") && elem.removeAttribute("__wb_orig_src"),
        elem.__$removedWBOSRC$__ = true)
    }
    ,
    Wombat.prototype.retrieveWBOSRC = function(elem) {
        if (elem.tagName === "SCRIPT" && !elem.__$removedWBOSRC$__) {
            var maybeWBOSRC;
            return maybeWBOSRC = this.wb_getAttribute ? this.wb_getAttribute.call(elem, "__wb_orig_src") : elem.getAttribute("__wb_orig_src"),
            maybeWBOSRC == null && (elem.__$removedWBOSRC$__ = true),
            maybeWBOSRC
        }
        return undefined
    }
    ,
    Wombat.prototype.wrapScriptTextJsProxy = function(scriptText) {
        return "var _____WB$wombat$assign$function_____ = function(name) {return (self._wb_wombat && self._wb_wombat.local_init && self._wb_wombat.local_init(name)) || self[name]; };\nif (!self.__WB_pmw) { self.__WB_pmw = function(obj) { this.__WB_source = obj; return this; } }\n{\nlet window = _____WB$wombat$assign$function_____(\"window\");\nlet globalThis = _____WB$wombat$assign$function_____(\"globalThis\");\nlet self = _____WB$wombat$assign$function_____(\"self\");\nlet document = _____WB$wombat$assign$function_____(\"document\");\nlet location = _____WB$wombat$assign$function_____(\"location\");\nlet top = _____WB$wombat$assign$function_____(\"top\");\nlet parent = _____WB$wombat$assign$function_____(\"parent\");\nlet frames = _____WB$wombat$assign$function_____(\"frames\");\nlet opener = _____WB$wombat$assign$function_____(\"opener\");\n{\n" + scriptText.replace(this.DotPostMessageRe, ".__WB_pmw(self.window)$1") + "\n\n}}"
    }
    ,
    Wombat.prototype.watchElem = function(elem, func) {
        if (!this.$wbwindow.MutationObserver)
            return false;
        var m = new this.$wbwindow.MutationObserver(function(records, observer) {
            for (var r, i = 0; i < records.length; i++)
                if (r = records[i],
                r.type === "childList")
                    for (var j = 0; j < r.addedNodes.length; j++)
                        func(r.addedNodes[j])
        }
        );
        m.observe(elem, {
            childList: true,
            subtree: true
        })
    }
    ,
    Wombat.prototype.reconstructDocType = function(doctype) {
        return doctype == null ? "" : "<!doctype " + doctype.name + (doctype.publicId ? " PUBLIC \"" + doctype.publicId + "\"" : "") + (!doctype.publicId && doctype.systemId ? " SYSTEM" : "") + (doctype.systemId ? " \"" + doctype.systemId + "\"" : "") + ">"
    }
    ,
    Wombat.prototype.getFinalUrl = function(useRel, mod, url) {
        var prefix = useRel ? this.wb_rel_prefix : this.wb_abs_prefix;
        return mod == null && (mod = this.wb_info.mod),
        this.wb_info.is_live || (prefix += this.wb_info.wombat_ts),
        prefix += mod,
        prefix[prefix.length - 1] !== "/" && (prefix += "/"),
        prefix + url
    }
    ,
    Wombat.prototype.resolveRelUrl = function(url, doc) {
        var docObj = doc || this.$wbwindow.document
          , parser = this.makeParser(docObj.baseURI, docObj)
          , hash = parser.href.lastIndexOf("#")
          , href = hash >= 0 ? parser.href.substring(0, hash) : parser.href
          , lastslash = href.lastIndexOf("/");
        return parser.href = lastslash >= 0 && lastslash !== href.length - 1 ? href.substring(0, lastslash + 1) + url : href + url,
        parser.href
    }
    ,
    Wombat.prototype.extractOriginalURL = function(rewrittenUrl) {
        if (!rewrittenUrl)
            return "";
        if (this.wb_is_proxy)
            return rewrittenUrl;
        var rwURLString = rewrittenUrl.toString()
          , url = rwURLString;
        if (this.startsWithOneOf(url, this.IGNORE_PREFIXES))
            return url;
        if (url.startsWith(this.wb_info.static_prefix))
            return url;
        var start;
        start = this.startsWith(url, this.wb_abs_prefix) ? this.wb_abs_prefix.length : this.wb_rel_prefix && this.startsWith(url, this.wb_rel_prefix) ? this.wb_rel_prefix.length : this.wb_rel_prefix ? 1 : 0;
        var index = url.indexOf("/http", start);
        return index < 0 && (index = url.indexOf("///", start)),
        index < 0 && (index = url.indexOf("/blob:", start)),
        index < 0 && (index = url.indexOf("/about:blank", start)),
        index >= 0 ? url = url.substr(index + 1) : (index = url.indexOf(this.wb_replay_prefix),
        index >= 0 && (url = url.substr(index + this.wb_replay_prefix.length)),
        url.length > 4 && url.charAt(2) === "_" && url.charAt(3) === "/" && (url = url.substr(4)),
        url !== rwURLString && !this.startsWithOneOf(url, this.VALID_PREFIXES) && !this.startsWith(url, "blob:") && (url = this.wb_orig_scheme + url)),
        rwURLString.charAt(0) === "/" && rwURLString.charAt(1) !== "/" && this.startsWith(url, this.wb_orig_origin) && (url = url.substr(this.wb_orig_origin.length)),
        this.startsWith(url, this.REL_PREFIX) ? this.wb_info.wombat_scheme + ":" + url : url
    }
    ,
    Wombat.prototype.makeParser = function(maybeRewrittenURL, doc) {
        var originalURL = this.extractOriginalURL(maybeRewrittenURL)
          , docElem = doc;
        return doc || (this.$wbwindow.location.href === "about:blank" && this.$wbwindow.opener ? docElem = this.$wbwindow.opener.document : docElem = this.$wbwindow.document),
        this._makeURLParser(originalURL, docElem)
    }
    ,
    Wombat.prototype._makeURLParser = function(url, docElem) {
        try {
            return new this.$wbwindow.URL(url,docElem.baseURI)
        } catch (e) {}
        var p = docElem.createElement("a");
        return p._no_rewrite = true,
        p.href = url,
        p
    }
    ,
    Wombat.prototype.defProp = function(obj, prop, setFunc, getFunc, enumerable) {
        var existingDescriptor = Object.getOwnPropertyDescriptor(obj, prop);
        if (existingDescriptor && !existingDescriptor.configurable)
            return false;
        if (!getFunc)
            return false;
        var descriptor = {
            configurable: true,
            enumerable: enumerable || false,
            get: getFunc
        };
        setFunc && (descriptor.set = setFunc);
        try {
            return Object.defineProperty(obj, prop, descriptor),
            true
        } catch (e) {
            return console.warn("Failed to redefine property %s", prop, e.message),
            false
        }
    }
    ,
    Wombat.prototype.defGetterProp = function(obj, prop, getFunc, enumerable) {
        var existingDescriptor = Object.getOwnPropertyDescriptor(obj, prop);
        if (existingDescriptor && !existingDescriptor.configurable)
            return false;
        if (!getFunc)
            return false;
        try {
            return Object.defineProperty(obj, prop, {
                configurable: true,
                enumerable: enumerable || false,
                get: getFunc
            }),
            true
        } catch (e) {
            return console.warn("Failed to redefine property %s", prop, e.message),
            false
        }
    }
    ,
    Wombat.prototype.getOrigGetter = function(obj, prop) {
        var orig_getter;
        if (obj.__lookupGetter__ && (orig_getter = obj.__lookupGetter__(prop)),
        !orig_getter && Object.getOwnPropertyDescriptor) {
            var props = Object.getOwnPropertyDescriptor(obj, prop);
            props && (orig_getter = props.get)
        }
        return orig_getter
    }
    ,
    Wombat.prototype.getOrigSetter = function(obj, prop) {
        var orig_setter;
        if (obj.__lookupSetter__ && (orig_setter = obj.__lookupSetter__(prop)),
        !orig_setter && Object.getOwnPropertyDescriptor) {
            var props = Object.getOwnPropertyDescriptor(obj, prop);
            props && (orig_setter = props.set)
        }
        return orig_setter
    }
    ,
    Wombat.prototype.getAllOwnProps = function(obj) {
        for (var ownProps = [], props = Object.getOwnPropertyNames(obj), i = 0; i < props.length; i++) {
            var prop = props[i];
            try {
                obj[prop] && !obj[prop].prototype && ownProps.push(prop)
            } catch (e) {}
        }
        for (var traverseObj = Object.getPrototypeOf(obj); traverseObj; ) {
            for (props = Object.getOwnPropertyNames(traverseObj),
            i = 0; i < props.length; i++)
                ownProps.push(props[i]);
            traverseObj = Object.getPrototypeOf(traverseObj)
        }
        return ownProps
    }
    ,
    Wombat.prototype.sendTopMessage = function(message, skipTopCheck, win) {
        win = win || this.$wbwindow;
        win.__WB_top_frame && (skipTopCheck || win == win.__WB_replay_top) && win.__WB_top_frame.postMessage(message, this.wb_info.top_host)
    }
    ,
    Wombat.prototype.sendHistoryUpdate = function(url, title, win) {
        this.sendTopMessage({
            url: url,
            ts: this.wb_info.timestamp,
            request_ts: this.wb_info.request_ts,
            is_live: this.wb_info.is_live,
            title: title,
            wb_type: "replace-url"
        }, false, win)
    }
    ,
    Wombat.prototype.updateLocation = function(reqHref, origHref, actualLocation) {
        if (reqHref && reqHref !== origHref) {
            var ext_orig = this.extractOriginalURL(origHref)
              , ext_req = this.extractOriginalURL(reqHref);
            if (ext_orig && ext_orig !== ext_req) {
                var final_href = this.rewriteUrl(reqHref);
                console.log(actualLocation.href + " -> " + final_href),
                actualLocation.href = final_href
            }
        }
    }
    ,
    Wombat.prototype.checkLocationChange = function(wombatLoc, isTop) {
        var locType = typeof wombatLoc
          , actual_location = isTop ? this.$wbwindow.__WB_replay_top.location : this.$wbwindow.location;
        locType === "string" ? this.updateLocation(wombatLoc, actual_location.href, actual_location) : locType === "object" && this.updateLocation(wombatLoc.href, wombatLoc._orig_href, actual_location)
    }
    ,
    Wombat.prototype.checkAllLocations = function() {
        return !this.wb_wombat_updating && void (this.wb_wombat_updating = true,
        this.checkLocationChange(this.$wbwindow.WB_wombat_location, false),
        this.$wbwindow.WB_wombat_location != this.$wbwindow.__WB_replay_top.WB_wombat_location && this.checkLocationChange(this.$wbwindow.__WB_replay_top.WB_wombat_location, true),
        this.wb_wombat_updating = false)
    }
    ,
    Wombat.prototype.proxyToObj = function(source) {
        if (source)
            try {
                var proxyRealObj = source.__WBProxyRealObj__;
                if (proxyRealObj)
                    return proxyRealObj
            } catch (e) {}
        return source
    }
    ,
    Wombat.prototype.objToProxy = function(obj) {
        if (obj)
            try {
                var maybeWbProxy = obj._WB_wombat_obj_proxy;
                if (maybeWbProxy)
                    return maybeWbProxy
            } catch (e) {}
        return obj
    }
    ,
    Wombat.prototype.defaultProxyGet = function(obj, prop, ownProps, fnCache) {
        switch (prop) {
        case "__WBProxyRealObj__":
            return obj;
        case "location":
        case "WB_wombat_location":
            return obj.WB_wombat_location;
        case "_WB_wombat_obj_proxy":
            return obj._WB_wombat_obj_proxy;
        case "__WB_pmw":
        case this.WB_ASSIGN_FUNC:
        case this.WB_CHECK_THIS_FUNC:
            return obj[prop];
        case "origin":
            return obj.WB_wombat_location.origin;
        case "constructor":
            return obj.constructor;
        }
        var retVal = obj[prop]
          , type = typeof retVal;
        if (type === "function" && ownProps.indexOf(prop) !== -1) {
            switch (prop) {
            case "requestAnimationFrame":
            case "cancelAnimationFrame":
                {
                    if (!this.isNativeFunction(retVal))
                        return retVal;
                    break
                }
            case "eval":
                if (this.isNativeFunction(retVal))
                    return this.wrappedEval(retVal);
            }
            var cachedFN = fnCache[prop];
            return cachedFN && cachedFN.original === retVal || (cachedFN = {
                original: retVal,
                boundFn: retVal.bind(obj)
            },
            fnCache[prop] = cachedFN),
            cachedFN.boundFn
        }
        return type === "object" && retVal && retVal._WB_wombat_obj_proxy ? (retVal instanceof this.WBWindow && this.initNewWindowWombat(retVal),
        retVal._WB_wombat_obj_proxy) : retVal
    }
    ,
    Wombat.prototype.setLoc = function(loc, originalURL) {
        var parser = this.makeParser(originalURL, loc.ownerDocument);
        loc._orig_href = originalURL,
        loc._parser = parser;
        var href = parser.href;
        loc._hash = parser.hash,
        loc._href = href,
        loc._host = parser.host,
        loc._hostname = parser.hostname,
        loc._origin = parser.origin ? parser.host ? parser.origin : "null" : parser.protocol + "//" + parser.hostname + (parser.port ? ":" + parser.port : ""),
        loc._pathname = parser.pathname,
        loc._port = parser.port,
        loc._protocol = parser.protocol,
        loc._search = parser.search,
        Object.defineProperty || (loc.href = href,
        loc.hash = parser.hash,
        loc.host = loc._host,
        loc.hostname = loc._hostname,
        loc.origin = loc._origin,
        loc.pathname = loc._pathname,
        loc.port = loc._port,
        loc.protocol = loc._protocol,
        loc.search = loc._search)
    }
    ,
    Wombat.prototype.makeGetLocProp = function(prop, origGetter) {
        var wombat = this;
        return function newGetLocProp() {
            if (this._no_rewrite)
                return origGetter.call(this, prop);
            var curr_orig_href = origGetter.call(this, "href");
            return prop === "href" ? wombat.extractOriginalURL(curr_orig_href) : prop === "ancestorOrigins" ? [] : (this._orig_href !== curr_orig_href && wombat.setLoc(this, curr_orig_href),
            this["_" + prop])
        }
    }
    ,
    Wombat.prototype.makeSetLocProp = function(prop, origSetter, origGetter) {
        var wombat = this;
        return function newSetLocProp(value) {
            if (this._no_rewrite)
                return origSetter.call(this, prop, value);
            if (this["_" + prop] !== value) {
                if (this["_" + prop] = value,
                !this._parser) {
                    var href = origGetter.call(this);
                    this._parser = wombat.makeParser(href, this.ownerDocument)
                }
                var rel = false;
                if (prop === "href" && typeof value === "string")
                    if (value && this._parser instanceof URL)
                        try {
                            value = new URL(value,this._parser).href
                        } catch (e) {
                            console.warn("Error resolving URL", e)
                        }
                    else
                        value && (value[0] === "." || value[0] === "#" ? value = wombat.resolveRelUrl(value, this.ownerDocument) : value[0] === "/" && (value.length > 1 && value[1] === "/" ? value = this._parser.protocol + value : (rel = true,
                        value = WB_wombat_location.origin + value)));
                try {
                    this._parser[prop] = value
                } catch (e) {
                    console.log("Error setting " + prop + " = " + value)
                }
                prop === "hash" ? (value = this._parser[prop],
                origSetter.call(this, "hash", value)) : (rel = rel || value === this._parser.pathname,
                value = wombat.rewriteUrl(this._parser.href, rel),
                origSetter.call(this, "href", value))
            }
        }
    }
    ,
    Wombat.prototype.styleReplacer = function(match, n1, n2, n3, offset, string) {
        return n1 + this.rewriteUrl(n2) + n3
    }
    ,
    Wombat.prototype.domConstructorErrorChecker = function(thisObj, what, args, numRequiredArgs) {
        var errorMsg, needArgs = typeof numRequiredArgs === "number" ? numRequiredArgs : 1;
        if (thisObj instanceof this.WBWindow ? errorMsg = "Failed to construct '" + what + "': Please use the 'new' operator, this DOM object constructor cannot be called as a function." : args && args.length < needArgs && (errorMsg = "Failed to construct '" + what + "': " + needArgs + " argument required, but only 0 present."),
        errorMsg)
            throw new TypeError(errorMsg)
    }
    ,
    Wombat.prototype.rewriteNodeFuncArgs = function(fnThis, originalFn, newNode, oldNode) {
        if (newNode)
            switch (newNode.nodeType) {
            case Node.ELEMENT_NODE:
                this.rewriteElemComplete(newNode);
                break;
            case Node.TEXT_NODE:
                (fnThis.tagName === "STYLE" || newNode.parentNode && newNode.parentNode.tagName === "STYLE") && (newNode.textContent = this.rewriteStyle(newNode.textContent));
                break;
            case Node.DOCUMENT_FRAGMENT_NODE:
                this.recurseRewriteElem(newNode);
            }
        var created = originalFn.call(fnThis, newNode, oldNode);
        return created && created.tagName === "IFRAME" && (created.allow = "autoplay 'self'; fullscreen 'self'",
        this.initIframeWombat(created)),
        created
    }
    ,
    Wombat.prototype.rewriteWSURL = function(originalURL) {
        if (!originalURL)
            return originalURL;
        var urltype_ = typeof originalURL
          , url = originalURL;
        if (urltype_ === "object")
            url = originalURL.toString();
        else if (urltype_ !== "string")
            return originalURL;
        if (!url)
            return url;
        var wsScheme = "ws://"
          , wssScheme = "wss://";
        if (this.wb_is_proxy)
            return this.wb_orig_scheme === this.HTTP_PREFIX && this.startsWith(url, wssScheme) ? "ws://" + url.substr(wssScheme.length) : this.wb_orig_scheme === this.HTTPS_PREFIX && this.startsWith(url, "ws://") ? wssScheme + url.substr(5) : url;
        var wbSecure = this.wb_abs_prefix.indexOf(this.HTTPS_PREFIX) === 0
          , wbPrefix = this.wb_abs_prefix.replace(wbSecure ? this.HTTPS_PREFIX : this.HTTP_PREFIX, wbSecure ? wssScheme : "ws://");
        return wbPrefix += this.wb_info.wombat_ts + "ws_",
        url[url.length - 1] !== "/" && (wbPrefix += "/"),
        wbPrefix + url.replace("WB_wombat_", "")
    }
    ,
    Wombat.prototype.rewriteUrl_ = function(originalURL, useRel, mod, doc) {
        if (!originalURL)
            return originalURL;
        var url, urltype_ = typeof originalURL;
        if (urltype_ === "object")
            url = originalURL.toString();
        else {
            if (urltype_ !== "string")
                return originalURL;
            url = originalURL
        }
        if (!url)
            return url;
        if (this.wb_is_proxy)
            return this.wb_orig_scheme === this.HTTP_PREFIX && this.startsWith(url, this.HTTPS_PREFIX) ? this.HTTP_PREFIX + url.substr(this.HTTPS_PREFIX.length) : this.wb_orig_scheme === this.HTTPS_PREFIX && this.startsWith(url, this.HTTP_PREFIX) ? this.HTTPS_PREFIX + url.substr(this.HTTP_PREFIX.length) : url;
        if (url = url.replace("WB_wombat_", ""),
        mod === "if_" && this.wb_info.isSW && this.startsWith(url, "blob:"))
            return this.wb_info.prefix + this.wb_info.request_ts + "if_/" + url;
        if (this.startsWithOneOf(url.toLowerCase(), this.IGNORE_PREFIXES))
            return url;
        if (this.wb_opts.no_rewrite_prefixes && this.startsWithOneOf(url, this.wb_opts.no_rewrite_prefixes))
            return url;
        var check_url;
        if (check_url = url.indexOf("//") === 0 ? this.origProtocol + url : url,
        this.startsWith(check_url, this.wb_abs_prefix) || this.startsWith(check_url, this.wb_rel_prefix))
            return url;
        if (this.origHost !== this.origHostname && this.startsWith(url, this.origProtocol + "//" + this.origHostname + "/"))
            return url.replace("/" + this.origHostname + "/", "/" + this.origHost + "/");
        if (url.charAt(0) === "/" && !this.startsWith(url, this.REL_PREFIX)) {
            if (this.wb_capture_date_part && url.indexOf(this.wb_capture_date_part) >= 0)
                return url;
            if (url.indexOf(this.wb_rel_prefix) === 0 && url.indexOf("http") > 1) {
                var scheme_sep = url.indexOf(":/");
                return scheme_sep > 0 && url[scheme_sep + 2] !== "/" ? url.substring(0, scheme_sep + 2) + "/" + url.substring(scheme_sep + 2) : url
            }
            return this.getFinalUrl(true, mod, this.wb_orig_origin + url)
        }
        url.charAt(0) === "." && (url = this.resolveRelUrl(url, doc));
        var prefix = this.startsWithOneOf(url.toLowerCase(), this.VALID_PREFIXES);
        if (prefix) {
            var orig_host = this.replayTopHost
              , orig_protocol = this.replayTopProtocol
              , prefix_host = prefix + orig_host + "/";
            if (this.startsWith(url, prefix_host)) {
                if (this.startsWith(url, this.wb_replay_prefix))
                    return url;
                var curr_scheme = orig_protocol + "//"
                  , path = url.substring(prefix_host.length)
                  , rebuild = false;
                return path.indexOf(this.wb_rel_prefix) < 0 && url.indexOf("/static/") < 0 && (path = this.getFinalUrl(true, mod, WB_wombat_location.origin + "/" + path),
                rebuild = true),
                prefix !== curr_scheme && prefix !== this.REL_PREFIX && (rebuild = true),
                rebuild && (url = useRel ? "" : curr_scheme + orig_host,
                path && path[0] !== "/" && (url += "/"),
                url += path),
                url
            }
            return this.getFinalUrl(useRel, mod, url)
        }
        return prefix = this.startsWithOneOf(url, this.BAD_PREFIXES),
        prefix ? this.getFinalUrl(useRel, mod, this.extractOriginalURL(url)) : url
    }
    ,
    Wombat.prototype.rewriteUrl = function(url, useRel, mod, doc) {
        var rewritten = this.rewriteUrl_(url, useRel, mod, doc);
        return this.debug_rw && (url === rewritten ? console.log("NOT REWRITTEN " + url) : console.log("REWRITE: " + url + " -> " + rewritten)),
        rewritten
    }
    ,
    Wombat.prototype.performAttributeRewrite = function(elem, name, value, absUrlOnly) {
        switch (name) {
        case "innerHTML":
        case "outerHTML":
            return this.rewriteHtml(value);
        case "filter":
            return this.rewriteInlineStyle(value);
        case "style":
            return this.rewriteStyle(value);
        case "srcset":
            return this.rewriteSrcset(value, elem);
        }
        if (absUrlOnly && !this.startsWithOneOf(value, this.VALID_PREFIXES))
            return value;
        var mod = this.rwModForElement(elem, name);
        return this.wbUseAFWorker && this.WBAutoFetchWorker && this.isSavedDataSrcSrcset(elem) && this.WBAutoFetchWorker.preserveDataSrcset(elem),
        this.rewriteUrl(value, false, mod, elem.ownerDocument)
    }
    ,
    Wombat.prototype.rewriteAttr = function(elem, name, absUrlOnly) {
        var changed = false;
        if (!elem || !elem.getAttribute || elem._no_rewrite || elem["_" + name])
            return changed;
        var value = this.wb_getAttribute.call(elem, name);
        if (!value || this.startsWith(value, "javascript:"))
            return changed;
        var new_value = this.performAttributeRewrite(elem, name, value, absUrlOnly);
        return new_value !== value && (this.removeWBOSRC(elem),
        this.wb_setAttribute.call(elem, name, new_value),
        changed = true),
        changed
    }
    ,
    Wombat.prototype.noExceptRewriteStyle = function(style) {
        try {
            return this.rewriteStyle(style)
        } catch (e) {
            return style
        }
    }
    ,
    Wombat.prototype.rewriteStyle = function(style) {
        if (!style)
            return style;
        var value = style;
        return typeof style === "object" && (value = style.toString()),
        typeof value === "string" ? value.replace(this.STYLE_REGEX, this.styleReplacer).replace(this.IMPORT_REGEX, this.styleReplacer).replace(this.no_wombatRe, "") : value
    }
    ,
    Wombat.prototype.rewriteSrcset = function(value, elem) {
        if (!value)
            return "";
        for (var v, split = value.split(this.srcsetRe), values = [], mod = this.rwModForElement(elem, "srcset"), i = 0; i < split.length; i++)
            if (v = split[i],
            v) {
                var parts = v.trim().split(" ");
                parts[0] = this.rewriteUrl(parts[0], true, mod),
                values.push(parts.join(" "))
            }
        return this.wbUseAFWorker && this.WBAutoFetchWorker && this.isSavedSrcSrcset(elem) && this.WBAutoFetchWorker.preserveSrcset(values, this.WBAutoFetchWorker.rwMod(elem)),
        values.join(", ")
    }
    ,
    Wombat.prototype.rewriteFrameSrc = function(elem, attrName) {
        var new_value, value = this.wb_getAttribute.call(elem, attrName);
        if (this.startsWith(value, "javascript:") && value.indexOf("WB_wombat_") >= 0) {
            var JS = "javascript:";
            new_value = "javascript:window.parent._wb_wombat.initNewWindowWombat(window);" + value.substr(11)
        }
        return new_value || (new_value = this.rewriteUrl(value, false, this.rwModForElement(elem, attrName))),
        new_value !== value && (this.wb_setAttribute.call(elem, attrName, new_value),
        true)
    }
    ,
    Wombat.prototype.rewriteScript = function(elem) {
        if (elem.hasAttribute("src") || !elem.textContent || !this.$wbwindow.Proxy)
            return this.rewriteAttr(elem, "src");
        if (this.skipWrapScriptBasedOnType(elem.type))
            return false;
        var text = elem.textContent.trim();
        return !this.skipWrapScriptTextBasedOnText(text) && (elem.textContent = this.wrapScriptTextJsProxy(text),
        true)
    }
    ,
    Wombat.prototype.rewriteSVGElem = function(elem) {
        var changed = this.rewriteAttr(elem, "filter");
        return changed = this.rewriteAttr(elem, "style") || changed,
        changed = this.rewriteAttr(elem, "xlink:href") || changed,
        changed = this.rewriteAttr(elem, "href") || changed,
        changed = this.rewriteAttr(elem, "src") || changed,
        changed
    }
    ,
    Wombat.prototype.rewriteElem = function(elem) {
        var changed = false;
        if (!elem)
            return changed;
        if (elem instanceof SVGElement)
            changed = this.rewriteSVGElem(elem);
        else
            switch (elem.tagName) {
            case "META":
                var maybeCSP = this.wb_getAttribute.call(elem, "http-equiv");
                maybeCSP && maybeCSP.toLowerCase() === "content-security-policy" && (this.wb_setAttribute.call(elem, "http-equiv", "_" + maybeCSP),
                changed = true);
                break;
            case "STYLE":
                var new_content = this.rewriteStyle(elem.textContent);
                elem.textContent !== new_content && (elem.textContent = new_content,
                changed = true,
                this.wbUseAFWorker && this.WBAutoFetchWorker && elem.sheet != null && this.WBAutoFetchWorker.deferredSheetExtraction(elem.sheet));
                break;
            case "LINK":
                changed = this.rewriteAttr(elem, "href"),
                this.wbUseAFWorker && elem.rel === "stylesheet" && this._addEventListener(elem, "load", this.utilFns.wbSheetMediaQChecker);
                break;
            case "IMG":
                changed = this.rewriteAttr(elem, "src"),
                changed = this.rewriteAttr(elem, "srcset") || changed,
                changed = this.rewriteAttr(elem, "style") || changed,
                this.wbUseAFWorker && this.WBAutoFetchWorker && elem.dataset.srcset && this.WBAutoFetchWorker.preserveDataSrcset(elem);
                break;
            case "OBJECT":
                if (this.wb_info.isSW && elem.parentElement && elem.getAttribute("type") === "application/pdf") {
                    for (var iframe = this.$wbwindow.document.createElement("IFRAME"), i = 0; i < elem.attributes.length; i++) {
                        var attr = elem.attributes[i]
                          , name = attr.name;
                        name === "data" && (name = "src"),
                        this.wb_setAttribute.call(iframe, name, attr.value)
                    }
                    elem.parentElement.replaceChild(iframe, elem),
                    changed = true;
                    break
                }
                changed = this.rewriteAttr(elem, "data", true),
                changed = this.rewriteAttr(elem, "style") || changed;
                break;
            case "FORM":
                changed = this.rewriteAttr(elem, "poster"),
                changed = this.rewriteAttr(elem, "action") || changed,
                changed = this.rewriteAttr(elem, "style") || changed;
                break;
            case "IFRAME":
                if (changed = this.rewriteFrameSrc(elem, "src"),
                this.wb_info.isSW && !changed) {
                    var srcdoc = elem.getAttribute("srcdoc");
                    if (elem.hasAttribute("srcdoc") && elem.removeAttribute("srcdoc"),
                    srcdoc)
                        this.blobUrlForIframe(elem, srcdoc);
                    else {
                        var src = elem.getAttribute("src");
                        src && src !== "about:blank" || (!src && (elem.__WB_blank = true),
                        elem.src = this.wb_info.prefix + this.wb_info.request_ts + "mp_/about:blank")
                    }
                }
                changed = this.rewriteAttr(elem, "style") || changed;
                break;
            case "FRAME":
                changed = this.rewriteFrameSrc(elem, "src"),
                changed = this.rewriteAttr(elem, "style") || changed;
                break;
            case "SCRIPT":
                changed = this.rewriteScript(elem);
                break;
            case "A":
                if (changed = this.rewriteAttr(elem, "href") || changed,
                elem.hasAttribute("target")) {
                    var newTarget = this.rewriteAttrTarget(elem.target);
                    newTarget !== elem.target && (elem.target = newTarget,
                    changed = true)
                }
                break;
            default:
                {
                    changed = this.rewriteAttr(elem, "src"),
                    changed = this.rewriteAttr(elem, "srcset") || changed,
                    changed = this.rewriteAttr(elem, "href") || changed,
                    changed = this.rewriteAttr(elem, "style") || changed,
                    changed = this.rewriteAttr(elem, "poster") || changed;
                    break
                }
            }
        return elem.hasAttribute && elem.removeAttribute && (elem.hasAttribute("crossorigin") && (elem.removeAttribute("crossorigin"),
        changed = true),
        elem.hasAttribute("integrity") && (elem.removeAttribute("integrity"),
        changed = true)),
        changed
    }
    ,
    Wombat.prototype.recurseRewriteElem = function(curr) {
        if (!this.nodeHasChildren(curr))
            return false;
        for (var changed = false, rewriteQ = [curr.children || curr.childNodes]; rewriteQ.length > 0; )
            for (var child, children = rewriteQ.shift(), i = 0; i < children.length; i++)
                child = children[i],
                child.nodeType === Node.ELEMENT_NODE && (changed = this.rewriteElem(child) || changed,
                this.nodeHasChildren(child) && rewriteQ.push(child.children || child.childNodes));
        return changed
    }
    ,
    Wombat.prototype.rewriteElemComplete = function(elem) {
        if (!elem)
            return false;
        var changed = this.rewriteElem(elem)
          , changedRecursively = this.recurseRewriteElem(elem);
        return changed || changedRecursively
    }
    ,
    Wombat.prototype.rewriteElementsInArguments = function(originalArguments) {
        for (var argElem, argArr = new Array(originalArguments.length), i = 0; i < originalArguments.length; i++)
            argElem = originalArguments[i],
            argElem instanceof Node ? (this.rewriteElemComplete(argElem),
            argArr[i] = argElem) : typeof argElem === "string" ? argArr[i] = this.rewriteHtml(argElem) : argArr[i] = argElem;
        return argArr
    }
    ,
    Wombat.prototype.rewriteHtml = function(string, checkEndTag) {
        if (!string)
            return string;
        var rwString = string;
        if (typeof string !== "string" && (rwString = string.toString()),
        this.write_buff && (rwString = this.write_buff + rwString,
        this.write_buff = ""),
        rwString.indexOf("<script") <= 0 && (rwString = rwString.replace(/((id|class)=".*)WB_wombat_([^"]+)/, "$1$3")),
        !this.$wbwindow.HTMLTemplateElement || this.FullHTMLRegex.test(rwString))
            return this.rewriteHtmlFull(rwString, checkEndTag);
        var inner_doc = new DOMParser().parseFromString("<template>" + rwString + "</template>", "text/html");
        if (!inner_doc || !this.nodeHasChildren(inner_doc.head) || !inner_doc.head.children[0].content)
            return rwString;
        var template = inner_doc.head.children[0];
        if (template._no_rewrite = true,
        this.recurseRewriteElem(template.content)) {
            var new_html = template.innerHTML;
            if (checkEndTag) {
                var first_elem = template.content.children && template.content.children[0];
                if (first_elem) {
                    var end_tag = "</" + first_elem.tagName.toLowerCase() + ">";
                    this.endsWith(new_html, end_tag) && !this.endsWith(rwString.toLowerCase(), end_tag) && (new_html = new_html.substring(0, new_html.length - end_tag.length))
                } else if (rwString[0] !== "<" || rwString[rwString.length - 1] !== ">")
                    return this.write_buff += rwString,
                    undefined
            }
            return new_html
        }
        return rwString
    }
    ,
    Wombat.prototype.rewriteHtmlFull = function(string, checkEndTag) {
        var inner_doc = new DOMParser().parseFromString(string, "text/html");
        if (!inner_doc)
            return string;
        for (var changed = false, i = 0; i < inner_doc.all.length; i++)
            changed = this.rewriteElem(inner_doc.all[i]) || changed;
        if (changed) {
            var new_html;
            if (string && string.indexOf("<html") >= 0)
                inner_doc.documentElement._no_rewrite = true,
                new_html = this.reconstructDocType(inner_doc.doctype) + inner_doc.documentElement.outerHTML;
            else {
                inner_doc.head._no_rewrite = true,
                inner_doc.body._no_rewrite = true;
                var headHasKids = this.nodeHasChildren(inner_doc.head)
                  , bodyHasKids = this.nodeHasChildren(inner_doc.body);
                if (new_html = (headHasKids ? inner_doc.head.outerHTML : "") + (bodyHasKids ? inner_doc.body.outerHTML : ""),
                checkEndTag)
                    if (inner_doc.all.length > 3) {
                        var end_tag = "</" + inner_doc.all[3].tagName.toLowerCase() + ">";
                        this.endsWith(new_html, end_tag) && !this.endsWith(string.toLowerCase(), end_tag) && (new_html = new_html.substring(0, new_html.length - end_tag.length))
                    } else if (string[0] !== "<" || string[string.length - 1] !== ">")
                        return void (this.write_buff += string);
                new_html = this.reconstructDocType(inner_doc.doctype) + new_html
            }
            return new_html
        }
        return string
    }
    ,
    Wombat.prototype.rewriteInlineStyle = function(orig) {
        var decoded;
        try {
            decoded = decodeURIComponent(orig)
        } catch (e) {
            decoded = orig
        }
        if (decoded !== orig) {
            var parts = this.rewriteStyle(decoded).split(",", 2);
            return parts[0] + "," + encodeURIComponent(parts[1])
        }
        return this.rewriteStyle(orig)
    }
    ,
    Wombat.prototype.rewriteCookie = function(cookie) {
        var wombat = this
          , rwCookie = cookie.replace(this.wb_abs_prefix, "").replace(this.wb_rel_prefix, "");
        return rwCookie = rwCookie.replace(this.cookie_domain_regex, function(m, m1) {
            var message = {
                domain: m1,
                cookie: rwCookie,
                wb_type: "cookie"
            };
            return wombat.sendTopMessage(message, true),
            wombat.$wbwindow.location.hostname.indexOf(".") >= 0 && !wombat.IP_RX.test(wombat.$wbwindow.location.hostname) ? "Domain=." + wombat.$wbwindow.location.hostname : ""
        }).replace(this.cookie_path_regex, function(m, m1) {
            var rewritten = wombat.rewriteUrl(m1);
            return rewritten.indexOf(wombat.wb_curr_host) === 0 && (rewritten = rewritten.substring(wombat.wb_curr_host.length)),
            "Path=" + rewritten
        }),
        wombat.$wbwindow.location.protocol !== "https:" && (rwCookie = rwCookie.replace("secure", "")),
        rwCookie.replace(",|", ",")
    }
    ,
    Wombat.prototype.rewriteWorker = function(workerUrl) {
        if (!workerUrl)
            return workerUrl;
        workerUrl = workerUrl.toString();
        var isBlob = workerUrl.indexOf("blob:") === 0
          , isJS = workerUrl.indexOf("javascript:") === 0;
        if (!isBlob && !isJS) {
            if (!this.startsWithOneOf(workerUrl, this.VALID_PREFIXES) && !this.startsWith(workerUrl, "/") && !this.startsWithOneOf(workerUrl, this.BAD_PREFIXES)) {
                var rurl = this.resolveRelUrl(workerUrl, this.$wbwindow.document);
                return this.rewriteUrl(rurl, false, "wkr_", this.$wbwindow.document)
            }
            return this.rewriteUrl(workerUrl, false, "wkr_", this.$wbwindow.document)
        }
        var workerCode = isJS ? workerUrl.replace("javascript:", "") : null;
        if (isBlob) {
            var x = new XMLHttpRequest;
            this.utilFns.XHRopen.call(x, "GET", workerUrl, false),
            this.utilFns.XHRsend.call(x),
            workerCode = x.responseText.replace(this.workerBlobRe, "").replace(this.rmCheckThisInjectRe, "this")
        }
        if (this.wb_info.static_prefix || this.wb_info.ww_rw_script) {
            var originalURL = this.$wbwindow.document.baseURI
              , ww_rw = this.wb_info.ww_rw_script || this.wb_info.static_prefix + "wombatWorkers.js"
              , rw = "(function() { self.importScripts('" + ww_rw + "'); new WBWombat({'prefix': '" + this.wb_abs_prefix + "', 'prefixMod': '" + this.wb_abs_prefix + "wkrf_/', 'originalURL': '" + originalURL + "'}); })();";
            workerCode = rw + workerCode
        }
        var blob = new Blob([workerCode],{
            type: "application/javascript"
        });
        return URL.createObjectURL(blob)
    }
    ,
    Wombat.prototype.rewriteTextNodeFn = function(fnThis, originalFn, argsObj) {
        var args, deproxiedThis = this.proxyToObj(fnThis);
        if (argsObj.length > 0 && deproxiedThis.parentElement && deproxiedThis.parentElement.tagName === "STYLE") {
            args = new Array(argsObj.length);
            var dataIndex = argsObj.length - 1;
            dataIndex === 2 ? (args[0] = argsObj[0],
            args[1] = argsObj[1]) : dataIndex === 1 && (args[0] = argsObj[0]),
            args[dataIndex] = this.rewriteStyle(argsObj[dataIndex])
        } else
            args = argsObj;
        return originalFn.__WB_orig_apply ? originalFn.__WB_orig_apply(deproxiedThis, args) : originalFn.apply(deproxiedThis, args)
    }
    ,
    Wombat.prototype.rewriteChildNodeFn = function(fnThis, originalFn, argsObj) {
        var thisObj = this.proxyToObj(fnThis);
        if (argsObj.length === 0)
            return originalFn.call(thisObj);
        var newArgs = this.rewriteElementsInArguments(argsObj);
        return originalFn.__WB_orig_apply ? originalFn.__WB_orig_apply(thisObj, newArgs) : originalFn.apply(thisObj, newArgs)
    }
    ,
    Wombat.prototype.rewriteInsertAdjHTMLOrElemArgs = function(fnThis, originalFn, position, textOrElem, rwHTML) {
        var fnThisObj = this.proxyToObj(fnThis);
        return fnThisObj._no_rewrite ? originalFn.call(fnThisObj, position, textOrElem) : rwHTML ? originalFn.call(fnThisObj, position, this.rewriteHtml(textOrElem)) : (this.rewriteElemComplete(textOrElem),
        originalFn.call(fnThisObj, position, textOrElem))
    }
    ,
    Wombat.prototype.rewriteSetTimeoutInterval = function(fnThis, originalFn, argsObj) {
        var rw = this.isString(argsObj[0])
          , args = rw ? new Array(argsObj.length) : argsObj;
        if (rw) {
            args[0] = this.$wbwindow.Proxy ? this.wrapScriptTextJsProxy(argsObj[0]) : argsObj[0].replace(/\blocation\b/g, "WB_wombat_$&");
            for (var i = 1; i < argsObj.length; ++i)
                args[i] = this.proxyToObj(argsObj[i])
        }
        var thisObj = this.proxyToObj(fnThis);
        return originalFn.__WB_orig_apply ? originalFn.__WB_orig_apply(thisObj, args) : originalFn.apply(thisObj, args)
    }
    ,
    Wombat.prototype.rewriteHTMLAssign = function(thisObj, oSetter, newValue) {
        var res = newValue
          , tagName = thisObj.tagName;
        thisObj._no_rewrite || thisObj instanceof this.$wbwindow.HTMLTemplateElement || (tagName === "STYLE" ? res = this.rewriteStyle(newValue) : tagName === "SCRIPT" ? (newValue && this.IsTagRegex.test(newValue) && (res = this.rewriteHtml(newValue)),
        res === newValue && !this.skipWrapScriptBasedOnType(thisObj.type) && !this.skipWrapScriptTextBasedOnText(newValue) && (res = this.wrapScriptTextJsProxy(res))) : res = this.rewriteHtml(newValue)),
        oSetter.call(thisObj, res),
        this.wbUseAFWorker && this.WBAutoFetchWorker && tagName === "STYLE" && thisObj.sheet != null && this.WBAutoFetchWorker.deferredSheetExtraction(thisObj.sheet)
    }
    ,
    Wombat.prototype.rewriteEvalArg = function(rawEvalOrWrapper, evalArg, extraArg) {
        var toBeEvald = this.isString(evalArg) && !this.skipWrapScriptTextBasedOnText(evalArg) ? this.wrapScriptTextJsProxy(evalArg) : this.otherEvalRewrite(evalArg);
        return rawEvalOrWrapper(toBeEvald, extraArg)
    }
    ,
    Wombat.prototype.otherEvalRewrite = function(value) {
        return typeof value === "string" ? value.replace(this.IMPORT_JS_REGEX, this.styleReplacer) : value
    }
    ,
    Wombat.prototype.addEventOverride = function(attr, eventProto) {
        var theProto = eventProto;
        eventProto || (theProto = this.$wbwindow.MessageEvent.prototype);
        var origGetter = this.getOrigGetter(theProto, attr);
        origGetter && this.defGetterProp(theProto, attr, function() {
            return this["_" + attr] == null ? origGetter.call(this) : this["_" + attr]
        })
    }
    ,
    Wombat.prototype.isAttrObjRewrite = function(attr) {
        if (!attr)
            return false;
        var tagName = attr.ownerElement && attr.ownerElement.tagName;
        return this.shouldRewriteAttr(tagName, attr.nodeName)
    }
    ,
    Wombat.prototype.newAttrObjGetSet = function(attrProto, prop) {
        var wombat = this
          , oGetter = this.getOrigGetter(attrProto, prop)
          , oSetter = this.getOrigSetter(attrProto, prop);
        this.defProp(attrProto, prop, function newAttrObjSetter(newValue) {
            var obj = wombat.proxyToObj(this)
              , res = newValue;
            return wombat.isAttrObjRewrite(obj) && (res = wombat.performAttributeRewrite(obj.ownerElement, obj.name, newValue, false)),
            oSetter.call(obj, res)
        }, function newAttrObjGetter() {
            var obj = wombat.proxyToObj(this)
              , res = oGetter.call(obj);
            return wombat.isAttrObjRewrite(obj) ? wombat.extractOriginalURL(res) : res
        })
    }
    ,
    Wombat.prototype.overrideAttrProps = function() {
        var attrProto = this.$wbwindow.Attr.prototype;
        this.newAttrObjGetSet(attrProto, "value"),
        this.newAttrObjGetSet(attrProto, "nodeValue"),
        this.newAttrObjGetSet(attrProto, "textContent")
    }
    ,
    Wombat.prototype.overrideAttr = function(obj, attr, mod) {
        var orig_getter = this.getOrigGetter(obj, attr)
          , orig_setter = this.getOrigSetter(obj, attr)
          , wombat = this
          , setter = function newAttrPropSetter(orig) {
            mod !== "js_" || this.__$removedWBOSRC$__ || wombat.removeWBOSRC(this);
            var val = wombat.rewriteUrl(orig, false, mod);
            if (orig_setter)
                return orig_setter.call(this, val);
            return wombat.wb_setAttribute ? wombat.wb_setAttribute.call(this, attr, val) : void 0
        }
          , getter = function newAttrPropGetter() {
            var res;
            return orig_getter ? res = orig_getter.call(this) : wombat.wb_getAttribute && (res = wombat.wb_getAttribute.call(this, attr)),
            res = wombat.extractOriginalURL(res),
            this.__WB_blank && res === "about:blank" ? "" : res
        };
        this.defProp(obj, attr, setter, getter)
    }
    ,
    Wombat.prototype.overridePropExtract = function(proto, prop) {
        var orig_getter = this.getOrigGetter(proto, prop)
          , wombat = this;
        if (orig_getter) {
            var new_getter = function() {
                var obj = wombat.proxyToObj(this)
                  , res = orig_getter.call(obj);
                return wombat.extractOriginalURL(res)
            };
            this.defGetterProp(proto, prop, new_getter)
        }
    }
    ,
    Wombat.prototype.overrideReferrer = function($document) {
        var orig_getter = this.getOrigGetter($document, "referrer")
          , wombat = this;
        if (orig_getter) {
            var new_getter = function() {
                var obj = wombat.proxyToObj(this)
                  , $win = this.defaultView;
                if ($win === $win.__WB_replay_top)
                    return "";
                var res = orig_getter.call(obj);
                return wombat.extractOriginalURL(res)
            };
            this.defGetterProp($document, "referrer", new_getter)
        }
    }
    ,
    Wombat.prototype.overridePropToProxy = function(proto, prop) {
        var orig_getter = this.getOrigGetter(proto, prop);
        if (orig_getter) {
            var wombat = this
              , new_getter = function overridePropToProxyNewGetter() {
                return wombat.objToProxy(orig_getter.call(this))
            };
            this.defGetterProp(proto, prop, new_getter)
        }
    }
    ,
    Wombat.prototype.overrideHistoryFunc = function(funcName) {
        if (!this.$wbwindow.history)
            return undefined;
        var orig_func = this.$wbwindow.history[funcName];
        if (!orig_func)
            return undefined;
        this.$wbwindow.history["_orig_" + funcName] = orig_func,
        this.$wbwindow.history.___wb_ownWindow = this.$wbwindow;
        var wombat = this
          , rewrittenFunc = function histNewFunc(stateObj, title, url) {
            var rewritten_url, resolvedURL, historyWin = this.___wb_ownWindow || wombat.$wbwindow, wombatLocation = historyWin.WB_wombat_location;
            if (url) {
                var parser = wombat._makeURLParser(url, historyWin.document);
                if (resolvedURL = parser.href,
                rewritten_url = wombat.rewriteUrl(resolvedURL),
                resolvedURL !== wombatLocation.origin && wombatLocation.href !== "about:blank" && !wombat.startsWith(resolvedURL, wombatLocation.origin + "/"))
                    throw new DOMException("Invalid history change: " + resolvedURL)
            } else
                resolvedURL = wombatLocation.href;
            orig_func.call(this, stateObj, title, rewritten_url);
            var origTitle = historyWin.document.title;
            wombat.WBAutoFetchWorker && historyWin.setTimeout(function() {
                title || historyWin.document.title === origTitle || (title = historyWin.document.title),
                wombat.WBAutoFetchWorker.fetchAsPage(rewritten_url, resolvedURL, title)
            }, 100),
            wombat.sendHistoryUpdate(resolvedURL, title, historyWin)
        };
        return this.$wbwindow.history[funcName] = rewrittenFunc,
        this.$wbwindow.History && this.$wbwindow.History.prototype && (this.$wbwindow.History.prototype[funcName] = rewrittenFunc),
        rewrittenFunc
    }
    ,
    Wombat.prototype.overrideStyleAttr = function(obj, attr, propName) {
        var orig_getter = this.getOrigGetter(obj, attr)
          , orig_setter = this.getOrigSetter(obj, attr)
          , wombat = this
          , setter = function overrideStyleAttrSetter(orig) {
            var val = wombat.rewriteStyle(orig);
            return orig_setter ? orig_setter.call(this, val) : this.setProperty(propName, val),
            val
        }
          , getter = orig_getter
          , extractUrl = function(_, p1, p2, p3, p4) {
            return p1 + (p2 || "") + wombat.extractOriginalURL(p3) + p4
        }
          , EXTRACT_URL_RX = /(url\()(['"])?(.*?)(\2\))/;
        orig_getter || (getter = function overrideStyleAttrGetter() {
            var res = this.getPropertyValue(propName);
            return res && res.startsWith("url(") && (res = res.replace(EXTRACT_URL_RX, extractUrl)),
            res
        }
        ),
        (orig_setter && orig_getter || propName) && this.defProp(obj, attr, setter, getter)
    }
    ,
    Wombat.prototype.overrideStyleSetProp = function(style_proto) {
        var orig_setProp = style_proto.setProperty
          , wombat = this;
        style_proto.setProperty = function rwSetProperty(name, value, priority) {
            var rwvalue = wombat.rewriteStyle(value);
            return orig_setProp.call(this, name, rwvalue, priority)
        }
    }
    ,
    Wombat.prototype.overrideAnchorAreaElem = function(whichObj) {
        if (whichObj && whichObj.prototype) {
            for (var prop, originalGetSets = {}, originalProto = whichObj.prototype, anchorAreaSetter = function anchorAreaSetter(prop, value) {
                var func = originalGetSets["set_" + prop];
                return func ? func.call(this, value) : ""
            }, anchorAreaGetter = function anchorAreaGetter(prop) {
                var func = originalGetSets["get_" + prop];
                return func ? func.call(this) : ""
            }, i = 0; i < this.URL_PROPS.length; i++)
                prop = this.URL_PROPS[i],
                originalGetSets["get_" + prop] = this.getOrigGetter(originalProto, prop),
                originalGetSets["set_" + prop] = this.getOrigSetter(originalProto, prop),
                Object.defineProperty && this.defProp(originalProto, prop, this.makeSetLocProp(prop, anchorAreaSetter, anchorAreaGetter), this.makeGetLocProp(prop, anchorAreaGetter), true);
            originalProto.toString = function toString() {
                return this.href
            }
        }
    }
    ,
    Wombat.prototype.overrideHtmlAssign = function(elem, prop, rewriteGetter) {
        if (this.$wbwindow.DOMParser && elem && elem.prototype) {
            var obj = elem.prototype
              , orig_getter = this.getOrigGetter(obj, prop)
              , orig_setter = this.getOrigSetter(obj, prop);
            if (orig_setter) {
                var rewriteFn = this.rewriteHTMLAssign
                  , setter = function overrideHTMLAssignSetter(orig) {
                    return rewriteFn(this, orig_setter, orig)
                }
                  , wb_unrewrite_rx = this.wb_unrewrite_rx
                  , getter = function overrideHTMLAssignGetter() {
                    var res = orig_getter.call(this);
                    return this._no_rewrite ? res : res.replace(wb_unrewrite_rx, "")
                };
                this.defProp(obj, prop, setter, rewriteGetter ? getter : orig_getter)
            }
        }
    }
    ,
    Wombat.prototype.overrideHtmlAssignSrcDoc = function(elem, prop) {
        var obj = elem.prototype;
        this.getOrigGetter(obj, prop);
        var orig_setter = this.getOrigSetter(obj, prop)
          , wombat = this
          , setter = function overrideSetter(orig) {
            return this.__wb_srcdoc = orig,
            wombat.wb_info.isSW ? (wombat.blobUrlForIframe(this, orig),
            orig) : wombat.rewriteHTMLAssign(this, orig_setter, orig)
        }
          , getter = function overrideGetter() {
            return this.__wb_srcdoc
        };
        this.defProp(obj, prop, setter, getter)
    }
    ,
    Wombat.prototype.overrideDataSet = function() {
        var obj = this.$wbwindow.HTMLElement.prototype
          , orig_getter = this.getOrigGetter(obj, "dataset")
          , wombat = this
          , getter = function wrapDataSet() {
            var dataset = orig_getter.call(this)
              , proxy = new Proxy(dataset,{
                get(target, prop, receiver) {
                    var result = target[prop];
                    return wombat.startsWithOneOf(result, wombat.wb_prefixes) ? wombat.extractOriginalURL(result) : result
                }
            });
            return proxy
        };
        this.defProp(obj, "dataset", null, getter)
    }
    ,
    Wombat.prototype.overrideStyleProxy = function(overrideProps) {
        var obj = this.$wbwindow.HTMLElement.prototype
          , orig_setter = this.getOrigSetter(obj, "style")
          , orig_getter = this.getOrigGetter(obj, "style")
          , wombat = this
          , getter = function wrapStyle() {
            var style = orig_getter.call(this)
              , fnCache = {}
              , proxy = new Proxy(style,{
                set(target, prop, value) {
                    return overrideProps.includes(prop) && (value = wombat.rewriteStyle(value)),
                    target[prop] = value,
                    true
                },
                get(target, prop, receiver) {
                    var value = target[prop];
                    return typeof value === "function" && (prop === "setProperty" || wombat.isNativeFunction(value)) ? (fnCache[prop] || (fnCache[prop] = value.bind(style)),
                    fnCache[prop]) : value
                }
            });
            return proxy
        };
        this.defProp(obj, "style", orig_setter, getter)
    }
    ,
    Wombat.prototype.overrideIframeContentAccess = function(prop) {
        if (this.$wbwindow.HTMLIFrameElement && this.$wbwindow.HTMLIFrameElement.prototype) {
            var obj = this.$wbwindow.HTMLIFrameElement.prototype
              , orig_getter = this.getOrigGetter(obj, prop);
            if (orig_getter) {
                var orig_setter = this.getOrigSetter(obj, prop)
                  , wombat = this
                  , getter = function overrideIframeContentAccessGetter() {
                    return wombat.initIframeWombat(this),
                    wombat.objToProxy(orig_getter.call(this))
                };
                this.defProp(obj, prop, orig_setter, getter),
                obj["_get_" + prop] = orig_getter
            }
        }
    }
    ,
    Wombat.prototype.overrideFramesAccess = function($wbwindow) {
        if (!($wbwindow.Proxy && $wbwindow === $wbwindow.frames)) {
            $wbwindow.__wb_frames = $wbwindow.frames;
            var wombat = this
              , getter = function overrideFramesAccessGetter() {
                for (var i = 0; i < this.__wb_frames.length; i++)
                    try {
                        wombat.initNewWindowWombat(this.__wb_frames[i])
                    } catch (e) {}
                return this.__wb_frames
            };
            this.defGetterProp($wbwindow, "frames", getter),
            this.defGetterProp($wbwindow.Window.prototype, "frames", getter)
        }
    }
    ,
    Wombat.prototype.overrideSWAccess = function($wbwindow) {
        if ($wbwindow.navigator.serviceWorker && $wbwindow.navigator.serviceWorker.controller) {
            $wbwindow._WB_wombat_sw = $wbwindow.navigator.serviceWorker;
            var overrideSW = {
                controller: null,
                ready: Promise.resolve({
                    unregister: function() {}
                }),
                register: function() {
                    return Promise.reject()
                },
                addEventListener: function() {},
                removeEventListener: function() {},
                onmessage: null,
                oncontrollerchange: null,
                getRegistrations: function() {
                    return Promise.resolve([])
                },
                getRegistration: function() {
                    return Promise.resolve(undefined)
                },
                startMessages: function() {}
            };
            this.defGetterProp($wbwindow.navigator, "serviceWorker", function() {
                return overrideSW
            })
        }
    }
    ,
    Wombat.prototype.overrideFuncThisProxyToObj = function(cls, method, obj) {
        if (cls) {
            var ovrObj = obj;
            if (!obj && cls.prototype && cls.prototype[method] ? ovrObj = cls.prototype : !obj && cls[method] && (ovrObj = cls),
            !!ovrObj) {
                var wombat = this
                  , orig = ovrObj[method];
                ovrObj[method] = function deproxyThis() {
                    return orig.apply(wombat.proxyToObj(this), arguments)
                }
            }
        }
    }
    ,
    Wombat.prototype.overrideFuncArgProxyToObj = function(cls, method, argumentIdx) {
        if (cls && cls.prototype) {
            var argIndex = argumentIdx || 0
              , orig = cls.prototype[method];
            if (orig) {
                var wombat = this;
                cls.prototype[method] = function deproxyFnArg() {
                    for (var args = new Array(arguments.length), i = 0; i < args.length; i++)
                        args[i] = i === argIndex ? wombat.proxyToObj(arguments[i]) : arguments[i];
                    var thisObj = wombat.proxyToObj(this);
                    return orig.__WB_orig_apply ? orig.__WB_orig_apply(thisObj, args) : orig.apply(thisObj, args)
                }
            }
        }
    }
    ,
    Wombat.prototype.overrideFunctionApply = function($wbwindow) {
        if (!$wbwindow.Function.prototype.__WB_orig_apply) {
            var orig_apply = $wbwindow.Function.prototype.apply;
            $wbwindow.Function.prototype.__WB_orig_apply = orig_apply;
            var wombat = this;
            $wbwindow.Function.prototype.apply = function apply(obj, args) {
                return wombat.isNativeFunction(this) && (obj = wombat.proxyToObj(obj),
                args = wombat.deproxyArrayHandlingArgumentsObj(args)),
                this.__WB_orig_apply(obj, args)
            }
            ,
            this.wb_funToString.apply = orig_apply
        }
    }
    ,
    Wombat.prototype.overrideFunctionBind = function($wbwindow) {
        if (!$wbwindow.Function.prototype.__WB_orig_bind) {
            var orig_bind = $wbwindow.Function.prototype.bind;
            $wbwindow.Function.prototype.__WB_orig_bind = orig_bind;
            var wombat = this;
            $wbwindow.Function.prototype.bind = function bind(obj) {
                var isNative = wombat.isNativeFunction(this)
                  , result = this.__WB_orig_bind.apply(this, arguments);
                return result.__WB_is_native_func__ = isNative,
                result
            }
        }
    }
    ,
    Wombat.prototype.overrideSrcsetAttr = function(obj, mod) {
        var prop = "srcset"
          , orig_getter = this.getOrigGetter(obj, "srcset")
          , orig_setter = this.getOrigSetter(obj, "srcset")
          , wombat = this
          , setter = function srcset(orig) {
            var val = wombat.rewriteSrcset(orig, this);
            if (orig_setter)
                return orig_setter.call(this, val);
            return wombat.wb_setAttribute ? wombat.wb_setAttribute.call(this, "srcset", val) : void 0
        }
          , getter = function srcset() {
            var res;
            return orig_getter ? res = orig_getter.call(this) : wombat.wb_getAttribute && (res = wombat.wb_getAttribute.call(this, "srcset")),
            res = wombat.extractOriginalURL(res),
            res
        };
        this.defProp(obj, "srcset", setter, getter)
    }
    ,
    Wombat.prototype.overrideHrefAttr = function(obj, mod) {
        var orig_getter = this.getOrigGetter(obj, "href")
          , orig_setter = this.getOrigSetter(obj, "href")
          , wombat = this
          , setter = function href(orig) {
            var val;
            return (val = mod === "cs_" && orig.indexOf("data:text/css") === 0 ? wombat.rewriteInlineStyle(orig) : this.tagName === "LINK" ? wombat.rewriteUrl(orig, false, wombat.rwModForElement(this, "href")) : wombat.rewriteUrl(orig, false, mod, this.ownerDocument),
            orig_setter) ? orig_setter.call(this, val) : wombat.wb_setAttribute ? wombat.wb_setAttribute.call(this, "href", val) : void 0
        }
          , getter = function href() {
            var res;
            return orig_getter ? res = orig_getter.call(this) : wombat.wb_getAttribute && (res = wombat.wb_getAttribute.call(this, "href")),
            this._no_rewrite ? res : wombat.extractOriginalURL(res)
        };
        this.defProp(obj, "href", setter, getter)
    }
    ,
    Wombat.prototype.overrideTextProtoGetSet = function(textProto, whichProp) {
        var setter, orig_getter = this.getOrigGetter(textProto, whichProp), wombat = this;
        if (whichProp === "data") {
            var orig_setter = this.getOrigSetter(textProto, whichProp);
            setter = function rwTextProtoSetter(orig) {
                var res = orig;
                return !this._no_rewrite && this.parentElement && this.parentElement.tagName === "STYLE" && (res = wombat.rewriteStyle(orig)),
                orig_setter.call(this, res)
            }
        }
        var getter = function rwTextProtoGetter() {
            var res = orig_getter.call(this);
            return !this._no_rewrite && this.parentElement && this.parentElement.tagName === "STYLE" ? res.replace(wombat.wb_unrewrite_rx, "") : res
        };
        this.defProp(textProto, whichProp, setter, getter)
    }
    ,
    Wombat.prototype.overrideAnUIEvent = function(which) {
        var didOverrideKey = "__wb_" + which + "_overridden"
          , ConstructorFN = this.$wbwindow[which];
        if (ConstructorFN && ConstructorFN.prototype && !ConstructorFN.prototype[didOverrideKey]) {
            var wombat = this;
            this.overridePropToProxy(ConstructorFN.prototype, "view");
            var initFNKey = "init" + which;
            if (ConstructorFN.prototype[initFNKey]) {
                var originalInitFn = ConstructorFN.prototype[initFNKey];
                ConstructorFN.prototype[initFNKey] = function() {
                    var thisObj = wombat.proxyToObj(this);
                    if (arguments.length === 0 || arguments.length < 3)
                        return originalInitFn.__WB_orig_apply ? originalInitFn.__WB_orig_apply(thisObj, arguments) : originalInitFn.apply(thisObj, arguments);
                    for (var newArgs = new Array(arguments.length), i = 0; i < arguments.length; i++)
                        newArgs[i] = i === 3 ? wombat.proxyToObj(arguments[i]) : arguments[i];
                    return originalInitFn.__WB_orig_apply ? originalInitFn.__WB_orig_apply(thisObj, newArgs) : originalInitFn.apply(thisObj, newArgs)
                }
            }
            this.$wbwindow[which] = function(EventConstructor) {
                return function NewEventConstructor(type, init) {
                    return wombat.domConstructorErrorChecker(this, which, arguments),
                    init && (init.view != null && (init.view = wombat.proxyToObj(init.view)),
                    init.relatedTarget != null && (init.relatedTarget = wombat.proxyToObj(init.relatedTarget)),
                    init.target != null && (init.target = wombat.proxyToObj(init.target))),
                    new EventConstructor(type,init)
                }
            }(ConstructorFN),
            this.$wbwindow[which].prototype = ConstructorFN.prototype,
            Object.defineProperty(this.$wbwindow[which].prototype, "constructor", {
                value: this.$wbwindow[which]
            }),
            this.$wbwindow[which].prototype[didOverrideKey] = true
        }
    }
    ,
    Wombat.prototype.rewriteParentNodeFn = function(fnThis, originalFn, argsObj) {
        var argArr = this._no_rewrite ? argsObj : this.rewriteElementsInArguments(argsObj)
          , thisObj = this.proxyToObj(fnThis);
        return originalFn.__WB_orig_apply ? originalFn.__WB_orig_apply(thisObj, argArr) : originalFn.apply(thisObj, argArr)
    }
    ,
    Wombat.prototype.overrideParentNodeAppendPrepend = function(obj) {
        var rewriteParentNodeFn = this.rewriteParentNodeFn;
        if (obj.prototype.append) {
            var originalAppend = obj.prototype.append;
            obj.prototype.append = function append() {
                return rewriteParentNodeFn(this, originalAppend, arguments)
            }
        }
        if (obj.prototype.prepend) {
            var originalPrepend = obj.prototype.prepend;
            obj.prototype.prepend = function prepend() {
                return rewriteParentNodeFn(this, originalPrepend, arguments)
            }
        }
    }
    ,
    Wombat.prototype.overrideShadowDom = function() {
        this.$wbwindow.ShadowRoot && this.$wbwindow.ShadowRoot.prototype && (this.overrideHtmlAssign(this.$wbwindow.ShadowRoot, "innerHTML", true),
        this.overrideParentNodeAppendPrepend(this.$wbwindow.ShadowRoot))
    }
    ,
    Wombat.prototype.overrideChildNodeInterface = function(ifaceWithChildNode, textIface) {
        if (ifaceWithChildNode && ifaceWithChildNode.prototype) {
            var rewriteFn = textIface ? this.rewriteTextNodeFn : this.rewriteChildNodeFn;
            if (ifaceWithChildNode.prototype.before) {
                var originalBefore = ifaceWithChildNode.prototype.before;
                ifaceWithChildNode.prototype.before = function before() {
                    return rewriteFn(this, originalBefore, arguments)
                }
            }
            if (ifaceWithChildNode.prototype.after) {
                var originalAfter = ifaceWithChildNode.prototype.after;
                ifaceWithChildNode.prototype.after = function after() {
                    return rewriteFn(this, originalAfter, arguments)
                }
            }
            if (ifaceWithChildNode.prototype.replaceWith) {
                var originalReplaceWith = ifaceWithChildNode.prototype.replaceWith;
                ifaceWithChildNode.prototype.replaceWith = function replaceWith() {
                    return rewriteFn(this, originalReplaceWith, arguments)
                }
            }
        }
    }
    ,
    Wombat.prototype.initTextNodeOverrides = function() {
        var Text = this.$wbwindow.Text;
        if (Text && Text.prototype) {
            var textProto = Text.prototype
              , rewriteTextProtoFunction = this.rewriteTextNodeFn;
            if (textProto.appendData) {
                var originalAppendData = textProto.appendData;
                textProto.appendData = function appendData() {
                    return rewriteTextProtoFunction(this, originalAppendData, arguments)
                }
            }
            if (textProto.insertData) {
                var originalInsertData = textProto.insertData;
                textProto.insertData = function insertData() {
                    return rewriteTextProtoFunction(this, originalInsertData, arguments)
                }
            }
            if (textProto.replaceData) {
                var originalReplaceData = textProto.replaceData;
                textProto.replaceData = function replaceData() {
                    return rewriteTextProtoFunction(this, originalReplaceData, arguments)
                }
            }
            this.overrideChildNodeInterface(Text, true),
            this.overrideTextProtoGetSet(textProto, "data"),
            this.overrideTextProtoGetSet(textProto, "wholeText")
        }
    }
    ,
    Wombat.prototype.initAttrOverrides = function() {
        this.overrideHrefAttr(this.$wbwindow.HTMLLinkElement.prototype, "cs_"),
        this.overrideHrefAttr(this.$wbwindow.CSSStyleSheet.prototype, "cs_"),
        this.overrideHrefAttr(this.$wbwindow.HTMLBaseElement.prototype, "mp_"),
        this.overrideSrcsetAttr(this.$wbwindow.HTMLImageElement.prototype, "im_"),
        this.overrideSrcsetAttr(this.$wbwindow.HTMLSourceElement.prototype, "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLVideoElement.prototype, "poster", "im_"),
        this.overrideAttr(this.$wbwindow.HTMLAudioElement.prototype, "poster", "im_"),
        this.overrideAttr(this.$wbwindow.HTMLImageElement.prototype, "src", "im_"),
        this.overrideAttr(this.$wbwindow.HTMLInputElement.prototype, "src", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLEmbedElement.prototype, "src", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLMediaElement.prototype, "src", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLVideoElement.prototype, "src", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLAudioElement.prototype, "src", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLSourceElement.prototype, "src", "oe_"),
        window.HTMLTrackElement && window.HTMLTrackElement.prototype && this.overrideAttr(this.$wbwindow.HTMLTrackElement.prototype, "src", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLIFrameElement.prototype, "src", "if_"),
        this.$wbwindow.HTMLFrameElement && this.$wbwindow.HTMLFrameElement.prototype && this.overrideAttr(this.$wbwindow.HTMLFrameElement.prototype, "src", "fr_"),
        this.overrideAttr(this.$wbwindow.HTMLScriptElement.prototype, "src", "js_"),
        this.overrideAttr(this.$wbwindow.HTMLObjectElement.prototype, "data", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLObjectElement.prototype, "codebase", "oe_"),
        this.overrideAttr(this.$wbwindow.HTMLMetaElement.prototype, "content", "mp_"),
        this.overrideAttr(this.$wbwindow.HTMLFormElement.prototype, "action", "mp_"),
        this.overrideAttr(this.$wbwindow.HTMLQuoteElement.prototype, "cite", "mp_"),
        this.overrideAttr(this.$wbwindow.HTMLModElement.prototype, "cite", "mp_"),
        this.overrideAnchorAreaElem(this.$wbwindow.HTMLAnchorElement),
        this.overrideAnchorAreaElem(this.$wbwindow.HTMLAreaElement);
        var style_proto = this.$wbwindow.CSSStyleDeclaration.prototype
          , cssAttrToProps = {
            background: "background",
            backgroundImage: "background-image",
            cursor: "cursor",
            listStyle: "list-style",
            listStyleImage: "list-style-image",
            border: "border",
            borderImage: "border-image",
            borderImageSource: "border-image-source",
            maskImage: "mask-image"
        };
        this.overrideStyleProxy(Object.values(cssAttrToProps)),
        this.$wbwindow.CSS2Properties && (style_proto = this.$wbwindow.CSS2Properties.prototype),
        this.overrideStyleAttr(style_proto, "cssText");
        for (var [attr,prop] of Object.entries(cssAttrToProps))
            this.overrideStyleAttr(style_proto, attr, prop);
        if (this.overrideStyleSetProp(style_proto),
        this.$wbwindow.CSSStyleSheet && this.$wbwindow.CSSStyleSheet.prototype) {
            var wombat = this
              , oInsertRule = this.$wbwindow.CSSStyleSheet.prototype.insertRule;
            this.$wbwindow.CSSStyleSheet.prototype.insertRule = function insertRule(ruleText, index) {
                return oInsertRule.call(this, wombat.rewriteStyle(ruleText), index)
            }
        }
        this.$wbwindow.CSSRule && this.$wbwindow.CSSRule.prototype && this.overrideStyleAttr(this.$wbwindow.CSSRule.prototype, "cssText")
    }
    ,
    Wombat.prototype.initCSSOMOverrides = function() {
        var wombat = this;
        if (this.$wbwindow.CSSStyleValue) {
            var cssStyleValueOverride = function(CSSSV, which) {
                var oFN = CSSSV[which];
                CSSSV[which] = function parseOrParseAllOverride(property, cssText) {
                    if (cssText == null)
                        return oFN.call(this, property, cssText);
                    var rwCSSText = wombat.noExceptRewriteStyle(cssText);
                    return oFN.call(this, property, rwCSSText)
                }
            };
            this.$wbwindow.CSSStyleValue.parse && this.$wbwindow.CSSStyleValue.parse.toString().indexOf("[native code]") > 0 && cssStyleValueOverride(this.$wbwindow.CSSStyleValue, "parse"),
            this.$wbwindow.CSSStyleValue.parseAll && this.$wbwindow.CSSStyleValue.parseAll.toString().indexOf("[native code]") > 0 && cssStyleValueOverride(this.$wbwindow.CSSStyleValue, "parseAll")
        }
        if (this.$wbwindow.CSSKeywordValue && this.$wbwindow.CSSKeywordValue.prototype) {
            var oCSSKV = this.$wbwindow.CSSKeywordValue;
            this.$wbwindow.CSSKeywordValue = function(CSSKeywordValue_) {
                return function CSSKeywordValue(cssValue) {
                    return wombat.domConstructorErrorChecker(this, "CSSKeywordValue", arguments),
                    new CSSKeywordValue_(wombat.rewriteStyle(cssValue))
                }
            }(this.$wbwindow.CSSKeywordValue),
            this.$wbwindow.CSSKeywordValue.prototype = oCSSKV.prototype,
            Object.defineProperty(this.$wbwindow.CSSKeywordValue.prototype, "constructor", {
                value: this.$wbwindow.CSSKeywordValue
            }),
            addToStringTagToClass(this.$wbwindow.CSSKeywordValue, "CSSKeywordValue")
        }
        if (this.$wbwindow.StylePropertyMap && this.$wbwindow.StylePropertyMap.prototype) {
            var originalSet = this.$wbwindow.StylePropertyMap.prototype.set;
            this.$wbwindow.StylePropertyMap.prototype.set = function set() {
                if (arguments.length <= 1)
                    return originalSet.__WB_orig_apply ? originalSet.__WB_orig_apply(this, arguments) : originalSet.apply(this, arguments);
                var newArgs = new Array(arguments.length);
                newArgs[0] = arguments[0];
                for (var i = 1; i < arguments.length; i++)
                    newArgs[i] = wombat.noExceptRewriteStyle(arguments[i]);
                return originalSet.__WB_orig_apply ? originalSet.__WB_orig_apply(this, newArgs) : originalSet.apply(this, newArgs)
            }
            ;
            var originalAppend = this.$wbwindow.StylePropertyMap.prototype.append;
            this.$wbwindow.StylePropertyMap.prototype.append = function append() {
                if (arguments.length <= 1)
                    return originalSet.__WB_orig_apply ? originalAppend.__WB_orig_apply(this, arguments) : originalAppend.apply(this, arguments);
                var newArgs = new Array(arguments.length);
                newArgs[0] = arguments[0];
                for (var i = 1; i < arguments.length; i++)
                    newArgs[i] = wombat.noExceptRewriteStyle(arguments[i]);
                return originalAppend.__WB_orig_apply ? originalAppend.__WB_orig_apply(this, newArgs) : originalAppend.apply(this, newArgs)
            }
        }
    }
    ,
    Wombat.prototype.initAudioOverride = function() {
        if (this.$wbwindow.Audio) {
            var orig_audio = this.$wbwindow.Audio
              , wombat = this;
            this.$wbwindow.Audio = function(Audio_) {
                return function Audio(url) {
                    return wombat.domConstructorErrorChecker(this, "Audio"),
                    new Audio_(wombat.rewriteUrl(url, true, "oe_"))
                }
            }(this.$wbwindow.Audio),
            this.$wbwindow.Audio.prototype = orig_audio.prototype,
            Object.defineProperty(this.$wbwindow.Audio.prototype, "constructor", {
                value: this.$wbwindow.Audio
            }),
            addToStringTagToClass(this.$wbwindow.Audio, "HTMLAudioElement")
        }
    }
    ,
    Wombat.prototype.initBadPrefixes = function(prefix) {
        this.BAD_PREFIXES = ["http:" + prefix, "https:" + prefix, "http:/" + prefix, "https:/" + prefix]
    }
    ,
    Wombat.prototype.initCryptoRandom = function() {
        if (this.$wbwindow.crypto && this.$wbwindow.Crypto) {
            var wombat = this
              , new_getrandom = function getRandomValues(array) {
                for (var i = 0; i < array.length; i++)
                    array[i] = parseInt(wombat.$wbwindow.Math.random() * 4294967296);
                return array
            };
            this.$wbwindow.Crypto.prototype.getRandomValues = new_getrandom,
            this.$wbwindow.crypto.getRandomValues = new_getrandom
        }
    }
    ,
    Wombat.prototype.initDateOverride = function(timestamp) {
        if (!this.$wbwindow.__wb_Date_now) {
            var newTimestamp = parseInt(timestamp) * 1e3
              , timezone = 0
              , start_now = this.$wbwindow.Date.now()
              , timediff = start_now - (newTimestamp - timezone)
              , orig_date = this.$wbwindow.Date
              , orig_utc = this.$wbwindow.Date.UTC
              , orig_parse = this.$wbwindow.Date.parse
              , orig_now = this.$wbwindow.Date.now;
            this.$wbwindow.__wb_Date_now = orig_now,
            this.$wbwindow.Date = function(Date_) {
                return function Date(A, B, C, D, E, F, G) {
                    return A === undefined ? new Date_(orig_now() - timediff) : B === undefined ? new Date_(A) : C === undefined ? new Date_(A,B) : D === undefined ? new Date_(A,B,C) : E === undefined ? new Date_(A,B,C,D) : F === undefined ? new Date_(A,B,C,D,E) : G === undefined ? new Date_(A,B,C,D,E,F) : new Date_(A,B,C,D,E,F,G)
                }
            }(this.$wbwindow.Date),
            this.$wbwindow.Date.prototype = orig_date.prototype,
            this.$wbwindow.Date.now = function now() {
                return orig_now() - timediff
            }
            ,
            this.$wbwindow.Date.UTC = orig_utc,
            this.$wbwindow.Date.parse = orig_parse,
            this.$wbwindow.Date.__WB_timediff = timediff,
            this.$wbwindow.Date.prototype.getTimezoneOffset = function() {
                return 0
            }
            ;
            var orig_toString = this.$wbwindow.Date.prototype.toString;
            this.$wbwindow.Date.prototype.toString = function() {
                var string = orig_toString.call(this).split(" GMT")[0];
                return string + " GMT+0000 (Coordinated Universal Time)"
            }
            ;
            var orig_toTimeString = this.$wbwindow.Date.prototype.toTimeString;
            this.$wbwindow.Date.prototype.toTimeString = function() {
                var string = orig_toTimeString.call(this).split(" GMT")[0];
                return string + " GMT+0000 (Coordinated Universal Time)"
            }
            ,
            Object.defineProperty(this.$wbwindow.Date.prototype, "constructor", {
                value: this.$wbwindow.Date
            })
        }
    }
    ,
    Wombat.prototype.initBlobOverride = function() {
        if (this.$wbwindow.Blob && !this.wb_info.isSW) {
            var orig_blob = this.$wbwindow.Blob
              , wombat = this;
            this.$wbwindow.Blob = function(Blob_) {
                return function Blob(array, options) {
                    return options && (options.type === "application/xhtml+xml" || options.type === "text/html") && array.length === 1 && typeof array[0] === "string" && wombat.startsWith(array[0], "<!DOCTYPE html>") && (array[0] = wombat.rewriteHtml(array[0]),
                    options.type = "text/html"),
                    new Blob_(array,options)
                }
            }(this.$wbwindow.Blob),
            this.$wbwindow.Blob.prototype = orig_blob.prototype
        }
    }
    ,
    Wombat.prototype.initWSOverride = function() {
        this.$wbwindow.WebSocket && this.$wbwindow.WebSocket.prototype && (this.$wbwindow.WebSocket = function(WebSocket_) {
            function WebSocket(url, protocols) {
                this.addEventListener = function() {}
                ,
                this.removeEventListener = function() {}
                ,
                this.close = function() {}
                ,
                this.send = function(data) {
                    console.log("ws send", data)
                }
                ,
                this.protocol = protocols && protocols.length ? protocols[0] : "",
                this.url = url,
                this.readyState = 0
            }
            return WebSocket.CONNECTING = 0,
            WebSocket.OPEN = 1,
            WebSocket.CLOSING = 2,
            WebSocket.CLOSED = 3,
            WebSocket
        }(this.$wbwindow.WebSocket),
        Object.defineProperty(this.$wbwindow.WebSocket.prototype, "constructor", {
            value: this.$wbwindow.WebSocket
        }),
        addToStringTagToClass(this.$wbwindow.WebSocket, "WebSocket"))
    }
    ,
    Wombat.prototype.initDocTitleOverride = function() {
        var orig_get_title = this.getOrigGetter(this.$wbwindow.document, "title")
          , orig_set_title = this.getOrigSetter(this.$wbwindow.document, "title")
          , wombat = this
          , set_title = function title(value) {
            var res = orig_set_title.call(this, value)
              , message = {
                wb_type: "title",
                title: value
            };
            return wombat.sendTopMessage(message),
            res
        };
        this.defProp(this.$wbwindow.document, "title", set_title, orig_get_title)
    }
    ,
    Wombat.prototype.initFontFaceOverride = function() {
        if (this.$wbwindow.FontFace) {
            var wombat = this
              , origFontFace = this.$wbwindow.FontFace;
            this.$wbwindow.FontFace = function(FontFace_) {
                return function FontFace(family, source, descriptors) {
                    wombat.domConstructorErrorChecker(this, "FontFace", arguments, 2);
                    var rwSource = source;
                    return source != null && (typeof source === "string" ? rwSource = wombat.rewriteInlineStyle(source) : rwSource = wombat.rewriteInlineStyle(source.toString())),
                    new FontFace_(family,rwSource,descriptors)
                }
            }(this.$wbwindow.FontFace),
            this.$wbwindow.FontFace.prototype = origFontFace.prototype,
            Object.defineProperty(this.$wbwindow.FontFace.prototype, "constructor", {
                value: this.$wbwindow.FontFace
            }),
            addToStringTagToClass(this.$wbwindow.FontFace, "FontFace")
        }
    }
    ,
    Wombat.prototype.initFixedRatio = function(value) {
        try {
            this.$wbwindow.devicePixelRatio = value
        } catch (e) {}
        if (Object.defineProperty)
            try {
                Object.defineProperty(this.$wbwindow, "devicePixelRatio", {
                    value: value,
                    writable: false
                })
            } catch (e) {}
    }
    ,
    Wombat.prototype.initPaths = function(wbinfo) {
        wbinfo.wombat_opts = wbinfo.wombat_opts || {},
        Object.assign(this.wb_info, wbinfo),
        this.wb_opts = wbinfo.wombat_opts,
        this.wb_replay_prefix = wbinfo.prefix,
        this.wb_is_proxy = wbinfo.proxy_magic || !this.wb_replay_prefix,
        this.wb_info.top_host = this.wb_info.top_host || "*",
        this.wb_curr_host = this.$wbwindow.location.protocol + "//" + this.$wbwindow.location.host,
        this.wb_info.wombat_opts = this.wb_info.wombat_opts || {},
        this.wb_orig_scheme = wbinfo.wombat_scheme + "://",
        this.wb_orig_origin = this.wb_orig_scheme + wbinfo.wombat_host,
        this.wb_abs_prefix = this.wb_replay_prefix,
        this.wb_capture_date_part = !wbinfo.is_live && wbinfo.wombat_ts ? "/" + wbinfo.wombat_ts + "/" : "",
        this.initBadPrefixes(this.wb_replay_prefix),
        this.initCookiePreset()
    }
    ,
    Wombat.prototype.initSeededRandom = function(seed) {
        this.$wbwindow.Math.seed = parseInt(seed);
        var wombat = this;
        this.$wbwindow.Math.random = function random() {
            return wombat.$wbwindow.Math.seed = (wombat.$wbwindow.Math.seed * 9301 + 49297) % 233280,
            wombat.$wbwindow.Math.seed / 233280
        }
    }
    ,
    Wombat.prototype.initHistoryOverrides = function() {
        this.overrideHistoryFunc("pushState"),
        this.overrideHistoryFunc("replaceState");
        var wombat = this;
        this.$wbwindow.addEventListener("popstate", function(event) {
            wombat.sendHistoryUpdate(wombat.$wbwindow.WB_wombat_location.href, wombat.$wbwindow.document.title)
        })
    }
    ,
    Wombat.prototype.initCookiePreset = function() {
        if (this.wb_info.presetCookie)
            for (var splitCookies = this.wb_info.presetCookie.split(";"), i = 0; i < splitCookies.length; i++)
                this.$wbwindow.document.cookie = splitCookies[i].trim() + "; Path=" + this.rewriteUrl("./", true)
    }
    ,
    Wombat.prototype.initHTTPOverrides = function() {
        var wombat = this;
        if (this.overridePropExtract(this.$wbwindow.XMLHttpRequest.prototype, "responseURL"),
        !!this.wb_info.isSW) {
            var origOpen = this.$wbwindow.XMLHttpRequest.prototype.open
              , origSetRequestHeader = this.$wbwindow.XMLHttpRequest.prototype.setRequestHeader
              , origSend = this.$wbwindow.XMLHttpRequest.prototype.send;
            this.utilFns.XHRopen = origOpen,
            this.utilFns.XHRsend = origSend,
            this.$wbwindow.XMLHttpRequest.prototype.open = function() {
                this.__WB_xhr_open_arguments = arguments,
                this.__WB_xhr_headers = new Headers
            }
            ,
            this.$wbwindow.XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                this.__WB_xhr_headers.set(name, value)
            }
            ;
            var wombat = this
              , convertToGet = !!this.wb_info.convert_post_to_get;
            this.$wbwindow.XMLHttpRequest.prototype.send = async function(value) {
                if (convertToGet && (this.__WB_xhr_open_arguments[0] === "POST" || this.__WB_xhr_open_arguments[0] === "PUT")) {
                    var request = {
                        url: this.__WB_xhr_open_arguments[1],
                        method: this.__WB_xhr_open_arguments[0],
                        headers: this.__WB_xhr_headers,
                        postData: value
                    };
                    w(request) && (this.__WB_xhr_open_arguments[1] = request.url,
                    this.__WB_xhr_open_arguments[0] = "GET",
                    value = null)
                }
                if (this.__WB_xhr_open_arguments.length > 2 && !this.__WB_xhr_open_arguments[2] && navigator.userAgent.indexOf("Firefox") === -1 && (this.__WB_xhr_open_arguments[2] = true,
                console.warn("wombat.js: Sync XHR not supported in SW-based replay in this browser, converted to async")),
                this._no_rewrite || (this.__WB_xhr_open_arguments[1] = wombat.rewriteUrl(this.__WB_xhr_open_arguments[1])),
                origOpen.apply(this, this.__WB_xhr_open_arguments),
                !wombat.startsWith(this.__WB_xhr_open_arguments[1], "data:")) {
                    for (const [name,value] of this.__WB_xhr_headers.entries())
                        origSetRequestHeader.call(this, name, value);
                    origSetRequestHeader.call(this, "X-Pywb-Requested-With", "XMLHttpRequest")
                }
                return origSend.call(this, value)
            }
        } else if (this.$wbwindow.XMLHttpRequest.prototype.open) {
            var origXMLHttpOpen = this.$wbwindow.XMLHttpRequest.prototype.open;
            this.utilFns.XHRopen = origXMLHttpOpen,
            this.utilFns.XHRsend = this.$wbwindow.XMLHttpRequest.prototype.send,
            this.$wbwindow.XMLHttpRequest.prototype.open = function open(method, url, async, user, password) {
                var rwURL = this._no_rewrite ? url : wombat.rewriteUrl(url)
                  , openAsync = true;
                async == null || async || (openAsync = false),
                origXMLHttpOpen.call(this, method, rwURL, openAsync, user, password),
                wombat.startsWith(rwURL, "data:") || this.setRequestHeader("X-Pywb-Requested-With", "XMLHttpRequest")
            }
        }
        if (this.$wbwindow.fetch) {
            var orig_fetch = this.$wbwindow.fetch;
            this.$wbwindow.fetch = function fetch(input, init_opts) {
                var rwInput = input
                  , inputType = typeof input;
                if (inputType === "string")
                    rwInput = wombat.rewriteUrl(input);
                else if (inputType === "object" && input.url) {
                    var new_url = wombat.rewriteUrl(input.url);
                    new_url !== input.url && (rwInput = new Request(new_url,init_opts))
                } else
                    inputType === "object" && input.href && (rwInput = wombat.rewriteUrl(input.href));
                if (init_opts || (init_opts = {}),
                init_opts.credentials === undefined)
                    try {
                        init_opts.credentials = "include"
                    } catch (e) {}
                return orig_fetch.call(wombat.proxyToObj(this), rwInput, init_opts)
            }
        }
        if (this.$wbwindow.Request && this.$wbwindow.Request.prototype) {
            var orig_request = this.$wbwindow.Request;
            this.$wbwindow.Request = function(Request_) {
                return function Request(input, init_opts) {
                    wombat.domConstructorErrorChecker(this, "Request", arguments);
                    var newInitOpts = init_opts || {}
                      , newInput = input
                      , inputType = typeof input;
                    switch (inputType) {
                    case "string":
                        newInput = wombat.rewriteUrl(input);
                        break;
                    case "object":
                        if (newInput = input,
                        input.url) {
                            var new_url = wombat.rewriteUrl(input.url);
                            new_url !== input.url && (newInput = new Request_(new_url,input))
                        } else
                            input.href && (newInput = wombat.rewriteUrl(input.toString(), true));
                    }
                    return newInitOpts.credentials = "include",
                    newInitOpts.referrer && (newInitOpts.referrer = wombat.rewriteUrl(newInitOpts.referrer)),
                    new Request_(newInput,newInitOpts)
                }
            }(this.$wbwindow.Request),
            this.$wbwindow.Request.prototype = orig_request.prototype,
            Object.defineProperty(this.$wbwindow.Request.prototype, "constructor", {
                value: this.$wbwindow.Request
            }),
            this.overridePropExtract(this.$wbwindow.Request.prototype, "url"),
            this.overridePropExtract(this.$wbwindow.Request.prototype, "referrer")
        }
        if (this.$wbwindow.Response && this.$wbwindow.Response.prototype) {
            var originalRedirect = this.$wbwindow.Response.prototype.redirect;
            this.$wbwindow.Response.prototype.redirect = function redirect(url, status) {
                var rwURL = wombat.rewriteUrl(url, true, null, wombat.$wbwindow.document);
                return originalRedirect.call(this, rwURL, status)
            }
            ,
            this.overridePropExtract(this.$wbwindow.Response.prototype, "url")
        }
        if (this.$wbwindow.EventSource && this.$wbwindow.EventSource.prototype) {
            var origEventSource = this.$wbwindow.EventSource;
            this.$wbwindow.EventSource = function(EventSource_) {
                return function EventSource(url, configuration) {
                    wombat.domConstructorErrorChecker(this, "EventSource", arguments);
                    var rwURL = url;
                    return url != null && (rwURL = wombat.rewriteUrl(url)),
                    new EventSource_(rwURL,configuration)
                }
            }(this.$wbwindow.EventSource),
            this.$wbwindow.EventSource.prototype = origEventSource.prototype,
            Object.defineProperty(this.$wbwindow.EventSource.prototype, "constructor", {
                value: this.$wbwindow.EventSource
            }),
            addToStringTagToClass(this.$wbwindow.EventSource, "EventSource")
        }
    }
    ,
    Wombat.prototype.initElementGetSetAttributeOverride = function() {
        if (!this.wb_opts.skip_setAttribute && this.$wbwindow.Element && this.$wbwindow.Element.prototype) {
            var wombat = this
              , ElementProto = this.$wbwindow.Element.prototype;
            if (ElementProto.setAttribute) {
                var orig_setAttribute = ElementProto.setAttribute;
                ElementProto._orig_setAttribute = orig_setAttribute,
                ElementProto.setAttribute = function setAttribute(name, value) {
                    var rwValue = value;
                    if (name && typeof rwValue === "string") {
                        var lowername = name.toLowerCase();
                        if (this.tagName === "LINK" && lowername === "href" && rwValue.indexOf("data:text/css") === 0)
                            rwValue = wombat.rewriteInlineStyle(value);
                        else if (lowername === "style")
                            rwValue = wombat.rewriteStyle(value);
                        else if (lowername === "srcset" || lowername === "imagesrcset" && this.tagName === "LINK")
                            rwValue = wombat.rewriteSrcset(value, this);
                        else {
                            var shouldRW = wombat.shouldRewriteAttr(this.tagName, lowername);
                            shouldRW && (wombat.removeWBOSRC(this),
                            !this._no_rewrite && (rwValue = wombat.rewriteUrl(value, false, wombat.rwModForElement(this, lowername))))
                        }
                    }
                    return orig_setAttribute.call(this, name, rwValue)
                }
            }
            if (ElementProto.getAttribute) {
                var orig_getAttribute = ElementProto.getAttribute;
                this.wb_getAttribute = orig_getAttribute,
                ElementProto.getAttribute = function getAttribute(name) {
                    var result = orig_getAttribute.call(this, name);
                    if (result === null)
                        return result;
                    var lowerName = name;
                    if (name && (lowerName = name.toLowerCase()),
                    wombat.shouldRewriteAttr(this.tagName, lowerName)) {
                        var maybeWBOSRC = wombat.retrieveWBOSRC(this);
                        return maybeWBOSRC ? maybeWBOSRC : wombat.extractOriginalURL(result)
                    }
                    return wombat.startsWith(lowerName, "data-") && wombat.startsWithOneOf(result, wombat.wb_prefixes) ? wombat.extractOriginalURL(result) : result
                }
            }
        }
    }
    ,
    Wombat.prototype.initSvgImageOverrides = function() {
        if (this.$wbwindow.SVGImageElement) {
            var svgImgProto = this.$wbwindow.SVGImageElement.prototype
              , orig_getAttr = svgImgProto.getAttribute
              , orig_getAttrNS = svgImgProto.getAttributeNS
              , orig_setAttr = svgImgProto.setAttribute
              , orig_setAttrNS = svgImgProto.setAttributeNS
              , wombat = this;
            svgImgProto.getAttribute = function getAttribute(name) {
                var value = orig_getAttr.call(this, name);
                return name.indexOf("xlink:href") >= 0 || name === "href" ? wombat.extractOriginalURL(value) : value
            }
            ,
            svgImgProto.getAttributeNS = function getAttributeNS(ns, name) {
                var value = orig_getAttrNS.call(this, ns, name);
                return name.indexOf("xlink:href") >= 0 || name === "href" ? wombat.extractOriginalURL(value) : value
            }
            ,
            svgImgProto.setAttribute = function setAttribute(name, value) {
                var rwValue = value;
                return (name.indexOf("xlink:href") >= 0 || name === "href") && (rwValue = wombat.rewriteUrl(value)),
                orig_setAttr.call(this, name, rwValue)
            }
            ,
            svgImgProto.setAttributeNS = function setAttributeNS(ns, name, value) {
                var rwValue = value;
                return (name.indexOf("xlink:href") >= 0 || name === "href") && (rwValue = wombat.rewriteUrl(value)),
                orig_setAttrNS.call(this, ns, name, rwValue)
            }
        }
    }
    ,
    Wombat.prototype.initCreateElementNSFix = function() {
        if (this.$wbwindow.document.createElementNS && this.$wbwindow.Document.prototype.createElementNS) {
            var orig_createElementNS = this.$wbwindow.document.createElementNS
              , wombat = this
              , createElementNS = function createElementNS(namespaceURI, qualifiedName) {
                return orig_createElementNS.call(wombat.proxyToObj(this), wombat.extractOriginalURL(namespaceURI), qualifiedName)
            };
            this.$wbwindow.Document.prototype.createElementNS = createElementNS,
            this.$wbwindow.document.createElementNS = createElementNS
        }
    }
    ,
    Wombat.prototype.initInsertAdjacentElementHTMLOverrides = function() {
        var Element = this.$wbwindow.Element;
        if (Element && Element.prototype) {
            var elementProto = Element.prototype
              , rewriteFn = this.rewriteInsertAdjHTMLOrElemArgs;
            if (elementProto.insertAdjacentHTML) {
                var origInsertAdjacentHTML = elementProto.insertAdjacentHTML;
                elementProto.insertAdjacentHTML = function insertAdjacentHTML(position, text) {
                    return rewriteFn(this, origInsertAdjacentHTML, position, text, true)
                }
            }
            if (elementProto.insertAdjacentElement) {
                var origIAdjElem = elementProto.insertAdjacentElement;
                elementProto.insertAdjacentElement = function insertAdjacentElement(position, element) {
                    return rewriteFn(this, origIAdjElem, position, element, false)
                }
            }
        }
    }
    ,
    Wombat.prototype.initDomOverride = function() {
        var Node = this.$wbwindow.Node;
        if (Node && Node.prototype) {
            var rewriteFn = this.rewriteNodeFuncArgs;
            if (Node.prototype.appendChild) {
                var originalAppendChild = Node.prototype.appendChild;
                Node.prototype.appendChild = function appendChild(newNode, oldNode) {
                    return rewriteFn(this, originalAppendChild, newNode, oldNode)
                }
            }
            if (Node.prototype.insertBefore) {
                var originalInsertBefore = Node.prototype.insertBefore;
                Node.prototype.insertBefore = function insertBefore(newNode, oldNode) {
                    return rewriteFn(this, originalInsertBefore, newNode, oldNode)
                }
            }
            if (Node.prototype.replaceChild) {
                var originalReplaceChild = Node.prototype.replaceChild;
                Node.prototype.replaceChild = function replaceChild(newNode, oldNode) {
                    return rewriteFn(this, originalReplaceChild, newNode, oldNode)
                }
            }
            this.overridePropToProxy(Node.prototype, "ownerDocument"),
            this.overridePropToProxy(this.$wbwindow.HTMLHtmlElement.prototype, "parentNode"),
            this.overridePropToProxy(this.$wbwindow.Event.prototype, "target")
        }
        this.$wbwindow.Element && this.$wbwindow.Element.prototype && (this.overrideParentNodeAppendPrepend(this.$wbwindow.Element),
        this.overrideChildNodeInterface(this.$wbwindow.Element, false)),
        this.$wbwindow.DocumentFragment && this.$wbwindow.DocumentFragment.prototype && this.overrideParentNodeAppendPrepend(this.$wbwindow.DocumentFragment)
    }
    ,
    Wombat.prototype.initDocOverrides = function($document) {
        if (Object.defineProperty) {
            this.overrideReferrer($document),
            this.defGetterProp($document, "origin", function origin() {
                return this.WB_wombat_location.origin
            }),
            this.defGetterProp(this.$wbwindow, "origin", function origin() {
                return this.WB_wombat_location.origin
            });
            var wombat = this
              , domain_setter = function domain(val) {
                var loc = this.WB_wombat_location;
                loc && wombat.endsWith(loc.hostname, val) && (this.__wb_domain = val)
            }
              , domain_getter = function domain() {
                return this.__wb_domain || this.WB_wombat_location.hostname
            };
            this.defProp($document, "domain", domain_setter, domain_getter)
        }
    }
    ,
    Wombat.prototype.initDocWriteOpenCloseOverride = function() {
        function isSWLoad() {
            return wombat.wb_info.isSW && wombat.$wbwindow.frameElement
        }
        function prepForWrite(args) {
            var string;
            return args.length === 0 ? "" : (string = args.length === 1 ? args[0] : Array.prototype.join.call(args, ""),
            string)
        }
        function docWrite(fnThis, originalFn, string) {
            if (wombat.$wbwindow,
            isSWLoad())
                return void (wombat._writeBuff += string);
            string = wombat.rewriteHtml(string, true);
            var thisObj = wombat.proxyToObj(fnThis)
              , res = originalFn.call(thisObj, string);
            return wombat.initNewWindowWombat(thisObj.defaultView),
            res
        }
        if (this.$wbwindow.DOMParser) {
            var DocumentProto = this.$wbwindow.Document.prototype
              , $wbDocument = this.$wbwindow.document;
            this._writeBuff = "";
            var wombat = this
              , orig_doc_write = $wbDocument.write
              , new_write = function write() {
                return docWrite(this, orig_doc_write, prepForWrite(arguments))
            };
            $wbDocument.write = new_write,
            DocumentProto.write = new_write;
            var orig_doc_writeln = $wbDocument.writeln
              , new_writeln = function writeln() {
                return docWrite(this, orig_doc_writeln, prepForWrite(arguments))
            };
            $wbDocument.writeln = new_writeln,
            DocumentProto.writeln = new_writeln;
            var orig_doc_open = $wbDocument.open
              , new_open = function open() {
                var res, thisObj = wombat.proxyToObj(this);
                if (arguments.length === 3) {
                    var rwUrl = wombat.rewriteUrl(arguments[0], false, "mp_");
                    res = orig_doc_open.call(thisObj, rwUrl, arguments[1], arguments[2]),
                    wombat.initNewWindowWombat(res, arguments[0])
                } else
                    res = orig_doc_open.call(thisObj),
                    isSWLoad() ? wombat._writeBuff = "" : wombat.initNewWindowWombat(thisObj.defaultView);
                return res
            };
            $wbDocument.open = new_open,
            DocumentProto.open = new_open;
            var originalClose = $wbDocument.close
              , newClose = function close() {
                if (wombat._writeBuff)
                    return wombat.blobUrlForIframe(wombat.$wbwindow.frameElement, wombat._writeBuff),
                    void (wombat._writeBuff = "");
                var thisObj = wombat.proxyToObj(this);
                return wombat.initNewWindowWombat(thisObj.defaultView),
                originalClose.__WB_orig_apply ? originalClose.__WB_orig_apply(thisObj, arguments) : originalClose.apply(thisObj, arguments)
            };
            $wbDocument.close = newClose,
            DocumentProto.close = newClose;
            var oBodyGetter = this.getOrigGetter(DocumentProto, "body")
              , oBodySetter = this.getOrigSetter(DocumentProto, "body");
            oBodyGetter && oBodySetter && this.defProp(DocumentProto, "body", function body(newBody) {
                return newBody && (newBody instanceof HTMLBodyElement || newBody instanceof HTMLFrameSetElement) && wombat.rewriteElemComplete(newBody),
                oBodySetter.call(wombat.proxyToObj(this), newBody)
            }, oBodyGetter)
        }
    }
    ,
    Wombat.prototype.initIframeWombat = function(iframe) {
        var win;
        win = iframe._get_contentWindow ? iframe._get_contentWindow.call(iframe) : iframe.contentWindow;
        try {
            if (!win || win === this.$wbwindow || win._skip_wombat || win._wb_wombat)
                return
        } catch (e) {
            return
        }
        var src = iframe.src;
        this.initNewWindowWombat(win, src)
    }
    ,
    Wombat.prototype.initNewWindowWombat = function(win, src) {
        var fullWombat = false;
        if (win && !win._wb_wombat) {
            if ((!src || src === "" || this.startsWithOneOf(src, ["about:blank", "javascript:"])) && (fullWombat = true),
            !fullWombat && this.wb_info.isSW) {
                var origURL = this.extractOriginalURL(src);
                (origURL === "about:blank" || origURL.startsWith("srcdoc:") || origURL.startsWith("blob:")) && (fullWombat = true)
            }
            if (fullWombat) {
                var newInfo = {};
                Object.assign(newInfo, this.wb_info);
                var wombat = new Wombat(win,newInfo);
                win._wb_wombat = wombat.wombatInit()
            } else
                this.initProtoPmOrigin(win),
                this.initPostMessageOverride(win),
                this.initMessageEventOverride(win),
                this.initCheckThisFunc(win),
                this.initImportWrapperFunc(win)
        }
    }
    ,
    Wombat.prototype.initTimeoutIntervalOverrides = function() {
        var rewriteFn = this.rewriteSetTimeoutInterval;
        if (this.$wbwindow.setTimeout && !this.$wbwindow.setTimeout.__$wbpatched$__) {
            var originalSetTimeout = this.$wbwindow.setTimeout;
            this.$wbwindow.setTimeout = function setTimeout() {
                return rewriteFn(this, originalSetTimeout, arguments)
            }
            ,
            this.$wbwindow.setTimeout.__$wbpatched$__ = true
        }
        if (this.$wbwindow.setInterval && !this.$wbwindow.setInterval.__$wbpatched$__) {
            var originalSetInterval = this.$wbwindow.setInterval;
            this.$wbwindow.setInterval = function setInterval() {
                return rewriteFn(this, originalSetInterval, arguments)
            }
            ,
            this.$wbwindow.setInterval.__$wbpatched$__ = true
        }
    }
    ,
    Wombat.prototype.initWorkerOverrides = function() {
        var wombat = this;
        if (this.$wbwindow.Worker && !this.$wbwindow.Worker._wb_worker_overridden) {
            var orig_worker = this.$wbwindow.Worker;
            this.$wbwindow.Worker = function(Worker_) {
                return function Worker(url, options) {
                    return wombat.domConstructorErrorChecker(this, "Worker", arguments),
                    new Worker_(wombat.rewriteWorker(url),options)
                }
            }(orig_worker),
            this.$wbwindow.Worker.prototype = orig_worker.prototype,
            Object.defineProperty(this.$wbwindow.Worker.prototype, "constructor", {
                value: this.$wbwindow.Worker
            }),
            this.$wbwindow.Worker._wb_worker_overridden = true
        }
        if (this.$wbwindow.SharedWorker && !this.$wbwindow.SharedWorker.__wb_sharedWorker_overridden) {
            var oSharedWorker = this.$wbwindow.SharedWorker;
            this.$wbwindow.SharedWorker = function(SharedWorker_) {
                return function SharedWorker(url, options) {
                    return wombat.domConstructorErrorChecker(this, "SharedWorker", arguments),
                    new SharedWorker_(wombat.rewriteWorker(url),options)
                }
            }(oSharedWorker),
            this.$wbwindow.SharedWorker.prototype = oSharedWorker.prototype,
            Object.defineProperty(this.$wbwindow.SharedWorker.prototype, "constructor", {
                value: this.$wbwindow.SharedWorker
            }),
            this.$wbwindow.SharedWorker.__wb_sharedWorker_overridden = true
        }
        if (this.$wbwindow.ServiceWorkerContainer && this.$wbwindow.ServiceWorkerContainer.prototype && this.$wbwindow.ServiceWorkerContainer.prototype.register) {
            var orig_register = this.$wbwindow.ServiceWorkerContainer.prototype.register;
            this.$wbwindow.ServiceWorkerContainer.prototype.register = function register(scriptURL, options) {
                var newScriptURL = new URL(scriptURL,wombat.$wbwindow.document.baseURI).href
                  , mod = wombat.getPageUnderModifier();
                return options && options.scope ? options.scope = wombat.rewriteUrl(options.scope, false, mod) : options = {
                    scope: wombat.rewriteUrl("/", false, mod)
                },
                orig_register.call(this, wombat.rewriteUrl(newScriptURL, false, "sw_"), options)
            }
        }
        if (this.$wbwindow.Worklet && this.$wbwindow.Worklet.prototype && this.$wbwindow.Worklet.prototype.addModule && !this.$wbwindow.Worklet.__wb_workerlet_overridden) {
            var oAddModule = this.$wbwindow.Worklet.prototype.addModule;
            this.$wbwindow.Worklet.prototype.addModule = function addModule(moduleURL, options) {
                var rwModuleURL = wombat.rewriteUrl(moduleURL, false, "js_");
                return oAddModule.call(this, rwModuleURL, options)
            }
            ,
            this.$wbwindow.Worklet.__wb_workerlet_overridden = true
        }
    }
    ,
    Wombat.prototype.initLocOverride = function(loc, oSetter, oGetter) {
        if (Object.defineProperty)
            for (var prop, i = 0; i < this.URL_PROPS.length; i++)
                prop = this.URL_PROPS[i],
                this.defProp(loc, prop, this.makeSetLocProp(prop, oSetter, oGetter), this.makeGetLocProp(prop, oGetter), true)
    }
    ,
    Wombat.prototype.initWombatLoc = function(win) {
        if (!(!win || win.WB_wombat_location && win.document.WB_wombat_location)) {
            var wombat_location = new WombatLocation(win.location,this)
              , wombat = this;
            if (Object.defineProperty) {
                var setter = function(value) {
                    var loc = this._WB_wombat_location || this.defaultView && this.defaultView._WB_wombat_location;
                    loc && (loc.href = value),
                    win.location = wombat.rewriteUrl(value)
                }
                  , getter = function() {
                    return this._WB_wombat_location || this.defaultView && this.defaultView._WB_wombat_location || this.location
                };
                this.defProp(win.Object.prototype, "WB_wombat_location", setter, getter),
                this.initProtoPmOrigin(win),
                win._WB_wombat_location = wombat_location
            } else
                win.WB_wombat_location = wombat_location,
                setTimeout(this.checkAllLocations, 500),
                setInterval(this.checkAllLocations, 500)
        }
    }
    ,
    Wombat.prototype.initProtoPmOrigin = function(win) {
        if (!win.Object.prototype.__WB_pmw) {
            var pm_origin = function pm_origin(origin_window) {
                return this.__WB_source = origin_window,
                this
            };
            try {
                win.Object.defineProperty(win.Object.prototype, "__WB_pmw", {
                    get: function() {
                        return pm_origin
                    },
                    set: function() {},
                    configurable: true,
                    enumerable: false
                })
            } catch (e) {}
            win.__WB_check_loc = function(loc, args) {
                if (loc instanceof Location || loc instanceof WombatLocation) {
                    if (args)
                        for (var i = 0; i < args.length; i++)
                            if (loc === args[i])
                                return {};
                    return this.WB_wombat_location
                }
                return {}
            }
        }
    }
    ,
    Wombat.prototype.initCheckThisFunc = function(win) {
        try {
            win.Object.prototype[this.WB_CHECK_THIS_FUNC] || win.Object.defineProperty(win.Object.prototype, this.WB_CHECK_THIS_FUNC, {
                configutable: false,
                enumerable: false,
                value: function(thisObj) {
                    return thisObj && thisObj._WB_wombat_obj_proxy ? thisObj._WB_wombat_obj_proxy : thisObj
                }
            })
        } catch (e) {}
    }
    ,
    Wombat.prototype.initImportWrapperFunc = function(win) {
        var wombat = this;
        win.____wb_rewrite_import__ = function(base, url) {
            return base && (url = new URL(url,base).href),
            import(wombat.rewriteUrl(url, false, "esm_"))
        }
    }
    ,
    Wombat.prototype.overrideGetOwnPropertyNames = function(win) {
        var orig_getOwnPropertyNames = win.Object.getOwnPropertyNames
          , removeProps = [this.WB_CHECK_THIS_FUNC, "WB_wombat_location", "__WB_pmw", "WB_wombat_top", "WB_wombat_eval", "WB_wombat_runEval"];
        try {
            win.Object.defineProperty(win.Object, "getOwnPropertyNames", {
                value: function(object) {
                    for (var foundInx, props = orig_getOwnPropertyNames(object), i = 0; i < removeProps.length; i++)
                        foundInx = props.indexOf(removeProps[i]),
                        foundInx >= 0 && props.splice(foundInx, 1);
                    return props
                }
            })
        } catch (e) {
            console.log(e)
        }
    }
    ,
    Wombat.prototype.initHashChange = function() {
        if (this.$wbwindow.__WB_top_frame) {
            var wombat = this
              , receive_hash_change = function receive_hash_change(event) {
                if (event.data && event.data.from_top) {
                    var message = event.data.message;
                    message.wb_type && (message.wb_type !== "outer_hashchange" || wombat.$wbwindow.location.hash == message.hash || (wombat.$wbwindow.location.hash = message.hash))
                }
            }
              , send_hash_change = function send_hash_change() {
                var message = {
                    wb_type: "hashchange",
                    hash: wombat.$wbwindow.location.hash
                };
                wombat.sendTopMessage(message)
            };
            this.$wbwindow.addEventListener("message", receive_hash_change),
            this.$wbwindow.addEventListener("hashchange", send_hash_change)
        }
    }
    ,
    Wombat.prototype.initPostMessageOverride = function($wbwindow) {
        if ($wbwindow.postMessage && !$wbwindow.__orig_postMessage) {
            var orig = $wbwindow.postMessage
              , wombat = this;
            $wbwindow.__orig_postMessage = orig;
            var postmessage_rewritten = function postMessage(message, targetOrigin, transfer, from_top) {
                var from, src_id, this_obj = wombat.proxyToObj(this);
                if (this_obj || (this_obj = $wbwindow,
                this_obj.__WB_source = $wbwindow),
                this_obj.__WB_source && this_obj.__WB_source.WB_wombat_location) {
                    var source = this_obj.__WB_source;
                    if (from = source.WB_wombat_location.origin,
                    this_obj.__WB_win_id || (this_obj.__WB_win_id = {},
                    this_obj.__WB_counter = 0),
                    !source.__WB_id) {
                        var id = this_obj.__WB_counter;
                        source.__WB_id = id + source.WB_wombat_location.href,
                        this_obj.__WB_counter += 1
                    }
                    this_obj.__WB_win_id[source.__WB_id] = source,
                    src_id = source.__WB_id,
                    this_obj.__WB_source = undefined
                } else
                    from = window.WB_wombat_location.origin;
                var to_origin = targetOrigin;
                to_origin === this_obj.location.origin && (to_origin = from);
                var new_message = {
                    from: from,
                    to_origin: to_origin,
                    src_id: src_id,
                    message: message,
                    from_top: from_top
                };
                if (targetOrigin !== "*") {
                    if (this_obj.location.origin === "null" || this_obj.location.origin === "")
                        return;
                    targetOrigin = this_obj.location.origin
                }
                return orig.call(this_obj, new_message, targetOrigin, transfer)
            };
            $wbwindow.postMessage = postmessage_rewritten,
            $wbwindow.Window.prototype.postMessage = postmessage_rewritten;
            var eventTarget = null;
            eventTarget = $wbwindow.EventTarget && $wbwindow.EventTarget.prototype ? $wbwindow.EventTarget.prototype : $wbwindow;
            var _oAddEventListener = eventTarget.addEventListener;
            eventTarget.addEventListener = function addEventListener(type, listener, useCapture) {
                var rwListener, obj = wombat.proxyToObj(this);
                if (type === "message" ? rwListener = wombat.message_listeners.add_or_get(listener, function() {
                    return wrapEventListener(listener, obj, wombat)
                }) : type === "storage" ? wombat.storage_listeners.add_or_get(listener, function() {
                    return wrapSameOriginEventListener(listener, obj)
                }) : rwListener = listener,
                rwListener)
                    return _oAddEventListener.call(obj, type, rwListener, useCapture)
            }
            ;
            var _oRemoveEventListener = eventTarget.removeEventListener;
            eventTarget.removeEventListener = function removeEventListener(type, listener, useCapture) {
                var rwListener, obj = wombat.proxyToObj(this);
                if (type === "message" ? rwListener = wombat.message_listeners.remove(listener) : type === "storage" ? wombat.storage_listeners.remove(listener) : rwListener = listener,
                rwListener)
                    return _oRemoveEventListener.call(obj, type, rwListener, useCapture)
            }
            ;
            var override_on_prop = function(onevent, wrapperFN) {
                var orig_setter = wombat.getOrigSetter($wbwindow, onevent)
                  , setter = function(value) {
                    this["__orig_" + onevent] = value;
                    var obj = wombat.proxyToObj(this)
                      , listener = value ? wrapperFN(value, obj, wombat) : value;
                    return orig_setter.call(obj, listener)
                }
                  , getter = function() {
                    return this["__orig_" + onevent]
                };
                wombat.defProp($wbwindow, onevent, setter, getter)
            };
            override_on_prop("onmessage", wrapEventListener),
            override_on_prop("onstorage", wrapSameOriginEventListener)
        }
    }
    ,
    Wombat.prototype.initMessageEventOverride = function($wbwindow) {
        !$wbwindow.MessageEvent || $wbwindow.MessageEvent.prototype.__extended || (this.addEventOverride("target"),
        this.addEventOverride("srcElement"),
        this.addEventOverride("currentTarget"),
        this.addEventOverride("eventPhase"),
        this.addEventOverride("path"),
        this.overridePropToProxy($wbwindow.MessageEvent.prototype, "source"),
        $wbwindow.MessageEvent.prototype.__extended = true)
    }
    ,
    Wombat.prototype.initUIEventsOverrides = function() {
        this.overrideAnUIEvent("UIEvent"),
        this.overrideAnUIEvent("MouseEvent"),
        this.overrideAnUIEvent("TouchEvent"),
        this.overrideAnUIEvent("FocusEvent"),
        this.overrideAnUIEvent("KeyboardEvent"),
        this.overrideAnUIEvent("WheelEvent"),
        this.overrideAnUIEvent("InputEvent"),
        this.overrideAnUIEvent("CompositionEvent")
    }
    ,
    Wombat.prototype.initOpenOverride = function() {
        var orig = this.$wbwindow.open;
        this.$wbwindow.Window.prototype.open && (orig = this.$wbwindow.Window.prototype.open);
        var wombat = this
          , open_rewritten = function open(strUrl, strWindowName, strWindowFeatures) {
            strWindowName && (strWindowName = wombat.rewriteAttrTarget(strWindowName));
            var rwStrUrl = wombat.rewriteUrl(strUrl, false)
              , res = orig.call(wombat.proxyToObj(this), rwStrUrl, strWindowName, strWindowFeatures);
            return wombat.initNewWindowWombat(res, strUrl),
            res
        };
        this.$wbwindow.open = open_rewritten,
        this.$wbwindow.Window.prototype.open && (this.$wbwindow.Window.prototype.open = open_rewritten);
        for (var i = 0; i < this.$wbwindow.frames.length; i++)
            try {
                this.$wbwindow.frames[i].open = open_rewritten
            } catch (e) {
                console.log(e)
            }
    }
    ,
    Wombat.prototype.rewriteAttrTarget = function(target) {
        return this.wb_info.target_frame ? target === "_blank" || target === "_parent" || target === "_top" ? this.wb_info.target_frame : target && this.$wbwindow === this.$wbwindow.__WB_replay_top ? this.wb_info.target_frame : target : target
    }
    ,
    Wombat.prototype.initCookiesOverride = function() {
        var orig_get_cookie = this.getOrigGetter(this.$wbwindow.document, "cookie")
          , orig_set_cookie = this.getOrigSetter(this.$wbwindow.document, "cookie");
        orig_get_cookie || (orig_get_cookie = this.getOrigGetter(this.$wbwindow.Document.prototype, "cookie")),
        orig_set_cookie || (orig_set_cookie = this.getOrigSetter(this.$wbwindow.Document.prototype, "cookie"));
        var rwCookieReplacer = function(m, d1) {
            var date = new Date(d1);
            if (isNaN(date.getTime()))
                return "Expires=Thu,| 01 Jan 1970 00:00:00 GMT";
            var finalDate = new Date(date.getTime() + Date.__WB_timediff);
            return "Expires=" + finalDate.toUTCString().replace(",", ",|")
        }
          , wombat = this
          , set_cookie = function cookie(value) {
            if (value) {
                for (var newValue = value.replace(wombat.cookie_expires_regex, rwCookieReplacer), cookies = newValue.split(wombat.SetCookieRe), i = 0; i < cookies.length; i++)
                    cookies[i] = wombat.rewriteCookie(cookies[i]);
                return orig_set_cookie.call(wombat.proxyToObj(this), cookies.join(","))
            }
        }
          , get_cookie = function cookie() {
            return orig_get_cookie.call(wombat.proxyToObj(this))
        };
        this.defProp(this.$wbwindow.document, "cookie", set_cookie, get_cookie)
    }
    ,
    Wombat.prototype.initRegisterUnRegPHOverride = function() {
        var wombat = this
          , winNavigator = this.$wbwindow.navigator;
        if (winNavigator.registerProtocolHandler) {
            var orig_registerPH = winNavigator.registerProtocolHandler;
            winNavigator.registerProtocolHandler = function registerProtocolHandler(protocol, uri, title) {
                return orig_registerPH.call(this, protocol, wombat.rewriteUrl(uri), title)
            }
        }
        if (winNavigator.unregisterProtocolHandler) {
            var origUnregPH = winNavigator.unregisterProtocolHandler;
            winNavigator.unregisterProtocolHandler = function unregisterProtocolHandler(scheme, url) {
                return origUnregPH.call(this, scheme, wombat.rewriteUrl(url))
            }
        }
    }
    ,
    Wombat.prototype.initBeaconOverride = function() {
        if (this.$wbwindow.navigator.sendBeacon) {
            var orig_sendBeacon = this.$wbwindow.navigator.sendBeacon
              , wombat = this;
            this.$wbwindow.navigator.sendBeacon = function sendBeacon(url, data) {
                try {
                    return orig_sendBeacon.call(this, wombat.rewriteUrl(url), data)
                } catch (e) {
                    return true
                }
            }
        }
    }
    ,
    Wombat.prototype.initMiscNavigatorOverrides = function() {
        this.$wbwindow.navigator.mediaDevices && (this.$wbwindow.navigator.mediaDevices.setCaptureHandleConfig = function() {}
        )
    }
    ,
    Wombat.prototype.initPresentationRequestOverride = function() {
        if (this.$wbwindow.PresentationRequest && this.$wbwindow.PresentationRequest.prototype) {
            var wombat = this
              , origPresentationRequest = this.$wbwindow.PresentationRequest;
            this.$wbwindow.PresentationRequest = function(PresentationRequest_) {
                return function PresentationRequest(url) {
                    wombat.domConstructorErrorChecker(this, "PresentationRequest", arguments);
                    var rwURL = url;
                    if (url != null)
                        if (Array.isArray(rwURL))
                            for (var i = 0; i < rwURL.length; i++)
                                rwURL[i] = wombat.rewriteUrl(rwURL[i], true, "mp_");
                        else
                            rwURL = wombat.rewriteUrl(url, true, "mp_");
                    return new PresentationRequest_(rwURL)
                }
            }(this.$wbwindow.PresentationRequest),
            this.$wbwindow.PresentationRequest.prototype = origPresentationRequest.prototype,
            Object.defineProperty(this.$wbwindow.PresentationRequest.prototype, "constructor", {
                value: this.$wbwindow.PresentationRequest
            })
        }
    }
    ,
    Wombat.prototype.initDisableNotificationsGeoLocation = function() {
        window.Notification && (window.Notification.requestPermission = function requestPermission(callback) {
            return callback && callback("denied"),
            Promise.resolve("denied")
        }
        );
        var applyOverride = function(on) {
            on && (on.getCurrentPosition && (on.getCurrentPosition = function getCurrentPosition(success, error, options) {
                error && error({
                    code: 2,
                    message: "not available"
                })
            }
            ),
            on.watchPosition && (on.watchPosition = function watchPosition(success, error, options) {
                error && error({
                    code: 2,
                    message: "not available"
                })
            }
            ))
        };
        window.geolocation && applyOverride(window.geolocation),
        window.navigator.geolocation && applyOverride(window.navigator.geolocation)
    }
    ,
    Wombat.prototype.initStorageOverride = function() {
        this.addEventOverride("storageArea", this.$wbwindow.StorageEvent.prototype),
        ThrowExceptions.yes = false;
        var initStorage = {};
        if (this.wb_info.storage)
            try {
                initStorage = JSON.parse(atob(this.wb_info.storage))
            } catch (e) {
                console.warn("Error parsing storage, storages not loaded")
            }
        createStorage(this, "localStorage", initStorage.local),
        createStorage(this, "sessionStorage", initStorage.session),
        this.$wbwindow.Storage = Storage,
        ThrowExceptions.yes = true
    }
    ,
    Wombat.prototype.initIndexedDBOverride = function() {
        if (this.$wbwindow.IDBFactory) {
            var proto = this.$wbwindow.IDBFactory.prototype
              , prefix = "wb-" + this.wb_orig_origin + "-"
              , orig_open = proto.open;
            proto.open = function(dbName, version) {
                return orig_open.call(this, prefix + dbName, version)
            }
            ;
            var orig_delete = proto.deleteDatabase;
            proto.delete = function(dbName) {
                return orig_delete.call(this, prefix + dbName, options)
            }
            ;
            var orig_databases = proto.databases;
            proto.databases = function() {
                var func = this;
                return new Promise(function(resolve, reject) {
                    orig_databases.call(func).then(function(dbList) {
                        for (var keys = [], i = 0; i < dbList.length; i++)
                            dbList[i].name.indexOf(prefix) === 0 && keys.push({
                                name: dbList[i].name.substring(prefix.length),
                                version: dbList[i].version
                            });
                        resolve(keys)
                    }).catch(function(err) {
                        reject(err)
                    })
                }
                )
            }
        }
    }
    ,
    Wombat.prototype.initCachesOverride = function() {
        if (this.$wbwindow.CacheStorage) {
            this.$wbwindow.chrome && (this.$wbwindow.chrome = {});
            var proto = this.$wbwindow.CacheStorage.prototype
              , prefix = "wb-" + this.wb_orig_origin + "-"
              , orig_open = proto.open;
            proto.open = function(cacheName) {
                return orig_open.call(this, prefix + cacheName)
            }
            ;
            var orig_has = proto.has;
            proto.has = function(cacheName) {
                return orig_has.call(this, prefix + cacheName)
            }
            ;
            var orig_delete = proto.delete;
            proto.delete = function(cacheName) {
                return orig_delete.call(this, prefix + cacheName)
            }
            ;
            var orig_keys = proto.keys;
            proto.keys = function() {
                var func = this;
                return new Promise(function(resolve, reject) {
                    orig_keys.call(func).then(function(keyList) {
                        for (var keys = [], i = 0; i < keyList.length; i++)
                            keyList[i].indexOf(prefix) === 0 && keys.push(keyList[i].substring(prefix.length));
                        resolve(keys)
                    }).catch(function(err) {
                        reject(err)
                    })
                }
                )
            }
            ,
            proto.match,
            proto.match = function match(request, opts) {
                var caches = this;
                return this.keys().then(function(cacheNames) {
                    var match;
                    return cacheNames.reduce(function(chain, cacheName) {
                        return chain.then(function() {
                            return match || caches.open(cacheName).then(function(cache) {
                                return cache.match(request, opts)
                            }).then(function(response) {
                                return match = response,
                                match
                            })
                        })
                    }, Promise.resolve())
                })
            }
        }
    }
    ,
    Wombat.prototype.initWindowObjProxy = function($wbwindow) {
        if (!$wbwindow.Proxy)
            return undefined;
        var ownProps = this.getAllOwnProps($wbwindow)
          , funCache = {}
          , wombat = this
          , windowProxy = new $wbwindow.Proxy({},{
            get: function(target, prop) {
                switch (prop) {
                case "top":
                    return wombat.$wbwindow.WB_wombat_top._WB_wombat_obj_proxy;
                case "parent":
                    if (wombat.$wbwindow === wombat.$wbwindow.WB_wombat_top)
                        return wombat.$wbwindow.WB_wombat_top._WB_wombat_obj_proxy;
                    try {
                        var parentProxy = wombat.$wbwindow.parent._WB_wombat_obj_proxy;
                        if (parentProxy)
                            return parentProxy
                    } catch (e) {}
                    return wombat.$wbwindow.WB_wombat_top._WB_wombat_obj_proxy;
                }
                return wombat.defaultProxyGet($wbwindow, prop, ownProps, funCache)
            },
            set: function(target, prop, value) {
                switch (prop) {
                case "location":
                    return $wbwindow.WB_wombat_location = value,
                    true;
                case "postMessage":
                case "document":
                    return true;
                }
                try {
                    if (!Reflect.set(target, prop, value))
                        return false
                } catch (e) {}
                return Reflect.set($wbwindow, prop, value)
            },
            has: function(target, prop) {
                return prop in $wbwindow
            },
            ownKeys: function(target) {
                return Object.getOwnPropertyNames($wbwindow).concat(Object.getOwnPropertySymbols($wbwindow))
            },
            getOwnPropertyDescriptor: function(target, key) {
                var descriptor = Object.getOwnPropertyDescriptor(target, key);
                return descriptor || (descriptor = Object.getOwnPropertyDescriptor($wbwindow, key),
                descriptor && (descriptor.configurable = true)),
                descriptor
            },
            getPrototypeOf: function(target) {
                return Object.getPrototypeOf($wbwindow)
            },
            setPrototypeOf: function(target, newProto) {
                return false
            },
            isExtensible: function(target) {
                return Object.isExtensible($wbwindow)
            },
            preventExtensions: function(target) {
                return Object.preventExtensions($wbwindow),
                true
            },
            deleteProperty: function(target, prop) {
                var propDescriptor = Object.getOwnPropertyDescriptor($wbwindow, prop);
                return propDescriptor === undefined || propDescriptor.configurable !== false && (delete target[prop],
                delete $wbwindow[prop],
                true)
            },
            defineProperty: function(target, prop, desc) {
                var ndesc = desc || {};
                return ndesc.value === undefined && ndesc.get === undefined && (ndesc.value = $wbwindow[prop]),
                Reflect.defineProperty($wbwindow, prop, ndesc),
                Reflect.defineProperty(target, prop, ndesc)
            }
        });
        return $wbwindow._WB_wombat_obj_proxy = windowProxy,
        windowProxy
    }
    ,
    Wombat.prototype.initDocumentObjProxy = function($document) {
        if (this.initDocOverrides($document),
        !this.$wbwindow.Proxy)
            return undefined;
        var funCache = {}
          , ownProps = this.getAllOwnProps($document)
          , wombat = this
          , documentProxy = new this.$wbwindow.Proxy($document,{
            get: function(target, prop) {
                return wombat.defaultProxyGet($document, prop, ownProps, funCache)
            },
            set: function(target, prop, value) {
                return prop === "location" ? $document.WB_wombat_location = value : target[prop] = value,
                true
            }
        });
        return $document._WB_wombat_obj_proxy = documentProxy,
        documentProxy
    }
    ,
    Wombat.prototype.initAutoFetchWorker = function() {
        if (this.wbUseAFWorker) {
            var af = new AutoFetcher(this,{
                isTop: this.$wbwindow === this.$wbwindow.__WB_replay_top,
                workerURL: (this.wb_info.auto_fetch_worker_prefix || this.wb_info.static_prefix) + "autoFetchWorker.js?init=" + encodeURIComponent(JSON.stringify({
                    mod: this.wb_info.mod,
                    prefix: this.wb_abs_prefix,
                    rwRe: this.wb_unrewrite_rx.source
                }))
            });
            this.WBAutoFetchWorker = af,
            this.$wbwindow.$WBAutoFetchWorker$ = af;
            var wombat = this;
            this.utilFns.wbSheetMediaQChecker = function checkStyle() {
                wombat._removeEventListener(this, "load", wombat.utilFns.wbSheetMediaQChecker),
                this.sheet == null || wombat.WBAutoFetchWorker && wombat.WBAutoFetchWorker.deferredSheetExtraction(this.sheet)
            }
        }
    }
    ,
    Wombat.prototype.initTopFrameNotify = function(wbinfo) {
        var wombat = this
          , notify_top = function notify_top(event) {
            if (!wombat.$wbwindow.__WB_top_frame) {
                var hash = wombat.$wbwindow.location.hash;
                return void wombat.$wbwindow.location.replace(wbinfo.top_url + hash)
            }
            if (wombat.$wbwindow.WB_wombat_location) {
                var url = wombat.$wbwindow.WB_wombat_location.href;
                if (typeof url === "string" && url !== "about:blank" && url.indexOf("javascript:") !== 0 && (wombat.$wbwindow.document.readyState === "complete" && wombat.wbUseAFWorker && wombat.WBAutoFetchWorker && wombat.WBAutoFetchWorker.extractFromLocalDoc(),
                wombat.$wbwindow === wombat.$wbwindow.__WB_replay_top)) {
                    for (var hicon, icons = [], hicons = wombat.$wbwindow.document.querySelectorAll("link[rel*='icon']"), i = 0; i < hicons.length; i++)
                        hicon = hicons[i],
                        icons.push({
                            rel: hicon.rel,
                            href: wombat.wb_getAttribute.call(hicon, "href")
                        });
                    icons.push({
                        rel: "icon",
                        href: wombat.rewriteUrl("/favicon.ico")
                    });
                    var message = {
                        icons: icons,
                        url: wombat.$wbwindow.WB_wombat_location.href,
                        ts: wombat.wb_info.timestamp,
                        request_ts: wombat.wb_info.request_ts,
                        is_live: wombat.wb_info.is_live,
                        title: wombat.$wbwindow.document ? wombat.$wbwindow.document.title : "",
                        readyState: wombat.$wbwindow.document.readyState,
                        wb_type: "load"
                    };
                    wombat.sendTopMessage(message)
                }
            }
        };
        this.$wbwindow.document.readyState === "complete" ? notify_top() : this.$wbwindow.addEventListener ? this.$wbwindow.document.addEventListener("readystatechange", notify_top) : this.$wbwindow.attachEvent && this.$wbwindow.document.attachEvent("onreadystatechange", notify_top)
    }
    ,
    Wombat.prototype.initTopFrame = function($wbwindow) {
        if (this.wb_is_proxy)
            return $wbwindow.__WB_replay_top = $wbwindow.top,
            $wbwindow.__WB_top_frame = undefined,
            this.replayTopHost = replay_top.location.host,
            void (this.replayTopProtocol = replay_top.location.protocol);
        for (var next_parent = function(win) {
            try {
                return !!win && (win.wbinfo ? win.wbinfo.is_framed : win._wb_wombat != null)
            } catch (e) {
                return false
            }
        }, replay_top = $wbwindow; replay_top.parent != replay_top && next_parent(replay_top.parent); )
            replay_top = replay_top.parent;
        $wbwindow.__WB_replay_top = replay_top,
        this.replayTopHost = replay_top.location.host,
        this.replayTopProtocol = replay_top.location.protocol;
        var real_parent = replay_top.parent;
        if (real_parent != $wbwindow && this.wb_info.is_framed || (real_parent = undefined),
        real_parent ? ($wbwindow.__WB_top_frame = real_parent,
        this.initFrameElementOverride($wbwindow)) : $wbwindow.__WB_top_frame = undefined,
        !this.wb_opts.embedded && replay_top == $wbwindow && this.wbUseAFWorker) {
            var wombat = this;
            this.$wbwindow.addEventListener("message", function(event) {
                event.data && event.data.wb_type === "aaworker" && wombat.WBAutoFetchWorker && wombat.WBAutoFetchWorker.postMessage(event.data.msg)
            }, false)
        }
    }
    ,
    Wombat.prototype.initFrameElementOverride = function($wbwindow) {
        if (Object.defineProperty && this.proxyToObj($wbwindow.__WB_replay_top) == this.proxyToObj($wbwindow))
            try {
                Object.defineProperty($wbwindow, "frameElement", {
                    value: null,
                    configurable: false
                })
            } catch (e) {}
    }
    ,
    Wombat.prototype.initWombatTop = function($wbwindow) {
        if (Object.defineProperty) {
            var isWindow = function isWindow(obj) {
                return typeof window.constructor === "undefined" ? obj instanceof window.constructor : obj.window == obj
            }
              , getter = function top() {
                return this.__WB_replay_top ? this.__WB_replay_top : isWindow(this) ? this : this.top
            }
              , setter = function top(val) {
                this.top = val
            };
            this.defProp($wbwindow.Object.prototype, "WB_wombat_top", setter, getter)
        }
    }
    ,
    Wombat.prototype.initEvalOverride = function() {
        var rewriteEvalArg = this.rewriteEvalArg
          , setNoop = function() {};
        this.wrappedEval = function(evalFunc) {
            return function(arg) {
                return rewriteEvalArg(evalFunc, arg)
            }
        }
        ;
        var wombat = this
          , runEval = function runEval(func) {
            var obj = this;
            return obj && obj.eval && obj.eval !== eval ? {
                eval: function() {
                    return obj.eval.__WB_orig_apply(obj, arguments)
                }
            } : {
                eval: function(arg) {
                    return rewriteEvalArg(func, arg)
                }
            }
        }
          , runEval2 = function runEval(func) {
            var obj = this;
            return obj && obj.eval && obj.eval !== eval ? {
                eval: function() {
                    return obj.eval.__WB_orig_apply(obj, [].slice.call(arguments, 2))
                }
            } : {
                eval: function(thisObj, args, evalparam) {
                    var isGlobal = thisObj === wombat.proxyToObj(wombat.$wbwindow);
                    try {
                        isGlobal = isGlobal && !args.callee.caller
                    } catch (e) {
                        isGlobal = false
                    }
                    return rewriteEvalArg(func, evalparam, isGlobal)
                }
            }
        };
        this.defProp(this.$wbwindow.Object.prototype, "WB_wombat_runEval", setNoop, function() {
            return runEval
        }),
        this.defProp(this.$wbwindow.Object.prototype, "WB_wombat_runEval2", setNoop, function() {
            return runEval2
        })
    }
    ,
    Wombat.prototype.wombatInit = function() {
        this._internalInit(),
        this.initCookiePreset(),
        this.initHistoryOverrides(),
        this.overrideFunctionApply(this.$wbwindow),
        this.overrideFunctionBind(this.$wbwindow),
        this.initDocTitleOverride(),
        this.initHashChange(),
        this.wb_opts.skip_postmessage || (this.initPostMessageOverride(this.$wbwindow),
        this.initMessageEventOverride(this.$wbwindow)),
        this.initCheckThisFunc(this.$wbwindow),
        this.initImportWrapperFunc(this.$wbwindow),
        this.overrideGetOwnPropertyNames(this.$wbwindow),
        this.initUIEventsOverrides(),
        this.initDocWriteOpenCloseOverride(),
        this.initEvalOverride(),
        this.initHTTPOverrides(),
        this.initAudioOverride(),
        this.initFontFaceOverride(this.$wbwindow),
        this.initWorkerOverrides(),
        this.initTextNodeOverrides(),
        this.initCSSOMOverrides(),
        this.overrideHtmlAssign(this.$wbwindow.Element, "innerHTML", true),
        this.overrideHtmlAssign(this.$wbwindow.Element, "outerHTML", true),
        this.overrideHtmlAssignSrcDoc(this.$wbwindow.HTMLIFrameElement, "srcdoc", true),
        this.overrideHtmlAssign(this.$wbwindow.HTMLStyleElement, "textContent"),
        this.overrideShadowDom(),
        this.overridePropExtract(this.$wbwindow.Document.prototype, "URL"),
        this.overridePropExtract(this.$wbwindow.Document.prototype, "documentURI"),
        this.overridePropExtract(this.$wbwindow.Node.prototype, "baseURI"),
        this.overrideAttrProps(),
        this.overrideDataSet(),
        this.initInsertAdjacentElementHTMLOverrides(),
        this.overrideIframeContentAccess("contentWindow"),
        this.overrideIframeContentAccess("contentDocument"),
        this.overrideFuncArgProxyToObj(this.$wbwindow.MutationObserver, "observe"),
        this.overrideFuncArgProxyToObj(this.$wbwindow.Node, "compareDocumentPosition"),
        this.overrideFuncArgProxyToObj(this.$wbwindow.Node, "contains"),
        this.overrideFuncArgProxyToObj(this.$wbwindow.Document, "createTreeWalker"),
        this.overrideFuncArgProxyToObj(this.$wbwindow.Document, "evaluate", 1),
        this.overrideFuncArgProxyToObj(this.$wbwindow.XSLTProcessor, "transformToFragment", 1),
        this.overrideFuncThisProxyToObj(this.$wbwindow, "getComputedStyle", this.$wbwindow),
        this.overrideFuncThisProxyToObj(this.$wbwindow, "clearTimeout"),
        this.overrideFuncThisProxyToObj(this.$wbwindow, "clearInterval"),
        this.overrideFuncThisProxyToObj(this.$wbwindow.EventTarget.prototype, "dispatchEvent"),
        this.initTimeoutIntervalOverrides(),
        this.overrideFramesAccess(this.$wbwindow),
        this.overrideSWAccess(this.$wbwindow),
        this.initElementGetSetAttributeOverride(),
        this.initSvgImageOverrides(),
        this.initAttrOverrides(),
        this.initCookiesOverride(),
        this.initCreateElementNSFix(),
        this.wb_opts.skip_dom || this.initDomOverride(),
        this.initRegisterUnRegPHOverride(),
        this.initPresentationRequestOverride(),
        this.initBeaconOverride(),
        this.initMiscNavigatorOverrides(),
        this.initSeededRandom(this.wb_info.wombat_sec),
        this.initCryptoRandom(),
        this.initFixedRatio(this.wb_info.pixel_ratio || 1),
        this.initDateOverride(this.wb_info.wombat_sec),
        this.initBlobOverride(),
        this.initWSOverride(),
        this.initOpenOverride(),
        this.initDisableNotificationsGeoLocation(),
        this.initStorageOverride(),
        this.initCachesOverride(),
        this.initIndexedDBOverride(),
        this.initWindowObjProxy(this.$wbwindow),
        this.initDocumentObjProxy(this.$wbwindow.document);
        var wombat = this;
        return {
            extract_orig: this.extractOriginalURL,
            rewrite_url: this.rewriteUrl,
            watch_elem: this.watchElem,
            init_new_window_wombat: this.initNewWindowWombat,
            init_paths: this.initPaths,
            local_init: function(name) {
                var res = wombat.$wbwindow._WB_wombat_obj_proxy[name];
                return name === "document" && res && !res._WB_wombat_obj_proxy ? wombat.initDocumentObjProxy(res) || res : res
            },
            showCSPViolations: function(yesNo) {
                wombat._addRemoveCSPViolationListener(yesNo)
            }
        }
    }
    ,
    window._WBWombat = Wombat,
    window._WBWombatInit = function(wbinfo) {
        if (!this._wb_wombat) {
            var wombat = new Wombat(this,wbinfo);
            this._wb_wombat = wombat.wombatInit()
        } else
            this._wb_wombat.init_paths(wbinfo)
    }
}
)();
