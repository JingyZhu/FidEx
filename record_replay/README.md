# Code for running record and replay on the browser with webrecorder and pywb
## Requirements
- ```pywb``` installed and run (assumed on port 8080, but can be changed)
- ```puppeteer``` installed, with the controled browser installed webrecorder extension

## Workflow
- Record the page with webrecorder (```record.js```)
- Download the warc file from webrecorder, and import it into pywb (```autorecord.py```)
- Replay the page with pywb (```replay.py```)


## Record phase
1. Open webrecorder extension page on Chrome and start recording.
    - Choose an archive(**need to be already created!**)
    - Create a new recording by clicking the recording button.
2. Load a dummy page (```localhost:8086```). 
    - The reason to load the dummy page is to inject the overriding script before loading the actual page (step 3).
3. Inject the overriding script.
    - Currently, the injected script (```node_writes_override.js``` and ```node_writes_collect.js```) aim on overriding the writes to the DOM so that they can be collected after the pageload.
    - Note that there can also be a tampermonkey script plugged in to do the same thing. So might need to disable it.
4. Load the actual page.
5. Wait for the page to be loaded. Two ways to do this:
    - Automatically: wait for the event of ```networkIdle``` (or 30s max)
    - Manually: Controlled by the user. Specified with ```--manual, -m``` flag.
6. (Optional) Trigger interaction
    - Not fully tested. Run with ````--interaction, -i``` flag.
7. (Optional) Collect the writes to the DOM
8. (Optional) Collect the screenshots and all other measurement for checking fidelity
    - Currently, the measurement will collect the self-built layout tree, and the failed network fetches and exceptions (```exceptionFF```)
9. Download the recorded warc file
10. (Optional) Remove the recording from webrecorder
    - If the crawl is large, we need to remove given the limit space of VM.


## Replay phase
1. Inject the overriding script.
2. Load the page.
3. (Optional) If replaying on Wayback, need to remove the banner for fidelity consistency
4. Wait for the page to be loaded.
5. (Optional) Trigger interaction
6. (Optional) Collect the writes to the DOM
7. (Optional) Collect the screenshots and all other measurement for checking fidelity

## Notebooks
- ```test_fidelity_additional_writes.ipynb```: Experimental code for checking whether the additional writes can directly indicate fidelity issues.