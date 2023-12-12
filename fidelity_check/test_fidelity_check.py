"""Test fidelity check in testcases"""
import os
from subprocess import PIPE, check_call, Popen
import re
import json

import sys
sys.path.append('../')
from utils import upload

REMOTE = False
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'
arguments = ['-w', '-s']

def record_replay(url, archive_name, remote_host=False):
    p = Popen(['node', 'record.js', '-d', f'../fidelity_check/testcases/{archive_name}',
                '-f', 'live',
                '-a', 'test', 
                *arguments,
                url], stdout=PIPE, cwd='../record_replay')
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

    check_call(['mv', f'../record_replay/downloads/test.warc', f'downloads/{archive_name}.warc'])
    if remote_host:
        upload.upload_warc(f'downloads/{archive_name}.warc', 'test', directory='test')
    else:
        check_call(['wb-manager', 'add', 'test', 
                    f'../fidelity_check/downloads/{archive_name}.warc'], cwd='../collections')
        
    ts = ts.strip()
    archive_url = f"{HOST}/test/{ts}/{url}"
    check_call(['node', 'replay.js', '-d', f'../fidelity_check/testcases/{archive_name}', 
                '-f', 'archive',
                *arguments,
                archive_url], cwd='../record_replay')
    if remote_host:
        upload.upload_write(f'../record_replay/writes/{archive_name}', directory='test')

    return ts, url


tests = json.load(open('testcases_positive.json', 'r'))
metadata = {} if not os.path.exists('test_metadata.json') else json.load(open('test_metadata.json', 'r'))

for i, test_obj in enumerate(tests[1:2]):
    url = test_obj['url']
    test_dirr = test_obj['directory']
    print(i, url)
    ts, url = record_replay(url, test_dirr, remote_host=False)
    metadata[url] = {
        'ts': ts,
        'archive': f'{HOST}/test/{ts}/{url}',
        'directory': test_dirr,
    }
    json.dump(metadata, open('test_metadata.json', 'w+'), indent=2)
