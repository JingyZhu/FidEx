"""
Count number of exceptions and failed fetches when recording and replaying the page
"""
import json
from urllib.parse import urlsplit
import os
from adblockparser import AdblockRules

rules = None

def get_filter_lists():
    global rules
    filter_lists = open(os.path.join(os.path.dirname(__file__), 'filter-lists.txt'), 'r').read().strip().split('\n')
    rules = AdblockRules(filter_lists)

get_filter_lists()

def num_exceptions_failedfetches(excep_ff):
    num_excep = len(excep_ff['exceptions'])
    valid_ff = {}
    for ff in excep_ff['failedFetches']:
        if ff['method'] == 'POST':
            continue
        if not rules.should_block(ff['url']):
            valid_ff[ff['url']] = ff
    return num_excep, valid_ff

def run(metadata):
    metadata = json.load(open(metadata, 'r'))
    new_data = {}

    total_valid_ff = []
    for url, value in metadata.items():
        directory = value['directory']
        live_path = f'../recording/pageinfo/{directory}/exception_failfetch.json'
        archive_path = f'../recording/pageinfo/{directory}_archive/exception_failfetch.json'
        if not os.path.exists(live_path) or not os.path.exists(archive_path):
            value['archive_delta_exception'] = 'N/A'
            value['archive_delta_failfetch'] = 'N/A'
            total_valid_ff.append({'directory': value['directory']})
        else:
            live_obj = json.load(open(live_path, 'r'))
            # * Just for onload
            live_obj = live_obj[0]
            live_excep, live_ff = num_exceptions_failedfetches(live_obj)
            archive_obj = json.load(open(archive_path, 'r'))
            # * Just for onload
            archive_obj = archive_obj[0]
            archive_excep, archive_ff = num_exceptions_failedfetches(archive_obj)
            value['archive_delta_exception'] = archive_excep - live_excep
            value['archive_delta_failfetch'] = len(archive_ff) - len(live_ff)
            total_valid_ff.append({
                'directory': value['directory'],
                'live_valid_ff': list(live_ff.values()),
                'archive_valid_ff': list(archive_ff.values())            
            })
        new_data[url] = value
    json.dump(new_data, open('../recording/carta_metadata.json', 'w+'), indent=2)
    json.dump(total_valid_ff, open('valid_failfetch.json', 'w+'), indent=2)


# obj = json.load(open('/home/jingyz/fidelity/recording/pageinfo/2022.vbexhibitions.hk_1_archive' + '/exception_failfetch.json', 'r'))
# print(num_exceptions_failedfetches(obj))

if __name__ == '__main__':
    run('../recording/carta_interact_metadata.json')