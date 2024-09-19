"""
    Auto run live_determinism.js and 
"""
from subprocess import call
import concurrent
import os
import json
import time
import glob
import multiprocessing
from itertools import combinations


from fidex.fidelity_check import fidelity_detect
from fidex.utils import url_utils
from fidex.record_replay import autorun

HOME = os.path.expanduser("~")
_CURDIR = os.getcwd()
ARGS = ['-w', '-s', '--scroll', '--headless']

def check_live_determinism(url, archive_name, 
                           num_loads=3, 
                           chrome_data=autorun.DEFAULT_CHROMEDATA) -> (bool, dict):
    """
    Check if the livepage load is deterministic everytime

    Returns:
        bool: True if deterministic, False otherwise
    """
    base_dirr = f'{_CURDIR}/determinism'
    dirr = f'{base_dirr}/{archive_name}'
    for i in range(num_loads):
        autorun.replay(url, archive_name,
                    chrome_data=chrome_data,
                    write_path=base_dirr,
                    filename=f'determinism_{i}',
                    arguments=ARGS)
    # DO fidelity check

    all_elements = glob.glob(f'{dirr}/determinism_*_dom.json')
    pair_comp = {}
    for left, right in combinations(all_elements, 2):
        if not os.path.exists(left) or not os.path.exists(right):
            continue
        left = os.path.basename(left).replace('_dom.json', '')
        right = os.path.basename(right).replace('_dom.json', '')
        has_issue, (left_unique, right_unique) = fidelity_detect.fidelity_issue(dirr, left, right)
        pair_comp[f'{left}_{right}'] = has_issue
        if has_issue:
            return False, pair_comp
    return True, pair_comp
    
def live_determinism(urls, metadata_file,
                     worker_id=None) -> dict | None:
    """Entry func for a single worker"""
    start = time.time()
    if not os.path.exists(metadata_file):
        json.dump({}, open(metadata_file, 'w+'), indent=2)
    metadata = json.load(open(metadata_file, 'r'))
    seen_dir = set([v['directory'] for v in metadata.values()])
    for i, url in enumerate(urls):
        print(i, url, flush=True) if worker_id is None else print(worker_id, i, url, flush=True)
        if url in metadata or url.replace('http://', 'https://') in metadata:
            continue
        try:
            req_url = url_utils.request_live_url(url)
        except:
            continue
        archive_name = url_utils.calc_hostname(req_url)
        if archive_name in seen_dir:
            continue
        deterministic, pair_comp = check_live_determinism(req_url, archive_name, 
                                                          chrome_data=f'{HOME}/chrome_data/determinism_{worker_id}')
        metadata[req_url] = {
            'url': req_url,
            'original_url': url,
            'directory': archive_name,
            'deterministic': deterministic,
            'pairwise_comparison': pair_comp
        }
        json.dump(metadata, open(metadata_file, 'w+'), indent=2)
        print('Till Now:', time.time()-start)
    json.dump(metadata, open(metadata_file, 'w+'), indent=2)


def _live_determinism_worker(url,
                            metadata_file,
                            chrome_data_dir,
                            chrome_data,
                            worker_id,
                            id_lock: "multiprocessing.Manager.Lock",
                            active_ids: "multiprocessing.Manager.dict") -> None:
    if not os.path.exists(chrome_data):
        call(['cp', '-r', f'{chrome_data_dir}/base', chrome_data])
        time.sleep(worker_id*5)
    live_determinism([url],
                    metadata_file,
                    worker_id)
    with id_lock:
        active_ids.pop(worker_id)


def live_determinism_multiproc(urls, num_workers=8,
                               chrome_data_dir=os.path.dirname(autorun.DEFAULT_CHROMEDATA),
                               metadata_prefix='metadata/determinism'):
    """
    Entry func
    Make sure to set the headless to new for js
    """
    for i in range(num_workers):
        call(['rm', '-rf', f'{chrome_data_dir}/determinism_{i}'])
    manager = multiprocessing.Manager()
    active_ids = manager.dict()
    id_lock = manager.Lock()
    def _get_worker_task():
        with id_lock:
            for i in range(num_workers):
                if i not in active_ids:
                    active_ids[i] = True
                    url = urls.pop(0) if len(urls) > 0 else None
                    return i, url
        return None, None

    with concurrent.futures.ProcessPoolExecutor(max_workers=num_workers) as executor:
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
                task = executor.submit(_live_determinism_worker, url,
                                       f'{metadata_prefix}_{worker_id}.json',
                                       chrome_data_dir,
                                       f'{chrome_data_dir}/determinism_{worker_id}',
                                       worker_id,
                                       id_lock,
                                       active_ids)
                tasks.append(task)
            else:
                break
            for task in tasks:
                if task.done():
                    tasks.remove(task)
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