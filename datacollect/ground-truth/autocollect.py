"""
    Auto run live_determinism.js and 
"""
from subprocess import PIPE, check_call, Popen
import os
import json
from urllib.parse import urlsplit
import requests
import sys
import re
import hashlib
import glob
from itertools import combinations

sys.path.append('../../')
from fidelity_check import find_diff_writes


HOST = 'http://pistons.eecs.umich.edu:8080'
arguments = ['-s']


def fidelity_check(dirr) -> (bool, dict):
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

def check_live_determinism(url, dirr) -> (bool, dict):
    """
    Check if the livepage load is deterministic everytime

    Returns:
        bool: True if deterministic, False otherwise
    """
    check_call(['node', 'live_determinism.js', '-d', f'determinism/{dirr}', '-f', 'live', url, *arguments])
    return fidelity_check(f'determinism/{dirr}')

if __name__ == '__main__':
    data = json.load(open('ground_truth_eot_300.json', 'r'))
    results = []
    for i, datum in enumerate(data[:20]):
        url = datum['live_url']
        try:
            url = requests.get(url).url
        except:
            continue
        print(i, url)
        url_hash= hashlib.md5(url.encode()).hexdigest()[:10]
        hostname = urlsplit(url).hostname
        dirr = f'{hostname}_{url_hash}'
        deterministic, pair_comp = check_live_determinism(url, dirr)
        results.append({
            'url': url,
            'hostname': dirr,
            'deterministic': deterministic,
            'pairwise_comparison': pair_comp
        })
        json.dump(results, open('determinism_results.json', 'w'), indent=2)