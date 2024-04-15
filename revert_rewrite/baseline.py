"""
Get the number for base line (screenshot and exceptions)
"""
import glob
import os
import json
import sys
import multiprocessing

sys.path.append('../')
from fidelity_check import fidelity_detect

write_dir = 'writes_gt/'

def screenshot_label(dirr):
    if not os.path.exists(f'{dirr}/results.json'):
        return
    # * Load
    load_screenshots = glob.glob(f'{dirr}/load_exception_*.png')
    for screenshot in load_screenshots:
        name = os.path.basename(screenshot).split('.')[0]
        same, _ =  fidelity_detect.fidelity_issue_screenshot(dirr, 'load_initial', name)
        if not same:
            return True
    # * extraInteraction
    if glob.glob(f'{dirr}/extraInteraction_exception_*.png'):
        name = os.path.basename(screenshot).split('.')[0]
        same, _ =  fidelity_detect.fidelity_issue_screenshot(dirr, 'extraInteraction_initial', name)
        if not same:
            return True
    # * interaction
    count = 0
    while True:
        if not glob.glob(f'{dirr}/interaction_{count}_exception_*.png'):
            break
        name = os.path.basename(screenshot).split('.')[0]
        same, _ =  fidelity_detect.fidelity_issue_screenshot(dirr, f'interaction_{count}_initial', name)
        if not same:
            return True
        count += 1
    return False

def exception_label(dirr):
    if not os.path.exists(f'{dirr}/results.json'):
        return
    results = json.load(open(f'{dirr}/results.json', 'r'))
    for _, stage_result in results.items():
        result = [r for r in stage_result['results'] if r['type'] == 'exceptions']
        for target_result in result:
            for r in target_result['exceptions']:
                if r['uncaught']:
                    return True
    return False

def _correlate_worker(hostname):
    print(hostname)
    slabel = screenshot_label(f'{write_dir}/{hostname}')
    elabel = exception_label(f'{write_dir}/{hostname}')
    return hostname, slabel, elabel

def correlate_labels():
    labels = json.load(open('gt_diff.json'))
    screenshot_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    exception_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    def categorize(label, result):
        if label:
            if result:
                return 'tp'
            else:
                return 'fn'
        else:
            if result:
                return 'fp'
            else:
                return 'tn'
    with multiprocessing.Pool(16) as pool:
        results = pool.map(_correlate_worker, labels.keys())

    for hostname, slabel, elabel in results:
        label = labels[hostname]
        if slabel is not None:
            screenshot_table[categorize(label, slabel)] += 1
        if elabel is not None:
            exception_table[categorize(label, elabel)] += 1
    print("screenshot table:", screenshot_table)
    print("exception table:", exception_table)

correlate_labels()