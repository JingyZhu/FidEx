"""
    Auto run record_writes.js
"""
from subprocess import PIPE, check_call, Popen
import os
import json
from urllib.parse import urlsplit
import requests
import sys
import re

HOST = 'http://localhost:8080'
default_archive = 'eot'
metadata_file = 'eot_metadata.json'

def liveweb():
    urls = json.load(open('../datacollect/data/carta_urls_100.json', 'r'))
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
            dirname = hostname
            check_call(['node', 'log_writes.js', '-d', f'writes/{dirname}', 
                '-f', str(i), url], stdout=PIPE)

def record_replay(url, archive_name):
    p = Popen(['node', 'log_writes_record.js', '-d', f'writes/{archive_name}',
                '-f', 'live',
                '-a', default_archive, url], stdout=PIPE)
    ts = None
    while True:
        line = p.stdout.readline()
        if not line:
            break
        line = line.decode()
        if "recorded page" in line:
            info = re.sub(r'.*recorded page: ', '', line)
            info = json.loads(info)
            ts, url = info['ts'], info['url']
            break
    if ts is None:
        return '', url

    os.rename(f'downloads/{default_archive}.warc', f'downloads/{archive_name}.warc')
    check_call(['wb-manager', 'add', default_archive, 
                f'../synchronization/downloads/{archive_name}.warc'], cwd='../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{default_archive}/{ts}/{url}"
    check_call(['node', 'log_writes_replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'archive',
                archive_url])
    return ts, url


def record_replay_all_urls(data):
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    seen_dir = set([v['directory'] for v in metadata.values()])
    urls = json.load(open(data, 'r'))
    urls = [u['live_url'] for u in urls] # * For eot
    # urls = random.sample(urls, 100)

    for i, url in list(enumerate(urls)):
        print(i, url)
        sys.stdout.flush()
        try:
            req_url = requests.get(url, timeout=20).url # * In case of redirection, only focusing on getting new hostname
        except:
            continue
        us = urlsplit(req_url)
        hostname = us.netloc.split(':')[0]
        count = 1
        # while f"{hostname}_{count}" in seen_dir:
        #     count += 1
        if f"{hostname}_{count}" in seen_dir:
            continue
        archive_name = f"{hostname}_{count}"
        ts, url = record_replay(url, archive_name)
        seen_dir.add(archive_name)
        metadata[url] = {
            'ts': ts,
            'wayback': f'{HOST}/{default_archive}/{ts}/{url}',
            'directory': archive_name,
        }
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)


# liveweb()
# record_replay_all_urls('../datacollect/data/carta_urls_100.json')
# record_replay_all_urls('../datacollect/data/eot_good_100.json')

# * Test single URL
test_url = "https://leg.wa.gov/CodeReviser/Pages/default.aspx"
test_req_url = requests.get(test_url).url # * In case of redirection
print(test_req_url)
test_archive = "test"
ts, test_url = record_replay(test_url, test_archive)
print(f'{HOST}/{default_archive}/{ts}/{test_url}')

# http://localhost:8080/sync/20230402215501/https://williamkentfoundation.org/biography/attachment/william-kent-foundation-20/embed/
