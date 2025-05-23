"""
Crawling the EOT website for data collection
"""
import requests
from bs4 import BeautifulSoup
import json
import time
import random
from concurrent import futures
from urllib.parse import urlsplit
from publicsuffixlist import PublicSuffixList
from collections import defaultdict

total_item = 59902
base_url = 'http://eotarchive.cdlib.org/search'
headers = {'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'}

class HostExtractor:
    def __init__(self):
        self.psl = PublicSuffixList()
    
    def extract(self, url):
        """
        Wayback: Whether the url is got from wayback
        """
        if 'http://' not in url and 'https://' not in url:
            url = 'http://' + url
        hostname = urlsplit(url).netloc.strip('.').split(':')[0]
        return self.psl.privatesuffix(hostname)


def get_page_data(idx):
    data = []
    url = f'{base_url}?browse-all=yes;startDoc={idx}'
    print(url)
    count = 0
    r = None
    while count < 5:
        try:
            r = requests.get(url, headers=headers)
            break
        except Exception as e:
            print(str(e))
            time.sleep(5)
    if r is None:
        return None
    soup = BeautifulSoup(r.text, 'lxml')
    items = soup.find_all('div', {'class': 'docHit'})
    for item in items:
        top_tr = item.find('tr', {'valign': 'top'})
        trs = top_tr.find_all('tr')
        title = trs[0].find('a').find('b').text
        archive_url = trs[1].find('td', {'class': 'col3url'}).text
        live_url = trs[2].find('td', {'class': 'col3'}).text
        if len(trs) > 4:
            desc = trs[4].find('td', {'class': 'col3'}).text
        else:
            desc = ""
        data.append({
            'title': title,
            'archive_url': archive_url,
            'live_url': live_url,
            'description': desc
        })
    return data

def get_data():
    num_pages = total_item // 20
    page_sample = random.sample(list(range(num_pages)), 500)
    # page_sample = [0, 1, 2, 3, 4, 5] + page_sample
    page_sample.sort()

    result = []
    for ps in page_sample:
        data = get_page_data(ps*20+1)
        if data is None:
            continue
        result += data
        print("Total unique:", len(set([d['live_url'] for d in result])))
        json.dump(result, open('eot_10k.json', 'w+'), indent=2)
        time.sleep(5)
    json.dump(result, open('eot_10k.json', 'w+'), indent=2)

def test_break():
    data = json.load(open('data/eot_10k.json', 'r'))
    live_urls_map = {d['live_url']: d for d in data}
    def broken(i, url):
        print(i, url)
        try:
            r = requests.get(url, timeout=15)
            return r.status_code // 200 != 1
        except:
            return True
    results = []
    with futures.ThreadPoolExecutor(max_workers=16) as executor:
        rs = {}
        for i, (url, d) in enumerate(live_urls_map.items()):
            rs[url] = executor.submit(broken, i, url)
        for url, r in rs.items():
            r = r.result()
            d = live_urls_map[url]
            d['broken'] = r
            results.append(d)
            if len(results) % 100 == 1:
                json.dump(results, open('data/eot_10k_broken.json', 'w+'), indent=2)
        json.dump(results, open('data/eot_10k_broken.json', 'w+'), indent=2)

def sample_good():
    data = json.load(open('data/eot_1k.json', 'r'))
    good_urls = [b for b in data if not b['broken']]
    site_urls = defaultdict(list)
    h = HostExtractor()
    for g in good_urls:
        site_urls[h.extract(g['live_url'])].append(g)
    sample_site_urls = random.sample(list(site_urls.items()), 120)
    sample_urls = [random.choice(v) for v in dict(sample_site_urls).values()]
    json.dump(sample_urls, open('data/eot_good_100.json', 'w+'), indent=2)

def all_good():
    data = json.load(open('data/eot_10k.json', 'r'))
    good_urls = [b for b in data if not b['broken']]
    json.dump(good_urls, open('data/eot_good_all.json', 'w+'), indent=2)

all_good()