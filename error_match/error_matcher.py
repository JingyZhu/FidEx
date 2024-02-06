import json
import os
import pickle
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
    
    def match_error(self, warc, line):
        """Abstract method for match error"""
        pass

    def match_error_multiproc(self, line, num_workers=1, save_file='matched_resources'):
        """Match error with multiple workers"""
        self.results = []
        def collect(result):
            self.results.extend(result)
            if len(self.results) % 100 == 0:
                json.dump(self.results, open(f'{save_file}.json', 'w+'), indent=2)
        with mp.Pool(num_workers) as pool:
            for warc in self.warcs:
                pool.apply_async(self.match_error, args=(warc, line), callback=collect)
            pool.close()
            pool.join()
            json.dump(self.results, open(f'{save_file}.json', 'w+'), indent=2)
        return self.results

class LineErrorMatcher(ErrorMatcher):
    """Match potential errorneous code directly by the error line"""
    def match_error(self, warc, line):
        line_re = re.escape(line)
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
                matches.append({
                    'text': m.group(),
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

class ASTErrorMatcher(ErrorMatcher):
    """Match potential errorneous code by the AST"""
    def match_error(self, warc, line):
        jst_parser = js_parse.JSTextParser(line)
        line_ast = jst_parser.get_ast_node()
        # * Line will be wrapped with Program --> Statements
        line_ast = line_ast.children[0].children[0]
        ast_hash = hash(line_ast)
        matched_urls = []
        print(len(warc['responses']))
        for response in warc['responses']:
            print("Matching error", response['url'])
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
                if hash(node) == ast_hash:
                    matches.append({
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