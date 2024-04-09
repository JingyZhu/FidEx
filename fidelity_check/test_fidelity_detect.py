import fidelity_detect
import os

base = '/vault-swift/jingyz/fidelity-files/writes/ground_truth/'

def test_no_issue():
    dirs = [
        'mview.md.gov_58ccccb7a7',
        'www.hirschlandadler.com_ad3c962cee',
        'www.cdc.gov_e1302c87d2',
        'www.nationalarchivesstore.org_5843d6ab64'
    ]
    for dirr in dirs:
        print(dirr)
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(os.path.join(base, dirr), 'live', 'archive')
        assert not issue

test_no_issue()