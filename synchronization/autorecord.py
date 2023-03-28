"""
    Auto run record_writes.js
"""
from subprocess import  PIPE, check_call
import os
import json
from urllib.parse import urlsplit
import requests
import sys

def run():
    urls = json.load(open('test_urls.json', 'r'))
    for i in range(5):
        for url in urls:
            print(i, url)
            sys.stdout.flush()
            try:
                url = requests.get(url).url # * In case of redirection
            except:
                continue
            us = urlsplit(url)
            hostname = us.netloc.split(':')[0]
            dirname = hostname.replace('.', '_')
            check_call(['node', 'record_writes.js', '-d', f'writes/{dirname}', 
                '-f', str(i), url], stdout=PIPE)

run()