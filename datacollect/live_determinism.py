"""
    Auto run live_determinism.js and 
"""
from subprocess import PIPE, check_call, Popen
import os
import json
import requests
import time
import glob
import socket
from itertools import combinations
from threading import Thread
from multiprocessing import Process

import sys
sys.path.append('../../')
from fidelity_check import fidelity_detect
from utils import url_utils

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
        has_issue, (left_unique, right_unique) = fidelity_detect.fidelity_issue(dirr, left, right)
        pair_comp[f'{left}_{right}'] = has_issue
        if has_issue:
            return False, pair_comp
    return True, pair_comp
    
def live_determinism(urls, worker_id=0) -> dict | None:
    """Entry func for a single worker"""
    start = time.time()
    results = []
    for i, url in enumerate(urls):
        try:
            url = requests.get(url, timeout=10).url
        except:
            continue
        print(worker_id, i, url)
        dirr = url_utils.calc_hostname(url)
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
    """
    Entry func
    Make sure to set the headless to new for js
    """
    processes = []
    for i in range(num_browsers):
        urls_part = urls[i::num_browsers]
        p = Process(target=live_determinism, args=(urls_part, i))
        processes.append(p)
        p.start()
    for p in processes:
        p.join()
    # Combine all results
    results = []
    for i in range(num_browsers):
        results += json.load(open(f'determinism_results/determinism_results_{i}.json', 'r'))
    json.dump(results, open('determinism_results/determinism_results.json', 'w+'), indent=2)


if __name__ == "__main__":
    data = json.load(open('../data/tranco_urls.json', 'r'))
    seen = set()
    if os.path.exists('determinism_results/determinism_results.json'):
        seen = set([d['url'] for d in json.load(open('determinism_results/determinism_results.json', 'r'))])
    urls = [d['live_url'] for d in data if d['live_url'] not in seen]
    print("Total URLs to process:", len(urls))
    live_determinism_multiproc(urls, 16)