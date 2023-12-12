# Examples seen for fidelity check methodology

- iccvam.niehs.nih.gov_1
    - Same screenshot, same html and elements

- photojournal.jpl.nasa.gov_1
    - Same screenshot
    - Different html, two reasons
        1. ```<a>``` tag including ```<img>``` tag. ```<a>``` tag in archive has no dimension, sub-img has the same dimension
            a. Solution, since ```<a>``` is not clickable. Consider fidelity issue?
        2. For a list of links on the page, liveweb's html in the form of recursive tags: 
        ```
        <font>
            <a></a>
                <font>
                    <a></a>
                </font>
        </font>
        ```
        archive's html in the form of flat tags:
        ```
        <font></font>
        <a></a>
        <font></font>
        <a></a>
        ```

- www.baaqmd.gov_1 (solved)
    - Different screenshot (0.99)
    - Different htmls. Two things that can be fixed:
        1. Different order of a tag's attributes (e.g. "style=... aria-hidden=... vs aria-hidden=... style=...)
        2. Non style-affecting attributes: e.g. ls-is-cached
        - Solution to both: bind each tag with the xpath 
    - At the botton, there seems to be a recaptcha that breaks the fidelity.

- www.nist.gov_1 (solved)
    - Same screenshot
    - Different htmls: reason similar to www.baaqmd.gov_1
    - Different issue: I changed pywb's src code to replace the loading of "lazy" to "eager". Now switched back, not sure if it will cause any other issues (like the reverse case).

- ffb.treasury.gov_1
    - Different screenshot
    - Same htmls and dimensions:
        - However, two images in the archive got 503. But still pass the test because they still have tags with the same dimension.
        - Do we really consider it as a fidelity issue?
