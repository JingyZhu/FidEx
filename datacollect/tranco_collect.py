"""
Collect URLs from tranco
"""
import tranco
import random
import json
from concurrent import futures
import requests

counter = 0

def tranco_list(cache=True) -> tranco.tranco.TrancoList:
    t = tranco.Tranco(cache=cache, cache_dir='.tranco')
    return t.list()

def check_url_working(url) -> (str, bool):
    """Check if the URL is working"""
    global counter
    good = False
    status = 0
    try:
        r = requests.get(url, timeout=15)
        good = r.status_code == 200
        status = r.status_code
        url = r.url if good else url
    except:
        pass
    print("Finished", url, good, status, counter)
    counter += 1
    return (url, good)

    
def sample_urls(range_n=100):
    """
    Entry func
    Sample range_n URLs from 1-1k, 1k-10k, 10k-100k, 100k-1M respectively
    """
    tl = tranco_list()
    all_urls = tl.top(1_000_000)
    ranges = [(1, 10_000), (10_000, 100_000), (100_000, 1_000_000)]
    sample_urls = []
    for ra in ranges:
        urls = random.sample(all_urls[ra[0]:ra[1]], int(2*range_n))
        urls_working = []
        with futures.ThreadPoolExecutor(max_workers=64) as executor:
            rs = {}
            for url in urls:
                rs[url] = executor.submit(check_url_working, f'https://{url}')
            for url, r in rs.items():
                r = r.result()
                if not r[1]:
                    continue
                urls_working.append(r[0])
        assert(len(urls_working) >= range_n), f"Only {len(urls_working)} working URLs found"
        sample_urls.append({
            "range": f"{ra[0]}-{ra[1]}",
            "urls": urls_working[:range_n]
        })
    json.dump(sample_urls, open('tranco_urls_sample.json', 'w+'), indent=2)

if __name__ == "__main__":
    sample_urls(1000)