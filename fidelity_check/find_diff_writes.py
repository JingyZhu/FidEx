import json

def find_diff_elements(dirr) -> (list, list):
    """Find the unique elements between live and archive
    
    Args:
        dirr: directory including live_elements.json and archive_elements.json
    
    Returns:
        live_unique & archive_unique: [[xpaths that share the same prefix (essentially same component)]
    """
    live_element = json.load(open(f"{dirr}/live_elements.json"))
    archive_element = json.load(open(f"{dirr}/archive_elements.json"))
    live_unique, archive_unique = check_utils.diff(live_element, archive_element, returnHTML=False)
    return live_unique, archive_unique

def fidelity_issue(dirr) -> (bool, (list, list)):
    """Returns: (if fidelity issue, detailed unique elements in live and archive)"""
    live_unique, archive_unique = find_diff_elements(dirr)
    return len(live_unique) + len(archive_unique) > 0, (live_unique, archive_unique)

def fidelity_issue_screenshot(dirr) -> (bool, float):
    """Screenshot-based method to check fidelity issue
    
    Returns:
        (if fidelity issue, similarity score between live and archive screenshots)
    """
    live_screenshot = f"{dirr}/live.png"
    archive_screenshot = f"{dirr}/archive.png"
    simi = check_utils.compare_screenshot(live_screenshot, archive_screenshot)
    return simi < 1, simi

def collect_diff_writes(dirr):
    live_writes = json.load(open(f'{dirr}/live_writes.json', 'r'))
    archive_writes = json.load(open(f'{dirr}/archive_writes.json', 'r'))

    live_unique, archive_unique = check_utils.diff_writes(live_writes, archive_writes)
    live_unique_list, archive_unique_list = [], []
    for writes in live_unique.values():
        live_unique_list += writes
    for writes in archive_unique.values():
        archive_unique_list += writes

    unique = {
        'live': sorted(live_unique_list, key=lambda x: int(x['wid'].split(':')[0])),
        'archive': sorted(archive_unique_list, key=lambda x: int(x['wid'].split(':')[0]))
    }
    return unique

def locate_key_writes(dirr):
    live_unique_elements, archive_unique_elements = find_diff_elements(dirr)
    unique_writes = collect_diff_writes(dirr)
    results = {'live': [], 'archive': []}
    for unique_elements in live_unique_elements:
        element_key_writes = {}
        for element_xpath in unique_elements:
            related_writes = check_utils.associate_writes(element_xpath, unique_writes['live'])
            for write in related_writes:
                if write['wid'] not in related_writes:
                    element_key_writes[write['wid']] = write
        element_key_writes = sorted(element_key_writes.values(), key=lambda x: int(x['wid'].split(':')[0]))
        results['live'].append({
            'unique_elements': unique_elements,
            'key_related_writes': element_key_writes
        })
    for unique_elements in archive_unique_elements:
        element_key_writes = {}
        for element_xpath in unique_elements:
            related_writes = check_utils.associate_writes(element_xpath, unique_writes['archive'])
            for write in related_writes:
                if write['wid'] not in related_writes:
                    element_key_writes[write['wid']] = write
        element_key_writes = sorted(element_key_writes.values(), key=lambda x: int(x['wid'].split(':')[0]))
        results['archive'].append({
            'unique_elements': unique_elements,
            'key_related_writes': element_key_writes
        })
    return results


if __name__ == "__main__":
    import check_utils
    dirr = '../record_replay/writes/test'
    key_writes = locate_key_writes(dirr)
    live_additional = [len(w['key_related_writes']) for w in key_writes['live']]
    archive_additional = [len(w['key_related_writes']) for w in key_writes['archive']]
    print('live:', live_additional)
    print('archive:', archive_additional)
    json.dump(key_writes, open(f'{dirr}/key_writes.json', 'w+'), indent=2)
else:
    from . import check_utils