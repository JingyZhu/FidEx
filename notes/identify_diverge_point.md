# www.slideshare.net_1
- Liveweb has additional elements
- Archive encounters an exception
- None of the point on liveweb's stack for writing can be triggered on archive
    - Archive triggers the exception on first eval of the script

# nimhd.nih.gov_1
- Archive has additional elements
- Archive misses effective removeChild

# www.nato.int_1
- Seems fail to track the whole window.postMessage on the stack (across iframes)
- **Reason**
    - Chrome devtool debugger is not able to track ```window.postMessage``` across cross-orgin iframes. Because there are multiple threads, one for each iframe.
    - Here the "cross-orgin" iframe should be really "cross-origin" (e.g. localhost:8080 and localhost:8081 will be run on the same thread.)

# dra.gov_1
- Liveweb has additional swiper pagination
- Liveweb has different (normal) swiper style
- Only one diff final_writes: reflects the addtional swiper pagination
    - the setInnerHTML stack does include the news-carousel.js, which triggers the exception

# www.sewp.nasa.gov_1
- Liveweb has additional link on the banner
- Link is added by Document.writeln
    - Not overriden by the current program.