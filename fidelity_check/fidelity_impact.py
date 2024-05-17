import json
import multiprocessing
import os
import numpy as np
import random
import bisect

# HTML tag that are important for the content
content_tag = ['img', 'video', 'audio', 'canvas', 'map']
resolution = (1000, 1000)

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


def total_space(elements):
    max_width, max_height = 0, 0
    for e in elements:
        if e['dimension']:
            max_width = max(max_width, e['dimension']['width'] + e['dimension']['left'])
            max_height = max(max_height, e['dimension']['height'] + e['dimension']['top'])
    return max_width * max_height, (max_width, max_height)


def fidelity_issue_impact(dirr, left_prefix='live', right_prefix='archive') -> float:
    """Returns: fraction of pages with fidelity issue"""
    left_element = json.load(open(f"{dirr}/{left_prefix}_elements.json"))
    right_element = json.load(open(f"{dirr}/{right_prefix}_elements.json"))
    left_unique, right_unique = check_utils.diff(left_element, right_element, returnHTML=False)
    # * Meaningful diff
    left_unique, right_unique = check_utils.meaningful_diff(left_element, left_unique, right_element, right_unique)

    left_dimensions = {e['xpath']: e['dimension'] for e in left_element if e['dimension']}
    right_dimensions = {e['xpath']: e['dimension'] for e in right_element if e['dimension']}
    left_diffs, right_diffs = calc_diff_dimensions(left_dimensions, left_unique, right_dimensions, right_unique)
    left_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in left_diffs])
    right_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in right_diffs])
    left_total_area, _ = total_space(left_element)
    right_total_area, _ = total_space(right_element)
    return left_diffs_area, right_diffs_area

def fidelity_issue_impact_heatmap(dirr, left_prefix='live', right_prefix='archive') -> np.ndarray:
    """Returns: Rectangle area of the fidelity issue"""
    left_element = json.load(open(f"{dirr}/{left_prefix}_elements.json"))
    right_element = json.load(open(f"{dirr}/{right_prefix}_elements.json"))
    left_unique, right_unique = check_utils.diff(left_element, right_element, returnHTML=False)
    # * Meaningful diff
    left_unique, right_unique = check_utils.meaningful_diff(left_element, left_unique, right_element, right_unique)
    
    
    left_dimensions = {e['xpath']: e['dimension'] for e in left_element if e['dimension']}
    right_dimensions = {e['xpath']: e['dimension'] for e in right_element if e['dimension']}
    
    left_diffs, right_diffs = calc_diff_dimensions_heatmap(left_dimensions, left_unique, right_dimensions, right_unique)
    left_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in left_diffs])
    right_diffs_area = calculate_total_area([(e['width'], e['height'], e['top'], e['left'], e.get('scale', 1)) for e in right_diffs])
    _, (total_left_w, total_left_h) = total_space(left_element)
    _, (total_right_w, total_right_h) = total_space(right_element)
    target_diffs = left_diffs if left_diffs_area >= right_diffs_area else right_diffs
    target_w, target_h = (total_left_w, total_left_h) if left_diffs_area >= right_diffs_area else (total_right_w, total_right_h)
    target_diffs = [(e['width'] / target_w * resolution[0],
        e['height'] / target_h * resolution[1],
        e['top'] / target_h * resolution[1],
        e['left'] / target_w * resolution[0],
        1
    ) for e in target_diffs]
    def in_rect(x, y, rect):
        if rect[3] <= x <= rect[3] + rect[0] and rect[2] <= y <= rect[2] + rect[1]:
            return rect[4]
        return 0
    array = np.zeros(resolution)
    for x in range(resolution[1]):
        for y in range(resolution[0]):
            array[y, x] = min(1, sum([in_rect(x, y, rect) for rect in target_diffs]))
    return array


def _worker(base, hostname, left, right):
    dirr = os.path.join(base, hostname)
    try:
        left_impact, right_impact = fidelity_issue_impact(dirr, left, right)
    except Exception as e:
        print(str(e))
        return
    impact = max(left_impact, right_impact)
    return {
        'hostname': hostname,
        'impact': impact,
    }

def fidelity_impact_ground_truth(base, hostnames):
    results = []
    with multiprocessing.Pool(31) as pool:
        results = pool.starmap(_worker, [(base, h, 'live', 'archive') for h in hostnames])
        results = [r for r in results if r]
    json.dump(results, open('fidelity_impact_gt.json', 'w+'), indent=2)

def fidelity_impact_detection(bases, target_hostnames=None, sample_size=0):
    results = []
    inputs = []
    for base in bases:
        hostnames = os.listdir(base)
        for hostname in hostnames:
            if target_hostnames and hostname not in target_hostnames:
                continue
            dirr = os.path.join(base, hostname)
            if not os.path.exists(os.path.join(dirr, 'results.json')):
                continue
            results = json.load(open(os.path.join(dirr, 'results.json'), 'r'))
            stage, fixedIdx = None, None
            for stage, result in results.items():
                if result['fixedIdx'] == -1:
                    continue
                fixedIdx = result['fixedIdx']
                break
            if fixedIdx is None:
                continue
            inputs.append((base, hostname, f'{stage}_initial', f'{stage}_exception_{fixedIdx}'))
    if sample_size > 0:
        inputs = random.sample(inputs, min(sample_size, len(inputs)))
    with multiprocessing.Pool(31) as pool:
        results = pool.starmap(_worker, inputs)
        results = [r for r in results if r]
    json.dump(results, open('fidelity_impact.json', 'w+'), indent=2)

