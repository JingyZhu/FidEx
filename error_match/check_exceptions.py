import json
import os
import collections

def get_all_exceptions(directory):
    all_exceptions = []
    dirs = os.listdir(f'../writes/{directory}')
    for dirr in dirs:
        if not os.path.isdir(f'../writes/{directory}/{dirr}'):
            continue
        if not os.path.exists(f'../writes/{directory}/{dirr}/archive_exception_failfetch.json'):
            continue
        exceptions = json.load(open(f'../writes/{directory}/{dirr}/archive_exception_failfetch.json', 'r'))
        exceptions = [e for e in exceptions[0]['exceptions'] if 'description' in e]
        if len(exceptions) > 0:
            all_exceptions.append({
                'directory': dirr,
                'exceptions': exceptions
            })
    return all_exceptions

def categorize_exceptions(exceptions):
    exception_map = collections.defaultdict(set)
    for obj in exceptions:
        dirr = obj['directory']
        for exception in obj['exceptions']:
            first_line = exception['description'].split('\n')[0]
            exception_map[first_line].add(dirr)
    exception_map = [{
        'exception': k,
        'number': len(v)
     } for k, v in exception_map.items()]
    return sorted(exception_map, key=lambda x: x['number'], reverse=True)

if '__name__' == '__main__':
    all_exceptions = get_all_exceptions('eot-1k')
    json.dump(all_exceptions, open('all_exceptions_eot-1k.json', 'w+'), indent=2)
    exception_map = categorize_exceptions(all_exceptions)
    json.dump(exception_map, open('exception_map_eot-1k.json', 'w+'), indent=2)