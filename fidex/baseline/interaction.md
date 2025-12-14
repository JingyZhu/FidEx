- https://artandpractice.org/es/exhibitions/exhibition/deborah-roberts-im/#
  - One div with event handler always change its id on every load (search magellan)
  - If using absolute pass from root, div.more-info should be at nth-child(4) while it is actually 5 (unclear)

- https://www.eyedrum.org/calendar-events-performances-art-music/simone-baron-arco-belo-at-eyedrum
  - Seems not responding when trigger interaction for map div (search for aria-describedby)

### Inconsistent #event listeners between recording and replaying
##### Version 1 (Before listeners dedup on path & event were introduced)
- https://www.artbrussels.com/en/fair-programme/off-programme/artist-curator-run-spaces/
  - Inconsistent number of event listeners for record and replay
  - Record has the same element (a.skip-link) appears multiple times
  - Reason for that is extractJQueryEvents, where the selector for (ul#menu-1-b13c1c8) is too general "a" and the first selected element is picked.

- http://chicagoimagists.com/
  - Probably because triggering interactions changes the html
  - Recording time xpath is got one by one, while replay time xpath is refreshed all at the beginning

- https://www.lucindabunnen.com/bio.html
  - No such elements in the archived copy

- https://floatingmuseum.org/
  - extractJQueryEvents (similar to artbrussels)

- https://www.radioatelier.ca/tag/gueze/
  - Archive has even more events
  - Reason for more archive events is because extractJqueryEvents(document) with archive gives addition (2) results.

##### Version 2 (After listeners dedup as: {path: {events}})
- https://www.bonhams.com/specialists/5797/louis-krieger/
  - Whole div (class: onetrust-consent-sdk) not rendered in the archived copy (looks there is some exception)

- https://www.wallergallery.com/strength-in-practice
  - Random html id
  - No element can be captured since the whole html cannot be got

- https://www.natasharia.com/black-space-black-art
  - Random div id as well

- https://www.frontart.org/calendar/2020/12/27?type=
  - Archive has banner for first cookie policy, liveweb doesn't
  - **Calendar icon cannot be clicked on archived copy**

1. Finds (sceenshots)
  - Mainly looking for (URL, interaction) that makes screenshot simi suddenly drop
  - chicagoimagists.com_1
    - Interaction with button "where" and "why"
    - Unclear why "where" for archive only have a small screenshot (not make sense)
    - "why" for liveweb page either not tiggered, or screenshot comes in too fast to take a screenshot
  - www.bonhams.com_1
    - Archive has additional events triggered in between and remained on the page
    - All afterwards screenshots have some difference because of the event
  - www.emilycarrfoundationshow.ca_1
    - Login link: Archive still loading the popup when taking screenshot
    - **!!fidelity!!** Login popup for archive cannot be input with anything or esc
  - stovallworkshop.com_1
    - Seems to be screenshot issue
  - www.molokaiartscenter.org_1
    - Image carousel
  - www.yyzartistsoutlet.org_1
    - Check Sep schedule from Oct page
    - Live page screenshoted while loading, archive loaded
  - wyld.gallery_1
    - Right menu sidebar popup
    - Screenshot for liveweb page seem to be broken on the after-viewpoint node (while actual check didn't reveal it)
  - www.equinoxgallery.com_1
    - Click on an image to show in a bigger size
    - Archive has additional events, triggered event cancelled previous effect
  - **nbss.edu_1**
    - **!!fidelity!!** Link to different language version
    - Archive cannot be switched to other languages
  - www.visualartscentre.ca_1
    - Mobile page side menu popup
    - Screenshot causing the sidebar to move back in. Final image depends on timing
  - kansascityartistscoalition.org_1
    - Cookie setup popup causing screenshot difference
    - Live web first trigger event not in archive to popup, causing following screenshot difference
  - venezia-biennale-japan.jpf.go.jp_1
    - **!!fidelity!!**
    - Search button shows the location in Google Map
    - Archive cannot show the Map: "The Google Maps Embed API must be used in an iframe"
  - **macm.org_1**
    - **!!fidelity!!** All functionalities from accesibility cannot be accessed by archive

2. Finds (excep & ff)
  - **extra exceptions**
  - artandpractice.org_1
    - image
    - Replay cannot reproduce the exception (replay saw a timeout from recaptcha)
  - lesparadisdegranby.blogspot.com_1
    - Suspect to be an recaptcha timeout
  - macm.org_1
    - Search button (exception): Suspect to be async recaptcha timeout
  - nationalmuseumofmexicanart.org_1
    - Invisible button: Suspect to be async recaptcha timeout
  - www.natasharia.com_1
    - Image from under "current patner" (exception): Directly trigger the event gives no exception. Suspect async excep.

  - **extra failed fetches**
  - aupuni.space_1
    - 503
  - chicagoimagists.com_1
    - "index", archive requested for both image of "MaxwellStreet" and "maxwellstreet". Cause additional ff
    - "who" & "where", during loading, a lot of images are being preloaded. Recording didn't catch them all. Replay quickly gives 404. No fidelity effect on current loading page
    - "why" has many failed resources left from last interaction
  - lavacoalition.art_1
    - "following (not visible)". Additional 503 response
  - www.bonhams.com_1
    - "sign up": gtag GET 404. No affecting the appearance
  - www.elevateatlart.com_1
    - Previous (Go to another URL): 3 right top icons failed to be fetched
  - **www.natasharia.com_1**
    - Invisible interaction: 3 ff caused by aysnc failed req
    - **!!fidelity!!** Login: signin/signup part error to load
    - to be continued ...
  - www.primary-colours.ca_1
    - **!!fidelity** Archived copy can only load blurry version of the background.
    - Looks like async 503 request (not sure why there are multiple same 503 requests)
  - wyld.gallery_1
    - Down button: 404 on facebook customerchat, nothing to do with the event


3. Finds (difference in total #events)

  - **Archive has more listeners**
  - www.artbrussels.com_1
    - Cookie accept only on archive
  - www.aci-iac.ca_1
    - Popup signup form, only appears on first load

  - **Liveweb has more listeners**
  - majesticauction.ca_1
    - Some menu dropdown func. Trigger the event has no effect visually
  - nbss.edu_1
    - Trigger the event has no effect visually
  - nationalmuseumofmexicanart.org_1
    - Top div element. Trigger has no effect visually
  - canadianart.ca_1
    - No visual effect
  - sarahemerson.com_1
    - Gallery image. Archive doesn't load event handler until scrolled down
  - **www.frontart.org_1**
    - Cookie prompt differs on archive (first load) and live web (after first load)
    - **!!fidelity!!** "Menu" has no listeners on archive: click has no effect
    - **!!fidelity!!** "Calendar" icon cannot be clicked on archive
  - niadart.org_1
    - **!!fidelity!!** "Accessbility": event not on archive
    - Other button (only on liveweb) seems to have skipping func. But cannot find on the page
  - macm.org_1 (similar to niadart)
    - **!!fidelity!!** "Accessbility": event not on archive
    - Other button (only on liveweb) seems to have skipping func. But cannot find on the page
  - www.lucindabunnen.com_1
    - **!!fidelity!!** shopping cart only on liveweb
    - Other element either cannot be seen, or has no effect on triggering events
  - www.haystack-mtn.org_1
    - **!!fidelity!!** "Accessbility": event not on archive
    - ? Also archive page's style looks a differently
  - front.nfshost.com_1
    - No addition events on the liveweb page have any visual effects
    - (Rerun the event listeners iterator gives the same number of events for archive and liveweb page)
  
### Fidelity issues
  - www.frontart.org_1
    - Menu + Calendar
    - 1 additional exception, No additional ff, 1 additional exception
  - niadart.org_1
    - Accessibility
    - 0 exception, 6 ff
  - macm.org_1
    - Accessibility
    - -2 exceptions, 2 ff
  - www.lucindabunnen.com_1
    - Shopping cart
    - 1 exceptiion, 0 ff
  - www.haystack-mtn.org_1
    - Accessibility
    - 0 exception, 1 ff
  - nbss.edu_1
    - Language switching
    - Onload: 1 exception, 2 ff
    - Interaction: 0 exception, 0 ff
  - venezia-biennale-japan.jpf.go.jp_1
    - Map in search
    - Onload: 0 exception, -3 ff
    - Interaction: 0 exception, 0 ff
  - www.primary-colours.ca_1