# Render tree
## Pages with different render tree
### HTML format (after filtration)
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
- www.usgs.gov_1
    - Archive has an iframe with dimension 1*1
    - Live has the same iframe with dimension 0*0

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


### Network different unique (html not different)
- www.yyzartistsoutlet.org_1
    - Different random URL requests
    - Both 200 (suspect pywb has some matching rule)

- www.natasharia.com_1
    - Random iframe URL

- williamkentfoundation.org_1
    - Different resolution of image with srcset
    - Fidelity issue?

- oklahoma.gov_1
    - Recorder progressively fetch images in different resolution
    - Replay serve in another resolution (with different URL)
    - Caused by behavior.js from brosertrix


# Writes
## Live and archive have different writes

- www.bonhams.com_1
    - insert HTML src different between live and archive (relative vs. absolute)
        - Even src is handled, there is srcset
        - srcset ignored so far
        - src in noscript are represented as string. Currently cannot change to absolute path
    - Attributes seem to be coming in different order, causing string failed to match

- alllightexpanded.com_1
    - insertBefore has many element inserted, not in the same order (First arg with "<div class=\"markup\">Mondzain, Marie-José.")

- niadart.org_1
    - Unclear div appended only for live (first diff causing max_prefix)
    - Same args but data-ruffle-polyfilled attribute only for live
        - Seems there is some later wrtie to eliminate this attribute on live
    - Accessibility not inserted in archive

- nationalmuseumofmexicanart.org_1
    - No accessibility

- wyld.gallery_1
    - Google recaptcha generates random URLs everytime (last 2 writes)


## Prefix methods and Screenshots methods have different writes
#### Only screenshot says it is different
- latvianpavilion.lv_1 (screenshot wrong)
    - Background pixel rendering difference

- momus.ca_1 (both have wrong)
    - Screenshot: live misses images
    - Predix: Some broken images

- pavilionofkosovo.com_1 (screenshots wrong)
    - Rolling text (animation)

- www.visualartscentre.ca_1 (screenshots wrong)
    - Pixel rendering difference

- williamkentfoundation.org_1 (screenshots wrong)
    - Pixel rendering difference

- www.stablearts.org_1 (prefix wrong)
    - Background image missing

- fredtruck.com_1 (prefix wrong)
    - PDF file shown in another iframe is not in archive

- www.wallergallery.com_1 (prefix wrong)
    - Image missing

- venezia-biennale-japan.jpf.go.jp_1 (screenshots wrong)
    - Pixel rendering difference

- www.natasharia.com_1 (screenshots wrong)
    - Live misses images

## How to compare archive vs. live
### Is it okay to directly record the "render tree" at a single point?
### To answer this question, need to figure out two things
- For pages with different #writes, why are they different?
- For pages with same #writes but not identical, how to match on nodes that are with different HTML texts?

#### Different number of writes (live vs. archive)
- venicebiennale.britishcouncil.org_1 (Actual difference)
    - Cookie section only on live cause more writes

- eriac.org_1 (Actual difference)
    - Recaptcha only on live cause more writes

- fredtruck.com_1 (Actual difference)
    - Archive pdf not shown

- www.haystack-mtn.org_1 (??)
    - Additional archive write is due to setAttr of xlink:href
    - Two pages' style look difference. Potentially because of no style in archive's write

- www.lucindabunnen.com_1 (Actual difference)
    - Archive miss shopping cart icon

- www.artsatl.org_1 (Actual difference)
    - Archive has twitter share link, where Live twitter share link was replaced and becomes a button (in iframe). That's why archive has 1 less write

- nbss.edu_1 (??)
    - Unclear no dimensional element being recorded as writes

- www.frontart.org_1 (Actual difference + Screenshot FN?)
    - Live has live viewed number, causing more writes
    - Not detected by screenshot since the number is covered by another identical layer

- hsead.org_1 (??)
    - Unclear live added span under a tag

- lavacoalition.art_1 (Idempotent op)
    - Archive had a bunch of extra setting HTML and removing child

- www.gallery.ca_1 (Idempoent op)
    - Archive extra writes: SetAttr and remove