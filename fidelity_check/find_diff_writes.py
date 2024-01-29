import fidelity_check
import json

dirr = '../execution_match/examples/eta.lbl.gov_2'

def find_diff_elements():
    live_element = json.load(open(f"{dirr}/live_elements.json"))
    archive_element = json.load(open(f"{dirr}/archive_elements.json"))
    live_unique, archive_unique = fidelity_check.diff(live_element, archive_element, returnHTML=False)
    return live_unique, archive_unique

def collect_diff_writes():
    live_writes = json.load(open(f'{dirr}/live_writes.json', 'r'))
    archive_writes = json.load(open(f'{dirr}/archive_writes.json', 'r'))

    live_unique, archive_unique = fidelity_check.diff_writes(live_writes, archive_writes)
    live_unique_list, archive_unique_list = [], []
    for writes in live_unique.values():
        live_unique_list += writes
    for writes in archive_unique.values():
        archive_unique_list += writes

    unique = {
        'live': sorted(live_unique_list, key=lambda x: int(x['wid'].split(':')[0])),
        'archive': sorted(archive_unique_list, key=lambda x: int(x['wid'].split(':')[0]))
    }
    json.dump(unique, open(f'{dirr}/unique_writes.json', 'w'), indent=2)
    return unique

def locate_key_writes():
    live_unique_elements, archive_unique_elements = find_diff_elements()
    unique_writes = collect_diff_writes()
    for unique_elements in live_unique_elements:
        element_key_writes = {}
        for element_xpath in unique_elements:
            related_writes = fidelity_check.associate_writes(element_xpath, unique_writes['live'])
            for write in related_writes:
                if write['wid'] not in related_writes:
                    element_key_writes[write['wid']] = write
        element_key_writes = sorted(element_key_writes.values(), key=lambda x: int(x['wid'].split(':')[0]))
        print(json.dumps(element_key_writes, indent=2))

# collect_diff_writes()
locate_key_writes()