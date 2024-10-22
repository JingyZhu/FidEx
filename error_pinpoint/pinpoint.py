import json
from dataclasses import dataclass

from fidex.fidelity_check import fidelity_detect, layout_tree, js_writes
from fidex.utils import url_utils
from fidex.error_pinpoint import js_exceptions


def extra_writes(dirr, diffs: "list[list]", left_prefix='live', right_prefix='archive') -> "list[js_writes.JSWrite]":
    """Get extra writes from left to right"""
    left_info = fidelity_detect.LoadInfo(dirr, left_prefix)
    right_info = fidelity_detect.LoadInfo(dirr, right_prefix)
    left_layout = layout_tree.build_layout_tree(left_info.elements, left_info.writes, left_info.write_stacks)
    right_layout = layout_tree.build_layout_tree(right_info.elements, right_info.writes, right_info.write_stacks)
    right_stacks = set([w.serialized_stack for w in right_layout.all_writes])

    diff_writes = []
    for branch in diffs:
        writes = []
        for xpath in branch:
            element = left_layout.all_nodes[xpath]
            element_writes = element.writes
            for w in element_writes:
                if w.serialized_stack not in right_stacks:
                    writes.append(w)
                    break
        if len(writes) > 0:
            diff_writes.append(sorted(writes, key=lambda x: int(x.wid.split(':')[0])))
    diff_writes.sort(key=lambda x: int(x[0].wid.split(':')[0]))
    return diff_writes


def read_exceptions(dirr, base, stage):
    exceptions = json.load(open(f"{dirr}/{base}_exception_failfetch.json"))
    exceptions = [e for e in exceptions if e['stage'] == stage][0]['exceptions']
    return [js_exceptions.JSException(e) for e in exceptions]

def pinpoint_syntax_errors(diff_writes: "js_writes.JSWrite", exceptions: "js_exceptions.JSException") -> "List[js_exceptions.JSExcep]":
    syntax_exceptions = [excep for excep in exceptions if excep.is_syntax_error]
    matched_exceptions = set()
    if len(syntax_exceptions) == 0:
        return []
    for writes in diff_writes:
        for write in writes:
            for excep in syntax_exceptions:
                if excep in matched_exceptions:
                    continue
                if url_utils.filter_archive(excep.scriptURL) in write.scripts:
                    matched_exceptions.add(excep)
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

@dataclass
class PinpointResult:
    fidelity_result: fidelity_detect.FidelityResult
    diff_writes: "List[js_writes.JSWrite]"
    pinpointed_errors: "List[js_exceptions.JSExcep]"

    def errors_to_dict(self):
        return [e.to_dict() for e in self.pinpointed_errors]


def pinpoint_issue(dirr, left_prefix='live', right_prefix='archive', meaningful=True) -> PinpointResult:
    fidelity_result = fidelity_detect.fidelity_issue_all(dirr, left_prefix, right_prefix, screenshot=False, meaningful=meaningful)
    if not fidelity_result.info['diff']:
        return []
    diff_stage = fidelity_result.info['diff_stage']
    diff_stage = diff_stage if diff_stage != 'extraInteraction' else 'onload'
    left = left_prefix if diff_stage =='onload' else f'{left_prefix}_{diff_stage.split("_")[1]}'
    right = right_prefix if diff_stage == 'onload' else f'{right_prefix}_{diff_stage.split("_")[1]}'
    diff_writes = extra_writes(dirr, fidelity_result.live_unique, left, right)
    exceptions = read_exceptions(dirr, right_prefix, diff_stage)
    syntax_errors = pinpoint_syntax_errors(diff_writes, exceptions)
    if len(syntax_errors) > 0:
        return PinpointResult(fidelity_result, diff_writes, syntax_errors)
    exceptions = pinpoint_exceptions(diff_writes, exceptions)
    if len(exceptions) > 0:
        return PinpointResult(fidelity_result, diff_writes, exceptions)
    return PinpointResult(fidelity_result, diff_writes, None)