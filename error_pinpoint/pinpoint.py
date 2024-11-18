import json
import time
import os
import bs4
import logging
from dataclasses import dataclass
from subprocess import call

from fidex.record_replay import autorun
from fidex.fidelity_check import fidelity_detect, layout_tree, js_writes
from fidex.error_pinpoint import js_exceptions, js_initiators
from fidex.utils import url_utils, common, execution, logger
from fidex.config import CONFIG


def sum_diffs(left_unique, right_unique):
    left_sum = sum([len(branch) for branch in left_unique])
    right_sum = sum([len(branch) for branch in right_unique])
    return left_sum

def extra_writes(dirr, left_diffs, right_diffs, left_prefix='live', right_prefix='archive') -> "list[js_writes.JSWrite]":
    """Get extra writes from left to right, or right to left, depending on the side"""
    diff_writes = []
    left_info = fidelity_detect.LoadInfo(dirr, left_prefix)
    right_info = fidelity_detect.LoadInfo(dirr, right_prefix)
    left_layout = layout_tree.build_layout_tree(left_info.elements, left_info.writes, left_info.write_stacks,
                                                include_verbose_writes=True)
    right_layout = layout_tree.build_layout_tree(right_info.elements, right_info.writes, right_info.write_stacks,
                                                include_verbose_writes=True)
    
    # * Enumerate [effective writes, verbose writes] x [left, right]. Starting from the most common and making senses one
    collect_writes = [lambda x: x.writes, lambda x: x.verbose_writes]
    sides = ['left', 'right']
    for collect in collect_writes:
        for side in sides:
            extra_layout = left_layout if side == 'left' else right_layout
            target_layout = right_layout if side == 'left' else left_layout
            target_stacks = set([w.serialized_stack_async for w in target_layout.all_writes])

            diffs = left_diffs if side == 'left' else right_diffs
            for branch in diffs:
                writes = set()
                for xpath in branch:
                    element = extra_layout.all_nodes[xpath]
                    element_writes = collect(element)
                    for w in element_writes:
                        if 1 or w.serialized_stack_async not in target_stacks:
                            writes.add(w)
                            break
                if len(writes) > 0:
                    diff_writes.append(sorted(list(writes), key=lambda x: int(x.wid.split(':')[0])))
            if len(diff_writes) > 0:
                break
        if len(diff_writes) > 0:
            break
    diff_writes.sort(key=lambda x: int(x[0].wid.split(':')[0]))
    return diff_writes

def _search_initiators(start_scripts: "List[str]",
                        target_exceps: "List[js_exceptions.JSException]", 
                        initiators: "Dict[str, js_initiators.JSIntiator]") -> "js_exceptions.JSException | None":
    """Given a set of scripts, check if any of the 1.scripts 2.initiator for scripts are in the target exceptions
    Args:
        start_scripts: List of scripts to start with
        target_exceps: List of exceptions to search for
        initiators: map of script to initiator
    """
    url_exception = {url_utils.filter_archive(excep.scriptURL): excep for excep in target_exceps}
    dfs_stack = start_scripts.copy()
    visited = set()
    while len(dfs_stack) > 0:
        script = dfs_stack.pop()
        if script in visited:
            continue
        visited.add(script)
        if script in url_exception:
            return url_exception[script]
        if script in initiators:
            for initiator in initiators[script].initiators:
                dfs_stack.append(initiator.url)
    return None

def _search_imports(start_scripts: "List[str]",
                    target_exceps: "List[js_exceptions.JSException]", 
                    import_map: "Dict[str, str]") -> "js_exceptions.JSException | None":
    """Given a set of scripts, check if it is imported from any of the target exceptions with the info of import map
    Args: (First two are same as above)
        import_map: map of script alias to script URL
    """
    url_exception = {url_utils.filter_archive(excep.scriptURL): excep for excep in target_exceps}
    url_code = {
                url_utils.filter_archive(excep.scriptURL): 
                execution.Frame.get_code(url_utils.replace_archive_host(excep.scriptURL, CONFIG.host)) 
                for excep in target_exceps
            }
    def import_from_code(code, key):
        lines = code.split('\n')
        for line in lines:
            if key in line and "import" in line:
                return True
        return False
    reverse_import_map = {v: k for k, v in import_map.items()}
    # Currently only do one depth search. Ideally, for each key, we should search for all scrips requested during loading, and then do a DFS
    for url in start_scripts:
        if url not in reverse_import_map:
            continue
        key = reverse_import_map[url]
        for excep_url, excep_code in url_code.items():
            if import_from_code(excep_code, key):
                return url_exception[excep_url]
    return None


