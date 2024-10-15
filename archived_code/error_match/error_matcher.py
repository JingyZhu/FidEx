import json
import os
import pickle
import random
import re
import multiprocessing as mp

import sys
sys.path.append('../')
from execution_match import js_parse
from error_match import warc_io

class ErrorMatcher:
    def __init__(self, warcs=[]):
        self.warcs = warcs
        self.results = [] # Used for multiprocessing

    def read_warcs(self, path, max_sample=0, **kwargs):
        files = os.listdir(path)
        if max_sample > 0:
            files = random.sample(files, min(max_sample, len(files)))
        for i, file in enumerate(files):
            if i % 100 == 0:
                print("Reading warcs", i)
            file = os.path.join(path, file)
            try:
                warc_responses = warc_io.read_warc(file, **kwargs)
                self.warcs.append(warc_responses)
            except:
                continue

    @staticmethod
    def _read_response(idx, file, target_types=None):
        if idx % 100 == 0:
            print("Reading warcs", idx)
        warc_responses = warc_io.response_2_warc(file, target_types)
        return warc_responses

    def read_responses(self, path, max_sample=0, num_workers=1, **kwargs):
        files = os.listdir(path)
        if max_sample > 0:
            files = random.sample(files, min(max_sample, len(files)))
        def _collect(warc_responses):
            self.warcs.append(warc_responses)
        with mp.Pool(num_workers) as pool:
            for i, file in enumerate(files):
                file = os.path.join(path, file)
                pool.apply_async(self._read_response, args=(i, file), kwds=kwargs, callback=_collect)
            pool.close()
            pool.join()
            
    def save_warcs(self, pkl_path):
        pickle.dump(self.warcs, open(pkl_path, 'wb+'))
    
    def load_warcs(self, pkl_path):
         self.warcs = pickle.load(open(pkl_path, 'rb+'))
    
    @staticmethod
    def match_error(warc, lines, idx=0):
        """Abstract method for match error
        idx: index of the warc in the list
        """
        pass

    def match_error_multiproc(self, lines, num_workers=1, save_file='matched_resources', **kwargs):
        """Match error with multiple workers"""
        self.results = []
        def collect(result):
            self.results.extend(result)
            if len(result) > 0:
                json.dump(self.results, open(f'{save_file}.json', 'w+'), indent=2)
        """Iterate 500 a time"""
        for i in range(0, len(self.warcs), 500):
            with mp.Pool(num_workers) as pool:
                for j, warc in enumerate(self.warcs[i:min(i+500,len(self.warcs))]):
                    pool.apply_async(self.match_error, args=(warc, lines, i+j), kwds=kwargs, callback=collect)
                pool.close()
                pool.join()
                json.dump(self.results, open(f'{save_file}.json', 'w+'), indent=2)
        return self.results

class LineErrorMatcher(ErrorMatcher):
    """
    Match potential errorneous code directly by the error line
    is_re: is the provided lines is in regular expression format
    """
    @staticmethod
    def match_error(warc, lines, idx=0, is_re=False):
        if is_re:
            line_res = lines
        else:
            line_res = [re.escape(line) for line in lines]
        matched_urls = []
        for response in warc['responses']:
            matches = []
            try:
                body = response['body'].decode()
            except:
                # print('Failed decoding body for url', response['url'])
                continue
            for i, line_re in enumerate(line_res):
                for m in re.finditer(line_re, body):
                    matches.append({
                        'line': lines[i],
                        'text': body[max(0, m.start()-20):min(m.end()+20, len(body))],
                        'start': m.start(), 
                        'end': m.end()
                    })
            if len(matches) > 0:
                matched_urls.append({
                    'warc': warc['warc'],
                    'url': response['url'],
                    'matches': matches
                })
        return matched_urls

class FilenameErrorMatcher(ErrorMatcher):
    """Match potential errorneous code by the filename"""
    @staticmethod
    def match_error(warc, filenames, idx=0, is_re=False):
        if is_re:
            filename_res = filenames
        else:
            filename_res = [re.escape(filename) for filename in filenames]
        matched_urls = []
        for response in warc['responses']:
            matches = []
            url = response['url']
            for i, filename_re in enumerate(filename_res):
                if re.search(filename_re, url):
                    matches.append({
                        'filename': filenames[i],
                        'url': url
                    })
            if len(matches) > 0:
                matched_urls.append({
                    'warc': warc['warc'],
                    'matches': matches
                })
        return matched_urls

class ASTErrorMatcher(ErrorMatcher):
    """Match potential errorneous code by the AST"""
    @staticmethod
    def match_error(warc, lines, idx=0):
        lines_ast = [js_parse.JSTextParser(line).get_ast_node() for line in lines]
        # * Line will be wrapped with Program --> Statements
        lines_ast = [ast.children[0].children[0] for ast in lines_ast]
        ast_hashes = [hash(line_ast) for line_ast in lines_ast]
        matched_urls = []
        for response in warc['responses']:
            print(idx, "Matching js", response['url'])
            matches = []
            try:
                body = response['body'].decode()
            except:
                continue
            try:
                body_jst = js_parse.JSTextParser(body)
            except Exception as e:
                print("Error parsing script!", str(e), '\n')
                continue
            body_ast = body_jst.get_ast_node()
            for node in body_ast:
                for i, ast_hash in enumerate(ast_hashes):
                    if hash(node) == ast_hash:
                        matches.append({
                            'line': lines[i],
                            'text': body_jst.get_text(node.start, node.end),
                            'start': node.start,
                            'end': node.end
                        })
            if len(matches) > 0:
                matched_urls.append({
                    'warc': warc['warc'],
                    'url': response['url'],
                    'matches': matches
                })
        return matched_urls