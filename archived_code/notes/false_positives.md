# False positives
## EOT (solved)
- www.lagunapueblo-nsn.gov_1
    - Cookie solved by no query matching

- www.ushmm.org_1
    - Very small dimension difference, solved with 99% filtration

## EOT
- www.aces.edu_1
    - timerbar keeps increasing (changing dimension) overtime

- radiate.fnal.gov_1 ??
    - Carousel
        - Seems to be implemented by listing all images in the first div (with dimension, but visibility:hidden)
        - When switching image, deletes all nodes relate to it and add whole new set of nodes

- www.tn.gov_1
    - Liveweb has an 1*1 ad pixel
    - Blocked on archive, passed on liveweb (resource itself is a 1*1 pixel)

- www.peacecorps.gov_1
    - FALSE POSITIVES: Multiple same tag, causing element match to fail

- dbc.ca.gov_1
    - Carousel:
        - Implemented by moving images left and right
        - However, fading the current active image by changing opacity