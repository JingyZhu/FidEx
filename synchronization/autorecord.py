"""
    Auto run record_writes.js
"""
from subprocess import PIPE, check_call, Popen
import os
import json
from urllib.parse import urlsplit
import requests
import sys

HOST = 'http://localhost:8080'
default_archive = 'sync'
metadata_file = 'sync_metadata.json'

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
        if "recording page ts" in line:
            ts = line.split(': ')[1]
            break
    if ts is None:
        return ''

    os.rename(f'downloads/{default_archive}.warc', f'downloads/{archive_name}.warc')
    check_call(['wb-manager', 'add', default_archive, 
                f'../synchronization/downloads/{archive_name}.warc'], cwd='../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{default_archive}/{ts}/{url}"
    check_call(['node', 'log_writes_replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'archive',
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


# liveweb()
# record_replay_all_urls('../datacollect/data/carta_urls_100.json')

# * Test single URL
test_url = "https://croatianpavilion2022.com/irma-omerzo/"
test_url = requests.get(test_url).url # * In case of redirection
print(test_url)
test_archive = "test"
ts = record_replay(test_url, test_archive)
print(f'{HOST}/{default_archive}/{ts}/{test_url}')

# http://localhost:8080/sync/20230402215501/https://williamkentfoundation.org/biography/attachment/william-kent-foundation-20/embed/
