import os
import json
import time
import logging
import traceback
import argparse
from concurrent import futures
from subprocess import call

# sys.path.append(os.path.abspath('..'))
from fidex.fidelity_check import fidelity_detect
from fidex.utils import logger, diff_utils, url_utils
from fidex.config import CONFIG
# supress warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import utils
# import fix_calculator


# * Left and Right
parser = argparse.ArgumentParser(description='Flags for the script')
parser.add_argument('--base', type=str, help='Base file prefix to compare layout tree (live or proxy)')
parser.add_argument('--comp', type=str, help='Comp file prefix to compare layout tree (archive or fix)')
parser.add_argument('--input_file', type=str, help='Input file to run URLs on')
parser.add_argument('--collection', type=str, help='Collection name to that writes and warcs are in')
parser.add_argument('operation', type=str, help='Operation to perform')
args = parser.parse_args()
LEFT = args.base
RIGHT = args.comp if args.comp else utils.reason_to_filename(args.error_reason)
operation = args.operation
assert LEFT is not None, "Left prefix must be provided"
assert RIGHT is not None, "Right prefix must be provided"
assert operation in ['fidelity', 'sync', 'fix_effect', 'merge'], f"Invalid operation {operation}"

if not os.path.exists(f'diffs/'):
    os.makedirs(f'diffs/', exist_ok=True)

counter = 0
timeout = 10 * 60

def fidelity_issue_wrapper(idx, dirr, url, left_prefix='live', right_prefix='archive', screenshot=False, more_errs=False, html_text=False, meaningful=True):
    """Check if all the data is available and then run the fidelity check"""
    logging.info(f"Processing {idx} {dirr}")
    if not os.path.exists(f'{dirr}/{left_prefix}_done'):
        return None
    if not os.path.exists(f'{dirr}/{right_prefix}_done'):
        return None
    
    try:
        return fidelity_detect.fidelity_issue_all(dirr, left_prefix=left_prefix, 
                                                        right_prefix=right_prefix,
                                                        screenshot=screenshot,
                                                        more_errs=more_errs,
                                                        html_text=html_text, 
                                                        meaningful=meaningful,
                                                        need_exist=False)
    except Exception as e:
        logging.error(f"Error in {idx} {dirr}: {e}")
        logging.error(traceback.format_exc())
        return None

def list_len(l):
    total = 0
    for ll in l:
        if isinstance(ll, list):
            total += len(ll)
    return total

def process_fidelity():
    global counter
    input_data = json.load(open(f'{args.input_file}', 'r'))
    num_workers = os.cpu_count() - 1 if os.cpu_count() is not None else 1

    print("Available dirs:", len(input_data))
    hostname_url = {}
    results = []
    with futures.ProcessPoolExecutor(num_workers) as executor:
        rs = []
        last_ts = time.time()
        for datum in input_data:
            url = datum['url']
            hostname = url_utils.calc_hostname(url)
            write_dir = f'{CONFIG.archive_dir}/writes/{args.collection}/{hostname}'
            hostname_url[hostname] = url
            rs.append(executor.submit(fidelity_issue_wrapper, counter, write_dir, url, LEFT, RIGHT, True, True, True, True))
            counter += 1
        while len(rs):
            try:
                for finished in futures.as_completed(rs, timeout=timeout):
                    logging.info(f"Processed {len(results)}")
                    r = finished.result()
                    rs.remove(finished)
                    last_ts = time.time()
                    if r is None:
                        continue
                    r.info['hostname'] = r.info['hostname'].split('/')[-1]
                    r.info['url'] = hostname_url.get(r.info['hostname'])
                    r.info['live_unique'] = list_len(r.live_unique)
                    r.info['archive_unique'] = list_len(r.archive_unique)
                    results.append(r.info)
                    if len(results) % 2 == 0:
                        json.dump(results, open(f'diffs/{LEFT}_{RIGHT}_{args.collection}.json', 'w+'), indent=2)
            except Exception as e:
                logging.error(f"Exception: {e}")
                if time.time() - last_ts > timeout:
                    logging.error(f"Timeout {time.time() - last_ts}")
                    break 
    json.dump(results, open(f'diffs/{LEFT}_{RIGHT}_{args.collection}.json', 'w+'), indent=2)


# def fix_effect():
#     diff_data = json.load(open(f'diffs/{RIGHT}/layout_diff_{utils.get_idx()}.json', 'r'))
#     input_file = f'input_data/{utils.reason_to_inputname(args.error_reason)}.json'
#     input_data = json.load(open(input_file, 'r'))
#     input_data = {d['hostname']: d for d in input_data}
#     new_diff_data = []
#     for datum in diff_data:
#         input_datum = input_data.get(datum['hostname'])
#         if 'reason' in input_datum:
#             original_broken = input_datum['reason'] is not None
#         else:
#             original_broken = input_datum['diff']
#         dirr = f'{CONFIG.archive_dir}/writes/{input_datum["archive"]}/{input_datum["hostname"]}'
#         fix_calc= fix_calculator.FixCalculator(dirr,'live', 'archive', LEFT, 'archive-29', RIGHT)
#         diff_eliminated = fix_calc.diff_eliminated()
#         if original_broken:
#             datum['fix_effect'] = diff_eliminated
#         else:
#             if diff_eliminated is None or diff_eliminated >= 0:
#                 datum['fix_effect'] = 'preserve'
#             else:
#                 datum['fix_effect'] = 'break'
#         error_eliminated, new_introduced = fix_calc.target_error_elimination(args.error_reason)
#         if not error_eliminated:
#             datum['error_fix'] = 'error_not_fixed'
#         elif not new_introduced:
#             datum['error_fix'] = 'error_eliminated'
#         else:
#             datum['error_fix'] = 'new_error_introduced'
#         new_diff_data.append(datum)

#     json.dump(new_diff_data, open(f'diffs/{RIGHT}/layout_diff_{utils.get_idx()}.json', 'w+'), indent=2)


if __name__ == "__main__":
    if operation == 'fidelity':
        process_fidelity()
    else:
        assert False, f"Invalid operation {operation}"