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