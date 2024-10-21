import multiprocessing
import pandas as pd
from subprocess import call
import os
import json

import test_utils
from fidex.fidelity_check import fidelity_detect
from fidex.error_pinpoint import pinpoint, js_exceptions
from fidex.utils import url_utils
from fidex.record_replay import autorun


import os
HOME = os.path.expanduser("~")

PROXY = 'http://pistons.eecs.umich.edu:8078'
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
        # 'https://tapping-game.win/',
        'https://www.taboola.com/',
        # 'https://www.dkb.de/',
        # 'https://www.gov.uk',
        # 'https://www.wireshark.org/',
        # 'https://www.scribd.com/',
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
            _, (live_unique, _) = fidelity_detect.fidelity_issue(dirr, 'live', 'archive', meaningful=True)
            diff_writes = pinpoint.extra_writes(dirr, live_unique, 'live','archive')
            exceptions = pinpoint.read_exceptions(dirr, 'archive', 'onload')
            syntax_errors = pinpoint.pinpoint_syntax_errors(diff_writes, exceptions)
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
        # 'https://www.passwordboss.com/', 
    ]
    if record:
        urls_copy = urls.copy()
        arguments = ['-w', '-t', '-s', '--scroll', '--headless', '-e']
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

    # for host, url in host_url.items():
    #     print(host)
    #     dirr = f'{write_dir}/{host}'
    #     if os.path.exists(f'{dirr}/live_writes.json') and os.path.exists(f'{dirr}/archive_writes.json'):
    #         _, (live_unique, _) = fidelity_detect.fidelity_issue(dirr, 'live', 'archive', meaningful=True)
    #         diff_writes = pinpoint.extra_writes(dirr, live_unique, 'live','archive')
    #         exceptions = pinpoint.read_exceptions(dirr, 'archive', 'onload')
    #         exception_errors = pinpoint.pinpoint_syntax_errors(diff_writes, exceptions)
    #         test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if len(exception_errors) > 0 else 'Wrong'}
    #         positive_reason.append({'host': host, 'exception_errors': [e.description for e in exception_errors]})
    #     else:
    #         print(f'No writes for {host}')
    #         test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes'}
    print(test_results)
    print(json.dumps(positive_reason, indent=2))


# test_syntax_error(record=True)
test_exception_error(record=True)