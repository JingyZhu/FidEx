import json
import time
import os
from dataclasses import dataclass
from subprocess import call

from fidex.record_replay import autorun
from fidex.fidelity_check import fidelity_detect, layout_tree, js_writes
from fidex.error_pinpoint import js_exceptions, js_initiators
from fidex.utils import url_utils, common

CHROME_DATA_INIT = False

def sum_diffs(left_unique, right_unique):
    return sum([len(branch) for branch in left_unique])

def extra_writes(dirr, diffs: "list[list]", side='left', left_prefix='live', right_prefix='archive') -> "list[js_writes.JSWrite]":
    """Get extra writes from left to right, or right to left, depending on the side"""
    assert side in ['left', 'right'], 'side should be either left or right'
    left_info = fidelity_detect.LoadInfo(dirr, left_prefix)
    right_info = fidelity_detect.LoadInfo(dirr, right_prefix)
    extra_info = left_info if side == 'left' else right_info
    target_info = right_info if side == 'left' else left_info
    extra_layout = layout_tree.build_layout_tree(extra_info.elements, extra_info.writes, extra_info.write_stacks)
    target_layout = layout_tree.build_layout_tree(target_info.elements, target_info.writes, target_info.write_stacks)
    target_stacks = set([w.serialized_stack for w in target_layout.all_writes])

    diff_writes = []
    for branch in diffs:
        writes = set()
        for xpath in branch:
            element = extra_layout.all_nodes[xpath]
            element_writes = element.writes
            for w in element_writes:
                if w.serialized_stack not in target_stacks:
                    writes.add(w)
                    break
        if len(writes) > 0:
            diff_writes.append(sorted(list(writes), key=lambda x: int(x.wid.split(':')[0])))
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
        

def pinpoint_syntax_errors(diff_writes: "js_writes.JSWrite",
                           exceptions: "List[js_exceptions.JSException]",
                           initiators: "Dict[str, js_initiators.JSIntiator]") -> "List[js_exceptions.JSExcep]":
    syntax_exceptions = [excep for excep in exceptions if excep.is_syntax_error]
    matched_exceptions = set()
    if len(syntax_exceptions) == 0:
        return []
    for writes in diff_writes:
        for write in writes:
            remain_exceps = [excep for excep in syntax_exceptions if excep not in matched_exceptions]
            if len(remain_exceps) == 0:
                break
            error = _search_initiators(list(write.stack.scripts), remain_exceps, initiators)
            if error is not None:
                matched_exceptions.add(error)
    return list(matched_exceptions)

def pinpoint_exceptions(diff_writes: "js_writes.JSWrite", exceptions: "js_exceptions.JSException") -> "List[js_exceptions.JSExcep]":
    exception_errors = [excep for excep in exceptions if excep.has_stack]
    matched_exceptions = set()
    if len(exception_errors) == 0:
        return []
    for writes in diff_writes:
        for write in writes:
            for excep in exception_errors:
                if excep in matched_exceptions:
                    continue
                if write.stack.after(excep.stack):
                    matched_exceptions.add(excep)
    return list(matched_exceptions)

