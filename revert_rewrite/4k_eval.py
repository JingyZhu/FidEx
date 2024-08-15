import os
import json
import random
from collections import defaultdict
import sys
import pandas as pd

sys.path.append('..')
from fidelity_check import fidelity_detect, fidelity_impact

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

def count_results(write_dir, data, strict=True):
    count = {}
    total = 0
    valid_data = []
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            valid_data.append(datum)
    data = random.sample(valid_data, min(1000, len(valid_data)))
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            total += 1
            fix_id = detected_issue(write_dir, hostname, strict)
            if fix_id:
                count[hostname] = f'{fix_id[0]}_{fix_id[1]}'
    print(total, len(count))
    categories = defaultdict(int)
    for val in count.values():
        stage = val.split('_')[0]
        categories['total'] += 1
        if stage == 'load':
            categories['load'] += 1
        elif 'interaction' in stage.lower():
            categories['interaction'] += 1
        else:
            raise
    return {k: v/total for k, v in categories.items()}

def count_patches(write_dir, data, strict=True):
    def get_type(fixedIdx):
        stage = fixedIdx.split('_')[0]
        excep = fixedIdx.split('_')[1]
        fid = fixedIdx.split('_')[2] if len(fixedIdx.split('_')) > 2 else ''
        if excep == 'NW':
            return 'URL'
        elif excep == 'SE':
            return 'Static'
        elif fid == '3':
            return 'trycatch'
        else:
            return 'Dynamic'
    count = {}
    total = 0
    valid_data = []
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            valid_data.append(datum)
    data = random.sample(valid_data, min(1000, len(valid_data)))
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            total += 1
            fix_id = detected_issue(write_dir, hostname, strict)
            if fix_id:
                count[hostname] = f'{fix_id[0]}_{fix_id[1]}'
    patch_counts = defaultdict(int)
    for val in count.values():
        fix_type = get_type(val)
        patch_counts[fix_type] += 1
    return patch_counts
    
def _leaves(xpaths):
    leaves = []
    for xpath in xpaths:
        is_leaf = True
        for other in xpaths:
            if xpath == other:
                continue
            if other.startswith(xpath):
                is_leaf = False
                break
        if is_leaf:
            leaves.append(xpath.split('/')[-1].split('[')[0])
    return leaves


def _roots(xpaths):
    roots = set()
    filter_lists = ['div', 'span', 'html', 'body', 'header', 'section', 'footer', 'main', 'center']
    for xpath in xpaths:
        elements = xpath.split('/')[1:]
        for e in elements:
            if any([f in e for f in filter_lists]):
                continue
            roots.add(e.split('[')[0])
            break
    return roots


def calc_diff_leaves(write_dir, data, strict=True):
    count = {}
    total = 0
    valid_data = []
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            valid_data.append(datum)
    data = random.sample(valid_data, min(1000, len(valid_data)))
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            total += 1
            fix_id = detected_issue(write_dir, hostname, strict)
            if fix_id:
                count[hostname] = (fix_id[0], fix_id[1])
    elements_count = defaultdict(int)
    print("Start diffing", len(count))
    for i, (hostname, (stage, fix_id)) in enumerate(count.items()):
        if i % 10 == 0:
            print(i)
        dirr = f'{write_dir}/{hostname}'
        left = f'{stage}_initial'
        right = f'{stage}_exception_{fix_id}'
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(dirr, left, right, meaningful=True)
        if not issue:
            continue
        main_u = left_u if len(left_u) > len(right_u) else right_u
        all_leaves = []
        for branch in main_u:
            roots = _roots(branch)
            all_leaves.extend(list(roots))
        all_leaves = set(all_leaves)
        for l in all_leaves:
            elements_count[l] += 1
    return elements_count, len(count)

def calc_diff_interactions(write_dir, data, strict=True):
    count = {}
    total = 0
    valid_data = []
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            valid_data.append(datum)
    data = random.sample(valid_data, min(1000, len(valid_data)))
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            total += 1
            fix_id = detected_issue(write_dir, hostname, strict)
            if fix_id and 'interaction' in fix_id[0]:
                count[hostname] = (fix_id[0], fix_id[1])
    interaction_count = defaultdict(int)
    print("Start diffing", len(count))
    for hostname, (stage, fix_id) in count.items():
        results = json.load(open(f'{write_dir}/{hostname}/results.json', 'r'))
        events = results[stage]['events']
        for name in events['events']:
            interaction_count[name] += 1
            break
    return interaction_count, len(count)


