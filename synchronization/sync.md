## Live and archive have different writes

- www.bonhams.com_1
    - insert HTML src different between live and archive (relative vs. absolute)
        - Even src is handled, there is srcset
    - Attributes seem to be coming in different order, causing string failed to match

- alllightexpanded.com_1
    - insertBefore has many element inserted, not in the same order (First arg with "<div class=\"markup\">Mondzain, Marie-José.")

- niadart.org_1
    - Unclear div appended only for live (first diff causing max_prefix)
    - Same args but data-ruffle-polyfilled attribute only for live
    - Accessibility not inserted in archive

- wyld.gallery_1
    - Google recaptcha generates random URLs everytime

- www.visualartscentre.ca_1
    - Insert HTML src different between live and archive (relative vs. absolute)