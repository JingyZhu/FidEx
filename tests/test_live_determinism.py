import pandas as pd
import json

from fidex.datacollect import live_determinism
from fidex.utils import url_utils

pd.set_option('display.max_colwidth', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', None) 

def test_non_determinism():
    urls = [
        "https://www.inkfrog.com/", # * Random increasing number
        "https://www.superenalotto.com/", # * clock counting
        
    ]
    host_url = {url_utils.calc_hostname(url): url for url in urls}
    
    test_results = pd.DataFrame(columns=['url', 'correct?', 'deterministic?'])
    for host, url in host_url.items():
        print(f"Testing {url}")
        deterministic, pair_comp = live_determinism.check_live_determinism(url, host)
        test_results.loc[len(test_results)] = {'url': url, 'correct?': 'Correct' if not deterministic else 'Wrong', 'deterministic?': json.dumps(pair_comp)}
    print(test_results)
    

test_non_determinism()