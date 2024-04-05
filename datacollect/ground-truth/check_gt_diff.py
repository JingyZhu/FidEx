import os, glob
import json
import sys

sys.path.append('../../')
from fidelity_check import fidelity_detect

HOME = os.path.expanduser("~")
writes_dir = f'{HOME}/fidelity-files/writes/ground_truth'
metadata = json.load(open('metadata/gt_metadata.json'))
directory_map = {v['directory']: v['archive'] for v in metadata.values()}

def diff_worker(dirs):
    for i, dirr in enumerate(dirs):
        print(i, dirr)
        if dirr not in directory_map:
            continue
        full_dir = f'{writes_dir}/{dirr}'
        diff, _ = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive')
        results.append({
            'hostname': dirr,
            'url': directory_map[dirr],
            'diff': diff
        })
    json.dump(results, open('gt_diff.json', 'w+'), indent=2)

dirs = os.listdir(writes_dir)
results = []
diff_worker(dirs)