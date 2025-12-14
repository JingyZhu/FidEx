import json
import multiprocessing
import os
import numpy as np
import random
import bisect

from fidex.fidelity_check import fidelity_detect

# HTML tag that are important for the content
content_tag = ['img', 'video', 'audio', 'canvas', 'map']
RESOLUTION = (1000, 1000)

def diff_rectangle(left, right):
    ll, lt, lw, lh = left['left'], left['top'], left['width'], left['height']
    rl, rt, rw, rh = right['left'], right['top'], right['width'], right['height']
    larger_width = lw >= rw
    larger_height = lh >= rh
    if larger_width and larger_height:
        return [
            {'top': lt, 'left': ll+rw, 'width': lw-rw, 'height': rh},
            {'top': lt+rh, 'left': ll, 'width': lw, 'height': lh-rh},
        ]
    elif larger_width:
        return [
            {'top': lt, 'left': ll+rw, 'width': lw-rw, 'height': lh},
        ]
    elif larger_height:
        return [
            {'top': lt+rh, 'left': ll, 'width': lw, 'height': lh-rh},
        ]
    else:
        return []

def calculate_total_area(rectangles):
    """Apply sweep-line algorithm to calculate the total area of the rectangles, each rect in the format of (width, height, top, left)"""
    events = []
    for (width, height, top, left, scale) in rectangles:
        start = left
        end = left + width
        bottom = top + height
        events.append((start, top, bottom, scale))  # Start of rectangle
        events.append((end, top, bottom, -scale))   # End of rectangle
    # Sort events, handling end before start if they have the same x-coordinate
    events.sort(key=lambda x: (x[0], -x[3] if x[3] < 0 else 0))
    last_x = 0
    active_intervals = []
    total_area = 0

    def compute_y_coverage():
        if not active_intervals:
            return 0
        # Calculate effective y-coverage taking scale into account
        merged_intervals = []
        sorted_intervals = sorted(active_intervals)
        current_start, current_end, current_scale = sorted_intervals[0]

        for start, end, scale in sorted_intervals[1:]:
            if start > current_end:  # No overlap
                merged_intervals.append((current_start, current_end, current_scale))
                current_start, current_end, current_scale = start, end, scale
            else:  # Overlapping intervals
                if current_end < end:
                    merged_intervals.append((current_start, current_end, current_scale))
                    current_start = current_end
                    current_scale = min(1, current_scale + scale)
                    current_end = end
                else:
                    current_scale = min(1, current_scale + scale)

        merged_intervals.append((current_start, current_end, current_scale))
        # Sum up all scaled lengths of merged intervals
        return sum((end - start) * scale for start, end, scale in merged_intervals)

    for x, y1, y2, scale_change in events:
        if x != last_x:
            # Calculate the area contribution from last_x to current x
            current_y_length = compute_y_coverage()
            total_area += current_y_length * (x - last_x)
            last_x = x

        # Updating the active interval list with scale changes
        # This part of the code could be optimized with a better data structure for interval management
        i = 0
        while i < len(active_intervals):
            if active_intervals[i][0] == y1 and active_intervals[i][1] == y2:
                new_scale = active_intervals[i][2] + scale_change
                if new_scale == 0:
                    active_intervals.pop(i)
                else:
                    active_intervals[i] = (y1, y2, min(1, new_scale))
                break
            i += 1
        else:
            if scale_change > 0:
                bisect.insort(active_intervals, (y1, y2, scale_change))

    return total_area


def _get_dimem(dimensions, xpaths):
    new_dimensions = {}
    for xpath in xpaths:
        if xpath in dimensions and dimensions[xpath]:
            new_dimensions[xpath] = dimensions[xpath]
            continue
        paths = xpath.split('/')
        for i in range(len(paths)-1, 0, -1):
            parent = '/'.join(paths[:i])
            if parent in dimensions and dimensions[parent]:
                new_dimensions[xpath] = dimensions[parent]
                break
    return new_dimensions

def _leaves(xpaths):
    leaves = []
    for xpath in xpaths:
        is_leaf = True
        for other in xpaths:
            if xpath == other:
                continue
            if other.startswith(xpath):
                is_leaf = False
                break
        if is_leaf:
            leaves.append(xpath)
    return leaves

