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