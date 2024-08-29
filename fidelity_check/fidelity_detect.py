import json
from . import check_utils, check_meaningful
import time
import os

def dedeup_elements(layout):
    seen_xpath = set()
    new_elements = []
    for element in layout:
        if element['xpath'] not in seen_xpath:
            seen_xpath.add(element['xpath'])
            new_elements.append(element)
    return new_elements


def find_diff_elements(dirr, left_file, right_file) -> (list, list):
    """Find the unique elements between live and archive
    
    Args:
        dirr: directory including {left_file}.json and {right}.json
    
    Returns:
        left_unique & right_unique: [[xpaths that share the same prefix (essentially same component)]
    """
    left_element = json.load(open(f"{dirr}/{left_file}.json"))
    right_element = json.load(open(f"{dirr}/{right_file}.json"))
    left_unique, right_unique = check_utils.diff(left_element, right_element, returnHTML=False)
    return left_unique, right_unique


def fidelity_issue(dirr, left_prefix='live', right_prefix='archive', meaningful=True) -> (bool, (list, list)):
    """Returns: (if fidelity issue, detailed unique elements in live and archive)"""
    left_element = json.load(open(f"{dirr}/{left_prefix}_layout.json"))
    right_element = json.load(open(f"{dirr}/{right_prefix}_layout.json"))
    left_element, right_element = dedeup_elements(left_element), dedeup_elements(right_element)
    left_unique, right_unique = check_utils.diff(left_element, right_element, returnHTML=False)
    # * Same visual part
    if len(left_unique) + len(right_unique) > 0:
        if os.path.exists(f"{dirr}/{left_prefix}.png") and os.path.exists(f"{dirr}/{right_prefix}.png"):
            left_img, right_img = f"{dirr}/{left_prefix}.png", f"{dirr}/{right_prefix}.png"
            left_unique, right_unique = check_utils.filter_same_visual_part(left_img, left_unique, left_element,
                                                                            right_img, right_unique, right_element)
        else:
            print("Warning: diff layout tree but no screenshots found")
    # * Dynamic components filtration
    if len(left_unique) + len(right_unique) > 0:
        if os.path.exists(f"{dirr}/{left_prefix}_writes.json") and os.path.exists(f"{dirr}/{right_prefix}_writes.json"):
            left_writes = json.load(open(f"{dirr}/{left_prefix}_writes.json"))
            right_writes = json.load(open(f"{dirr}/{right_prefix}_writes.json"))
            left_unique, right_unique = check_utils.filter_dynamism(left_unique, left_writes, right_unique, right_writes)
        else:
            print("Warning: diff layout tree but no writes found")
    if meaningful:
        left_unique, right_unique = check_meaningful.meaningful_diff(left_element, left_unique, right_element, right_unique)
    return len(left_unique) + len(right_unique) > 0, (left_unique, right_unique)


def fidelity_issue_screenshot(dirr, left_file='live', right_file='archive') -> (bool, float):
    """Screenshot-based method to check fidelity issue
    
    Returns:
        (if fidelity issue, similarity score between left and right screenshots)
    """
    left_screenshot = f"{dirr}/{left_file}.png"
    right_screenshot = f"{dirr}/{right_file}.png"
    simi = check_utils.compare_screenshot(left_screenshot, right_screenshot)
    return simi < 1, simi


