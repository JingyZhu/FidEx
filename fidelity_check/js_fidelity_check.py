"""
wrapper script run by js code at ../revert_rewrite/
"""
import json
import sys
import find_diff_writes

if __name__ == '__main__':
    data = json.load(sys.stdin.read())
    dirr = data['dir']
    has_issue, (live_unique, archive_unique) = find_diff_writes.fidelity_issue(dirr)
    sys.stdout.write(json.dumps({
        'has_issue': has_issue,
        'live_unique': live_unique,
        'archive_unique': archive_unique
    }))
    sys.stdout.flush()
        