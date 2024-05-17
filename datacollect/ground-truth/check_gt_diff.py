import os, glob
import json
import sys
import multiprocessing
import pandas as pd

sys.path.append('../../')
from fidelity_check import fidelity_detect

HOME = os.path.expanduser("~")
PREFIX = 'gt_imp_intat_v0'

writes_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
metadata = json.load(open(f'metadata/{PREFIX}_metadata.json'))
directory_map = {v['directory']: v['archive'] for v in metadata.values()}

def diff_worker(dirr, url, onload=False):
    print(dirr)
    full_dir = f'{writes_dir}/{dirr}'
    if not os.path.exists(f'{full_dir}/archive_elements.json'):
        return
    diff, s_diff = False, False
    diff_stage, s_diff_stage, simi = None, None, 1
    odiff, _ = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
    os_diff, o_simi = fidelity_detect.fidelity_issue_screenshot(full_dir, 'live', 'archive')
    if odiff:
        diff = True
        diff_stage = 'onload'
    if os_diff:
        s_diff = True
        s_diff_stage = 'onload'
        simi = o_simi
    # * Only checking for onload
    if onload:
        return {
            'hostname': dirr,
            'url': url,
            'diff': diff,
            'screenshot_diff': s_diff,
            'diff_stage': diff_stage,
            'sreenshot_diff_stage': s_diff_stage,
            'similarity': simi
        }
    if diff_stage and s_diff_stage:
        return {
            'hostname': dirr,
            'url': url,
            'diff': diff,
            'screenshot_diff': s_diff,
            'diff_stage': diff_stage,
            'sreenshot_diff_stage': s_diff_stage,
            'similarity': simi
        }
    # * Compare interaction
    live_files = glob.glob(f'{full_dir}/live_*_elements.json')
    archive_files = glob.glob(f'{full_dir}/archive_*_elements.json')
    if len(live_files) != len(archive_files):
        return {
            'hostname': dirr,
            'url': url,
            'diff': True,
            'screenshot_diff': True,
            'diff_stage': 'extraInteraction',
            'sreenshot_diff_stage': 'extraInteraction',
            'similarity': simi
        }
    for i in range(len(live_files)):
        idiff, _ = fidelity_detect.fidelity_issue(full_dir, f'live_{i}', f'archive_{i}', meaningful=True)
        is_diff, is_simi = fidelity_detect.fidelity_issue_screenshot(full_dir, f'live_{i}', f'archive_{i}')
        if idiff and not diff:
            diff = True
            diff_stage = f'interaction_{i}'
        if is_diff and not s_diff:
            s_diff = True
            s_diff_stage = f'interaction_{i}'
            simi = is_simi
        if diff_stage and s_diff_stage:
            return {
                'hostname': dirr,
                'url': url,
                'diff': diff,
                'screenshot_diff': s_diff,
                'diff_stage': diff_stage,
                'sreenshot_diff_stage': s_diff_stage,
                'similarity': simi
            }
    return {
        'hostname': dirr,
        'url': url,
        'diff': diff,
        'screenshot_diff': s_diff,
        'diff_stage': diff_stage,
        'sreenshot_diff_stage': s_diff_stage,
        'similarity': simi
    }
        


def diff_worker_forexamples(dirr, url):
    print(dirr)
    def screenshot_diff(dirr, left, right):
        if not os.path.exists(f'{dirr}/{left}.png'):
            return 'no live'
        if not os.path.exists(f'{dirr}/{right}.png'):
            return 'no archive'
        _, simi = fidelity_detect.fidelity_issue_screenshot(dirr, left, right)
        return simi

    full_dir = f'{writes_dir}/{dirr}'
    if not os.path.exists(f'{full_dir}/archive_elements.json'):
        return
    diff, _ = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
    all_diffs = {'layout tree': diff}
    if not os.path.exists(f'{full_dir}/live.png') and not os.path.exists(f'{full_dir}/archive.png'):
        return {
            'hostname': dirr,
            'url': url,
            'diff': all_diffs
        }
    all_diffs['load_screenshot'] = screenshot_diff(full_dir, 'live', 'archive')
    counter = 0
    while True:
        left = f'live_{counter}'
        right = f'archive_{counter}'
        if not os.path.exists(f'{full_dir}/{left}.png') and not os.path.exists(f'{full_dir}/{right}.png'):
            break
        all_diffs[f'{counter}_screenshot'] = screenshot_diff(full_dir, left, right)
        counter += 1    
    return {
        'hostname': dirr,
        'url': url,
        'diff': all_diffs
    }


def get_confusion_table(diff_file):
    data = json.load(open(diff_file))
    row_name = 'diff'
    col_name = 'screenshot_diff'
    df = pd.DataFrame({
        True: {True: 0, False: 0},
        False: {True: 0, False: 0}
    })
    for item in data:
        row_value = item[row_name]
        col_value = item[col_name]
        df.at[row_value, col_value] += 1
    print(df)

if __name__ == '__main__':
    dirs = os.listdir(writes_dir)
    num_worker = 31
    with multiprocessing.Pool(num_worker) as p:
        results = p.starmap(diff_worker, [(d, directory_map[d]) for d in dirs if d in directory_map])
        results = [r for r in results if r is not None]
    json.dump(results, open(f'{PREFIX}_diff.json', 'w+'), indent=2)
    get_confusion_table(f'{PREFIX}_diff.json')