def fidelity_issue_all(dirr, left_prefix='live', right_prefix='archive', screenshot=False, meaningful=True) -> dict:
    """
    Check fidelity issue for all stages (i.e. onload, extraInteraction, and interaction)
    """
    start = time.time()
    # * Overall diff for layout and screenshot
    diff, s_diff = False, False
    # * If any stage is different, which one
    diff_stage, s_diff_stage, s_simi = None, None, None
    # * Checking onload
    ol_diff, _ = fidelity_issue(dirr, left_prefix, right_prefix, meaningful=meaningful)
    ol_s_diff = None
    if screenshot:
        ol_s_diff, s_simi = fidelity_issue_screenshot(dirr, left_prefix, right_prefix)
    if ol_diff:
        diff = True
        diff_stage = 'onload'
    if ol_s_diff:
        s_diff = True
        s_diff_stage = 'onload'
    if diff_stage and (not screenshot or s_diff_stage):
        return {
            'hostname': dirr,
            'diff': diff,
            'screenshot_diff': s_diff,
            'diff_stage': diff_stage,
            'sreenshot_diff_stage': s_diff_stage,
            'similarity': s_simi
        }
    
    # * Check for number of interaction
    left_events = json.load(open(f"{dirr}/{left_prefix}_events.json"))
    left_elements = json.load(open(f"{dirr}/{left_prefix}_layout.json"))
    left_elements_map = {e['xpath']: e for e in left_elements}
    right_events = json.load(open(f"{dirr}/{right_prefix}_events.json"))
    right_elements = json.load(open(f"{dirr}/{right_prefix}_layout.json"))
    right_elements_map = {e['xpath']: e for e in right_elements}
    
    print(dirr, 'onload elasped:', time.time()-start)
    left_idx, right_idx = [], []
    for event in left_events:
        if check_meaningful.meaningful_interaction(event, elements_map=left_elements_map) and os.path.exists(f'{dirr}/{left_prefix}_{event["idx"]}_layout.json'):
            left_idx.append(event['idx'])
    for event in right_events:
        if check_meaningful.meaningful_interaction(event, elements_map=right_elements_map) and os.path.exists(f'{dirr}/{right_prefix}_{event["idx"]}_layout.json'):
            right_idx.append(event['idx'])
    if len(left_idx) > len(right_idx):
        return {
            'hostname': dirr,
            'diff': True,
            'screenshot_diff': True,
            'diff_stage': 'extraInteraction',
            'sreenshot_diff_stage': 'extraInteraction'
        }
    
    # * Check for each interaction
    for k in range(len(left_idx)):
        i, j = left_idx[k], right_idx[k]
        i_diff, _ = fidelity_issue(dirr, f'{left_prefix}_{i}', f'{right_prefix}_{j}', meaningful=True)
        i_s_diff, i_s_simi = None, None
        if screenshot:
            i_s_diff, i_s_simi = fidelity_issue_screenshot(dirr, f'{left_prefix}_{i}', f'{right_prefix}_{j}')
        if i_diff and not diff:
            diff = True
            diff_stage = f'interaction_{i}'
        if i_s_diff and not s_diff:
            s_diff = True
            s_diff_stage = f'interaction_{i}'
            s_simi = i_s_simi
        print(dirr, f'{k+1}/{len(left_idx)}', 'elasped:', time.time()-start)
        if diff_stage and s_diff_stage:
            return {
                'hostname': dirr,
                'diff': diff,
                'screenshot_diff': s_diff,
                'diff_stage': diff_stage,
                'sreenshot_diff_stage': s_diff_stage,
                'similarity': s_simi
            }
    return {
        'hostname': dirr,
        'diff': diff,
        'screenshot_diff': s_diff,
        'diff_stage': diff_stage,
        'sreenshot_diff_stage': s_diff_stage,
        'similarity': s_simi
    }


def collect_diff_writes(dirr, left_prefix='live', right_prefix='archive'):
    left_writes = json.load(open(f'{dirr}/{left_prefix}_writes.json', 'r'))
    right_writes = json.load(open(f'{dirr}/{right_prefix}_writes.json', 'r'))

    left_unique, right_unique = check_utils.diff_writes(left_writes, right_writes)
    left_unique_list, right_unique_list = [], []
    for writes in left_unique.values():
        left_unique_list += writes
    for writes in right_unique.values():
        right_unique_list += writes

    unique = {
        left_prefix: sorted(left_unique_list, key=lambda x: int(x['wid'].split(':')[0])),
        right_prefix: sorted(right_unique_list, key=lambda x: int(x['wid'].split(':')[0]))
    }
    return unique


def locate_key_writes(dirr, left_prefix='live', right_prefix='archive'):
    left_unique_elements, right_unique_elements = find_diff_elements(dirr, f'{left_prefix}_layout', f'{right_prefix}_layout')
    unique_writes = collect_diff_writes(dirr, left_prefix, right_prefix)
    results = {left_prefix: [], right_prefix: []}
    for unique_elements in left_unique_elements:
        element_key_writes = {}
        for element_xpath in unique_elements:
            related_writes = check_utils.associate_writes(element_xpath, unique_writes[left_prefix])
            for write in related_writes:
                if write['wid'] not in related_writes:
                    element_key_writes[write['wid']] = write
        element_key_writes = sorted(element_key_writes.values(), key=lambda x: int(x['wid'].split(':')[0]))
        results[left_prefix].append({
            'unique_elements': unique_elements,
            'key_related_writes': element_key_writes
        })
    for unique_elements in right_unique_elements:
        element_key_writes = {}
        for element_xpath in unique_elements:
            related_writes = check_utils.associate_writes(element_xpath, unique_writes[right_prefix])
            for write in related_writes:
                if write['wid'] not in related_writes:
                    element_key_writes[write['wid']] = write
        element_key_writes = sorted(element_key_writes.values(), key=lambda x: int(x['wid'].split(':')[0]))
        results[right_prefix].append({
            'unique_elements': unique_elements,
            'key_related_writes': element_key_writes
        })
    return results