import json

def calc_diff_dimensions(left_dimension, left_unique, right_dimensions, right_unique):
    """
    Currently just apply the easiest diff calculation by looking at the root of each unique branches
    1. If the xpath is unique, count the whole element as contributing to the overall dimension diff
    2. If the xpath is shared across unique, count the diff in dimension
    
    Assumption: change(parent) -> sum(change(children))
    """
    left_unique_dimen, right_unique_dimen = {}, {}
    default_d = {'width': 0, 'height': 0}
    for branch in left_unique:
        left_unique_dimen.update({e: left_dimension.get(e, default_d) for e in branch})
    for branch in right_unique:
        right_unique_dimen.update({e: right_dimensions.get(e, default_d) for e in branch})
    left_total_diff = 0
    for branch in left_unique:
        root = branch[0]
        root_dimen = left_unique_dimen[root]
        if root in right_unique_dimen:
            right_dimen = right_unique_dimen[root]
            dimen_diff = abs(root_dimen['width']*root_dimen['height'] - right_dimen['width']*right_dimen['height'])
        else:
            dimen_diff = root_dimen['width']*root_dimen['height']
        left_total_diff += dimen_diff
    right_total_diff = 0
    for branch in right_unique:
        root = branch[0]
        root_dimen = right_unique_dimen[root]
        if root in left_unique_dimen:
            left_dimen = left_unique_dimen[root]
            dimen_diff = abs(root_dimen['width']*root_dimen['height'] - left_dimen['width']*left_dimen['height'])
        else:
            dimen_diff = root_dimen['width']*root_dimen['height']
        right_total_diff += dimen_diff
    return left_total_diff, right_total_diff

def total_space(elements):
    max_width, max_height = 0, 0
    for e in elements:
        if e['dimension']:
            max_width = max(max_width, e['dimension']['width'] + e['dimension']['left'])
            max_height = max(max_height, e['dimension']['height'] + e['dimension']['top'])
    return max_width * max_height


def fidelity_issue_impact(dirr, left_prefix='live', right_prefix='archive') -> float:
    """Returns: fraction of pages with fidelity issue"""
    left_element = json.load(open(f"{dirr}/{left_prefix}_elements.json"))
    right_element = json.load(open(f"{dirr}/{right_prefix}_elements.json"))
    left_unique, right_unique = check_utils.diff(left_element, right_element, returnHTML=False)
    left_dimensions = {e['xpath']: e['dimension'] for e in left_element if e['dimension']}
    right_dimensions = {e['xpath']: e['dimension'] for e in right_element if e['dimension']}
    left_diff, right_diff = calc_diff_dimensions(left_dimensions, left_unique, right_dimensions, right_unique)
    # * Currently use body, but can use max width and height
    left_total = total_space(left_element)
    right_total = total_space(right_element)
    return left_diff / left_total, right_diff / right_total


if __name__ == "__main__":
    import fidelity_detect
    import check_utils
    base = '../../fidelity-files/writes/ground_truth_0/'
    dirr = 'civilwarstudies.org_4930885bed'
    dirr = base + dirr
    left_impact, right_impact = fidelity_issue_impact(dirr)
    _, simi = fidelity_detect.fidelity_issue_screenshot(dirr)
    print(left_impact, right_impact, 1- simi)
else:
    import sys, os
    # * To make it available to be imported from another directory
    script_path = os.path.abspath(__file__)
    dir_path = os.path.dirname(script_path)
    sys.path.append(dir_path)
    import check_utils