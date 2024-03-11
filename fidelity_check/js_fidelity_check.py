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
    has_issue, (left_unique, right_unique) = find_diff_writes.fidelity_issue(dirr, left, right)
    sys.stdout.write(json.dumps({
        'different': has_issue,
        'left_unique': left_unique,
        'right_unique': right_unique
    }))
    sys.stdout.flush()
        