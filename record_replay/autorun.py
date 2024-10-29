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
from urllib.parse import urlsplit, urlunsplit
import random
import os
import json
import sys
import re
import socket
import threading
import concurrent.futures
import time
import logging

_FILEDIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(_FILEDIR))
_CURDIR = os.getcwd()
from fidex.utils import upload, url_utils, logger
from fidex.config import CONFIG

REMOTE = False
HOST = f'http://{CONFIG.host}'
PROXYHOST = f'http://{CONFIG.host_proxy}'
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
           filename=None, 
           arguments=None):
    filename = 'live' if filename is None else filename
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
           filename=None,
           arguments=None):
    if filename is None:
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
                  sshclient=None,
                  proxy=False,
                  archive=True,
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
        proxy (bool | str): True if run with proxy, False if run with archive, str if run with specific proxy
        archive (bool | str): True if run with archive, False if not run with archive, str if run with specific archive
    """
    if arguments is None:
        arguments = DEFAULTARGS
    temp_client = False
    client = None
    if remote_host:
        if sshclient is None:
            temp_client = True
        client = upload.SSHClientManager()
    else:
        client = upload.LocalUploadManager()

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
    client.upload_warc(f'{download_path}/{archive_name}.warc', pw_archive, directory=pw_archive)

    ts = ts.strip()
    if archive:
        AHOST = archive if isinstance(archive, str) else HOST
        archive_url = f"{AHOST}/{pw_archive}/{ts}/{record_url}"
        replay(archive_url, archive_name, 
                chrome_data=chrome_data,
                write_path=write_path, 
                arguments=arguments)
    
    if proxy:
        PHOST = proxy if isinstance(proxy, str) else PROXYHOST
        proxy_arguments = arguments + ['--proxy', PHOST]
        replay(record_url, archive_name, 
                chrome_data=chrome_data,
                write_path=write_path, 
                proxy=True,
                arguments=proxy_arguments)
    
    # The metadata will also be merged and dump together later. Here just leave a copy at the directory
    if os.path.exists(f'{write_path}/{archive_name}'):
        json.dump({
            'ts': ts,
            'url': record_url,
            'req_url': url,
            'archive_url': f'{HOST}/{pw_archive}/{ts}/{record_url}',
            'directory': archive_name,
            'proxy_host': PHOST if proxy else None,
            'archive_host': AHOST if archive else None,
        }, open(f'{write_path}/{archive_name}/metadata.json', 'w+'), indent=2)
    
    client.upload_write(f'{write_path}/{archive_name}', directory=pw_archive)
    if temp_client:
        sshclient.close()
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
                           archive=True,
                           arguments=None):
    if arguments is None:
        arguments = DEFAULTARGS
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    seen_dir = set([v['directory'] for v in metadata.values()])

    for i, url in list(enumerate(urls)):
        logging.info(f"Start {i} {url}") if worker_id is None else logging.info(f"Start {worker_id} {i} {url}")
        if url in metadata or url.replace('http://', 'https://') in metadata:
            continue
        try:
            req_url = url_utils.request_live_url(url)
        except:
            continue
        if req_url in metadata:
            continue
        archive_name = url_utils.calc_hostname(req_url)
        if archive_name in seen_dir:
            continue
        try:
            ts, record_url = record_replay(req_url, archive_name, 
                                    chrome_data=chrome_data,
                                    write_path=write_path, 
                                    download_path=download_path, 
                                    archive_path=archive_path,
                                    wr_archive=wr_archive, 
                                    pw_archive=pw_archive, 
                                    remote_host=remote_host, 
                                    proxy=proxy,
                                    archive=archive,
                                    arguments=arguments)
            logging.info(f"Finished {url} {ts}")
            if ts == '':
                continue
        except Exception as e:
            logging.error(f"Issue when record_replay URL {url}: {str(e)}")
            continue
        seen_dir.add(archive_name)
        metadata[url] = {
            'ts': ts,
            'url': record_url,
            'req_url': req_url,
            'archive': f'{HOST}/{pw_archive}/{ts}/{record_url}',
            'directory': archive_name,
        }
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)

def record_replay_all_urls_multi(urls, num_workers=8,
                                 chrome_data_dir=os.path.dirname(DEFAULT_CHROMEDATA),
                                 metadata_prefix='metadata/metadata',
                                 write_path=f'{_CURDIR}/writes',
                                 download_path=None,
                                 wr_archive=default_archive,
                                 pw_archive=default_archive,
                                 remote_host=REMOTE,
                                 proxy=False,
                                 archive=True,
                                 arguments=None):
    """
    The  multi-threaded version of record_replay_all_urls
    Need to make sure that the chrome_data_dir is set up with base, since the workers will copy from base
    Base need to have the webrecorder extension installed. Adblock is optional but recommended.
    """
    if arguments is None:
        arguments = DEFAULTARGS
    for i in range(num_workers):
        call(['rm', '-rf', f'{chrome_data_dir}/record_replay_{_get_hostname()}_{i}'])
    # random.shuffle(urls)
    active_ids = set()
    pywb_servers = []
    id_lock = threading.Lock()

    def _get_worker_task():
        with id_lock:
            for i in range(num_workers):
                if i not in active_ids:
                    active_ids.add(i)
                    url = urls.pop(0) if len(urls) > 0 else None
                    return i, url
        return None, None
    
    def _start_pywb_servers():
        for _ in range(num_workers):
            pywb_server, pywb_server_proxy = upload.PYWBServer(archive=pw_archive), upload.PYWBServer(archive=pw_archive, proxy=True)
            if proxy:
                pywb_server_proxy.start()
            if archive:
                pywb_server.start()
            pywb_servers.append((pywb_server, pywb_server_proxy))
    _start_pywb_servers()

    def _replace_port(url, port):
            us = urlsplit(url)
            hostname = us.hostname.split(':')[0]
            us = us._replace(netloc=f'{hostname}:{port}')
            return urlunsplit(us)

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
                             archive,
                             arguments):
        pywb_server, pywb_server_proxy = pywb_servers[worker_id]
        if proxy:
            proxy = _replace_port(PROXYHOST, pywb_server_proxy.port)
        if archive:
            archive = _replace_port(HOST, pywb_server.port)
        if not os.path.exists(chrome_data):
            call(['cp', '--reflink=auto', '-r', f'{chrome_data_dir}/base', chrome_data])
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
                               archive=archive,
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
                    sleep_time = min(sleep_time * 2, 30)
                    time.sleep(sleep_time)
            assert worker_id is not None, "Worker ID is None"
            if url:
                # Submit the worker thread to the pool
                task = executor.submit(record_replay_worker, 
                                        url=url,
                                        metadata_file=f'{metadata_prefix}_{worker_id}.json',
                                        chrome_data=f'{chrome_data_dir}/record_replay_{_get_hostname()}_{worker_id}',
                                        worker_id=worker_id,
                                        write_path=write_path,
                                        download_path=download_path,
                                        wr_archive=wr_archive,
                                        pw_archive=pw_archive,
                                        remote_host=remote_host,
                                        proxy=proxy,
                                        archive=archive,
                                        arguments=arguments)
                tasks.append(task)
            else:
                # Exit the loop if no more urls
                break
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
    return metadata