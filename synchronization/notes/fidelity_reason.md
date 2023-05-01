# Fidelity and reason
## EOT
theftaz.azag.gov_1
    - Translation
        - **Reason** Archive's translation has a `style="display: none;"`, while live has display: "" (empty string)
        - For set display: "", there needs to be a supportedLanguange resource fetched, which is not in the archive.
        - The reason it is not in the archive is because the resource is fetched under an iframe, which is **Blocked** by the archive's CSP. Closest in el_conf (search for e.o = b ? function(h), or g(m))
        - The exception is also handled silently
            - Exception: `DOMException: Blocked a frame with origin "http://localhost:8080" from accessing a cross-origin frame.
                at Kp (http://localhost:8080/eot/20230423230501js_/https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/exm=el_conf/ed=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_main:249:1279)
                at http://localhost:8080/eot/20230423230501js_/https://translate.googleapis.com/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/exm=el_conf/ed=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_main:249:1022
                at e.o (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:100:443)
                at ye (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:104:198)
                at te (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:104:88)
                at _.F.G (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:103:178)
                at je (/_/translate_http/_/js/k=translate_http.tr.en_US.Arp_I7oRyqY.O/d=1/rs=AN8SPfpqBaYOsqrB9xy0BJYbZ1X0cAGdiw/m=el_conf:98:1376)`
        - **GOT REASON**: Wombat or pywb rewrite iframe.contentWindow.postMessage to iframe.contentWindow.__WB_pmv(self).postMessage, which cause the problem