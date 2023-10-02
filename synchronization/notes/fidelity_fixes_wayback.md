# Fidelity fix and on Wayback
Check for each archived copy with fidelity issue, what is the fix for the problem.
Check whether the same fidelity issue exists on Wayback, and if so, how can the fix to the webrecorder be applied to Wayback.

- nimhd.nih.gov_1
    - Replace ```$('img[src="/assets/img/exit-icon.png"]').parent('a').remove()``` with ```$('img[src="/eot/20230912213801im_/https://nimhd.nih.gov/assets/img/exit-icon.png"]').parent('a').remove()```
    - Works on archive
    - On Wayback, seen "www" in the hostname, so use regex instead
        - 2 exit-icon with "www" not in the html initially. Added by some JS.
        - ```\/web\/\d+im_\/https:\/\/(?:www\.)?nimhd\.nih\.gov\/assets\/img\/exit-icon\.png```
        - Also accessing attribute of the image returns the original path (/assets/...). So can also write 
        ```javascript
        regexPattern = /(?:\/web\/\d+im_\/https:\/\/(?:www\.)?nimhd\.nih\.gov)?\/assets\/img\/exit-icon\.png/
        $('img').filter(function() {
            return regexPattern.test($(this).attr('src'));
        })
        ```

- theftaz.azag.gov_1
    - Probably neet to rewrite some of the iframe/contentWindow logic in wombat.js