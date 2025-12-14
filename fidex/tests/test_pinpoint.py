import multiprocessing
import pandas as pd
import subprocess
import os
import json
import glob
import random
import tempfile
import logging

import test_utils
from fidex.config import CONFIG
from fidex.fidelity_check import fidelity_detect
from fidex.error_pinpoint import pinpoint, js_exceptions, js_initiators, error_inject
from fidex.utils import url_utils
from fidex.record_replay import autorun


import os
HOME = os.path.expanduser("~")

PROXY = f'http://{CONFIG.host_proxy_test}'
PREFIX = 'test' if os.environ.get('PREFIX') is None else os.environ.get('PREFIX')
autorun.PROXYHOST = PROXY
autorun.SPLIT_ARCHIVE = False
error_inject.PROXYHOST = PROXY
chrome_data_dir = CONFIG.chrome_data_dir
# logging.getLogger().setLevel(logging.DEBUG)

def test_inject_error_js(prefix='gt_2k'):
    CONFIG.collection = prefix
    dirrs = glob.glob(f"{CONFIG.archive_dir}/writes/{prefix}/*")
    target_drrs = [
        'nordvpn.com_571daad656'
    ]
    dirrs = [d for d in dirrs if any([t in d for t in target_drrs])]

    def _check_syntax(code):
        with tempfile.NamedTemporaryFile(suffix=".js", delete=False) as temp_file:
            temp_file.write(code.encode('utf-8'))
            temp_file.flush()
            temp_file_path = temp_file.name
            # Run the Node.js syntax checker on the temporary file
            result = subprocess.run(
                ['node', 'check_syntax_error.js', temp_file_path],
                capture_output=True,
                text=True
            )
            # Output the result
            if result.returncode == 0:
                return True, result.stdout, temp_file_path
            else:
                return False, result.stderr, temp_file_path
    original_issue = []
    injection_issue = []
    # random.shuffle(dirrs)
    for dirr in dirrs[:100]:
        print("directory", dirr)
        ei = error_inject.ErrorInjector(dirr)
        ei.read_exceptions('interaction_20')
        ei.inject_error_js()
        overrides = json.load(open(f"{dirr}/overrides.json"))
        originals = json.load(open(f"{dirr}/originals.json"))
        for url, override in overrides.items():
            original_code = originals[url]
            original_syntax, original_output, original_path = _check_syntax(original_code)
            if not original_syntax:
                original_issue.append({
                    'dirr': dirr,
                    'url': url,
                    'error': original_output,
                    'file_path': original_path
                })
                continue
            override_code = override['source']
            override_syntax, override_output, override_path = _check_syntax(override_code)
            if not override_syntax and override['type'] == 'runtime':
                injection_issue.append({
                    'dirr': dirr,
                    'url': url,
                    'error': override_output,
                    'file_path': override_path
                })
            elif override_syntax and override['type'] == 'syntax':
                injection_issue.append({
                    'dirr': dirr,
                    'url': url,
                    'error': override_output,
                    'file_path': override_path
                })
    print("original_issue", json.dumps(original_issue, indent=2))
    print("injection_issue", json.dumps(injection_issue, indent=2))

def test_error_injector(record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    CONFIG.collection = PREFIX
    write_dir = f'{CONFIG.archive_dir}/writes/{PREFIX}'
    urls = [
        'https://anota.ai/home/', # Type Error
        # 'https://www.sjny.edu/', # Type Error Seen no diffs some time
        # 'https://www.quickflirt.com/', # Reference Error
        'https://www.sinsay.com/special/store/?nolang=true', # Reference Error but need to inject later
        # 'https://gamersupps.gg/', # Syntax Error
        'https://nordvpn.com/cybersecurity-site/', # Syntax error in HTML
    ]
    if record:
        urls_copy = urls.copy()
        arguments = ['-w', '-t', '-s', '--scroll', '-i', '--headless', '-e']
        metadata = autorun.record_replay_all_urls_multi(urls_copy, min(16, len(urls_copy)), 
                                    chrome_data_dir=chrome_data_dir,
                                    metadata_prefix='metadata/test',
                                    pw_archive='test',
                                    proxy=True,
                                    archive=True,
                                    arguments=arguments)
        urls = [metadata[u]['req_url'] if u in metadata else u for u in urls]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

    test_results = pd.DataFrame(columns=['url', 'correct?', 'frac_diff_eliminated'])

    for host, url in host_url.items():
        print(host)
        dirr = f'{write_dir}/{host}'
        if os.path.exists(f'{dirr}/live_writes.json') and os.path.exists(f'{dirr}/archive_writes.json'):
            fidelity_result = fidelity_detect.fidelity_issue_all(dirr, 'live', 'archive', screenshot=False, meaningful=True)
            if not fidelity_result.info['diff']:
                print(f'No diff for {host}')
                test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No diff', 'frac_diff_eliminated': 'N/A'}
                continue
            inject_result = error_inject.inject_errors(dirr, 0, 'proxy', 'archive', meaningful=True)
            if inject_result.mut_fidelity_result is None:
                test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Wrong', 'frac_diff_eliminated': 'N/A'}
            else:
                num_diffs = pinpoint.sum_diffs(inject_result.fidelity_result.live_unique, inject_result.fidelity_result.archive_unique)
                num_diffs_mut = pinpoint.sum_diffs(inject_result.mut_fidelity_result.live_unique, inject_result.mut_fidelity_result.archive_unique)
                test_results.loc[len(test_results)] = {'url': url, 'correct?': 
                                                       'Correct' if num_diffs > num_diffs_mut else 'Wrong',
                                                       'frac_diff_eliminated': 1 - num_diffs_mut / num_diffs}
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes', 'frac_diff_eliminated': 'N/A'}
    print(test_results)


def test_syntax_error(record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    write_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = [
        # 'https://tapping-game.win/',
        # 'https://www.taboola.com/',
        # 'https://www.dkb.de/',
        # 'https://www.gov.uk/',
        # 'https://www.wireshark.org/',
        # 'https://www.scribd.com/',
        # 'https://tribute.tg/', # Initiator syntax error
        # 'https://wordpress.org/', # Extra interaction caused by syntax error from import map
        # 'https://www.mace.com/', # cannot get effective writes, fallback to verbose_writes
        'https://www.bang.com/', # prepend operation tacking. (Warning: porn site)
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
        'https://felenasoft.com/en/', # set:innerHTML needs to be associated
        'https://www.envoyproxy.io/docs/envoy/latest/start/install', # insertAdjacent tracking
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

def test_common_issues(record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    write_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = [
        'https://lightwidget.com/', # svg use issues
    ]


test_inject_error_js('gt_2k')
# test_error_injector(record=True)
# test_syntax_error(record=True)
# test_exception_error(record=False)
# test_mutation(record=True)