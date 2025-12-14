import os
from os.path import dirname
import json
import sys
import re
from subprocess import PIPE, check_call, Popen, call
import random
import time


script_path = os.path.abspath(__file__)
script_parent = dirname(dirname(script_path))
sys.path.append(script_parent)
import fidelity_detect

script_parent_parent = os.path.dirname(script_parent)
sys.path.append(script_parent_parent)
from utils import upload

base = 'tests'
arguments = ['-w', '-s', '--scroll', '-i']
REMOTE = True
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'


def record_replay(url, archive_name, 
                  wr_archive='test', 
                  pw_archive='test',
                  remote_host=False):
    """
    Args:
        url: URL to record and replay
        archive_name: Name of the archive to be saved
        wr_archive: Name of the archive to save & export on webrecorder
        pw_archive: Name of the archive to import for warc on pywb
        remote_host: True if run on remote host, False if run on local host
    """
    p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                '-f', 'live',
                '-a', wr_archive, 
                *arguments,
                url], stdout=PIPE, cwd='../../record_replay')
    ts = None
    while True:
        line = p.stdout.readline()
        if not line:
            break
        line = line.decode()
        if "recorded page" in line:
            info = re.sub(r'.*recorded page: ', '', line)
            info = json.loads(info)
            ts, _ = info['ts'], info['url']
            break
    if ts is None:
        return '', url
    p.wait()

    os.rename(f'../../record_replay/downloads/{wr_archive}.warc', f'../../record_replay/downloads/{archive_name}.warc')
    if remote_host:
        upload.upload_warc(f'../../record_replay/downloads/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'../../record_replay/downloads/{archive_name}.warc'], cwd='../../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    check_call(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'archive',
                *arguments,
                archive_url], cwd='../../record_replay')
    if remote_host:
        upload.upload_write(f'../../record_replay/writes/{archive_name}', directory=pw_archive)

    return ts, url


def replay_multi_times(url, archive_name, 
                       wr_archive='test', 
                       pw_archive='test', 
                       remote_host=False, 
                       times=2, random_sleep=True):
    """
    Similar to record_replay, but replay the archive multiple times (for testing non-determinism)
    """
    p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                '-f', 'live',
                '-a', wr_archive, 
                *arguments,
                url], stdout=PIPE, cwd='../../record_replay')
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

    os.rename(f'../../record_replay/downloads/{wr_archive}.warc', f'../../record_replay/downloads/{archive_name}.warc')
    if remote_host:
        upload.upload_warc(f'../../record_replay/downloads/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'../../record_replay/downloads/{archive_name}.warc'], cwd='../../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    for i in range(times):
        time.sleep(1)
        print("Start replaying", i)
        p = Popen(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                    '-f', f'archive_{i}', '-m',
                    *arguments,
                    archive_url], stdin=PIPE, stdout=PIPE, cwd='../../record_replay')
        while True:
            line = p.stdout.readline()
            if not line:
                break
            line = line.decode()
            if "ready?" in line.lower():
                break
        if random_sleep:
            stime = random.randint(1, 10)
            print("sleeping", stime)
            time.sleep(stime)
        # Press enter to continue
        p.stdin.write(b'\n')
        p.stdin.flush()
        p.wait()
    if remote_host:
        upload.upload_write(f'../../record_replay/writes/{archive_name}', directory=pw_archive)

    return ts, url

def live_multi_times(url, times=3, random.sleep=True):
    """Similar to replay_multi_times, but on liveweb page so no archive involved"""
    for i in range(times):
        time.sleep(1)
        print("Start livewebpage", i)
        p = Popen(['node', 'live_determinism.js', '-d', f'determinism/test', '-m',
                    # *arguments,
                    '-f', 'live', url], stdin=PIPE, stdout=PIPE, cwd='../../datacollect/ground-truth')
        while True:
            line = p.stdout.readline()
            if not line:
                break
            line = line.decode()
            if "ready?" in line.lower():
                break
        if random_sleep:
            stime = random.randint(1, 10)
            print("sleeping", stime)
            time.sleep(stime)
        # Press enter to continue
        p.stdin.write(b'\n')
        p.stdin.flush()
        p.wait()
    return url

def record_multi_times(url, archive_name, 
                       wr_archive='test', 
                       pw_archive='test', 
                       remote_host=False, 
                       times=2, random_sleep=False):
    """
    Similar to replay_multitimes, but record (for testing non-determinism)
    """
    for i in range(times):
        print("Start recording", i)
        p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                    '-f', f'live_{i}',
                    '-a', wr_archive, '-m',
                    *arguments,
                    url], stdin=PIPE, stdout=PIPE, cwd='../../record_replay')
        while True:
            line = p.stdout.readline()
            if not line:
                break
            line = line.decode()
            if "ready?" in line.lower():
                break
        if random_sleep:
            stime = random.randint(1, 10)
            print("sleeping", stime)
            time.sleep(stime)
        # Press enter to continue
        p.stdin.write(b'\n')
        p.stdin.flush()
        p.wait()
    if remote_host:
        upload.upload_write(f'../../record_replay/writes/{archive_name}', directory=pw_archive)