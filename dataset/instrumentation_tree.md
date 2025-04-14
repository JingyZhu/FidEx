Contains instrumentation data for each load, typically looks like follows:
```
├── archive_0_dom.json
├── archive_0.jpg
├── archive_dom.json
├── archive_done
├── archive_events.json
├── archive_exception_failfetch.json
├── archive.jpg
├── archive_requestStacks.json
├── archive_writes.json
├── archive_writeStacks.json
├── live_0_dom.json
├── live_0.jpg
├── live_dom.json
├── live_done
├── live_events.json
├── live_exception_failfetch.json
├── live.jpg
├── live_requestStacks.json
├── live_writes.json
├── live_writeStacks.json
├── metadata.json
├── proxy_0_dom.json
├── proxy_0.jpg
├── proxy_dom.json
├── proxy_done
├── proxy_events.json
├── proxy_exception_failfetch.json
├── proxy.jpg
├── proxy_requestStacks.json
├── proxy_writes.json
└── proxy_writeStacks.json
```
  - **Prefixes**:
    - `live`: Data collected while loading live web pages.
    - `proxy`: Data collected while loading with pywb's Proxy Mode (not rewritten).
    - `archive`: Data collected while loading with pywb's Archive Mode (rewritten).
  - **Suffixes**:
    - `{N}_dom.json`: Layout tree collected after triggering the Nth interaction (initial load if no N).
    - `{N}.jpg`: Screenshot taken after triggering the Nth interaction.
    - `events.json`: Interactions offered by the page (in the same order as the previous files).
    - `exception_failfetch.json`: Uncaught exceptions and failed fetches.
    - `requestStacks.json`: Stack traces for each initiated request.
    - `writes.json`: JavaScript writes performed to the DOM and CSSOM.
    - `writeStacks.json`: Stack traces for each write operation.