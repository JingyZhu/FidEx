"""
    Auto run record.js and replay.js
    If run on remote host with large scale, need to make sure that:
        - Crawls (warc) are uploaded and "wb-manager added" to the remote server
        - Screenshots are uploaded to the remote server
        - Writes are uploaded to the remote server
    If run with local host, need to make sure that:
        - This script is run with pywb venv on.
"""
from subprocess import PIPE, check_call, Popen
import os
import json
from urllib.parse import urlsplit
import requests
import sys
import re
import hashlib

_cur_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(_cur_dir))
from utils import upload, url_utils


REMOTE = True
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'
default_archive = 'archive'
metadata_file = 'archive_metadata.json'
arguments = ['-w', '-s', '--scroll']

def record_replay(url, archive_name,
                  write_path='writes',
                  download_path='downloads',
                  archive_path='./',
                  wr_archive=default_archive, 
                  pw_archive=default_archive,
                  remote_host=REMOTE):
    """
    Args:
        url: URL to record and replay
        archive_name: Name of the archive to be saved
        wr_archive: Name of the archive to save & export on webrecorder
        pw_archive: Name of the archive to import for warc on pywb
        remote_host: True if run on remote host, False if run on local host
    """
    p = Popen(['node', 'record.js', '-d', f'{write_path}/{archive_name}',
                '-f', 'live',
                '-a', wr_archive, 
                '--download', download_path,
                *arguments,
                url], stdout=PIPE, cwd=_cur_dir)
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
    
    check_call(['mv', f'{download_path}/{wr_archive}.warc', f'{download_path}/{archive_name}.warc'], cwd=_cur_dir)
    if remote_host:
        upload.upload_warc(f'{download_path}/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'{download_path}/{archive_name}.warc'], cwd=archive_path)

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    check_call(['node', 'replay.js', '-d', f'{write_path}/{archive_name}', 
                '-f', 'archive',
                *arguments,
                archive_url], cwd=_cur_dir)
    if remote_host:
        upload.upload_write(f'{write_path}/{archive_name}', directory=pw_archive)

    return ts, url


def record_replay_all_urls(data,
                           write_path='writes',
                           download_path='downloads',
                           archive_path='./',
                           wr_archive=default_archive,
                           pw_archive=default_archive, remote_host=REMOTE):
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    seen_dir = set([v['directory'] for v in metadata.values()])
    urls = json.load(open(data, 'r'))
    urls = [u['live_url'] for u in urls]

    for i, url in list(enumerate(urls)):
        print(i, url)
        if url in metadata or url.replace('http://', 'https://') in metadata:
            continue
        sys.stdout.flush()
        try:
            req_url = requests.get(url, timeout=20).url # * In case of redirection, only focusing on getting new hostname
        except:
            continue
        if req_url in metadata:
            continue
        us = urlsplit(req_url)
        hostname = us.netloc.split(':')[0]
        url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
        if f"{hostname}_{url_hash}" in seen_dir:
            continue
        archive_name = f"{hostname}_{url_hash}"
        ts, url = record_replay(url, archive_name, write_path, download_path, archive_path,
                                wr_archive, pw_archive, remote_host=remote_host)
        if ts == '':
            continue
        seen_dir.add(archive_name)
        metadata[url] = {
            'ts': ts,
            'archive': f'{HOST}/{pw_archive}/{ts}/{url}',
            'directory': archive_name,
        }
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)


def replay_all_wayback():
    metadata = json.load(open(metadata_file, 'r'))
    urls = [u for u in metadata]

    for i, url in list(enumerate(urls)):
        print(i, url)
        sys.stdout.flush()
        # Query wayback CDX to get the latest archive
        try:
            r = requests.get('http://archive.org/wayback/available', params={'url': url, 'timestamp': metadata[url]['ts']})
            r = r.json()
            wayback_url = r['archived_snapshots']['closest']['url']
        except Exception as e:
            print(str(e))
            continue
        us = urlsplit(url)
        hostname = us.netloc.split(':')[0]
        url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
        archive_name = f"{hostname}_{url_hash}"
        check_call(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'wayback', '-w',
                wayback_url], cwd=_cur_dir)
        metadata[url]['wayback'] = wayback_url
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)

def test_single_url():
    # * Test single URL
    test_url = "https://www.google.com"
    test_req_url = requests.get(test_url).url # * In case of redirection
    test_archive = url_utils.calc_hostname(test_req_url)
    print(test_req_url, test_archive)
    wr_archive = 'test'
    pw_archive = 'test'
    ts, test_url = record_replay(test_url, test_archive, 
                                wr_archive=wr_archive, pw_archive=pw_archive)
    print(f'{HOST}/{pw_archive}/{ts}/{test_url}')