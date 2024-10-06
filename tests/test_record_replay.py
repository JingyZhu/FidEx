import os
import pandas as pd
import requests
import test_utils
from subprocess import call

from fidex.record_replay import autorun
from fidex.utils import url_utils

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


arguments = ['-w', '-s', '--scroll', '-i', '-e', '--headless']

HOME = os.path.expanduser("~")
chrome_data_dir = os.path.join(HOME, 'chrome_data')
PROXY = 'http://pistons.eecs.umich.edu:8078'
ARCHIVEDIR = os.path.join(os.path.expanduser("~"), 'fidelity-files')
autorun.PROXYHOST = PROXY

def test_record():
    test_utils.init_test()
    call(f'rm -rf {chrome_data_dir}/test', shell=True)
    call(f'cp -r {chrome_data_dir}/base {chrome_data_dir}/test', shell=True)
    urls = [
        'https://mrjack.bet/',
        'https://realrobo.in/',
        'https://telegraphyx.ru?utm_source=landing',
        'https://ioam.de/',
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

    test_results = pd.DataFrame(columns=['url', 'correct?', 'status_code'])
    for host, url in host_url.items():
        autorun.record_replay(url, host,
                       chrome_data=f'{chrome_data_dir}/test',
                       wr_archive='test',
                       pw_archive='test',
                       proxy=True,
                       arguments=arguments)
        r = requests.get(url, proxies={'http': PROXY, 'https': PROXY}, verify=False)
        test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if r.status_code == 200 else 'Wrong', 'status_code': r.status_code}
    print(test_results)

def _check_record_replay(host):
    stages = ['live', 'archive', 'proxy']
    error_stages = []
    for stage in stages:
        if not os.path.exists(f'{ARCHIVEDIR}/writes/test/{host}/{stage}_events.json'):
            error_stages.append(stage)
    return error_stages

def test_record_replay():
    test_utils.init_test()

    urls = [
        'https://www.yellowshop.es/',
        'https://crpt.ru/',
        'https://gettyimages.co.jp/',
        'https://starlink.com',
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

    test_results = pd.DataFrame(columns=['url', 'correct?', 'failed stages'])
    for host, url in host_url.items():
        autorun.record_replay(url, host,
                       chrome_data=f'{chrome_data_dir}/test',
                       wr_archive='test',
                       pw_archive='test',
                       proxy=True,
                       arguments=arguments)
        failed_stages = _check_record_replay(host)
        if len(failed_stages) == 0:
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct', 'failed stages': None}
        else:
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Wrong', 'failed stages': ','.join(failed_stages)}

    print(test_results)

def test_record_replay_multiproc():
    test_utils.init_test()
    urls = [
        'https://www.yellowshop.es/',
        'https://crpt.ru/',
        'https://gettyimages.co.jp/',
        'https://starlink.com',
        'https://www.hevs.ch/fr',
        'https://www.radtouren.at/', # * Reflect.get without receiver
        'https://www.si.edu/', # * Reflect.get without receiver
        'https://egihosting.com/', # Looks like archive can't finish
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

    test_results = pd.DataFrame(columns=['url', 'correct?', 'status_code'])
    urls_copy = urls.copy()
    autorun.record_replay_all_urls_multi(urls_copy, min(16, len(urls_copy)), 
                                            chrome_data_dir=chrome_data_dir,
                                            metadata_prefix='metadata/test',
                                            pw_archive='test',
                                            proxy=True,
                                            arguments=arguments)
    for host, url in host_url.items():    
        failed_stages = _check_record_replay(host)
        if len(failed_stages) == 0:
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct', 'failed stages': None}
        else:
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Wrong', 'failed stages': ','.join(failed_stages)}
    print(test_results)

test_record_replay_multiproc()
    