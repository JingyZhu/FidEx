## Carta
#### False negative (network failed fetches == 0 but fidelity problem)
##### 1. Fidelity issues cause by runtime, not network failed fetches (3 cases)
##### 2. CSR (1 case)
- bookproject2020.blogspot.com_1
  - Background image not loaded on archived copy
  - Background is blocked because of CSR

- www.lucindabunnen.com_1
  - Archive missing shopping icon on the top right
  - No failed network fetches, but there is an exception
  - One exception occurred. But in the place of an iframe seemed not related to shopping icon

- www.richardfung.ca_1
  - The sidebar is unrolled in Archive
  - No additional network failed fatches
  - Three exceptions (may) be the reason for loss of fidelity

- www.frontart.org_1
  - Viewed number not shown on the Archive
  - No additional network failed fetches
  - 1 additional exception: Uncaught SyntaxError: Unexpected eval or arguments in strict mode

#### False positive (network failed fetches > 0 but no fidelity problem)
### ??? Screenshot FN May exists --> www.wallergallery.com_1
##### 1. Endless list of random (tracking) requests (6 cases)
##### 2. Recording behavior (1 case prefetch)
##### 3. Rewriting Error (1 case appending data:app to URL, 1 case missing token for session)
##### 4. 503 during migration (3 cases)
##### 5. Blocked over recording, 404 over replay (4 cases)
##### 6. Stateful sites (not within page, across site) (2 cases for locale setup)

- paulwongprojects.com_1
  - Fetched a new resource:proxy.html never fetched by recording, within iframe from some js from vimeo

- chicagoimagists.com_1
  - Two FB's auth and subscribe link

- www.bonhams.com_1
  - 1 URL request is a starting GET for token of pinging
  - 1 URL request is super long URL (414). Seems to have JS(as data:application) encoded into the URL. (https://www.bonhams.com/specialists/5797/louis-krieger/data:application/javascript,!function(e)%7Bfunction%20t...)

- www.eyedrum.org_1
  - Map in the archive is shown randomly

- materiajournal.com_1
  - Two URLs are prefetched HTMLs. Not indexed by archive. 404 on replay.

- www.wallergallery.com_1
  - 2 images gives 503 ("Original for revisit record could not be loaded")
  - Without warc transfer seems to work

- www.billreidgallery.ca_1
  - Session URL 404. (Missing token parameter in the URL)

- www.forestcitygallery.com_1
 - Random URL for cartwidget popup

- www.haystack-mtn.org_1
  - A resource is only fetched when user first loads the site (locales/en-US.json)
  - Replay uses localhost, while recording might see the site multiple times

- canadianart.ca_1
  - 3 tracking URLs: 2 session related fetches (assumed to be random). 1 analytics (confirmed to be random, **Random in the hostname**)

- vault.jeancharlot.org_1
  - Blocked over recording (HTTPS to HTTP), 404 over replay

- www.equinoxgallery.com_1
  - 1 stylesheet gives 503 ("Original for revisit record could not be loaded")

- niadart.org_1
  - A resource is only fetched when user first loads the site (locales/en-US.json)
  - Replay uses localhost, while recording might see the site multiple times

- nbss.edu_1
  - 1 image gives 503 ("Original for revisit record could not be loaded")

- nationalmuseumofmexicanart.org_1
  - Random URL from recaptcha

- www.beatnation.org_1
  - Blocked over recording (HTTPS to HTTP), 404 over replay, favicon

- macm.org_1
  - 1 Random recaptcha
  - 1 locales
  - 1 Fetched a new resource:proxy.html never fetched by recording, within iframe from some js from vimeo

- front.nfshost.com_1
  - ? (Didn't seen recorded 404ed image)

- lesparadisdegranby.blogspot.com_1
  - 1 recaptcha

- sarahemerson.com_1
  - ? (Didn't seen recorded 404ed image)

- www.gkb-furniture.com_1
  - On image 404 go to both raw /{date}/{URL} and /{data}im_/{URL}

- www.firstvisionart.com_1
  - Blocked over recording, 404 over replay (favicon)

- www.artsatl.org_1
  - Blocked over recording, 404 over replay (js)

#### False negative (exception == 0 but fidelity issue)
##### 1. No exception in not fidelity page
- www.artbrussels.com_1
  - No exception seen

- bookproject2020.blogspot.com_1
  - No exception seen (CSR is not exception)

- www.molokaiartscenter.org_1
  - Captcha not fetched. No exception

- www.elevateatlart.com_1
  - No exception seen

- www.stablearts.org_1
  - No exception seen

....

#### False positive (exception > 0 but no fidelity issue)
##### 1. Exception related code (functionality) has nothing to do with the fidelity, at this state (14 cases)
##### 2. Cross origin violation
- floatingmuseum.org_1
  - 4 exceptions seems all about following framework
  - Cannot read property of undefined 

- pavilionrus.com_1
  - Didn't see more exception

- www.lifeofacraphead.com_1
  - 1 exception in like related functionality (in facebook)
  - closeURI is not defined

- www.bonhams.com_1
  - 1 exception for cookie functionality
  - Unhandled Promise Rejection: Cannot read properties of undefined

- lavacoalition.art_1
  - 4 exceptions seems all about following framework
  - Cannot read property of undefined 

- www.billreidgallery.ca_1
  - 2 exceptions caused by "cross-origin" 
  - Unclear what the script is about

- stovallworkshop.com_1
  - 4 exceptions seems all about following framework
  - Cannot read property of undefined

- www.haystack-mtn.org_1
  - 1 session related exception
  - 1 unclear exception (userway.org-->widget_app...js Uncaught TypeError: i.__WB_pmw is not a function)

- aupuni.space_1
  - 4 exceptions seems all about following framework
  - Cannot read property of undefined

- majesticauction.ca_1
  - 1 cookie related exception
  - 1 exception on service worker

- niadart.org_1
  - 1 exception about banners (wp simple banner plugin)
  - 1 unclear exception (userway.org-->widget_app...js Uncaught TypeError: i.__WB_pmw is not a function)

- nbss.edu_1
  - 1 exception on share service (eval error)

- venezia-biennale-japan.jpf.go.jp_1
  - GoogleMap API exception (No map on the page)

- macm.org_1
  - 3 unclear exception (userway.org-->widget_app...js Uncaught TypeError: i.__WB_pmw is not a function)

- grunt.ca_1
  - Didn't see more exception

- fredtruck.com_1
  - Service worker exception
  - Cookie related exception

- sarahemerson.com_1
  - Service worker exception
  - Cookie related exception

- www.artsatl.org_1
  - 1 exception in like related functionality
  - 1 exception in share related functionality
  - closeURI is not defined