def _worker_heatmap(base, hostname, left, right):
    print(hostname)
    dirr = os.path.join(base, hostname)
    try:
        heatmap = fidelity_issue_impact_heatmap(dirr, left, right)
    except Exception as e:
        print(str(e))
        return
    return heatmap

def fidelity_impact_heatmap_ground_truth(base, hostnames):
    results = []
    print("Total inputs", len(hostnames))
    with multiprocessing.Pool(31) as pool:
        results = pool.starmap(_worker_heatmap, [(base, h, 'live', 'archive') for h in hostnames])
        results = [r for r in results if r is not None]
    total_heatmap = np.zeros(resolution)
    print("Total length", len(results))
    for heatmap in results:
        total_heatmap += heatmap
    total_heatmap /= len(results)
    # Store the heatmap
    np.save('fidelity_impact_heatmap_gt.npy', total_heatmap)

def fidelity_impact_heatmap_detection(bases, target_hostnames=None, sample_size=0):
    results = []
    inputs = []
    for base in bases:
        hostnames = os.listdir(base)
        for hostname in hostnames:
            if target_hostnames and hostname not in target_hostnames:
                continue
            dirr = os.path.join(base, hostname)
            if not os.path.exists(os.path.join(dirr, 'results.json')):
                continue
            results = json.load(open(os.path.join(dirr, 'results.json'), 'r'))
            stage, fixedIdx = None, None
            for stage, result in results.items():
                if result['fixedIdx'] == -1:
                    continue
                fixedIdx = result['fixedIdx']
                break
            if fixedIdx is None:
                continue
            inputs.append((base, hostname, f'{stage}_initial', f'{stage}_exception_{fixedIdx}'))
    # inputs = [i for i in inputs if i[1] in ['miami.va.gov_5576']]
    
    if sample_size > 0:
        inputs = random.sample(inputs, min(sample_size, len(inputs)))
    print("Total inputs", len(inputs))
    with multiprocessing.Pool(31) as pool:
        results = pool.starmap(_worker_heatmap, inputs)
        results = [r for r in results if r is not None]
    total_heatmap = np.zeros(resolution)
    print("Total length", len(results))
    for heatmap in results:
        total_heatmap += heatmap
    total_heatmap /= len(results)
    # Store the heatmap
    np.save('fidelity_impact_heatmap.npy', total_heatmap)

if __name__ == "__main__":
    import fidelity_detect
    import check_utils
    # base = '../../fidelity-files/writes/ground_truth/'
    # dirr = 'www.eac.gov_78a0be245c'
    # dirr = base + dirr
    # left_impact, right_impact = fidelity_issue_impact(dirr)
    # _, simi = fidelity_detect.fidelity_issue_screenshot(dirr)
    # print(left_impact, right_impact, 1- simi)


    # * Ground-truth impact
    # gt_diff = json.load(open('../datacollect/ground-truth/gt_diff.json'))
    # hostnames = [g['hostname'] for g in gt_diff if g['diff']]
    # gt_500 = json.load(open('../revert_rewrite/gt_diff.json'))
    # hostnames = [h for h in hostnames if h in gt_500 if gt_500[h]]
    # fidelity_impact_ground_truth('../../fidelity-files/writes/ground_truth/', hostnames)

    # * Detection impact
    fidelity_impact_detection('../revert_rewrite/writes_gt/', sample_size=0)

    # * Ground-truth heatmap
    # gt_diff = json.load(open('../datacollect/ground-truth/gt_diff.json'))
    # hostnames = [g['hostname'] for g in gt_diff if g['diff']]
    # fidelity_impact_heatmap_ground_truth('../../fidelity-files/writes/ground_truth/', hostnames)

    # * Detection heatmap
    fidelity_impact_heatmap_detection([
                                        # '../revert_rewrite/writes_gt/'
                                        '../revert_rewrite/writes_eot_2016/',
                                        '../revert_rewrite/writes_eot_2020/',
                                        '../revert_rewrite/writes_carta/'
                                       ], sample_size=200)

    # * Single impact
    # result = _worker('../../fidelity-files/writes/ground_truth/', 'www.nhtsa.gov_522ad71962', 'live', 'archive')
    # print(result)

    # * Comp of heatmap between ground-truth and detection
    # dirr = '../revert_rewrite/writes_multiproc/'
    # # dirr = '../revert_rewrite/test/load_override/writes/'
    # base = 'oklahoma.gov_fbd26c5dd5'
    # gt_heatmap = _worker_heatmap('../../fidelity-files/writes/ground_truth/', base, 'live', 'archive')
    # if not os.path.exists(os.path.join(dirr+base, 'results.json')):
    #     print("No results")
    #     exit(0)
    # results = json.load(open(os.path.join(dirr+base, 'results.json'), 'r'))
    # stage, fixedIdx = None, None
    # for stage, result in results.items():
    #     if result['fixedIdx'] == -1:
    #         continue
    #     fixedIdx = result['fixedIdx']
    #     break
    # if fixedIdx is None:
    #     print("No fidelity issue detected")
    #     exit(0)
    # detection_heatmap = _worker_heatmap(dirr, base, f'{stage}_initial', f'{stage}_exception_{fixedIdx}')
    # np.save('fidelity_impact_heatmap_gt.npy', gt_heatmap)
    # np.save('fidelity_impact_heatmap.npy', detection_heatmap)

else:
    import sys, os
    # * To make it available to be imported from another directory
    script_path = os.path.abspath(__file__)
    dir_path = os.path.dirname(script_path)
    sys.path.append(dir_path)
    import check_utils