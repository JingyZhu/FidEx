import os
import pandas as pd
import requests
import test_utils
from subprocess import call

from fidex.record_replay import autorun
from fidex.utils import url_utils

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


arguments = ['-w', '-s', '--scroll', '-i']

HOME = os.path.expanduser("~")
chrome_data_dir = os.path.join(HOME, 'chrome_data')
PROXY = 'http://pistons.eecs.umich.edu:8078'

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

test_record()
    