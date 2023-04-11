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