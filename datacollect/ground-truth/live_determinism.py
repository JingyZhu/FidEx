"""
    Auto run live_determinism.js and 
"""
from subprocess import PIPE, check_call, Popen
import os
import json
from urllib.parse import urlsplit
import requests
import re
import time
import hashlib
import glob
import socket
from itertools import combinations
from threading import Thread

import sys
sys.path.append('../../')
from fidelity_check import find_diff_writes

machine_idx = ['pistons', 'wolverines'].index(socket.gethostname())

ARCHIVE_HOST = 'http://pistons.eecs.umich.edu:8080'
HOME = os.path.expanduser("~")
arguments = ['-s']


def check_live_determinism(url, dirr, chrome_data=None) -> (bool, dict):
    """
    Check if the livepage load is deterministic everytime

    Returns:
        bool: True if deterministic, False otherwise
    """
    funcArgs = arguments + ['-c', chrome_data] if chrome_data else arguments
    try:
        check_call(['node', 'live_determinism.js', '-d', f'determinism/{dirr}', '-f', 'live', url, *funcArgs])
    except:
        return False, {}
    # DO fidelity check
    dirr = f'determinism/{dirr}'
    all_elements = glob.glob(f'{dirr}/live_*_elements.json')
    pair_comp = {}
    for left, right in combinations(all_elements, 2):
        if not os.path.exists(left) or not os.path.exists(right):
            continue
        left = os.path.basename(left).replace('_elements.json', '')
        right = os.path.basename(right).replace('_elements.json', '')
        has_issue, (left_unique, right_unique) = find_diff_writes.fidelity_issue(dirr, left, right)
        pair_comp[f'{left}_{right}'] = has_issue
        if has_issue:
            return False, pair_comp
    return True, pair_comp
    
def live_determinism(urls, worker_id=0) -> dict | None:
    start = time.time()
    results = []
    for i, url in enumerate(urls):
        try:
            url = requests.get(url, timeout=10).url
        except:
            continue
        print(worker_id, i, url)
        url_hash= hashlib.md5(url.encode()).hexdigest()[:10]
        hostname = urlsplit(url).hostname
        dirr = f'{hostname}_{url_hash}'
        deterministic, pair_comp = check_live_determinism(url, dirr, chrome_data=f'{HOME}/chrome_data/determinism_{worker_id}')
        results.append({
            'url': url,
            'hostname': dirr,
            'deterministic': deterministic,
            'pairwise_comparison': pair_comp
        })
        if i % 10 == 1:
            json.dump(results, open(f'determinism_results/determinism_results_{worker_id}.json', 'w+'), indent=2)
        print('Till Now:', time.time()-start)
    json.dump(results, open(f'determinism_results/determinism_results_{worker_id}.json', 'w+'), indent=2)

def live_determinism_multiproc(urls, num_browsers=8):
    """Make sure to set the headless to new for js"""
    threads = []
    for i in range(num_browsers):
        urls_part = urls[i::num_browsers]
        t = Thread(target=live_determinism, args=(urls_part, i))
        threads.append(t)
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    data = json.load(open('ground_truth_urls.json', 'r'))
    urls = [d['live_url'] for d in data]
    live_determinism_multiproc(urls, 16)