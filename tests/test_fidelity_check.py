import multiprocessing
import pandas as pd
from subprocess import call
import os

import test_utils
from fidex.config import CONFIG
from fidex.fidelity_check import fidelity_detect
from fidex.utils import url_utils
from fidex.record_replay import autorun


import os
HOME = os.path.expanduser("~")

PROXY = f'http://{CONFIG.host_proxy_test}'
PREFIX = 'test' if os.environ.get('PREFIX') is None else os.environ.get('PREFIX')
autorun.PROXYHOST = PROXY
autorun.SPLIT_ARCHIVE = False
chrome_data_dir = os.path.join(HOME, 'chrome_data')

def test_fidelity_detect_no_issue(tocmp='proxy', record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    writes_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = {
        'proxy': [
            # 'https://www.sherlockcomms.com/',
            # 'https://www.stackcommerce.com/',
            # 'https://www.jimdo.com/',
            # 'https://www.si.edu/',
            # 'https://www.google.com.gh/',
            # 'https://www.infonline.de/',
            # 'https://crpt.ru/',
            # 'https://www.dearfoams.com/',
            # 'https://rtvbn.tv/',
            # 'https://yapolitic.ru/',
            # 'https://ediig.com/',
            # 'https://www.healio.com/',
            # 'https://gettyimages.co.jp/',
            # 'https://www.passwordboss.com/',
            # 'https://jrgroupindia.com/',
            # 'https://realrobo.in/',
            # 'https://www.nit.pt/', # Order of interaction
            
            # 'https://mojohost.com/',
            # 'https://www.hinet.net/',
            # 'https://q10.com/Colombia',
            # 'https://mrjack.bet/',
            # 'https://www.efortuna.pl/',
            # 'https://www.yellowshop.es/',
            # 'https://www.eldestapeweb.com/',
            # 'https://www.radtouren.at/',
            'https://www.chinadaily.com.cn/', # Carousel static match but descendant diff

            # * Need to resolve
            # 'https://www.nist.gov/',
            # 'https://confluent.cloud/',
            # 'https://www.trustpilot.com/',
            
            # ? Fail to load somtime
            # 'https://www.smartrecruiters.com/',
            
            # ? Observed non-determinism across loads but should have not issue
            # 'https://www.gsa.gov/', # svg 404 without redirection
            # 'https://www.tado.com/all-en', # Messenger seems only appears in live
            # 'https://www.pinterest.com/',

            # ! Unable to fix now
            'https://www.instagram.com/', # ! Can be wrong sometime because of long onload
            # 'https://videojs.com/', #! Long carousel that always trigger timeouts
            # 'https://bigsport.today/', # ! (Non-determinisitically) blocked by adblocker
        ],

    'archive': [
            # * Should be solved
            'https://web.mit.edu/', # set:textContent writes to text
            'https://www.princeton.edu/', # 1x1 extra span in text   
            'https://www.inkfrog.com/',
            'https://www.klaviyo.com/', # hidden different dimensions in archive
            'https://www.skype.com/en/', # Long waiting before fully loaded
            'https://miniclip.com/',
            'https://www.tado.com/all-en', # Messenger seems only appears in live
            'https://oenergetice.cz/', # Spotify player
            'https://equativ.com:443/', # Lazy loading image
            'https://pinterestdownloader.com/', # ytp diff on play time
            'https://comozero.it/', # Blocked ads

            # ? Double check or need to resolve
            'https://ht-web.com/', # Interaction 2
            'https://www.instagram.com/',
            'https://www.efortuna.pl/',
            'https://www.trustpilot.com/',
            'https://www.camara.leg.br/',
            'https://tarhely.eu/',
            'https://www.pinterest.com/', # interaction_0 popping "i" timing
            'https://9to5mac.com/', # Infinite scroll icon + Eager image loading in archive
            'https://dsport.bg/', # Lazy loading + relative path vs. absolute path
            'https://patch.com/', # Img lazying loading with patched image

            # ! Unable to fix now
            # 'https://www.warnerrecords.com/',
            'https://lipighor.com/', # Lazy loading?
            # 'https://www.trainsimcommunity.com/', # Clicking on cookie accept trigger a reload? in live            
        ]

    }
    urls = urls[tocmp]
    if record:
        urls_copy = urls.copy()
        arguments = ['-w', '-t', '-s', '--scroll', '-i', '--headless', '-e']
        metadata = autorun.record_replay_all_urls_multi(urls_copy, min(16, len(urls_copy)), 
                                    chrome_data_dir=chrome_data_dir,
                                    metadata_prefix='metadata/test',
                                    pw_archive='test',
                                    proxy=tocmp=='proxy',
                                    archive=tocmp=='archive',
                                    arguments=arguments)
        urls = [metadata[u]['req_url'] if u in metadata else u for u in urls]
    host_url = {url_utils.calc_hostname(url): url for url in urls}
    
    test_results = pd.DataFrame(columns=['url', 'correct?', 'stage (if not correct)'])
    available_host_url = {}
    for host, url in host_url.items():
        if os.path.exists(f'{writes_dir}/{host}/{tocmp}_writes.json'):
            available_host_url[host] = url
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes', 'stage (if not correct)': None}

    with multiprocessing.Pool(32) as p:
        results = p.starmap(fidelity_detect.fidelity_issue_all, [(f'{writes_dir}/{host}', 'live', tocmp, False, True) for host in available_host_url])
        
        for r in results:
            if r is None:
                continue
            hostname = r.info['hostname'].split('/')[-1]
            url = available_host_url[hostname]
            correct = 'Correct' if r.info['diff'] == False else 'Wrong'
            test_results.loc[len(test_results)] = {'url': url, 'correct?': correct, 'stage (if not correct)': r.info['diff_stage']}
    print(test_results)


def test_fidelity_detect_with_issue(tocmp='proxy', record=False):
    global PREFIX
    if record:
        PREFIX = 'test'
        test_utils.init_test()
    writes_dir = f'{HOME}/fidelity-files/writes/{PREFIX}'
    urls = {
        'proxy': [
            'https://www.starlink.com/', # Watch now icon seems not in proxy
            'https://egihosting.com/', # Page keeps loading (fail to register serviceworker)
        ],
        'archive': [
            # 'https://www.bootstrapcdn.com/', # Missing twitter button
            # 'https://voxeu.org', # Browser incompatibility
            # 'https://oenergetice.cz/', # Spotify player
            # 'https://www.telstra.com.au/', # Phone recommendation and carousel not flashing
            'https://www.mysql.com/', # Cookie preferences can't show in archive
            'https://www.nih.gov/',
            'https://www.futurelearn.com:443/', # body dynamically matched but not children
        ]
    }
    urls = urls[tocmp]
    if record:
        urls_copy = urls.copy()
        arguments = ['-w', '-t', '-s', '--scroll', '-i', '--headless', '-e']
        metadata = autorun.record_replay_all_urls_multi(urls_copy, min(16, len(urls_copy)), 
                                    chrome_data_dir=chrome_data_dir,
                                    metadata_prefix='metadata/test',
                                    pw_archive='test',
                                    proxy=tocmp=='proxy',
                                    archive=tocmp=='archive',
                                    arguments=arguments)
        urls = [metadata[u]['req_url'] if u in metadata else u for u in urls]
    host_url = {url_utils.calc_hostname(url): url for url in urls}
    
    test_results = pd.DataFrame(columns=['url', 'correct?', 'stage (if correct)'])
    available_host_url = {}
    for host, url in host_url.items():
        if os.path.exists(f'{writes_dir}/{host}/{tocmp}_writes.json'):
            available_host_url[host] = url
        else:
            print(f'No writes for {host}')
            test_results.loc[len(test_results)] = {'url': url, 'correct?': 'No writes', 'stage (if correct)': None}

    with multiprocessing.Pool(32) as p:
        results = p.starmap(fidelity_detect.fidelity_issue_all, [(f'{writes_dir}/{host}', 'live', tocmp, False, True) for host in available_host_url])
        
        for r in results:
            if r is None:
                continue
            hostname = r.info['hostname'].split('/')[-1]
            url = available_host_url[hostname]
            correct = 'Wrong' if r.info['diff'] == False else 'Correct'
            test_results.loc[len(test_results)] = {'url': url, 'correct?': correct, 'stage (if correct)': r.ifno['diff_stage']}
    print(test_results)


test_fidelity_detect_no_issue(tocmp='archive', record=False)
# test_fidelity_detect_with_issue(tocmp='archive', record=True)