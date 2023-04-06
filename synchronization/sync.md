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