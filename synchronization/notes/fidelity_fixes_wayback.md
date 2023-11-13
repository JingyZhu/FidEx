# Fidelity fix and on Wayback
Check for each archived copy with fidelity issue, what is the fix for the problem.
Check whether the same fidelity issue exists on Wayback, and if so, how can the fix to the webrecorder be applied to Wayback.

- nimhd.nih.gov_1
    - Replace ```$('img[src="/assets/img/exit-icon.png"]').parent('a').remove()``` with ```$('img[src="/eot/20230912213801im_/https://nimhd.nih.gov/assets/img/exit-icon.png"]').parent('a').remove()```
    - Works on archive
    - On Wayback (rencently), seen "www" in the hostname, so use regex instead
        - 2 exit-icon with "www" not in the html initially. Added by some JS.
        - ```\/web\/\d+im_\/https:\/\/(?:www\.)?nimhd\.nih\.gov\/assets\/img\/exit-icon\.png```
        - Also accessing attribute of the image returns the original path (/assets/...). So can also write 
        ```javascript
        regexPattern = /(?:\/web\/\d+im_\/https:\/\/(?:www\.)?nimhd\.nih\.gov)?\/assets\/img\/exit-icon\.png/
        $('img').filter(function() {
            return regexPattern.test($(this).attr('src'));
        })
        ```
    - Wayback doesn't record the same functionality for removing exit-icon in 2017, but recorded the same functionality earliest seen in 2022
    - **Sytematic way fixing**
        - Redo rewriting for that line?

- theftaz.azag.gov_1
    - Probably need to rewrite some of the iframe/contentWindow logic in wombat.js
    - Currently, three steps to fix the fidelity issue
        - 1. Remove **2** __WB_pmw(self) from iframe.contentWindow.postMessage in el_main (one in string argument).
        - 2. Disable CSP headers from pywb (to avoid triggering CSP violation in document.body.append(script) to SupportedLanguages)
             - **This will result in the fetch to actual site instead of archive, so need someway to actually change back to archive**
             - Alternative: just change the URL of fetch to archive. Add ```b.src=\\"http://localhost:8080/eot/20230912223236/\\"+b.src;```  at ```fn('[null, null,]...')```
        - 3. Remove __WB_pmv(self) at reg replace in Wombat.prototype.wrapScriptTextJsProxy from wombat.js
    - On Wayback
        - theftaz.azag.gov has much more archives wit the same functionality
        - Old page design till 2011
        - New page design works on the archive initially (till ~2018)
            - Since the page fetches language information, which triggers the code of display="", in the main frame. No problem
        - 2020 archives starts to have the same/similar behavior to today's pages. 
    - **Sytematic way fixing**
        - Undo rewriting of iframe.contentWindow.__WB_pmw
        - Then undo replacement correspondingly within wombat.js
        - SupportedLanguage is fetched through liveweb, *maybe write the line the iframe text again? (can be hard)*


- house.louisiana.gov_1
    - Remove ```let arguments;``` in shoelace.js (since it cannot be used under strict mode)
    - Remove all the brackets around imports. Since static import cannot be done conditionally.
    - On Wayback
        - Old design till the end of 2022
    - **Sytematic way fixing**
        - Syntax error --> Undo rewriting the whole js file.


- www.dsireusa.org_1
    - Since google.visualization.arrayToDataTable is not defined when used in script.min.js. One solution is just to load (all) the scripts early by injecting them into the HTML
        ```html
            <script type='text/javascript' src='https://www.gstatic.com/charts/51/js/jsapi_compiled_default_module.js' id='jsapi-default-js'></script>
            <script type='text/javascript' src='https://www.gstatic.com/charts/51/js/jsapi_compiled_graphics_module.js' id='jsapi-graphics-js'></script>
            <script type='text/javascript' src='https://www.gstatic.com/charts/51/js/jsapi_compiled_ui_module.js' id='jsapi-ui-js'></script>
            <script type='text/javascript' src='https://www.gstatic.com/charts/51/js/jsapi_compiled_geo_module.js' id='jsapi-geo-js'></script>
            <script type='text/javascript' src='https://www.gstatic.com/charts/51/js/jsapi_compiled_geochart_module.js' id='jsapi-geochart-js'></script>
        ```
    - An alternative is just to keep waiting in script.min.js until the variable is ready
        ```javascript
        // Making sure to let the outside function also be async.
        async function waitForReady() {
            return new Promise((resolve, reject) => {
            function check() {
                if (typeof google !== 'undefined' 
                    && google.visualization 
                    && google.visualization.arrayToDataTable
                    && google.visualization.GeoChart) {
                    resolve();
                } else {
                    setTimeout(check, 50); // check every 50ms
                }
            }
            check();
            });
        }
        await waitForReady();
        ```
    - On Wayback
        - Old design till 2014
        - Current design seems to working most of the time on Wayback. However, do see at least one not working sometime (20230901093615)

- uieservices.mt.gov_1
    - Unclear of how to fix it. But potential ways could be
        - Eliminate non-determinism (e.g. DRP APIs return the same values as recording)
        - Whenever requesting the resource with non-deterministic paths, return the most similar resources. 

- dra.gov_1
    - Remove all wrappers added by wombat for "news-carousel.js" and "equalizer.js"
    - On Wayback
        - The same fix works for latest archive
        - The carousel component only exists since 2023
    - **Sytematic way fixing**
        - Syntax error --> Undo rewriting the whole js file.

- www.slideshare.net_1
    - Add a space between "$" and "extends 
        ```class $extends V``` --> ```class $ extends V``` (there are two of it in osano.js)
    - **Sytematic way fixing**
        - Undo overriding/proxifying the class Window and Document
        - More specifically, in ```osano.js```, replace ```n.Av``` within call as ```originalDocument```, which is the original document.
            - Some more illegal invocation errors will occur later, but currently don't see any fidelity issue from there.

- www.sewp.nasa.gov_1
    - Remove ```var``` from ```var today = new Date()``` in s5.js
    - On Wayback
        - The same behavior seen first on 2021-Feb
    - **Sytematic way fixing**
        - Syntax error --> Undo rewriting for (at least) the function
            - Move the last if block outside of the scope.

- www.osmre.gov_1
    - Remove the CSP header in pywb src code.
    - On Wayback
        - The same behavior seen at least from 2022-Feb

- globe.gov_1
    - Make sure that the ```n.domain``` is the same as ```document.domain``` or the assignment is not executed.
    - **Sytematic way fixing**
        - Redo proxy for n (not the main document but an iframe, so need to check which function to use in wombat)
        - Note that even current issue is fixed, the fidelity issue won't be fixed since getting map resources returns a 404 (non-determinism)

- eta.lbl.gov_1
    - **Sytematic way fixing**
        - Undo overriding/proxifying the class Window and Document. (Similar to the approach in slideshare)