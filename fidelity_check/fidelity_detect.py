import json
# Other imports are down below

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

def fidelity_issue(dirr, left_prefix='live', right_prefix='archive') -> (bool, (list, list)):
    """Returns: (if fidelity issue, detailed unique elements in live and archive)"""
    left_unique, right_unique = find_diff_elements(dirr, f'{left_prefix}_elements', f'{right_prefix}_elements')
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
    left_unique_elements, right_unique_elements = find_diff_elements(dirr, f'{left_prefix}_elements', f'{right_prefix}_elements')
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


if __name__ == "__main__":
    import check_utils
    dirr = '../record_replay/writes/nimhd.nih.gov_1'
    key_writes = locate_key_writes(dirr)
    live_additional = [len(w['key_related_writes']) for w in key_writes['live']]
    archive_additional = [len(w['key_related_writes']) for w in key_writes['archive']]
    print('live:', live_additional)
    print('archive:', archive_additional)
    json.dump(key_writes, open(f'{dirr}/key_writes.json', 'w+'), indent=2)
else:
    import sys, os
    # * To make it available to be imported from another directory
    script_path = os.path.abspath(__file__)
    dir_path = os.path.dirname(script_path)
    sys.path.append(dir_path)
    import check_utils