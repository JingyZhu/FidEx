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
        'https://wordpress.org/', # Extra interaction caused by syntax error from import map
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
            pinpointer = pinpoint.Pinpointer(dirr, 0, 'live', 'archive')
            pinpointer.add_fidelity_result(fidelity_result)
            _ = pinpointer.extra_writes()
            pinpointer.read_related_info()
            syntax_errors = pinpointer.pinpoint_syntax_errors()
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
        'https://www.billabong.com/',
        'https://superbet.com/', # No main part of the page overall
        'https://www.transip.nl/', # Previous seen bug
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
            pinpointer = pinpoint.Pinpointer(dirr, 0, 'live', 'archive')
            pinpointer.add_fidelity_result(fidelity_result)
            _ = pinpointer.extra_writes()
            pinpointer.read_related_info()
            exception_errors = pinpointer.pinpoint_exceptions()
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if len(exception_errors) > 0 else 'Wrong'}
            positive_reason.append({'host': host, 'exception_errors': [e.description for e in exception_errors]})
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes'}
    print(test_results)
    print(json.dumps(positive_reason, indent=2))


def test_mutation(record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    write_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = [
        'https://www.nit.pt/', # top popup
        'https://www.kualo.com/', # Trustpilot popup
        'https://www.vivastreet.co.uk/', # Response.json error
        'https://opensource.jp/', # Google translate
        'https://www.google.ee/',
        'https://www.futurelearn.com:443/', # Override HTML Assignment
        'https://ectopic.org.uk/', # JSON parse on wrongly js rewritten JSON
        'https://www.estadiodeportivo.com/', # firstElementChild is wombat script
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
            pinpointer = pinpoint.Pinpointer(dirr, 0, 'live', 'archive')
            pinpointer.add_fidelity_result(fidelity_result)
            _ = pinpointer.extra_writes()
            pinpointer.read_related_info()
            mutation_errors = pinpointer.pinpoint_mutations()
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if len(mutation_errors) > 0 else 'Wrong'}
            positive_reason.append({'host': host, 'mutation_errors': [e.description for e in mutation_errors]})
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes'}
    print(test_results)
    print(json.dumps(positive_reason, indent=2))


# test_syntax_error(record=False)
# test_exception_error(record=False)
test_mutation(record=True)