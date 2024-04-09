"""
wrapper script run by js code at ../revert_rewrite/
"""
import json
import sys
import fidelity_detect

def _strict_decide(initial_elements, initial_writes, final_writes, final_elements):
    """
    1. More writes
    2. Same writes no missing elements
    """
    if len(initial_writes["rawWrites"]) < len(final_writes["rawWrites"]):
        return True
    elif len(initial_writes["rawWrites"]) == len(final_writes["rawWrites"]):
        return len(initial_elements) <= len(final_elements)
    return False

if __name__ == '__main__':
    data = json.load(sys.stdin)
    dirr = data['dir']
    left, right = data['left'], data['right']
    strict = data['strict']
    left_writes, right_writes = json.load(open(f'{dirr}/{left}_writes.json', 'r')), json.load(open(f'{dirr}/{right}_writes.json', 'r'))
    left_elements, right_elements = json.load(open(f'{dirr}/{left}_elements.json', 'r')), json.load(open(f'{dirr}/{right}_elements.json', 'r'))
    has_issue, (left_unique, right_unique) = fidelity_detect.fidelity_issue(dirr, left, right)
    if strict:
        has_issue = has_issue and _strict_decide(left_elements, left_writes, right_writes, right_elements)
    sys.stdout.write(json.dumps({
        'different': has_issue,
        'left_unique': left_unique,
        'right_unique': right_unique,
        'left_writes': len(left_writes['rawWrites']),
        'right_writes': len(right_writes['rawWrites']),
    }))
    sys.stdout.flush()
        