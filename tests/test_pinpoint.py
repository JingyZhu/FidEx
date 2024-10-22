import multiprocessing
import pandas as pd
from subprocess import call
import os
import json

import test_utils
from fidex.config import CONFIG
from fidex.fidelity_check import fidelity_detect
from fidex.error_pinpoint import pinpoint, js_exceptions, js_initiators
from fidex.utils import url_utils
from fidex.record_replay import autorun


import os
HOME = os.path.expanduser("~")

PROXY = f'http://{CONFIG.host_proxy_test}'
PREFIX = 'test' if os.environ.get('PREFIX') is None else os.environ.get('PREFIX')
autorun.PROXYHOST = PROXY
chrome_data_dir = os.path.join(HOME, 'chrome_data')

def test_syntax_error(record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    write_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = [
        'https://tapping-game.win/',
        'https://www.taboola.com/',
        'https://www.dkb.de/',
        'https://www.gov.uk/',
        'https://www.wireshark.org/',
        'https://www.scribd.com/',
        'https://tribute.tg/', # Initiator syntax error
    ]
    if record:
        urls_copy = urls.copy()
        arguments = ['-w', '-t', '-s', '--scroll', '-i', '--headless', '-e']
        metadata = autorun.record_replay_all_urls_multi(urls_copy, min(16, len(urls_copy)), 
                                    chrome_data_dir=chrome_data_dir,
                                    metadata_prefix='metadata/test',
                                    pw_archive='test',
                                    proxy=False,
                                    archive=True,
                                    arguments=arguments)
        urls = [metadata[u]['req_url'] if u in metadata else u for u in urls]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

    test_results = pd.DataFrame(columns=['url', 'correct?'])
    positive_reason = []

    for host, url in host_url.items():
        print(host)
        dirr = f'{write_dir}/{host}'
        if os.path.exists(f'{dirr}/live_writes.json') and os.path.exists(f'{dirr}/archive_writes.json'):
            fidelity_result = fidelity_detect.fidelity_issue_all(dirr, 'live', 'archive', screenshot=False, meaningful=True)
            if not fidelity_result.info['diff']:
                print(f'No diff for {host}')
                test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No diff'}
                continue
            diff_stage = fidelity_result.info['diff_stage']
            diff_stage = diff_stage if diff_stage != 'extraInteraction' else 'onload'
            live = 'live' if diff_stage =='onload' else f'live_{diff_stage.split("_")[1]}'
            archive = 'archive' if diff_stage == 'onload' else f'archive_{diff_stage.split("_")[1]}'
            diff_writes = pinpoint.extra_writes(dirr, fidelity_result.live_unique, live, archive)
            exceptions = js_exceptions.read_exceptions(dirr, 'archive', diff_stage)
            initiators = js_initiators.read_initiators(dirr, 'live')
            syntax_errors = pinpoint.pinpoint_syntax_errors(diff_writes, exceptions, initiators)
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if len(syntax_errors) > 0 else 'Wrong'}
            positive_reason.append({'host': host, 'syntax_errors': [e.description for e in syntax_errors]})
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes'}
    print(test_results)
    print(json.dumps(positive_reason, indent=2))


def test_exception_error(record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    write_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = [
        'https://www.nit.pt/', # No reference error
        'https://www.passwordboss.com/', # Userway extra interaction
        'https://www.billabong.com/'
    ]
    if record:
        urls_copy = urls.copy()
        arguments = ['-w', '-t', '-s', '--scroll', '-i', '--headless', '-e']
        metadata = autorun.record_replay_all_urls_multi(urls_copy, min(16, len(urls_copy)), 
                                    chrome_data_dir=chrome_data_dir,
                                    metadata_prefix='metadata/test',
                                    pw_archive='test',
                                    proxy=False,
                                    archive=True,
                                    arguments=arguments)
        urls = [metadata[u]['req_url'] if u in metadata else u for u in urls]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

    test_results = pd.DataFrame(columns=['url', 'correct?'])
    positive_reason = []

    for host, url in host_url.items():
        print(host)
        dirr = f'{write_dir}/{host}'
        if os.path.exists(f'{dirr}/live_writes.json') and os.path.exists(f'{dirr}/archive_writes.json'):
            fidelity_result = fidelity_detect.fidelity_issue_all(dirr, 'live', 'archive', screenshot=False, meaningful=True)
            if not fidelity_result.info['diff']:
                print(f'No diff for {host}')
                test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No diff'}
                continue
            diff_stage = fidelity_result.info['diff_stage']
            diff_stage = diff_stage if diff_stage != 'extraInteraction' else 'onload'
            live = 'live' if diff_stage =='onload' else f'live_{diff_stage.split("_")[1]}'
            archive = 'archive' if diff_stage == 'onload' else f'archive_{diff_stage.split("_")[1]}'
            diff_writes = pinpoint.extra_writes(dirr, fidelity_result.live_unique, live, archive)
            exceptions = pinpoint.read_exceptions(dirr, 'archive', diff_stage)
            exception_errors = pinpoint.pinpoint_exceptions(diff_writes, exceptions)
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if len(exception_errors) > 0 else 'Wrong'}
            positive_reason.append({'host': host, 'exception_errors': [e.description for e in exception_errors]})
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes'}
    print(test_results)
    print(json.dumps(positive_reason, indent=2))


test_syntax_error(record=False)
# test_exception_error(record=False)