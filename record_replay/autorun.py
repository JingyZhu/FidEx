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
import requests
import sys
import re
import socket
import threading
import concurrent.futures
import time

_FILEDIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(_FILEDIR))
_CURDIR = os.getcwd()
from utils import upload, url_utils


REMOTE = True
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'
PROXYHOST = 'http://pistons.eecs.umich.edu:8079' if REMOTE else 'http://localhost:8079'
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
    return ts, url

def replay(url, archive_name,
           chrome_data=DEFAULT_CHROMEDATA,
           write_path=f'{_CURDIR}/writes',
           proxy=False,
           arguments=None):
    filename = 'proxy' if proxy else 'archive'
    check_call(['node', 'replay.js', '-d', f'{write_path}/{archive_name}', 
                '-f', filename,
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
                  proxy=False,
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
        proxy: If proxy mode will be replayed on
    """
    if arguments is None:
        arguments = DEFAULTARGS
    ts, record_url = record(url, archive_name, 
                chrome_data=chrome_data, 
                write_path=write_path, 
                download_path=download_path, 
                archive_path=archive_path, 
                wr_archive=wr_archive, 
                arguments=arguments)
    if ts is None:
        return '', record_url
    
    if download_path is None:
        download_path = f'{chrome_data}/Downloads'
    if not os.path.exists(f'{download_path}/{wr_archive}.warc'):
        return '', record_url
    check_call(['mv', f'{download_path}/{wr_archive}.warc', f'{download_path}/{archive_name}.warc'], cwd=_FILEDIR)
    if remote_host:
        upload.upload_warc(f'{download_path}/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'{download_path}/{archive_name}.warc'], cwd=archive_path)

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{record_url}"
    replay(archive_url, archive_name, 
            chrome_data=chrome_data,
            write_path=write_path, 
            arguments=arguments)
    
    if proxy:
        proxy_arguments = arguments + ['--proxy', PROXYHOST]
        replay(record_url, archive_name, 
                chrome_data=chrome_data,
                write_path=write_path, 
                proxy=True,
                arguments=proxy_arguments)
    if remote_host:
        upload.upload_write(f'{write_path}/{archive_name}', directory=pw_archive)

    return ts, record_url


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
                           proxy=False,
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
        archive_name = url_utils.calc_hostname(req_url)
        if archive_name in seen_dir:
            continue
        try:
            ts, record_url = record_replay(url, archive_name, 
                                    chrome_data=chrome_data,
                                    write_path=write_path, 
                                    download_path=download_path, 
                                    archive_path=archive_path,
                                    wr_archive=wr_archive, 
                                    pw_archive=pw_archive, 
                                    remote_host=remote_host, 
                                    proxy=proxy,
                                    arguments=arguments)
            if ts == '':
                continue
        except Exception as e:
            print(str(e))
            continue
        seen_dir.add(archive_name)
        metadata[url] = {
            'ts': ts,
            'url': record_url,
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
                                 proxy=False,
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
    random.shuffle(urls)
    active_ids = set()
    id_lock = threading.Lock()
    def _get_worker_task():
        with id_lock:
            for i in range(num_workers):
                if i not in active_ids:
                    active_ids.add(i)
                    url = urls.pop(0) if len(urls) > 0 else None
                    return i, url
        return None, None
    def record_replay_worker(url, 
                             metadata_file,
                             chrome_data,
                             worker_id,
                             write_path,
                             download_path,
                             wr_archive,
                             pw_archive, 
                             remote_host,
                             proxy,
                             arguments):
        if not os.path.exists(chrome_data):
            call(['cp', '-r', f'{chrome_data_dir}/base', chrome_data])
            time.sleep(worker_id*5)
        record_replay_all_urls([url], 
                               metadata_file,
                               chrome_data=chrome_data,
                               worker_id=worker_id,
                               write_path=write_path,
                               download_path=download_path,
                               wr_archive=wr_archive,
                               pw_archive=pw_archive, 
                               remote_host=remote_host,
                               proxy=proxy,
                               arguments=arguments)
        with id_lock:
            active_ids.remove(worker_id)
   
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        # Keep track of futures
        tasks = []
        while True:
            # Get worker id
            sleep_time = 1
            while True:
                worker_id, url = _get_worker_task()
                if worker_id is not None:
                    break
                else:
                    sleep_time = min(sleep_time * 2, 60)
                    time.sleep(sleep_time)
            if url:
                # Submit the worker thread to the pool
                task = executor.submit(record_replay_worker, 
                                        url=url,
                                        metadata_file=f'{metadata_prefix}_{worker_id}.json',
                                        chrome_data=f'{chrome_data_dir}/record_replay_{worker_id}',
                                        worker_id=worker_id,
                                        write_path=write_path,
                                        download_path=download_path,
                                        wr_archive=wr_archive,
                                        pw_archive=pw_archive,
                                        remote_host=remote_host,
                                        proxy=proxy,
                                        arguments=arguments)
                tasks.append(task)
            # Check for any completed threads
            for task in tasks:
                if task.done():
                    tasks.remove(task)
            # Exit the loop if all tasks are done
            if len(tasks) == 0 and len(active_ids) == 0:
                break

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
        archive_name = url_utils.calc_hostname(url)
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