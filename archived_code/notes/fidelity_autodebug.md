- eta.lbl.gov_1
    - > 1 (seen 5) differences in writes between live and archive 
      - img originally with place holder of src, then change to actual image URL.
      - Multile writes on attributes of the img and wrapping div class
      - No actual URL change detected (cannot be overriden of value assignments)
    - If manually found the correct writes, works.

- www.slideshare.net_1
    - 3 differences in writes, all about the same tag (and its fidelity issues)
    - The writes is originated from event handler from Document's "readystatechange". There is not such info about that event (stack only starts from the handler)
    - **Potential solution**: If there is exception, can set the breakpoint at the very beginning of the file and the end of the file. Check exception in between.
        - Note that Uncaught exception breakpoint won't be triggered in this example.   Not sure why
    - Another fidelity issue (login/signup link URL not changed in archive)
        - No visible writes. But difference in raw writes.
        - Reason: similar to nihmd case. jQuery fail to extract corresponding a tag in arcvhive.
        - Able to detect the diverging point (for loop within jquery's attr: http://localhost:8080/exec_match/20240124074839/https://public.slidesharecdn.com/v2/javascripts/packs/combined_jquery.80c0a4a8967fd21ab46c.js:15:33715) 

