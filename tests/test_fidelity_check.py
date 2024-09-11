import multiprocessing
import pandas as pd
from subprocess import call

import test_utils
from fidex.fidelity_check import fidelity_detect
from fidex.utils import url_utils
from fidex.record_replay import autorun


import os
HOME = os.path.expanduser("~")

PROXY = 'http://pistons.eecs.umich.edu:8078'
autorun.PROXYHOST = PROXY
chrome_data_dir = os.path.join(HOME, 'chrome_data')

def test_fidelity_detect_no_issue(tocmp='proxy'):
    PREFIX = 'gt_tranco'
    writes_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = [
        'https://sherlockcomms.com/',
        'https://www.stackcommerce.com/',
        'https://www.jimdo.com/',
        'https://stmichaelsschooldgp.in/',
        'https://www.si.edu/',
        'https://www.google.com.gh/',
        'https://www.infonline.de/',
        'https://crpt.ru/',
        'https://mojohost.com/',
        'https://www.dearfoams.com/',
        'https://www.healio.com/',
        'https://rtvbn.tv/',
        'https://yapolitic.ru/',
        'https://ediig.com/',
        'https://www.nike.com/',
        'https://www.healio.com/',
        'https://mrjack.bet/',

        'https://www.smartrecruiters.com/',
        
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}
    
    test_results = pd.DataFrame(columns=['url', 'correct?', 'stage (if not correct)'])
    available_host_url = {}
    for host, url in host_url.items():
        if os.path.exists(f'{writes_dir}/{host}'):
            available_host_url[host] = url
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes', 'stage (if not correct)': None}

    with multiprocessing.Pool(16) as p:
        results = p.starmap(fidelity_detect.fidelity_issue_all, [(f'{writes_dir}/{host}', 'live', tocmp, True, True) for host in available_host_url])
        
        for r in results:
            if r is None:
                continue
            hostname = r['hostname'].split('/')[-1]
            url = available_host_url[hostname]
            correct = 'Correct' if r['diff'] == False else 'Wrong'
            test_results.loc[len(test_results)] = {'url': url, 'correct?': correct, 'stage (if not correct)': r['diff_stage']}
    print(test_results)


def test_fidelity_detect_no_issue_e2e(runtimes=1, tocmp='proxy'):
    test_utils.init_test()
    arguments = ['-w', '-s', '--scroll', '-i']
    call(f'rm -rf {chrome_data_dir}/test', shell=True)
    call(f'cp -r {chrome_data_dir}/base {chrome_data_dir}/test', shell=True)
    urls = [
        'https://crpt.ru/',
        # 'https://7zap.com/en/',
        
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}
    test_results = pd.DataFrame(columns=['url', 'correct?', 'stage (if not correct)'])
    for host, url in host_url.items():
        autorun.record_replay(url, host,
                       chrome_data=f'{chrome_data_dir}/test',
                       wr_archive='test',
                       pw_archive='test',
                       proxy=True,
                       arguments=arguments)
        fidelity_detect.fidelity_issue_all(f'{HOME}/fidelity-files/writes/test/{host}', 'live', tocmp, True, True)
    print(test_results)

# test_fidelity_detect_no_issue()
test_fidelity_detect_no_issue_e2e()