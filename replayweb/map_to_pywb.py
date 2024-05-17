import json
import os
import random
from collections import defaultdict
import re
from subprocess import check_call

def decide(initial_elements, initial_writes, final_writes, final_elements):
    """
    1. More writes
    2. Same writes no missing elements
    """
    if len(initial_writes["rawWrites"]) < len(final_writes["rawWrites"]):
        return True
    elif len(initial_writes["rawWrites"]) == len(final_writes["rawWrites"]):
        return len(initial_elements) <= len(final_elements)
    return False

def get_stage_key(stage):
    """Load first, followed by interaction_0, 1, ..."""
    stage = stage.split('_')
    if len(stage) == 1:
        return -1
    else:
        return int(stage[1])

def detected_issue(write_dir, hostname, strict=True):
    results = json.load(open(f'{write_dir}/{hostname}/results.json', 'r'))
    results = sorted(list(results.items()), key=lambda x: get_stage_key(x[0]))
    for stage, result in results:
        if result['fixedIdx'] == -1:
            continue
        if stage == 'extraInteraction':
            result['fixedIdx'] = 0
        if not strict:
            return f"{stage}_{result['fixedIdx']}"
        else:
            idx = result['fixedIdx']
            initial_writes = json.load(open(f'{write_dir}/{hostname}/{stage}_initial_writes.json', 'r'))
            initial_elements = json.load(open(f'{write_dir}/{hostname}/{stage}_initial_elements.json', 'r'))
            final_writes = json.load(open(f'{write_dir}/{hostname}/{stage}_exception_{idx}_writes.json', 'r'))
            final_elements = json.load(open(f'{write_dir}/{hostname}/{stage}_exception_{idx}_elements.json', 'r'))
            if decide(initial_elements, initial_writes, final_writes, final_elements):
                return stage, result['fixedIdx']
            else:
                continue
    return

def map_results(write_dir, data, pywb_dirs, strict=True):
    pywb_issue_hostnames = set()
    pywb_run_hostnames = set()
    for pywb_dir in pywb_dirs:
        for hostname in os.listdir(pywb_dir):
            if os.path.exists(f'{pywb_dir}/{hostname}/results.json'):
                pywb_run_hostnames.add(hostname)
                fix_id = detected_issue(pywb_dir, hostname, strict)
                if fix_id:
                    pywb_issue_hostnames.add(hostname)
    print(len(pywb_run_hostnames), len(pywb_issue_hostnames))
    total = 0
    in_pywb = {True: 0, False: 0}
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            total += 1
            fix_id = detected_issue(write_dir, hostname, strict)
            if fix_id:
                if hostname not in pywb_run_hostnames:
                    continue
                in_pywb[hostname in pywb_issue_hostnames] += 1
                # print(hostname, hostname in pywb_issue_hostnames)
    
    print(len(pywb_run_hostnames), len(pywb_issue_hostnames))
    print(in_pywb)

pywb_dirs = [
    '../revert_rewrite/writes_replayweb',
]

map_results('writes',  json.load(open('inputs/replayweb_sampled.json', 'r')),
            pywb_dirs, strict=True)


def add_replayweb_warcs_2_pywb():
    crawl_prefixes = [
        'eot_2016',
        'eot_2020',
        'carta',
        'm1m',
    ]
    def replace_wayback(url, prefix):
        # Replace the "http(s)://web.archive.org/web/.../" with "http://pistons.eecs.umich.edu:8080/{collection}/"
        return re.sub(r'http(s)?://web.archive.org/web/', f'http://pistons.eecs.umich.edu:8080/{prefix}/', url)
    host_url = {}
    for crawl_prefix in crawl_prefixes:
        files = os.listdir(f'../../wayback-crawl/crawl_wayback/{crawl_prefix}')
        for file in files:
            data = json.load(open(f'../../wayback-crawl/crawl_wayback/{crawl_prefix}/{file}', 'r'))
            for datum in data:
                hostname = datum['hostname']
                archive_url = replace_wayback(datum['wayback_url'], 'replayweb')
                host_url[hostname] = archive_url
    replayweb_data = json.load(open('inputs/replayweb_sampled.json', 'r'))
    new_replayweb_data = []
    for obj in replayweb_data:
        hostname = obj['hostname']
        obj['archive_url'] = host_url[hostname]
        obj['prefix'] = obj['prefix'].replace('_replayweb', '')
        new_replayweb_data.append(obj)
    final_replayweb_data = []
    for i, crawl in enumerate(new_replayweb_data):
        print(i, crawl['hostname'])
        try:
            if not os.path.exists(f"../../wayback-crawl/warcs/{crawl['prefix']}/{crawl['hostname']}.warc"):
                continue
            check_call(['wb-manager', 'add', 'replayweb', f"../wayback-crawl/warcs/{crawl['prefix']}/{crawl['hostname']}.warc"], cwd='/vault-swift/jingyz/fidelity-files')
            final_replayweb_data.append(crawl)
        except Exception as e:
            print(str(e))
            continue
    json.dump(final_replayweb_data, open('inputs/replayweb_pywb_sampled.json', 'w+'), indent=2)


# add_replayweb_warcs_2_pywb()