@dataclass
class PinpointResult:
    fidelity_result: fidelity_detect.FidelityResult
    mut_fidelity_result: fidelity_detect.FidelityResult
    diff_writes: "List[js_writes.JSWrite]"
    pinpointed_errors: "List[js_exceptions.JSExcep]"

    def errors_to_dict(self):
        return [e.to_dict() for e in self.pinpointed_errors]
    
    def mut_result(self):
        if self.mut_fidelity_result is None:
            return None
        return {
            'original_num_diff': sum_diffs(self.fidelity_result.live_unique, self.fidelity_result.archive_unique),
            'mut_diff_stage': self.mut_fidelity_result.info['diff_stage'],
            'mut_num_diff': sum_diffs(self.mut_fidelity_result.live_unique, self.mut_fidelity_result.archive_unique),
        }

class Pinpointer:
    CHROME_DATA_INIT = False

    def __init__(self, dirr, idx=0, left_prefix='live', right_prefix='archive', meaningful=True):
        self.dirr = dirr
        self.idx = idx
        self.left_prefix = left_prefix
        self.right_prefix = right_prefix
        self.meaningful = meaningful
    
    def add_fidelity_result(self, fidelity_result: fidelity_detect.FidelityResult):
        self.fidelity_result = fidelity_result
        self.diff_stage = fidelity_result.info['diff_stage']
        self.diff_stage = self.diff_stage if self.diff_stage != 'extraInteraction' else 'onload'
        self.left = self.left_prefix if self.diff_stage =='onload' else f'{self.left_prefix}_{self.diff_stage.split("_")[1]}'
        self.right = self.right_prefix if self.diff_stage == 'onload' else f'{self.right_prefix}_{self.diff_stage.split("_")[1]}'
    
    def extra_writes(self):
        self.diff_writes = extra_writes(self.dirr, left_diffs=self.fidelity_result.live_unique, 
                                        right_diffs=self.fidelity_result.archive_unique,
                                        left_prefix=self.left, right_prefix=self.right)
        return self.diff_writes

    def read_related_info(self):
        self.exceptions = js_exceptions.read_exceptions(self.dirr, self.right_prefix, self.diff_stage)
        self.initiators = js_initiators.read_initiators(self.dirr, self.left_prefix)
        self.url = json.load(open(f'{self.dirr}/metadata.json'))['req_url']
        self.archive_url = json.load(open(f'{self.dirr}/metadata.json'))['archive_url']
        self.import_map = js_initiators.read_import_map(self.url)
    
    def read_original_info(self, stage):
        left_stage = self.left_prefix if stage in ['onload', 'extraInteraction'] \
                        else f'{self.left_prefix}_{stage.split("_")[1]}'
        right_stage = self.right_prefix if stage in ['onload', 'extraInteraction'] \
                        else f'{self.right_prefix}_{stage.split("_")[1]}'
        if not hasattr(self, 'left_info'):
            self.left_info = fidelity_detect.LoadInfo(self.dirr, left_stage)
            self.left_info.read_info()
            self.left_info.gen_xpath_map()
        if not hasattr(self, 'right_info'):
            self.right_info = fidelity_detect.LoadInfo(self.dirr, right_stage)
            self.right_info.read_info()
            self.right_info.gen_xpath_map()
        
    def pinpoint_common(self) -> "List[js_exceptions.JSExcep]":
        """Pinpoint some errors that are common and not related to errors"""
        issues = []
        self.read_original_info(self.diff_stage)
        # Check svg issue with use
        for branch in self.fidelity_result.live_unique:
            for br in branch:
                if common.tagname_from_xpath(br) != 'use':
                    continue
                element = self.left_info.elements_map[br]
                element_tag = bs4.BeautifulSoup(element['text'], 'html.parser').find()
                if element_tag is None:
                    continue
                xlink = element_tag.attrs.get('xlink:href', '')
                if xlink == '':
                    continue
                right_uses = [e for e in self.right_info.elements if common.tagname_from_xpath(e['xpath']) == 'use']
                right_uses = [self.right_info.elements_map[e['xpath']] for e in right_uses]
                right_use_nodes = [bs4.BeautifulSoup(e['text'], 'html.parser').find() for e in right_uses]
                right_xlinks = [e.attrs.get('xlink:href', '') for e in right_use_nodes if e is not None and e.attrs.get('xlink:href', '')]
                right_xlinks = [url_utils.filter_archive(x) if url_utils.is_archive(x) else x for x in right_xlinks]
                if xlink in right_xlinks:
                    issues.append(js_exceptions.JSException({
                        'ts': time.time(),
                        'description': '<use> link xlink:href issue, \n either rewritten causing not found, \n or not rewritten causing blocked',
                        'scriptURL': br,
                        'line': 1,
                        'column': 1,
                    }))
        return issues

    def pinpoint_syntax_errors(self) -> "List[js_exceptions.JSExcep]":
        syntax_exceptions = [excep for excep in self.exceptions if excep.is_syntax_error]
        matched_exceptions = set()
        if len(syntax_exceptions) == 0:
            return []
        for writes in self.diff_writes:
            for write in writes:
                remain_exceps = [excep for excep in syntax_exceptions if excep not in matched_exceptions]
                if len(remain_exceps) == 0:
                    break
                error = _search_initiators(list(write.stack.scripts), remain_exceps, self.initiators) \
                        or _search_imports(list(write.stack.scripts), remain_exceps, self.import_map)
                if error is not None:
                    matched_exceptions.add(error)
        return list(matched_exceptions)

    def pinpoint_exceptions(self) -> "List[js_exceptions.JSExcep]":
        exception_errors = [excep for excep in self.exceptions if excep.has_stack]
        matched_exceptions = set()
        if len(exception_errors) == 0:
            return []
        for writes in self.diff_writes:
            for write in writes:
                for excep in exception_errors:
                    if excep in matched_exceptions:
                        continue
                    if write.stack.after(excep.stack):
                        matched_exceptions.add(excep)
        return list(matched_exceptions)

    def pinpoint_mutations(self) -> "List[js_exceptions.JSExcep], FidelityResult":
        arguments = ['-w', '-t', '-s', '--scroll', '--headless', '-e', '--mutation']
        write_path = '/'.join(self.dirr.split('/')[:-1]) if '/' in self.dirr else '.'
        archive_name = self.dirr.split('/')[-1]
        archive_url = json.load(open(f'{self.dirr}/metadata.json'))['archive_url']
        arguments.append('-i')
        if self.fidelity_result.info['diff_stage'] in ['extraInteraction', 'onload']:
            arguments.append('0')
        else:
            stage_num = int(self.fidelity_result.info['diff_stage'].split('_')[1])
            arguments.append(str(stage_num + 1))
        chrome_data_dir = os.path.dirname(autorun.DEFAULT_CHROMEDATA)
        if not Pinpointer.CHROME_DATA_INIT:
            Pinpointer.CHROME_DATA_INIT = True
            call(f'rm -rf {chrome_data_dir}/pinpoint_{common.get_hostname()}_{self.idx}', shell=True)
            call(['cp', '--reflink=auto', '-r', f'{chrome_data_dir}/base', f'{chrome_data_dir}/pinpoint_{common.get_hostname()}_{self.idx}'])
        autorun.replay(archive_url, archive_name,
                    chrome_data=f'{chrome_data_dir}/pinpoint_{common.get_hostname()}_{self.idx}',
                    write_path=write_path,
                    filename='mut',
                    arguments=arguments)
        fidelity_result_mut = fidelity_detect.fidelity_issue_all(self.dirr, 
                                                                 self.left_prefix, 
                                                                 'mut', 
                                                                 screenshot=False, 
                                                                 meaningful=self.meaningful,
                                                                 need_exist=False)
        # TODO: Need to change it into actual meaningful check
        mutation_success = [js_exceptions.JSException({
                'ts': time.time(),
                'description': 'Mutation success',
                'scriptURL': 'wombat.js',
                'line': 1,
                'column': 1,
            }
            )]
        if not fidelity_result_mut.info['diff']:
            return mutation_success, fidelity_result_mut
        if fidelity_result_mut.info['diff_stage'] != self.fidelity_result.info['diff_stage']:
            if common.stage_later(fidelity_result_mut.info['diff_stage'], self.fidelity_result.info['diff_stage']):
                return mutation_success, fidelity_result_mut
        elif sum_diffs(fidelity_result_mut.live_unique, fidelity_result_mut.archive_unique) \
            < sum_diffs(self.fidelity_result.live_unique, self.fidelity_result.archive_unique):
            return mutation_success, fidelity_result_mut
        return [], None


