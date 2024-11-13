"""Inject error into the original JS for proxy mode effectiveness experiment"""
import requests
import logging
import json
import re
from collections import defaultdict


from fidex.error_pinpoint import js_exceptions
from fidex.config import CONFIG
from fidex.utils import url_utils, logger, execution


class ErrorInjector:
    def __init__(self, dirr, right='archive'):
        self.dirr = dirr
        self.right = right
    
    def read_exceptions(self, stage):
        self.exceptions = js_exceptions.read_exceptions(self.dirr, self.right, stage)
        return self.exceptions
    
    @staticmethod
    def inject_syntax_error(code, loc=0):
        """Inject a syntax error into the code"""
        return code[:loc] + "@#$%^&SyntaxError For Fidex" + code[loc:]
    
    @staticmethod
    def inject_runtime_error(code, pos):
        """Inject a runtime error into the code"""
        delimitor = ',;()){}'
        def next_token(pos):
            match = re.search(r'\S+', code[pos:])
            if match:
                return match.group(0)
            return ''
        while pos >= 0:
            if code[pos] == '.':
                return code[:pos+1] + '___.___.' + code[pos+1:]
            if code[pos-1:pos+1] == '({':
                pos -= 1
            elif code[pos+1: pos+3] == '==':
                pos -= 1
            elif code[pos] in delimitor:
                break
            pos -= 1
        last_char = ''
        if code[pos] in ",;":
            last_char = code[pos]
        elif next_token(pos+1) in ['return', 'var', 'throw', 'let', 'const', 'function', '=>']:
            last_char = ';'
        elif pos < 0:
            last_char = ';'
        else:
            last_char = ","
        return code[:pos+1] \
                  + f'_ = (()=>{{throw new Error("Fidex Injected runtime error")}})(){last_char} '\
                  + code[pos+1:]
    
    def get_original_pos(self, exception: js_exceptions.JSException, original_code) -> "int | None":
        if not exception.has_stack:
            return
        top_frame = None
        idx = len(exception.stack.serialized_flat_reverse)-1
        while idx >= 0:
            url = exception.stack.serialized_flat_reverse[idx].url
            if  url and 'wombat.js' not in url:
                top_frame = exception.stack.serialized_flat_reverse[idx]
                break
            idx -= 1
        if not top_frame:
            return
        archive_code = execution.Frame.get_code(top_frame.url)
        pos = execution.ASTNode.linecol_2_pos(top_frame.lineNumber, 
                                                top_frame.columnNumber, 
                                                archive_code)
        original_pos = None
        # print("Archive line col:", top_frame.lineNumber, top_frame.columnNumber)
        if top_frame.associated_ast:
            path  = top_frame.ast_path
            program_id = top_frame.get_program_identifier()
            if 'script' in program_id:
                program_id = f"script:{int(program_id.split(':')[1])-3}"
            # print("program_id", program_id)
            original_jsparser = execution.JSTextParser(original_code)
            original_start, _ = original_jsparser.range_from_identifier(program_id)
            original_ast = original_jsparser.get_ast_node(pos=original_start)
            original_pos = original_ast.find_pos(path)['start'] + original_start
        else:
            text_matcher = execution.TextMatcher(archive_code)
            original_pos = text_matcher.archive_pos_2_live(pos)
        if not original_pos or original_pos > len(original_code):
            return
        return original_pos

    def get_top_frame_url(self, exception: js_exceptions.JSException):
        if exception.has_stack:
            idx = len(exception.stack.serialized_flat_reverse)-1
            while idx >= 0:
                url = exception.stack.serialized_flat_reverse[idx].url
                if url and 'wombat.js' not in url:
                    return url
                idx -= 1
            return None
        elif exception.scriptURL and 'wombat.js' not in exception.scriptURL:
            return exception.scriptURL

    def get_original_code(self, url) -> "str | None":
        try:
            # print("Before:", url)
            url = url_utils.replace_archive_host(url, f'http://{CONFIG.host}')
            url = url_utils.replace_archive_collection(url, CONFIG.collection)
            url = url_utils.add_id(url)
            # print("After:", url)
            r_original = requests.get(url)
            return r_original.text
        except Exception as e:
            logging.error(f"Error fetching {url}: {e}")
            return None

    def print_injection(self, url, exception,
                        original_code, original_pos,
                        injected_code):
                        
        top_frame = exception.stack.serialized_flat_reverse[-1]
        archive_code = execution.Frame.get_code(top_frame.url)
        pos = execution.ASTNode.linecol_2_pos(top_frame.lineNumber, 
                                                top_frame.columnNumber, 
                                                archive_code)
        print("URL:", url)
        print("Archive code snippet:", archive_code[pos-20:pos] + "***" + archive_code[pos:pos+20])
        print("Original code snippet:", original_code[original_pos-20:original_pos] + "***" + original_code[original_pos:original_pos+20])
        print("Injected code snippet:", injected_code[original_pos-20:original_pos] + "***" + injected_code[original_pos:original_pos+20])
        print("\n\n")

    def inject_error_js(self):
        override_map = {} # TODO: Ideally need to track all injected errors for the same script, and merge changes in the end.
        original_map = {}
        seen = set()
        for exception in self.exceptions:
            url = self.get_top_frame_url(exception)
            if not url or url in seen:
                continue
            seen.add(url)
            original_code = self.get_original_code(url)
            if not original_code:
                continue
            original_map[url_utils.filter_archive(url)] = original_code
            if exception.is_syntax_error:
                injected_code = ErrorInjector.inject_syntax_error(original_code)
                override_map[url_utils.filter_archive(url)] = {
                    "source": injected_code,
                    "type": "syntax",
                    "plainText": True
                }
            else: # Runtime error
                original_pos = self.get_original_pos(exception, original_code)
                if not original_pos:
                    continue
                injected_code = ErrorInjector.inject_runtime_error(original_code, original_pos)
                override_map[url_utils.filter_archive(url)] = {
                    "source": injected_code,
                    "type": "runtime",
                    "plainText": True
                }
                # self.print_injection(url, exception, original_code, original_pos, injected_code)
        json.dump(override_map, open(f"{self.dirr}/overrides.json", 'w'), indent=2)
        json.dump(original_map, open(f"{self.dirr}/originals.json", 'w'), indent=2)
        return override_map