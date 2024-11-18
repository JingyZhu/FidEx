"""Inject error into the original JS for proxy mode effectiveness experiment"""
import requests
import logging
import json
import re
import os

from subprocess import call
from collections import defaultdict
from functools import lru_cache

from fidex.record_replay import autorun
from fidex.fidelity_check import fidelity_detect
from fidex.error_pinpoint import js_exceptions
from fidex.error_pinpoint.pinpoint import PinpointResult, sum_diffs
from fidex.config import CONFIG
from fidex.utils import url_utils, logger, execution, common

CHROME_DATA_INIT = False
PROXYHOST = f'http://{CONFIG.host_proxy}'
HOST = f'http://{CONFIG.host}'

def next_token(code, pos):
    reserved_chars = r'.,{}()\[\];:\'\"/\\+\-*&#|^%!=<>?@#$'
    match = re.search(rf'[^\s{reserved_chars}]+', code[pos:])
    if match:
        return match.group(0)
    return ''

class ErrorInjector:
    def __init__(self, dirr, left_prefix='live', right_prefix='archive', excep_selector=None):
        self.dirr = dirr
        self.left_prefix = left_prefix
        self.right_prefix = right_prefix
        self.excep_selector = excep_selector
    
    def read_exceptions(self, stage):
        self.exceptions = js_exceptions.read_exceptions(self.dirr, self.right_prefix, stage)
        if self.excep_selector:
            self.exceptions = [e for e in self.exceptions if self.excep_selector.match(e)]
        return self.exceptions
    
    @staticmethod
    def inject_syntax_error(code, pos=0):
        """Inject a syntax error into the code"""
        html_tags = re.compile(r'</?([a-zA-Z]+)>')
        is_html = html_tags.search(code)
        if not is_html:
            return "\n@#$%^&SyntaxError For Fidex" + code
        else:
            return code[:pos] + "\n@#$%^&SyntaxError For Fidex" + code[pos:]
    
    @staticmethod
    def inject_runtime_error(code, pos):
        """Inject a runtime error into the code"""
        delimitor = ',;()){}'
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
        elif next_token(code, pos+1) in ['return', 'var', 'throw', 'let', 'const', 'function', '=>']:
            last_char = ';'
        elif pos < 0:
            last_char = ';'
        else:
            last_char = ","
        return code[:pos+1] \
                  + f' _ = (()=>{{throw new Error("Fidex Injected runtime error")}})(){last_char} '\
                  + code[pos+1:]
    
    @staticmethod
    def inject_reference_error(code, pos):
        """Inject a reference error into the code"""
        next_t = next_token(code, pos)
        if next_t in ['if', 'switch', 'for', 'while', 'do', 'try', 'catch', 'finally', 'with', 'function', '=>']:
            return code[:pos] + " ___.___\n " + code[pos:]
        else:
            return code[:pos] + " ___.___." + code[pos:]

    @staticmethod
    def merge_override(original_map, override_map):
        new_map = {}
        for url, overrides in override_map.items():
            if any([o['type'] == 'syntax' for o in overrides]):
                new_map[url] = [o for o in overrides if o['type'] == 'syntax'][0]
                continue
            original_text = original_map[url]
            override_texts = [o['source'] for o in overrides]
            merged_text = common.merge_strings(original_text, override_texts)
            new_map[url] = {
                "source": merged_text,
                "type": "runtime",
                "plainText": True
            }
        return new_map
    
    def get_original_pos(self, exception: js_exceptions.JSException, original_code) -> "int | None":
        if not exception.has_stack:
            return
        top_frame = self.get_top_frame(exception)
        if not top_frame:
            return
        archive_code = execution.Frame.get_code(top_frame.url)
        pos = top_frame.relative_position
        original_pos = None
        logging.debug(f"Archive line col: {top_frame.lineNumber} {top_frame.columnNumber} {top_frame.code[top_frame.position:top_frame.position+20]}")
        program_id = top_frame.get_program_identifier()
        logging.debug(f"Program ID: {program_id}")
        if 'script' in program_id:
            idx = int(program_id.split(':')[1])-3
            if idx < 0: # Error in added script instead of the original ones
                return
            program_id = f"script:{idx}"
        original_jsparser = execution.JSTextParser(original_code)
        original_start, original_end = original_jsparser.range_from_identifier(program_id)

        if top_frame.associated_ast:
            try:
                path  = top_frame.ast_path
                original_ast = original_jsparser.get_ast_node(pos=original_start)
                original_pos = original_ast.find_pos(path)['start'] + original_start
            except Exception as e:
                logging.error(f"Error in finding original pos, fallback to text_matcher: {e}")
                text_matcher = top_frame.text_matcher
                original_pos = text_matcher.archive_pos_2_live(pos) + original_start
        else:
            text_matcher = top_frame.text_matcher
            original_pos = text_matcher.archive_pos_2_live(pos) + original_start
        if not original_pos or original_pos > len(original_code):
            return
        return original_pos

    @lru_cache(maxsize=None)
    def get_top_frame(self, exception: js_exceptions.JSException):
        if exception.has_stack:
            idx = len(exception.stack.serialized_flat_reverse)-1
            while idx >= 0:
                url = exception.stack.serialized_flat_reverse[idx].url
                if url and 'wombat.js' not in url:
                    return exception.stack.serialized_flat_reverse[idx]
                idx -= 1
            return None
        elif exception.scriptURL and 'wombat.js' not in exception.scriptURL:
            return execution.Frame(url=exception.scriptURL, lineNumber=exception.line, columnNumber=exception.column, functionName='')

    def get_original_code(self, url) -> "str | None":
        try:
            # print("Before:", url)
            url = url_utils.replace_archive_host(url, HOST)
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
        override_map = defaultdict(list)
        original_map = {}
        seen = set()
        for exception in self.exceptions:
            top_frame = self.get_top_frame(exception)
            if not top_frame or top_frame in seen:
                continue
            seen.add(top_frame)
            url = top_frame.url
            original_code = self.get_original_code(url)
            if not original_code:
                continue
            original_map[url_utils.filter_archive(url)] = original_code
            original_pos = self.get_original_pos(exception, original_code)
            if exception.is_syntax_error:
                injected_code = ErrorInjector.inject_syntax_error(original_code, pos=original_pos)
                override_map[url_utils.filter_archive(url)].append({
                    "source": injected_code,
                    "type": "syntax",
                    "plainText": True
                })
            else: # Runtime error
                if not original_pos:
                    continue
                if exception.is_reference_error:
                    injected_code = ErrorInjector.inject_reference_error(original_code, pos=original_pos)
                else:
                    injected_code = ErrorInjector.inject_runtime_error(original_code, pos=original_pos)
                override_map[url_utils.filter_archive(url)].append({
                    "source": injected_code,
                    "type": "runtime",
                    "plainText": True
                })
                # self.print_injection(url, exception, original_code, original_pos, injected_code)
        override_map = ErrorInjector.merge_override(original_map, override_map)
        SUFFIX = '' if not self.excep_selector else f'-{self.excep_selector.md5()}'
        json.dump(override_map, open(f"{self.dirr}/overrides{SUFFIX}.json", 'w'), indent=2)
        json.dump(original_map, open(f"{self.dirr}/originals{SUFFIX}.json", 'w'), indent=2)
        return override_map

