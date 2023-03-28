import json
from fable.utils import crawl, sic_transit
from concurrent import futures
import random


def all_sites_archives():
    sites = open('top-sites.txt', 'r').read().strip().split('\n')
    sites = sites[:200]
    result = []
    for i, site in enumerate(sites):
        site_url = f'https://{site}*'
        param_dict = {
            'output': 'json',
            'url': site_url,
            'filter': ['mimetype:text/html', 'statuscode:200'],
            'collapse': 'urlkey',
            'limit': 10000
        }
        archives, _ = crawl.wayback_index(site_url, param_dict=param_dict)
        print(i, site, len(archives))
        archives = random.sample(archives, min(len(archives), 100))
        result.append({
            'site': f'https://{site}',
            'archives': [a[1] for a in archives]
        })
        json.dump(result, open('data/topsite_archives.json', 'w+'), indent=2)
    json.dump(result, open('data/topsite_archives.json', 'w+'), indent=2)


def sample_working_urls():
    data_in = 'data/topsite_archives.json'
    data_out = 'data/topsite_urls.json'
    data = json.load(open(data_in, 'r'))
    def _worker(i, d):
        site = d['site']
        print(i, site)
        archives = d['archives']
        sample_archives = random.sample(archives, min(5, len(archives)))
        for a in sample_archives:
            print(a)
            broken, _ = sic_transit.broken(a, html=True, redir_home=True)
            if not broken:
                return a
        return site

    results = []
    with futures.ThreadPoolExecutor(max_workers=16) as e:
        for i, d in enumerate(data):
            r = e.submit(_worker, i, d)
            results.append(r)
        results = [r.result() for r in results]
        json.dump(results, open(data_out, 'w+'), indent=2)
    
# all_sites_archives()
sample_working_urls()