#!/bin/bash

dir=www.republican.senate.gov_1
url="http://web.archive.org/web/20230423112735/https://www.republican.senate.gov/"

node log_writes_replay.js -d writes/$dir -f wayback -w $url -m