def calc_diff_dimensions(left_dimensions, left_unique, right_dimensions, right_unique):
    """
    Currently just apply the easiest diff calculation by looking at the root of each unique branches
    1. If the xpath is unique, count the whole element as contributing to the overall dimension diff
    2. If the xpath is shared across unique, count the diff in dimension
    
    Assumption: change(parent) -> sum(change(children))
    """
    left_unique_dimen, right_unique_dimen = {}, {}
    for branch in left_unique:
        left_unique_dimen.update(_get_dimem(left_dimensions, branch))
    for branch in right_unique:
        right_unique_dimen.update(_get_dimem(right_dimensions, branch))
    left_total_diffs = []
    for branch in left_unique:
        branch = _leaves(branch)
        for e in branch:
            e_dimen = left_unique_dimen[e]
            e_type = e.split('/')[-1].split('[')[0]
            if e_type not in content_tag and e in right_unique_dimen:
                # dimen_diffs = []
                right_dimen = right_unique_dimen[e]
                dimen_diffs = diff_rectangle(e_dimen, right_dimen)
            else:
                dimen_diffs = [e_dimen]
            left_total_diffs += dimen_diffs
    right_total_diffs = []
    for branch in right_unique:
        branch = _leaves(branch)
        for e in branch:
            e_dimen = right_unique_dimen[e]
            e_type = e.split('/')[-1].split('[')[0]
            if e_type not in content_tag and e in left_unique_dimen:
                # dimen_diffs = []
                left_dimen = left_unique_dimen[e]
                dimen_diffs = diff_rectangle(e_dimen, left_dimen)
            else:
                dimen_diffs = [e_dimen]
            right_total_diffs += dimen_diffs
    return left_total_diffs, right_total_diffs

def calc_diff_dimensions_heatmap(left_dimensions, left_unique, right_dimensions, right_unique):
    """
    Currently just apply the easiest diff calculation by looking at the root of each unique branches
    1. If the xpath is unique, count the whole element as contributing to the overall dimension diff
    2. If the xpath is shared across unique, count the diff in dimension
    
    Assumption: change(parent) -> sum(change(children))
    """
    left_unique_dimen, right_unique_dimen = {}, {}
    for branch in left_unique:
        left_unique_dimen.update(_get_dimem(left_dimensions, branch))
    for branch in right_unique:
        right_unique_dimen.update(_get_dimem(right_dimensions, branch))
    left_total_diffs = []
    def calc_scale(e_dimen, diffs):
        e_space = e_dimen['width'] * e_dimen['height']
        diffs_space = sum([diff['width'] * diff['height'] for diff in diffs])
        return min(1, diffs_space / e_space)
    for branch in left_unique:
        branch = _leaves(branch)
        for e in branch:
            e_dimen = left_unique_dimen[e]
            e_type = e.split('/')[-1].split('[')[0]
            if e_type not in content_tag and e in right_unique_dimen:
                right_dimen = right_unique_dimen[e]
                dimen_diffs = diff_rectangle(e_dimen, right_dimen)
            else:
                dimen_diffs = [e_dimen]
            scale = calc_scale(e_dimen, dimen_diffs)
            scale_e_dimen = e_dimen.copy()
            scale_e_dimen['scale'] = scale
            left_total_diffs += [scale_e_dimen]
    right_total_diffs = []
    for branch in right_unique:
        branch = _leaves(branch)
        for e in branch:
            e_dimen = right_unique_dimen[e]
            e_type = e.split('/')[-1].split('[')[0]
            if e_type not in content_tag and e in left_unique_dimen:
                left_dimen = left_unique_dimen[e]
                dimen_diffs = diff_rectangle(e_dimen, left_dimen)
            else:
                dimen_diffs = [e_dimen]
            scale = calc_scale(e_dimen, dimen_diffs)
            scale_e_dimen = e_dimen.copy()
            scale_e_dimen['scale'] = scale
            right_total_diffs += [scale_e_dimen]
    return left_total_diffs, right_total_diffs


def total_space(dimensions: list) -> tuple:
    """Returns total space, (width, height)"""
    max_width, max_height = 0, 0
    for d in dimensions:
        max_width = max(max_width, d['width'] + d['left'])
        max_height = max(max_height, d['height'] + d['top'])
    return max_width * max_height, (max_width, max_height)