def pinpoint_mutation(fidelity_result: fidelity_detect.FidelityResult, dirr, idx=0, left_prefix='live', right_prefix='archive', meaningful=True) -> "List[js_exceptions.JSExcep]":
    global CHROME_DATA_INIT
    arguments = ['-w', '-t', '-s', '--scroll', '--headless', '-e', '--mutation']
    write_path = '/'.join(dirr.split('/')[:-1]) if '/' in dirr else '.'
    archive_name = dirr.split('/')[-1]
    archive_url = json.load(open(f'{dirr}/metadata.json'))['archive_url'] # TODO: Need to change it back to archive_url
    if fidelity_result.info['diff_stage'] != 'onload':
        arguments.append('-i')
        if fidelity_result.info['diff_stage'] == 'extraInteraction':
            arguments.append('0')
        else:
            stage_num = int(fidelity_result.info['diff_stage'].split('_')[1])
            arguments.append(str(stage_num + 1))
    chrome_data_dir = os.path.dirname(autorun.DEFAULT_CHROMEDATA)
    if not CHROME_DATA_INIT:
        CHROME_DATA_INIT = True
        call(f'rm -rf {chrome_data_dir}/pinpoint_{idx}', shell=True)
        call(['cp', '--reflink=auto', '-r', f'{chrome_data_dir}/base', f'{chrome_data_dir}/pinpoint_{idx}'])
    autorun.replay(archive_url, archive_name,
                   chrome_data=f'{chrome_data_dir}/pinpoint_{idx}',
                   write_path=write_path,
                   filename='mut',
                   arguments=arguments)
    fidelity_result_mut = fidelity_detect.fidelity_issue_all(dirr, left_prefix, 'mut', screenshot=False, meaningful=meaningful)
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
        return mutation_success
    if fidelity_result_mut.info['diff_stage'] != fidelity_result.info['diff_stage']:
        if common.stage_nolater(fidelity_result_mut.info['diff_stage'], fidelity_result.info['diff_stage']):
            return mutation_success
    elif sum_diffs(fidelity_result_mut.live_unique, fidelity_result_mut.archive_unique) \
         < sum_diffs(fidelity_result.live_unique, fidelity_result.archive_unique):
        return mutation_success
    return []

@dataclass
class PinpointResult:
    fidelity_result: fidelity_detect.FidelityResult
    diff_writes: "List[js_writes.JSWrite]"
    pinpointed_errors: "List[js_exceptions.JSExcep]"

    def errors_to_dict(self):
        return [e.to_dict() for e in self.pinpointed_errors]


def pinpoint_issue(dirr, idx=0, left_prefix='live', right_prefix='archive', meaningful=True) -> PinpointResult:
    fidelity_result = fidelity_detect.fidelity_issue_all(dirr, left_prefix, right_prefix, screenshot=False, meaningful=meaningful)
    if not fidelity_result.info['diff']:
        return PinpointResult(fidelity_result, [], [])
    start = time.time()
    diff_stage = fidelity_result.info['diff_stage']
    diff_stage = diff_stage if diff_stage != 'extraInteraction' else 'onload'
    left = left_prefix if diff_stage =='onload' else f'{left_prefix}_{diff_stage.split("_")[1]}'
    right = right_prefix if diff_stage == 'onload' else f'{right_prefix}_{diff_stage.split("_")[1]}'
    diff_writes = extra_writes(dirr, fidelity_result.live_unique, left_prefix=left, right_prefix=right)
    exceptions = js_exceptions.read_exceptions(dirr, right_prefix, diff_stage)
    initiators = js_initiators.read_initiators(dirr, left_prefix)
    print(dirr, 'finished pinpoint preparation', time.time()-start)
    syntax_errors = pinpoint_syntax_errors(diff_writes, exceptions, initiators)
    if len(syntax_errors) > 0:
        return PinpointResult(fidelity_result, diff_writes, syntax_errors)
    print(dirr, 'finished syntax error pinpoint', time.time()-start)
    exceptions = pinpoint_exceptions(diff_writes, exceptions)
    if len(exceptions) > 0:
        return PinpointResult(fidelity_result, diff_writes, exceptions)
    print(dirr, 'finished exception pinpoint', time.time()-start)
    mutation_errors = pinpoint_mutation(fidelity_result, dirr, idx=idx, 
                                        left_prefix=left_prefix, right_prefix=right_prefix, 
                                        meaningful=meaningful)
    if len(mutation_errors) > 0:
        return PinpointResult(fidelity_result, diff_writes, mutation_errors)
    print(dirr, 'finished mutation pinpoint', time.time()-start)
    return PinpointResult(fidelity_result, diff_writes, [])