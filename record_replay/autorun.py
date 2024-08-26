"""
    Auto run record.js and replay.js
    If run on remote host with large scale, need to make sure that:
        - Crawls (warc) are uploaded and "wb-manager added" to the remote server
        - Screenshots are uploaded to the remote server
        - Writes are uploaded to the remote server
    If run with local host, need to make sure that:
        - This script is run with pywb venv on.
"""
from subprocess import PIPE, check_call, Popen, call
import random
import os
import json
from urllib.parse import urlsplit
import requests
import sys
import re
import socket
import hashlib
from threading import Thread

_FILEDIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(_FILEDIR))
_CURDIR = os.getcwd()
from utils import upload, url_utils


REMOTE = True
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'
HOME = os.path.expanduser("~")
default_archive = 'test'
DEFAULTARGS = ['-w', '-s', '--scroll']

def _get_hostname():
    return socket.gethostname()
DEFAULT_CHROMEDATA = f'{HOME}/chrome_data/{_get_hostname()}'


def record(url, archive_name,
           chrome_data=DEFAULT_CHROMEDATA,
           write_path=f'{_CURDIR}/writes',
           download_path=None,
           archive_path='./',
           wr_archive=default_archive, 
           arguments=None):
    if download_path is not None:
        arguments = arguments + ['--download', download_path]
    p = Popen(['node', 'record.js', '-d', f'{write_path}/{archive_name}',
                '-f', 'live',
                '-a', wr_archive,
                '-c', chrome_data,
                *arguments,
                url], stdout=PIPE, cwd=_FILEDIR)
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
    return ts

def replay(url, archive_name,
           chrome_data=DEFAULT_CHROMEDATA,
           write_path=f'{_CURDIR}/writes',
           arguments=None):
    check_call(['node', 'replay.js', '-d', f'{write_path}/{archive_name}', 
                '-f', 'archive',
                '-c', chrome_data,
                *arguments,
                url], cwd=_FILEDIR)
    

def record_replay(url, archive_name,
                  chrome_data=DEFAULT_CHROMEDATA,
                  write_path=f'{_CURDIR}/writes',
                  download_path=None,
                  archive_path='./',
                  wr_archive=default_archive, 
                  pw_archive=default_archive,
                  remote_host=REMOTE,
                  arguments=None):
    """
    Args:
        url: URL to record and replay
        archive_name: Name of the archive to be saved
        write_path: Path to save the writes (-w for record.js and replay.js)
        download_path: Path to save the downloads (-d for record.js and replay.js)
        archive_path: Path where the archive will be saved (where wb-manager and wayback is run)
        wr_archive: Name of the archive to save & export on webrecorder
        pw_archive: Name of the archive to import for warc on pywb
        remote_host: True if run on remote host, False if run on local host
    """
    if arguments is None:
        arguments = DEFAULTARGS
    ts = record(url, archive_name, 
                chrome_data=chrome_data, 
                write_path=write_path, 
                download_path=download_path, 
                archive_path=archive_path, 
                wr_archive=wr_archive, 
                arguments=arguments)
    if ts is None:
        return '', url
    
    if download_path is None:
        download_path = f'{chrome_data}/Downloads'
    check_call(['mv', f'{download_path}/{wr_archive}.warc', f'{download_path}/{archive_name}.warc'], cwd=_FILEDIR)
    if remote_host:
        upload.upload_warc(f'{download_path}/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'{download_path}/{archive_name}.warc'], cwd=archive_path)

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    replay(archive_url, archive_name, 
            chrome_data=chrome_data,
            write_path=write_path, 
            arguments=arguments)
    if remote_host:
        upload.upload_write(f'{write_path}/{archive_name}', directory=pw_archive)

    return ts, url


def record_replay_all_urls(urls,
                           metadata_file,
                           chrome_data=DEFAULT_CHROMEDATA,
                           worker_id=None,
                           write_path=f'{_CURDIR}/writes',
                           download_path=None,
                           archive_path='./',
                           wr_archive=default_archive,
                           pw_archive=default_archive, 
                           remote_host=REMOTE,
                           arguments=None):
    if arguments is None:
        arguments = DEFAULTARGS
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    seen_dir = set([v['directory'] for v in metadata.values()])

    for i, url in list(enumerate(urls)):
        print(i, url) if worker_id is None else print(worker_id, i, url)
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
        ts, url = record_replay(url, archive_name, 
                                chrome_data=chrome_data,
                                write_path=write_path, 
                                download_path=download_path, 
                                archive_path=archive_path,
                                wr_archive=wr_archive, 
                                pw_archive=pw_archive, 
                                remote_host=remote_host, 
                                arguments=arguments)
        if ts == '':
            continue
        seen_dir.add(archive_name)
        metadata[url] = {
            'ts': ts,
            'archive': f'{HOST}/{pw_archive}/{ts}/{url}',
            'directory': archive_name,
        }
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)

def record_replay_all_urls_multi(urls, num_workers=8,
                                 chrome_data_dir=DEFAULT_CHROMEDATA,
                                 metadata_prefix='metadata/metadata',
                                 write_path=f'{_CURDIR}/writes',
                                 download_path=None,
                                 wr_archive=default_archive,
                                 pw_archive=default_archive,
                                 remote_host=REMOTE,
                                 arguments=None):
    """
    The  multi-threaded version of record_replay_all_urls
    Need to make sure that the chrome_data_dir is set up with base, since the workers will copy from base
    Base need to have the webrecorder extension installed. Adblock is optional but recommended.
    """
    if arguments is None:
        arguments = DEFAULTARGS
    for i in range(num_workers):
        call(['rm', '-rf', f'{chrome_data_dir}/record_replay_{i}'])
        call(['cp', '-r', f'{chrome_data_dir}/base', f'{chrome_data_dir}/record_replay_{i}'])
    threads = []
    random.shuffle(urls)
    for i in range(num_workers):
        urls_worker = urls[i::num_workers]
        chrome_data = f'{chrome_data_dir}/record_replay_{i}'
        t = Thread(target=record_replay_all_urls, args=(urls_worker, f'{metadata_prefix}_{i}.json'),
                    kwargs={'worker_id': i, 
                            'chrome_data': chrome_data,
                            'write_path': write_path,
                            'download_path': download_path, 
                            'wr_archive': wr_archive, 
                            'pw_archive': pw_archive, 
                            'remote_host': remote_host, 
                            'arguments': arguments})
        threads.append(t)
        t.start()
    for t in threads:
        t.join()
    # Merge metadata files
    if os.path.exists(f'{metadata_prefix}.json'):
        metadata = json.load(open(f'{metadata_prefix}.json', 'r'))
    else:
        metadata = {}
    for i in range(num_workers):
        metadata_worker = json.load(open(f'{metadata_prefix}_{i}.json', 'r'))
        metadata.update(metadata_worker)
    json.dump(metadata, open(f'{metadata_prefix}.json', 'w+'), indent=2)



# ! Below deprecated for now
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
                wayback_url], cwd=_FILEDIR)
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