"""
    Automated process of find diff elements, associated key writes and reason for it
"""
import json
from subprocess import check_call
import sys
import os

sys.path.append('../')
from fidelity_check import fidelity_detect
from utils import url_utils

dirr = 'examples/eta.lbl.gov_2'
archive_url = 'http://localhost:8080/exec_match/20240129135149/https://eta.lbl.gov/'

uas = url_utils.archive_split(archive_url)
print("Matching live stack to archive's")
check_call(['node', 'matchArchive.js', '--hostname', uas['hostname'], 
            '-d', dirr, '-f', 'live', '-a', uas['collection'], '-t', uas['ts']])
matched_writes = json.load(open(f'{dirr}/live_archiveWriteStacks.json', 'r'))
matched_writes = {w['writeID']: w for w in matched_writes}

print("Finding diff elements and associated key writes")
abs_dirr = os.path.abspath(dirr)
key_related_writes = fidelity_detect.locate_key_writes(abs_dirr)
print("Number of key related writes:", len(key_related_writes['live']))

reasons = []
for i, krw in enumerate(key_related_writes['live']):
    if len(krw['key_related_writes']) == 0:
        continue
    print(f"Debugging {i}")
    first_write = krw['key_related_writes'][0]
    first_matched_write = matched_writes[first_write['wid']]
    json.dump(first_matched_write, open(f'{dirr}/first_matched_write.json', 'w+'), indent=2)
    check_call(['node', 'reason.js', '-d', dirr, '-f', 'first_matched_write', archive_url])
    reason = json.load(open(f'{dirr}/reason.json', 'r'))
    reasons.append({
        'unique_elements': krw['unique_elements'],
        'key_write': first_write,
        'reason': reason
    })

json.dump(reasons, open(f'{dirr}/fidelity_reasons.json', 'w+'), indent=2)