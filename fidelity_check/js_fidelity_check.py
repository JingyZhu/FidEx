"""
wrapper script run by js code at ../revert_rewrite/
"""
import json
import sys
import find_diff_writes

if __name__ == '__main__':
    data = json.load(sys.stdin)
    dirr = data['dir']
    left, right = data['left'], data['right']
    left_writes, right_writes = json.load(open(f'{dirr}/{left}_writes.json', 'r')), json.load(open(f'{dirr}/{right}_writes.json', 'r'))
    has_issue, (left_unique, right_unique) = find_diff_writes.fidelity_issue(dirr, left, right)
    sys.stdout.write(json.dumps({
        'different': has_issue,
        'left_unique': left_unique,
        'right_unique': right_unique,
        'left_writes': len(left_writes['rawWrites']),
        'right_writes': len(right_writes['rawWrites']),
    }))
    sys.stdout.flush()
        