def pinpoint_issue(dirr, idx=0, left_prefix='live', right_prefix='archive', meaningful=True) -> PinpointResult:
    fidelity_result = fidelity_detect.fidelity_issue_all(dirr, left_prefix, right_prefix, screenshot=False, meaningful=meaningful)
    if not fidelity_result.info['diff']:
        return PinpointResult(fidelity_result=fidelity_result, 
                              mut_fidelity_result=None,
                              diff_writes=[],
                              pinpointed_errors=[])
    
    start = time.time()
    pinpointer = Pinpointer(dirr, idx, left_prefix, right_prefix, meaningful)
    pinpointer.add_fidelity_result(fidelity_result)
    diff_writes = pinpointer.extra_writes()
    pinpointer.read_related_info()
    logging.info(f'{dirr} pinpoint preparation {time.time()-start}')
    
    syntax_errors = pinpointer.pinpoint_syntax_errors()
    if len(syntax_errors) > 0:
        logging.info(f'Finished pinpoint {dirr} {time.time()-start}')
        return PinpointResult(fidelity_result=fidelity_result, 
                              mut_fidelity_result=None, 
                              diff_writes=diff_writes, 
                              pinpointed_errors=syntax_errors)
    logging.info(f'{dirr} syntax error pinpoint {time.time()-start}')
    
    exceptions = pinpointer.pinpoint_exceptions()
    if len(exceptions) > 0:
        logging.info(f'Finished pinpoint {dirr} {time.time()-start}')
        return PinpointResult(fidelity_result=fidelity_result, 
                              mut_fidelity_result=None, 
                              diff_writes=diff_writes, 
                              pinpointed_errors=exceptions)
    logging.info(f'{dirr} exception pinpoint {time.time()-start}')
    
    mutation_errors, mut_fidelity_result = pinpointer.pinpoint_mutations()
    if len(mutation_errors) > 0:
        logging.info(f'Finished pinpoint {dirr} {time.time()-start}')
        return PinpointResult(fidelity_result=fidelity_result, 
                              mut_fidelity_result=mut_fidelity_result, 
                              diff_writes=diff_writes, 
                              pinpointed_errors=mutation_errors)
    logging.info(f'{dirr} mutation pinpoint {time.time()-start}')
    
    common_issues = pinpointer.pinpoint_common()
    if len(common_issues) > 0:
        logging.info(f'Finished pinpoint {dirr} {time.time()-start}')
        return PinpointResult(fidelity_result=fidelity_result, 
                              mut_fidelity_result=None,
                              diff_writes=[],
                              pinpointed_errors=common_issues)
    logging.info(f'{dirr} common pinpoint {time.time()-start}')
    logging.info(f'Finished pinpoint {dirr} {time.time()-start}')
    return PinpointResult(fidelity_result=fidelity_result,
                          mut_fidelity_result=None,
                          diff_writes=diff_writes, 
                          pinpointed_errors=[])