# Fidelity and reason
    - Cross origin access between iframes
    - Rewrite cause query fails to work
    - Strict mode violation
## EOT
- www.uspto.gov_1

- nimhd.nih.gov_1
    - Archive adds "external link" icon to disclaimer link
    - **Reason**
        - Both liveweb and archive will add a disclaimer link for URL not in gov and is not image (function.js->blankLinks)
        - However, liveweb remove the link when the page is onload by JQuerying with certain src and remove them.
        - Since archive's images' sources are rewritten, the JQuerying will not remove the link

- www.ddap.pa.gov_1
    - Google translate banner

- theftaz.azag.gov_1
    - Translation
        - **Reason** Archive's translation has a `style="display: none;"`, while live has display: "" (empty string)
        - For set display: "", there needs to be a supportedLanguange resource fetched, which is not in the archive.
        - The reason it is not in the archive is because the resource is fetched under an iframe, which is **Blocked** by the archive's CSP. Closest in el_conf (search for e.o = b ? function(h), or g(m))
            - **Update**: Search style.display in el_main. Probably the first one. By the time searched it is: a.style.display = b ? "" : "none"
        - The exception is also handled silently
            - Exception: `DOMException: Blocked a frame with origin "http://localhost:8080" from accessing a cross-origin frame.
                at Kp (http://localhost:8080/eot/20230423230501js_/https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/exm=el_conf/ed=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_main:249:1279)
                at http://localhost:8080/eot/20230423230501js_/https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/exm=el_conf/ed=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_main:249:1022
                at e.o (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:100:443)
                at ye (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:104:198)
                at te (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:104:88)
                at _.F.G (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:103:178)
                at je (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:98:1376)`
        - **GOT REASON**: Wombat or pywb rewrite iframe.contentWindow.postMessage to iframe.contentWindow.__WB_pmv(self).postMessage, which cause the problem (search for "a.rc.contentWindow.__WB_pmw(self)")
        - **TODO**: It is currently unable to detect writes to styles, need to add this functionality (now able to override a single instance of style with all listed properties.)

- www.airforce.com_1
    - Live has cookie banner
    - Eval on js related to cookie throws error (TypeError: Cannot read properties of undefined (reading 'DomainData')

- house.louisiana.gov_1
    - Live and Archive have different style, causing different dimension
    - **Reason**
        - Syntax Error: Unexpected eval or arguments in strict mode (at shoelace.js:13:5)
    
- www.dsireusa.org_1 ??
    - Archive page misses policy map for US
    - **Reason**
        - Uncaught ReferenceError: google is not defined scripts.min.js
        - google.visualization.arrayToDataTable is not defined
        - In archive:
            - jsapi_compiled_default_module.js loaded after scripts.min.js is called
            - Suspect to be caused by rewrite

- www.slideshare.net_1
    - Liveweb has privacy policy notification
    - **Reason**
        - Unught TypeError: Illegal invocation at osano.js
        - qt.lk.value.call(Z.Av, "iframe"), this not matching with method
            - qt.lk.value: document.createElement
            - Z.Av: Proxy(HTMLDocument)
        - Essentially: Proxy(Window).Document() != Proxy(HTMLDocument)
    
- www.republican.senate.gov_1
    - Youtube error behavior difference between record and replay
    - Similar to www.ncdoj.gov_1

- leg.wa.gov_1
    - Google Translate

- uieservices.mt.gov_1
    - Archive has blank page
    - **Reason**
        - Random request returns 404
        - Ignore query match causes infinite requesting loop
            - This is because requesting URL has the same non query part as the home page, which is an HTML (actual resource should be json) and cause the parsing error (/_/?Load=....)

- www.fmcs.gov_1
    - Archive doesn't have twitter timeline
    - **Reason**
        - iframe added when DOMContentLoaded fired (in widgets.js)
        - **No longer right** ~~ProxyDocument seems don't work on addEventListener (no events found)~~
        - Even if it works, seems like DOMContentLoaded fired before addEventListener is called
            - Suspect this to be called by script async property

- www.nato.int_1
    - Archive not have images in the slider down below the top view of the page
    - First difference between archive and live is that images within the slider are not fetched by archive
    - The diverging point between the execution of archive and live is at 
        - ```m.__WB_pmw(self).postMessage(n, l)``` under ```ttps://apis.google.com/_/scs/abc-static/_/js/k=gapi.lb.en.IoxrLNdlTyI.O/m=googleapis_proxy ...```
        - After ```postMessage``` is called, no handler is invoked, and there is a warning from ```wombat.js``` saying: "```Skipping message event to https://www.nato.int doesn't start with origin https://content.googleapis.com```
        - On latest WebRecorder, there is **no such problem**. Suspect the issue is caused by **Wombat.js** and is already solved.

- edis.usitc.gov_1
    - Missing import notification banner message
    - Reason: post request to ```https://edis.usitc.gov/external/util/unescape``` returns 503 in the archive
        - Post request works in **WebRecorder**

- www.sandiego.gov_1
    - No background image (also for webrecorder)

- mvp.sos.ga.gov_1
    - Archive has blank page
    - Webrecorder has banner and footer, but other parts empty
    - **Reason (unable to reproduce in the new version)**
        - illegal invocation of parentNode on Proxy(Document)
        - ParentNode from Node.prototype, which is not proxied
        - parentN = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode'), parentN.get.call(Proxy(Document)) will cause the error
    - **Updated Reason**
        - Hard to track what exactly happened. The main div was not added to the page. Which due to an silently handled exception at: ```catch (d) {
                    (c || d instanceof $A.Wf)``` at ```aura_prod.js```
        - The exception text is: ```Failed to initialize a component [Unexpected identifier '_postMessage']```