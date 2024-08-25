"""
    Auto run record.js and replay.js
    If run on remote host with large scale, need to make sure that:
        - Crawls (warc) are uploaded and "wb-manager added" to the group server
        - Screenshots are uploaded to the group server
        - Writes are uploaded to the group server
    If run with local host, need to make sure that:
        - The file is run with pywb venv on.
"""
from subprocess import PIPE, check_call, Popen, call
import os
import json
from urllib.parse import urlsplit, urlunsplit
import requests
import sys
import re
import hashlib
import socket
import time
import random
from threading import Thread

sys.path.append('../../')
from utils import upload

REMOTE = True
HOME = os.path.expanduser("~")
MACHINE = socket.gethostname()
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'
PROXY = 'http://pistons.eecs.umich.edu:8079'
# Make sure that pw archive is created on the pywb server
default_pw_archive = 'gt_tranco'
default_wr_archive = 'test'
metadata_prefix = 'gt_tranco_metadata'
arguments = ['-w', '-s', '--scroll', '-i']

def record_replay(url, archive_name, chrome_data=f'{HOME}/chrome_data/{MACHINE}',
                  wr_archive=default_wr_archive, 
                  pw_archive=default_pw_archive,
                  remote_host=REMOTE):
    """
    Args:
        url: URL to record and replay
        archive_name: Name of the archive to be saved
        wr_archive: Name of the archive to save & export on webrecorder
        pw_archive: Name of the archive to import for warc on pywb
        remote_host: True if run on remote host, False if run on local host
    """
    # Remove url fragments
    url = urlunsplit(urlsplit(url)._replace(fragment=''))
    suffix = chrome_data.strip('/').split('/')[-1]
    p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                '-f', 'live',
                '-a', wr_archive,
                '-c', chrome_data,
                *arguments,
                url], stdout=PIPE)
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
    p.wait()

    os.rename(f'downloads_{suffix}/{wr_archive}.warc', f'downloads_{suffix}/{archive_name}.warc')
    if remote_host:
        upload.upload_warc(f'downloads_{suffix}/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'../record_replay/downloads/{archive_name}.warc'], cwd='../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    # Check if the archive_url has been uploaded
    try:
        r = requests.get(archive_url, timeout=10)
        if r.status_code != 200:
            return '', url
    except:
        return '', url
    check_call(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'archive',
                '-c', chrome_data,
                *arguments,
                archive_url])

    # * Put proxy mode run here for now
    call(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'proxy',
                '-c', chrome_data,
                '--proxy', PROXY,
                *arguments,
                url])

    if remote_host:
        upload.upload_write(f'writes/{archive_name}', directory=pw_archive)

    return ts, url


def record_replay_all_urls(urls, worker_id=0, chrome_data=f'{HOME}/chrome_data/{MACHINE}',
                           wr_archive=default_wr_archive,
                           pw_archive=default_pw_archive, remote_host=REMOTE):
    # sys.stdout = open(f'logs/autorecord_{worker_id}.log', 'w')
    # sys.stderr = sys.stdout
    metadata_file = f'metadata/{metadata_prefix}.json'
    metadata_worker_file = f'metadata/{metadata_prefix}_{worker_id}.json'
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    if not os.path.exists(metadata_worker_file):
        json.dump({}, open(metadata_worker_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    metadata_worker = json.load(open(metadata_worker_file, 'r'))
    start = time.time()
    for i, url in list(enumerate(urls)):
        print(worker_id, i, url)
        if url in metadata or url.replace('http://', 'https://') in metadata:
            continue
        sys.stdout.flush()
        retry, success= 0, False
        while retry < 5:
            try:
                req_url = requests.get(url, timeout=20).url # * In case of redirection, only focusing on getting new hostname
                success = True
                break
            except Exception as e:
                if 'Temporary failure in name resolution' in str(e):
                    print("Temporary failure in name resolution, retrying", worker_id, url)
                    retry += 1
                    time.sleep(2 ** retry)
                    continue
                else:
                    print("Exception encountered on requests", worker_id, str(e))
                    break
        if not success:
            continue
        if req_url in metadata:
            continue
        us = urlsplit(req_url)
        hostname = us.netloc.split(':')[0]
        url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
        archive_name = f"{hostname}_{url_hash}"
        ts, url = record_replay(url, archive_name, chrome_data,
                                wr_archive, pw_archive, remote_host=remote_host)
        if ts == '':
            continue
        metadata_worker[url] = {
            'ts': ts,
            'archive': f'{HOST}/{pw_archive}/{ts}/{url}',
            'directory': archive_name,
        }
        print('Till Now:', time.time()-start)
        json.dump(metadata_worker, open(metadata_worker_file, 'w+'), indent=2)


def record_replay_all_urls_multi(urls, num_workers=8,
                                 wr_archive=default_wr_archive,
                                 pw_archive=default_pw_archive, remote_host=REMOTE):
    for i in range(num_workers):
        call(['rm', '-rf', f'{HOME}/chrome_data/record_replay_{i}'])
        call(['cp', '-r', f'{HOME}/chrome_data/base', f'{HOME}/chrome_data/record_replay_{i}'])
    threads = []
    random.shuffle(urls)
    for i in range(num_workers):
        urls_worker = urls[i::num_workers]
        chrome_data = f'{HOME}/chrome_data/record_replay_{i}'
        t = Thread(target=record_replay_all_urls, args=(urls_worker, i, chrome_data, wr_archive, pw_archive, remote_host))
        threads.append(t)
        t.start()
    for t in threads:
        t.join()
    # Merge metadata files
    if os.path.exists(f'metadata/{metadata_prefix}.json'):
        metadata = json.load(open(f'metadata/{metadata_prefix}.json', 'r'))
    else:
        metadata = {}
    for i in range(num_workers):
        metadata_worker = json.load(open(f'metadata/{metadata_prefix}_{i}.json', 'r'))
        metadata.update(metadata_worker)
    json.dump(metadata, open(f'metadata/{metadata_prefix}.json', 'w+'), indent=2)

if __name__ == '__main__':
    data = json.load(open('determinism_results/determinism_results.json', 'r'))
    urls = [d['url'] for d in data if d['deterministic']]
    urls = urls[:min(200, len(urls))]
    print("Total URLs:", len(urls))
    urls = ["https://www.camara.leg.br/"]
    record_replay_all_urls_multi(urls, 1)