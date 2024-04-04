import os
import json
from concurrent import futures
import requests
import random

input_file = 'ground_truth_urls.json'
output_file = 'ground_truth_url_new.json'

def test_break():

    def broken(i, url):
        print(i, url)
        try:
            r = requests.get(url, timeout=15)
            if r.status_code // 200 != 1:
                return None
            else:
                return r.url
        except:
            return None

    data = json.load(open(input_file, 'r'))
    results = []
    with futures.ThreadPoolExecutor(max_workers=16) as executor:
        rs = {}
        for i, datum in enumerate(data):
            url = datum['live_url']
            rs[url] = executor.submit(broken, i, url)
        for url, r in rs.items():
            r = r.result()
            if r is None:
                continue
            results.append({'live_url': r})
            if len(results) % 100 == 1:
                json.dump(results, open(output_file, 'w+'), indent=2)
        json.dump(results, open(output_file, 'w+'), indent=2)

test_break()