"""
    Control the whole recording process. 
    live_recording: Manage running live_recording.js, rename warc, and insert into wb collections
    check_replay: crawl replay pageinfo. Note: pywb should be running

    Before recording: 
    1) making sure that the collection 
    has already been created on the target browser extension
    2) Start wayback on the ../collection folder
"""
from subprocess import Popen, PIPE, check_call
import os
import json
from urllib.parse import urlsplit
import random
import requests
import sys

HOST = 'http://localhost:8080'
default_archive = 'carta'
metadata_file = 'carta_metadata.json'

def record_replay(url, archive_name):
    p = Popen(['node', 'live_recording.js', '-d', f'pageinfo/{archive_name}', '-f', 'live_dimension',
                #  '-i, 
                 '-a', default_archive, url], stdout=PIPE)
    ts = None
    while True:
        line = p.stdout.readline()
        if not line:
            break
        line = line.decode()
        if "recording page ts" in line:
            ts = line.split(': ')[1]
            break
    if ts is None:
        return ''

    os.rename(f'downloads/{default_archive}.warc', f'downloads/{archive_name}.warc')
    check_call(['wb-manager', 'add', default_archive, 
                f'../recording/downloads/{archive_name}.warc'], cwd='../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{default_archive}/{ts}/{url}"
    # os.makedirs(f'pageinfo/{archive_name}_archive')
    check_call(['cp', f'pageinfo/{archive_name}/exception_failfetch.json', f'pageinfo/{archive_name}/exception_failfetch_record.json'])
    check_call(['node', 'check_replay.js', '-d', f'pageinfo/{archive_name}', '-f', 'archive_dimension',
                #  '-i', 
                 archive_url])
    return ts


def record_replay_all_urls(data):
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    seen_dir = set([v['directory'] for v in metadata.values()])
    urls = json.load(open(data, 'r'))
    # urls = random.sample(urls, 100)

    for i, url in list(enumerate(urls)):
        print(i, url)
        sys.stdout.flush()
        try:
            url = requests.get(url).url # * In case of redirection
        except:
            continue
        us = urlsplit(url)
        hostname = us.netloc.split(':')[0]
        count = 1
        while f"{hostname}_{count}" in seen_dir:
            count += 1
        archive_name = f"{hostname}_{count}"
        ts = record_replay(url, archive_name)
        seen_dir.add(archive_name)
        metadata[url] = {
            'ts': ts,
            'wayback': f'{HOST}/{default_archive}/{ts}/{url}',
            'directory': archive_name,
        }
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)


# record_replay_all_urls('../datacollect/data/carta_urls_100.json')

# # * Test single URL
test_url = "https://williamkentfoundation.org/biography/attachment/william-kent-foundation-20/embed/"
test_url = requests.get(test_url).url # * In case of redirection
print(test_url)
test_archive = "test"
ts = record_replay(test_url, test_archive)
print(f'{HOST}/{default_archive}/{ts}/{test_url}')

# * Test difference between multiple replay
# archive_url = "http://localhost:8080/carta/20221216065733/https://stovallworkshop.com/"
# archive_name = 'stovallworkshop.com'
# replay_multiple(archive_url, archive_name, 10)

# metadata = json.load(open('sampled_metadata.json', 'r'))
# for m in metadata:
#     archive_url = m['wayback']
#     archive_name = m['directory'].split('_')[0]
#     replay_multiple(archive_url, archive_name, 10)