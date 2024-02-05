import json
import os
import pickle
import re
import multiprocessing as mp
from . import warc_io

class ErrorMatcher:
    def __init__(self):
        self.warcs = []
        self.results = [] # Used for multiprocessing

    def read_warcs(self, path, executable=True):
        files = os.listdir(path)
        for file in files:
            i += 1
            if i % 100 == 0:
                print("Reading warcs", i)
            file = os.path.join(path, file)
            warc_responses = warc_io.read_warc(path, executable_only=executable)
            self.warcs.append(warc_responses)

    def save_warcs(self, pkl_path):
        pickle.dump(self.warcs, open(pkl_path, 'wb+'))
    
    def load_warcs(self, pkl_path):
         self.warcs = pickle.load(open(pkl_path, 'rb+'))
    
    def match_error(self, line, num_workers=1):
        """Abstract method to match error"""
        pass


class LineErrorMatcher(ErrorMatcher):
    """Match error code directly by the error line"""
    def __init__(self):
        super().__init__()

    def match_error(self, line, num_workers=1):
        line_re = re.escape(line)
        self.results = []

        def match_worker(warc, line_re):
            matched_urls = []
            for response in warc['responses']:
                if not warc_io.executable(response['headers']):
                    continue
                matches = []
                try:
                    body = response['body'].decode()
                except:
                    # print('Failed decoding body for url', response['url'])
                    continue
                for m in re.finditer(line_re, body):
                    matches.append((m.start(), m.end()))
                if len(matches) > 0:
                    matched_urls.append({
                        'warc': warc['warc'],
                        'url': response['url'],
                        'matches': matches
                    })
            return matched_urls

        def collect(result):
            self.results.extend(result)
            if len(self.results) % 1000 == 0:
                json.dump(self.results, open('matched_resources.json', 'w+'), indent=2)

        with mp.Pool(num_workers) as pool:
            for warc in self.warcs:
                pool.apply_async(match_worker, args=(warc, line_re), callback=collect)
            pool.close()
            pool.join()
            json.dump(self.results, open('matched_resources.json', 'w+'), indent=2)