def calc_impact(all_data, strict=True):
    target_hostnames = []
    for input_file, write_dir in all_data.items():
        data = json.load(open(f'./inputs/{input_file}', 'r'))
        total = 0
        valid_data = []
        for datum in data:
            hostname = datum['hostname']
            if os.path.exists(f'{write_dir}/{hostname}/results.json'):
                valid_data.append(datum)
        data = random.sample(valid_data, min(1000, len(valid_data)))
        for datum in data:
            hostname = datum['hostname']
            if os.path.exists(f'{write_dir}/{hostname}/results.json'):
                total += 1
                fix_id = detected_issue(write_dir, hostname, strict)
                if fix_id:
                    target_hostnames.append(hostname)
    print("Total targets", len(target_hostnames))
    fidelity_impact.fidelity_impact_detection(all_data.values(), target_hostnames)


def calc_impact_heatmap(all_data, strict=True):
    target_hostnames = []
    for input_file, write_dir in all_data.items():
        data = json.load(open(f'./inputs/{input_file}', 'r'))
        total = 0
        valid_data = []
        for datum in data:
            hostname = datum['hostname']
            if os.path.exists(f'{write_dir}/{hostname}/results.json'):
                valid_data.append(datum)
        data = random.sample(valid_data, min(1000, len(valid_data)))
        for datum in data:
            hostname = datum['hostname']
            if os.path.exists(f'{write_dir}/{hostname}/results.json'):
                total += 1
                fix_id = detected_issue(write_dir, hostname, strict)
                if fix_id:
                    target_hostnames.append(hostname)
    print("Total targets", len(target_hostnames))
    fidelity_impact.fidelity_impact_heatmap_detection(all_data.values(), target_hostnames)
        

all_data = {
    'eot_2016_sampled.json': 'writes_eot_2016',
    'eot_2020_sampled.json': 'writes_eot_2020',
    'carta_sampled.json': 'writes_carta',
    'm1m_sampled.json': 'writes_m1m'
}

# * Counting coverage
# all_counts = {}
# for input_file, write_dir in all_data.items():
#     data = json.load(open(f'./inputs/{input_file}', 'r'))
#     count = count_results(write_dir, data)
#     all_counts[write_dir] = count
# print(all_counts)

# * Count patch contribution
all_patches = defaultdict(int)
for input_file, write_dir in all_data.items():
    data = json.load(open(f'./inputs/{input_file}', 'r'))
    count = count_patches(write_dir, data)
    for k, v in count.items():
        all_patches[k] += v
print(all_patches, sum(all_patches.values()))


# * Counting diff elements
# all_elements_count = defaultdict(int)
# all_total = 0
# for input_file, write_dir in all_data.items():
#     print(input_file)
#     data = json.load(open(f'./inputs/{input_file}', 'r'))
#     elements_count, total = calc_diff_leaves(write_dir, data)
#     all_total += total
#     for k, v in elements_count.items():
#         all_elements_count[k] += v
# all_elements_count = {k: v/all_total for k, v in all_elements_count.items()}
# all_elements_count = sorted(list(all_elements_count.items()), key=lambda x: x[1], reverse=True)
# json.dump(all_elements_count, open('elements_diff_count.json', 'w+'), indent=2)

# * Counting diff interactions
# all_interaction_count = defaultdict(int)
# all_total = 0
# for input_file, write_dir in all_data.items():
#     print(input_file)
#     data = json.load(open(f'./inputs/{input_file}', 'r'))
#     interaction_count, total = calc_diff_interactions(write_dir, data)
#     all_total += total
#     for k, v in interaction_count.items():
#         all_interaction_count[k] += v
# all_interaction_count = {k: v/all_total for k, v in all_interaction_count.items()}
# all_interaction_count = sorted(list(all_interaction_count.items()), key=lambda x: x[1], reverse=True)
# json.dump(all_interaction_count, open('interaction_count.json', 'w+'), indent=2)

# def to_csv(file):
#     data = json.load(open(file, 'r'))
#     data = [{'type': d[0], 'fraction': d[1]} for d in data]
#     df = pd.DataFrame(data)
#     df.to_csv(f'{file.split(".")[0]}.csv', index=False)

# to_csv('interaction_count.json')


# * Counting impact
# calc_impact(all_data, strict=True)
# data = json.load(open('fidelity_impact.json', 'r'))
# data = {'impact': [d['impact'] for d in data]}
# df = pd.DataFrame(data)
# df.to_csv('fidelity_impact.csv', index=False)

# * Counting impact heatmap
# calc_impact_heatmap(all_data, strict=True)