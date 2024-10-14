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
            diff_writes.append(writes)
    diff_writes.sort(key=lambda x: int(x[0].wid.split(':')[0]))
    return diff_writes


def match_syntax_errors(diff_writes: "js_writes.JSWrite", exceptions: "js_exceptions.JSException") -> "list[js_exceptions.JSExcep]":
    syntax_exceptions = [excep for excep in exceptions if excep.is_syntax_error]
    matched_exceptions = set()
    if len(syntax_exceptions) == 0:
        return None
    for writes in diff_writes:
        for write in writes:
            for excep in exceptions:
                if url_utils.filter_archive(excep.scriptURL) in write.scripts:
                    matched_exceptions.add(excep)
    return list(matched_exceptions)
