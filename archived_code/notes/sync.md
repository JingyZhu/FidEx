# Render tree
## Pages with different render tree
### HTML format (after filtration) (No longer important)
- chicagoimagists.com_1
    - Archive has additional section of "loading"
    - (Sol: Sync changes?)

- canadianart.ca_1
    - javascript code inlined into a href attr
    - Rewritten by wombat
    - (Sol: Dimension match)

- paulwongprojects.com_1
    - Live has additional "data-ruffle-polyfilled" attribute

- alllightexpanded.com_1
    - Video has poster attribute, which has relative link for live and absolute for archive

- nationalmuseumofmexicanart.org_1
    - Recaptcha

- www.gkb-furniture.com_1
    - Seems to be style's attr order not correct
    - (Sol: reorder or dimension match)

- niadart.org_1
    - Missin components

- wyld.gallery_1
    - Image carousels
        - Move by changing class & transition
        - Dimension for a certain image could move out of the viewport

### HTML + dimension
#### Summarize
    - Fidelity issues
    - Recaptcha
    - Carousel
        - Only shown images has dimension
        - Images moved from left to right

#### Carta
- www.richardfung.ca_1
    - Do have some fidelity issue: (Left side bar expanded vs. collapsed)

- venicebiennale.britishcouncil.org_1
    - Cookie section only on Live

- eriac.org_1
    - Recaptcha

- fredtruck.com_1
    - Do have some fidelity issue: (PDF not shown)

- tttheartist.com_1
    - Image carousel needs to be clicked to scroll
    - Archive 503 on 2 images. Not difference onload, but difference after clicking
    - Total div of carousel different in width (archive smaller)

- www.haystack-mtn.org_1 ??

- ignasiaballi.net_1
    - Non-identical tag + slightly different dimension

- www.lucindabunnen.com_1
    - Do have some fidelity issue: (Shopping cart icon & autoplay)
    - Autoplay seems to be because ruffle (flash player) inserted when recording the page by webrecorder

- www.artsatl.org_1
    - Do have some fidelity issue: (Twitter & Facebook share button)
    - Not captured (totally) by screenshot because it is missing caturing it (empty screenshot for that part)

- nbss.edu_1
    - a2a (Add to any) button with different xpath between live and archive
    - Rerun solve the problem

- www.frontart.org_1
    - Missing view numbers

- www.stablearts.org_1
    - Do have some fidelity issue: (Background image broken on archive)

- nationalmuseumofmexicanart.org_1
    - Liveweb page has additional transparent div

- www.eyedrum.org_1
    - Do have some fidelity issue: (Map)

- www.ktaylor.net_1
    - Do have some fidelity issue: (Image carousel image broken after clicks)

#### eot
- www.ndtourism.com_1
    - Same (branch of) element appear at different order
    - Current diff dectection consider as dels + adds

- oklahoma.gov_1
    - Image carousel different state
    - Carousel achieved by setting active image with dimension while others 0*0
    - Live has addition translation banner

- las.doa.virginia.gov_1
    - Liveweb has additional Virginia banner

- www.usgs.gov_1
    - Archive has an iframe with dimension 1*1
    - Live has the same iframe with dimension 0*0

- twitter.com_4
    - iframe for google account login has no dimension in archive
    - Because 404 within iframe
    - However, the button is outside of iframe, so the look is the same

- reportline.doa.virginia.gov_1
    - Liveweb has additional Virginia banner

- www.uspto.gov_1
    - Liveweb has "Trademark" button set as active, while archive has not (fidelity?)

- www.accessidaho.org_1
    - Archive's iframe for "help" out of the viewport

- www.ddap.pa.gov_1
    - Translation banner

- herc.research.va.gov_1
    - Live has twitter timeline, in archive it is replaced by a link

- bhc.ca.gov_1
    - Translation banner

- www.isbinvestment.com_1
    - Archive missing "bill" for "$23.2"

- gov.idaho.gov_1
    - Recaptcha

- www.accessidaho.org_1
    - Should give a random quote everytime
    - On archive, always gives the same quote. Random seed is the timestamp of the archive 

- www.collegedrinkingprevention.gov_1
    - Carousel: Rerun solved the problem

- **www.fsgb.gov_1**
    - Archive keeps have loading without actually loaded
    - Non-deterministic request get 404, use fuzzy matching seem to solve the problem


