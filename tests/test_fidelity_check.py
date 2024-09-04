import multiprocessing
import pandas as pd

from fidex.fidelity_check import fidelity_detect
from fidex.utils import url_utils

import os
HOME = os.path.expanduser("~")
PREFIX = 'gt_tranco'
writes_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'

def test_fidelity_detect_no_issue(tocmp='proxy'):
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


def test_fidelity_detect_autorun(runtimes=1, tocmp='proxy'):
    urls = [
        'https://crpt.ru/',
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}

test_fidelity_detect_no_issue()