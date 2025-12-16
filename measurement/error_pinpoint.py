import os
import json
import multiprocessing
import pandas as pd
import random
import requests
import sys
import logging
import traceback
import multiprocessing as mp
from concurrent import futures
import argparse


from fidex.error_pinpoint import pinpoint
from fidex.utils import logger, url_utils
from fidex.config import CONFIG
# supress warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

parser = argparse.ArgumentParser(description='Flags for the script')
parser.add_argument('--base', type=str, help='Base file prefix for pinpointing reference (live or proxy)')
parser.add_argument('--comp', type=str, help='Comp file prefix for pinpointing comparison (archive or fix)')
parser.add_argument('--collection', type=str, help='Collection name to that writes and warcs are in')
parser.add_argument('--input_file', type=str, help='Input diff file to run URLs on')
args = parser.parse_args()
LEFT = args.base
RIGHT = args.comp

writes_dir = f'{CONFIG.archive_dir}/writes/{args.collection}'

num_workers = os.cpu_count() - 1 if os.cpu_count() is not None else 1
Manager = mp.Manager()
active_ids = Manager.dict()
for i in range(num_workers): active_ids[i] = False
active_ids_lock = Manager.Lock()

if not os.path.exists(f'pinpoint/'):
    os.makedirs(f'pinpoint/', exist_ok=True)

def pinpoint_issue_wrapper(idx, archive_url, dirr, left_prefix='live', right_prefix='archive'):
    logging.info(f"Processing {idx} {dirr}")
    if not os.path.exists(f'{dirr}/{left_prefix}_done'):
        return None
    if not os.path.exists(f'{dirr}/{right_prefix}_done'):
        return None

    try:
        idx = 0
        with active_ids_lock:
            for idx in range(num_workers):
                if active_ids[idx] == False:
                    active_ids[idx] = True
                    break
        pinpoint_result = pinpoint.pinpoint_issue(dirr, idx, left_prefix, right_prefix)
        with active_ids_lock:
            active_ids[idx] = False
        return pinpoint_result
    except Exception as e:
        logging.error(f"Error in {idx} {dirr}: {e}")
        logging.error(traceback.format_exc())
        with active_ids_lock:
            active_ids[idx] = False
        return None

def pinpoint_issues():
    counter = 0
    input_data = json.load(open(f'{args.input_file}', 'r'))
    hostname_url = {}
    with futures.ProcessPoolExecutor(num_workers) as executor:
        rs = []
        for datum in input_data:
            url = datum['url']
            hostname = datum['hostname']
            hostname_url[hostname] = url
            if not datum['diff']:
                continue
            rs.append(executor.submit(pinpoint_issue_wrapper, counter, url, f'{writes_dir}/{hostname}', LEFT, RIGHT))
            counter += 1
    results = []
    for r in futures.as_completed(rs):
        logging.info(f"Processed {len(results)}")
        r = r.result()
        if r is None or not r.fidelity_result.info['diff']:
            continue
        info = r.fidelity_result.info
        info['hostname'] = info['hostname'].split('/')[-1]
        info['url'] = hostname_url[info['hostname']]
        results.append({"FidelityResult": info, "Errors": r.errors_to_dict(), "Mut_result": r.mut_result()})
        json.dump(results, open(f'pinpoint/{LEFT}_{RIGHT}_{args.collection}.json', 'w+'), indent=2)
    json.dump(results, open(f'pinpoint/{LEFT}_{RIGHT}_{args.collection}.json', 'w+'), indent=2)
    return results

if __name__ == '__main__':
    pinpoint_issues()