#!/bin/bash

dir=www.nist.gov_1
url="http://web.archive.org/web/20230422131348/https://www.nist.gov/world-trade-center-investigation"

node log_writes_replay.js -d writes/$dir -f wayback -w $url