def fidelity_issue_impact(dirr, left_prefix='live', right_prefix='archive') -> float:
    """Returns: Rectangle area of the fidelity issue"""
    fidelity_result = fidelity_detect.FidelityResult(info={}, live_unique=[], archive_unique=[], more_errs=None)
    if os.path.exists(f'{dirr}/diff_{left_prefix}_{right_prefix}.json'):
        diff_dict = json.load(open(f'{dirr}/diff_{left_prefix}_{right_prefix}.json'))
        fidelity_result.load_from_dict(diff_dict)
    else:
        fidelity_result = fidelity_detect.fidelity_issue_all(dirr, left_prefix, right_prefix)
    if not fidelity_result.info['diff']:
        return 0, 0
    diff_stage = fidelity_result.info['diff_stage']
    stage_suffix = '' if diff_stage in ['onload', 'extraInteraction'] else diff_stage.replace('interaction', '')
    left, right = left_prefix + stage_suffix, right_prefix + stage_suffix
    left_info = fidelity_detect.LoadInfo(dirr, left)
    right_info = fidelity_detect.LoadInfo(dirr, right)
    left_info.gen_xpath_map(), right_info.gen_xpath_map()
    left_dimensions = {xpath: e['dimension'] for xpath, e in left_info.elements_map.items() if e['dimension']}
    right_dimensions = {xpath: e['dimension'] for xpath, e in right_info.elements_map.items() if e['dimension']}
    left_diffs, right_diffs = calc_diff_dimensions(left_dimensions, fidelity_result.live_unique, 
                                                   right_dimensions, fidelity_result.archive_unique)
    left_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in left_diffs])
    right_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in right_diffs])
    left_total_area, _ = total_space(list(left_dimensions.values()))
    right_total_area, _ = total_space(list(right_dimensions.values()))
    return left_diffs_area, right_diffs_area

def fidelity_issue_impact_heatmap(dirr, left_prefix='live', right_prefix='archive') -> np.ndarray:
    """Returns: Heatmap array of the fidelity issue"""
    fidelity_result = fidelity_detect.FidelityResult(info={}, live_unique=[], archive_unique=[], more_errs=None)
    if os.path.exists(f'{dirr}/diff_{left_prefix}_{right_prefix}.json'):
        diff_dict = json.load(open(f'{dirr}/diff_{left_prefix}_{right_prefix}.json'))
        fidelity_result.load_from_dict(diff_dict)
    else:
        fidelity_result = fidelity_detect.fidelity_issue_all(dirr, left_prefix, right_prefix)
    if not fidelity_result.info['diff']:
        return np.zeros(RESOLUTION)
    diff_stage = fidelity_result.info['diff_stage']
    stage_suffix = '' if diff_stage in ['onload', 'extraInteraction'] else diff_stage.replace('interaction', '')
    left, right = left_prefix + stage_suffix, right_prefix + stage_suffix
    left_info = fidelity_detect.LoadInfo(dirr, left)
    right_info = fidelity_detect.LoadInfo(dirr, right)
    left_info.gen_xpath_map(), right_info.gen_xpath_map()
    left_dimensions = {xpath: e['dimension'] for xpath, e in left_info.elements_map.items() if e['dimension']}
    right_dimensions = {xpath: e['dimension'] for xpath, e in right_info.elements_map.items() if e['dimension']}

    left_diffs, right_diffs = calc_diff_dimensions(left_dimensions, fidelity_result.live_unique, 
                                                   right_dimensions, fidelity_result.archive_unique)
    left_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in left_diffs])
    right_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in right_diffs])
    _, (total_left_w, total_left_h) = total_space(list(left_dimensions.values()))
    _, (total_right_w, total_right_h) = total_space(list(right_dimensions.values()))
    target_diffs = left_diffs if left_diffs_area >= right_diffs_area else right_diffs
    target_w, target_h = (total_left_w, total_left_h) if left_diffs_area >= right_diffs_area else (total_right_w, total_right_h)
    target_diffs = [(e['width'] / target_w * RESOLUTION[0],
        e['height'] / target_h * RESOLUTION[1],
        e['top'] / target_h * RESOLUTION[1],
        e['left'] / target_w * RESOLUTION[0],
        1
    ) for e in target_diffs]
    def in_rect(x, y, rect):
        if rect[3] <= x <= rect[3] + rect[0] and rect[2] <= y <= rect[2] + rect[1]:
            return rect[4]
        return 0
    array = np.zeros(RESOLUTION)
    for x in range(RESOLUTION[1]):
        for y in range(RESOLUTION[0]):
            array[y, x] = min(1, sum([in_rect(x, y, rect) for rect in target_diffs]))
    return array