### Network different
#### Summarize
    - Missing component
    - Record and replay have inconsistencies of image complete, causing one currentSrc not finished
    - 503

#### Carta
- www.yyzartistsoutlet.org_1
    - Different random URL requests
    - Both 200 (suspect pywb has some matching rule)

- www.natasharia.com_1
    - Random iframe URL

- williamkentfoundation.org_1
    - Different resolution of image with srcset
    - Fidelity issue?

#### EOT
- www.ndtourism.com_1
    - Recorder progressively fetch images in different resolution
    - Replay serve in another resolution (with different URL)
    - Caused by behavior.js from brosertrix

- oklahoma.gov_1
    - Recorder progressively fetch images in different resolution
    - Replay serve in another resolution (with different URL)
    - Caused by behavior.js from brosertrix

- las.doa.virginia.gov_1
    - Liveweb has additional Virginia banner

- www.usgs.gov_1
    - 503

- twitter.com_4
    - 404 with iframe link

- reportline.doa.virginia.gov_1
    - Liveweb has additional Virginia banner

- nimhd.nih.gov_1
    - 503 + additional component

- www.accessidaho.org_1
    - 503

- www.ddap.pa.gov_1
    - Missing component

- herc.research.va.gov_1
    - Missing component

- bhc.ca.gov_1
    - Missing component

- flickr.com_2
    - Liveweb always has images loading=eager
    - Archive has loading=lazy for newly added images 

## Render tree vs. Screenshots
### Render tree uniquely deciding False
#### Summarize: Main reasons
    - Addtional component with dimensions doesn't necessarily contribute to the look

#### EOT
- twitter.com_4
    - iframe only in live doesn't affect the look

- www.ddap.pa.gov_1
    - Translation banner

- flickr.com_2
    - Preloading

- roc.az.gov_1
    - Dimension slightly different

- www.archives.gov_1
    - Collapsed a tag for archive

### Screenshot uniquely deciding False
#### Summarize: Main reasons
    - Screenshot issue with liveweb + Pixel difference
    - Carousel + Animation
    - Broken Image (503)
    - Minor: iframe access (solved), Canvas

- Examples
    - www.molokaiartscenter.org_1
        - Image carousel
        - Recaptcha URL not found in archive, but not detected by HTML

    - www.primary-colours.ca_1
        - Blur background + Random background layout

    - momus.ca_1
        - 1 Broken image + Screenshot issue with liveweb

    - www.natasharia.com_1
        - Screnshot issue with liveweb

    - venezia-biennale-japan.jpf.go.jp_1
        - Pixel difference

    - bookproject2020.blogspot.com_1
        - Broken background
        - (Seems missing one section for archive)

    - publicknowledge.sfmoma.org_1
        - Carousel

    - artandpractice.org_1
        - Recaptcha + Unplayable virtual tour
        - iframe currently not able to iterate children (cross domain access)

    - www.artbrussels.com_1
        - Pixel difference

    - paulwongprojects.com_1
        - Screnshot issue with liveweb

    - nbss.edu_1
        - Screnshot issue with liveweb

    - whippersnapper.ca_1
        - Animation

    - floatingmuseum.org_1
        - Image carousel

    - pmvabf.org_1
        - Animation + Broken image

    - candlewoodartsfestival.org_1
        - Broken image + Autoplay

    - 2022.vbexhibitions.hk_1 !!
        - Canvas causing Animation difference

    - williamkentfoundation.org_1
        - Pixel difference

    - pavilionofkosovo.com_1
        - Scrolling text

    - www.wallergallery.com_1
        - Broken image

    - www.masonfineartandevents.com_1
        - Broken image

    - www.visualartscentre.ca_1
        - Pixel difference

    - www.radioatelier.ca_1
        - Pixel difference

    - www.monicareyesgallery.com_1
        - Sceeenshot issue with liveweb
    
    - www.bta.ms.gov_1
        - Screeshot issue with liveweb
    
    - niccs.cisa.gov_1
        - Screeshot issue with liveweb
    
    - gao.az.gov_1
        - Carousel
    
    - www.ca1.uscourts.gov_1
        - Animation
    
    - earth.gsfc.nasa.gov_1
        - Pixel difference
    
    - www.philadelphiafed.org_1
        - Screeshot issue with liveweb
    
    - www.hsgac.senate.gov_1
        - Render difference
    
    - hiosh.ehawaii.gov_1
        -Render difference

    - **www.dir.ca.gov_1** (Bug)