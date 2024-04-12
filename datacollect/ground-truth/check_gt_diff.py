import os, glob
import json
import sys
import multiprocessing

sys.path.append('../../')
from fidelity_check import fidelity_detect

HOME = os.path.expanduser("~")
writes_dir = f'{HOME}/fidelity-files/writes/ground_truth'
metadata = json.load(open('metadata/gt_metadata.json'))
directory_map = {v['directory']: v['archive'] for v in metadata.values()}

def diff_worker(dirr, url):
    print(dirr)
    full_dir = f'{writes_dir}/{dirr}'
    if not os.path.exists(f'{full_dir}/archive_elements.json'):
        return
    diff, _ = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
    return {
        'hostname': dirr,
        'url': url,
        'diff': diff
    }

dirs = os.listdir(writes_dir)
num_worker = 16
with multiprocessing.Pool(num_worker) as p:
    results = p.starmap(diff_worker, [(d, directory_map[d]) for d in dirs if d in directory_map])
    results = [r for r in results if r is not None]

json.dump(results, open('gt_diff.json', 'w+'), indent=2)