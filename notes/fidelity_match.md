- nimmd.nih.gov_1
    - TODO: Need to think more about how to have the initial pattern

- theftaz.azag.gov_1
    - Search for line ```a.rc.contentWindow.postMessage```, across synchronization crawls.
    - Matched for 10 archives.
        - All matches are on the same file, since all of the these crawls are on the same time.
        - Not all archives seem to cause fidelity issue.
            - www.aces.edu_1: Not having components for google translate
            - www.ddap.pa.gov_1 & www.penndot.pa.gov_1: Onload looks the same, problem happens at the time of clicking the button.
            - www.helpwithmycreditcard.gov_1: Have similar problem.
    - On liveweb today: seems re-minified to ```a.wc.contentWindow.postMessage```

- house.louisiana.gov_1
    - Detect by exception should work
    - TODO: How to achieve the detection of strict mode error statically?

- www.slideshare.net_1
    - Detect by exception should work
    - Search for line ```Re.lk.value.call(n.Av,"iframe")```. Fail to match any other archives
    - The original exception seems to be under a js file related to accessibility. So no fidelity issue on landing onloading (problem might happen after clicking)
    - Search for ```illegal invocation``` for exception on loading the page. Matched several other archives
        - www.faa.gov_1: No related issue
        - yes-abroad.org_1: Similar to www.slideshare.net_1, may related to accessibility
        - portal.arkansas.gov_1: Similar to www.slideshare.net_1, may related to accessibility

- sewp.nasa.gov_1
    - Search for ```var today = new Date()``` will match another file. But it is not related to the same error.

- globe.gov_1
    - Search for line ```n.domain!==document.domain&&(n.domain=document.domain)```. Matched 48 files.
    - TODO: Dig deeper

- eta.lbl.gov_1
    - Search for line ```!document.documentElement.isSameNode(documentElement)```. Fail to match any other archives