def inject_errors(dirr, idx=0, left_prefix='proxy', right_prefix='archive', meaningful=True, excep_selector: js_exceptions.JSExcepSelector=None):
    """
    excep_selector: If available, only inject error for the selected exception
    """
    global CHROME_DATA_INIT
    arguments = ['-w', '-t', '-s', '--scroll', '--proxy', PROXYHOST, '-e', '--headless', '--override']
    SUFFIX = '' if not excep_selector else f'-{excep_selector.md5()}'
    if SUFFIX:
        arguments.append(f'overrides{SUFFIX}.json')
    fidelity_result = fidelity_detect.fidelity_issue_all(dirr, left_prefix, right_prefix, screenshot=False, meaningful=meaningful)
    if not fidelity_result.info['diff']:
        return PinpointResult(fidelity_result=fidelity_result,
                              mut_fidelity_result=None,
                              diff_writes=[], 
                              pinpointed_errors=[])
    error_injector = ErrorInjector(dirr, left_prefix, right_prefix, excep_selector=excep_selector)
    error_injector.read_exceptions(fidelity_result.info['diff_stage'])
    error_injector.inject_error_js()
    overrides = json.load(open(f"{dirr}/overrides{SUFFIX}.json"))
    if len(overrides) == 0:
        return PinpointResult(fidelity_result=fidelity_result,
                              mut_fidelity_result=fidelity_result,
                              diff_writes=[], 
                              pinpointed_errors=[])
    write_path = '/'.join(dirr.split('/')[:-1]) if '/' in dirr else '.'
    archive_name = dirr.split('/')[-1]
    proxy_url = json.load(open(f'{dirr}/metadata.json'))['url']
    arguments.append('-i')
    if fidelity_result.info['diff_stage'] in ['extraInteraction', 'onload']:
        arguments.append('0')
    else:
        stage_num = int(fidelity_result.info['diff_stage'].split('_')[1])
        arguments.append(str(stage_num + 1))
    chrome_data_dir = os.path.dirname(autorun.DEFAULT_CHROMEDATA)
    if not CHROME_DATA_INIT:
        CHROME_DATA_INIT = True
        call(f'rm -rf {chrome_data_dir}/error_inject_{common.get_hostname()}_{idx}', shell=True)
        call(['cp', '--reflink=auto', '-r', f'{chrome_data_dir}/base', f'{chrome_data_dir}/error_inject_{common.get_hostname()}_{idx}'])
    
    autorun.replay(proxy_url, archive_name,
                    chrome_data=f'{chrome_data_dir}/error_inject_{common.get_hostname()}_{idx}',
                    write_path=write_path,
                    filename=f'proxy-inject{SUFFIX}',
                    arguments=arguments)
    fidelity_result_mut = fidelity_detect.fidelity_issue_all(dirr, 
                                                             f'proxy-inject{SUFFIX}', 
                                                             right_prefix, 
                                                             screenshot=False,
                                                             need_exist=False)
    empty_fidelity_result = fidelity_detect.FidelityResult(info={'diff': False, 'diff_stage': None}, 
                                                     live_unique=[], archive_unique=[])
    if not fidelity_result_mut.info['diff']:
        return PinpointResult(fidelity_result=fidelity_result,
                                mut_fidelity_result=fidelity_result_mut,
                                diff_writes=[], 
                                pinpointed_errors=[])
    if fidelity_result_mut.info['diff_stage'] != fidelity_result.info['diff_stage']:
        if common.stage_later(fidelity_result_mut.info['diff_stage'], fidelity_result.info['diff_stage']):
            return PinpointResult(fidelity_result=fidelity_result,
                                    mut_fidelity_result=empty_fidelity_result,
                                    diff_writes=[], 
                                    pinpointed_errors=[])
    elif sum_diffs(fidelity_result_mut.live_unique, fidelity_result_mut.archive_unique) \
        < sum_diffs(fidelity_result.live_unique, fidelity_result.archive_unique):
        return PinpointResult(fidelity_result=fidelity_result,
                                mut_fidelity_result=fidelity_result_mut,
                                diff_writes=[], 
                                pinpointed_errors=[])
    return PinpointResult(fidelity_result=fidelity_result,
                            mut_fidelity_result=fidelity_result,
                            diff_writes=[], 
                            pinpointed_errors=[])