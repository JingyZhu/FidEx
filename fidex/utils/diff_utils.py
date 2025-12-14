import os
import re
import json
from bs4 import BeautifulSoup

from fidex.utils import common
from fidex.fidelity_check import fidelity_detect

def num_diffs(fidelity_result: dict):
    """Number of diffs from the diff"""
    count = 0
    for diffs in fidelity_result['live_unique']:
        count += len(diffs)
    return count

def drop_equiv_diff(left_diff_list, right_diff_list) -> "tuple[list[str], list[str]]":
    """Drop equivalent diffs from left and right.
    Since they are likely caused by flaws in fidelity detection."""
    def equivalent_diff(xpath1, xpath2, allow_num_diff=1):
        parts1 = xpath1.split('/')[1:]
        parts2 = xpath2.split('/')[1:]
        num_diff = 0
        if len(parts1) != len(parts2):
            return False
        for part1, part2 in zip(parts1, parts2):
            tag_name1, idx1 = re.match(r'([^\[\]]+)\[(\d+)\]', part1).groups()
            tag_name2, idx2 = re.match(r'([^\[\]]+)\[(\d+)\]', part2).groups()
            if tag_name1 != tag_name2:
                return False
            if idx1 != idx2:
                num_diff += 1
                if num_diff > allow_num_diff:
                    return False
        return True
    
    left_diffs = set([x for xpaths in left_diff_list for x in xpaths])
    right_diffs = set([x for xpaths in right_diff_list for x in xpaths])
    left_drops, right_drops = set(), set()
    for left_diff in left_diffs:
        for right_diff in right_diffs:
            if equivalent_diff(left_diff, right_diff):
                left_drops.add(left_diff)
                right_drops.add(right_diff)
    left_diffs -= left_drops
    right_diffs -= right_drops
    return sorted(left_diffs), sorted(right_diffs)

def _has_dimension(element):
    if element.get('dimension') is None:
        return False
    return element['dimension'].get('width', 0) * element['dimension'].get('height', 0) > 0

def _same_dimension(e1, e2):
    if e1.get('dimension') is None or e2.get('dimension') is None:
        return False
    return e1['dimension']['width'] == e2['dimension']['width'] \
            and e1['dimension']['height'] == e2['dimension']['height']

def drop_incorrect_left_diff(dirr, left_diffs: "list[str]", left_prefix, right_prefix, stage):
    if len(left_diffs) == 0:
        return left_diffs
    if stage == 'extraInteraction':
        return left_diffs
    left_diffs = set(left_diffs)
    l_suffix = '' if stage == 'onload' else f'_{stage.split("_")[1]}'
    stage_num = -1 if stage == 'onload' else int(stage.split('_')[1])
    left_doms = json.load(open(f'{dirr}/{left_prefix}{l_suffix}_dom.json'))
    left_doms = {d['xpath']: d for d in left_doms}
    for idx in range(stage_num, 20):
        r_suffix = '' if idx == -1 else f'_{idx}'
        if not os.path.exists(f'{dirr}/{right_prefix}{r_suffix}_dom.json'):
            continue
        right_doms = json.load(open(f'{dirr}/{right_prefix}{r_suffix}_dom.json'))
        right_doms = {d['xpath']: d for d in right_doms}
        
        left_drops = set()
        for diff in left_diffs:
            left_elem = left_doms[diff]
            left_text = left_elem['text']
            if diff not in left_doms or diff not in right_doms:
                continue
            right_elem = right_doms[diff]
            right_text = right_elem['text']
            if _has_dimension(left_elem) and _has_dimension(right_elem):
                left_text = BeautifulSoup(left_text, 'html.parser')
                right_text = BeautifulSoup(right_text, 'html.parser')
                if str(left_text) == str(right_text):
                    left_drops.add(diff)
                elif _same_dimension(left_elem, right_elem):
                    left_drops.add(diff)
        left_diffs = left_diffs - left_drops
        if len(left_diffs) == 0:
            break
    return sorted(left_diffs)

def diff_eliminated(dirr, diff_left_prefix, diff_right_prefix, filter_apply=True):
    if not os.path.exists(f'{dirr}/diff_{diff_left_prefix}.json') or not os.path.exists(f'{dirr}/diff_{diff_right_prefix}.json'):
        return "No diff"
    diff_left_dict = json.load(open(f'{dirr}/diff_{diff_left_prefix}.json'))
    diff_left = fidelity_detect.FidelityResult([], [], {}, None)
    diff_left.load_from_dict(diff_left_dict)
    diff_right_dict = json.load(open(f'{dirr}/diff_{diff_right_prefix}.json'))
    diff_right = fidelity_detect.FidelityResult([], [], {}, None)
    diff_right.load_from_dict(diff_right_dict)
    if not diff_left.info['diff'] and not diff_right.info['diff']:
        return None
    if not diff_right.info['diff']:
        return 1
    if diff_left.info['diff_stage'] and diff_right.info['diff_stage']:
        if common.stage_later(diff_left.info['diff_stage'], diff_right.info['diff_stage']):
            return -1
        if common.stage_later(diff_right.info['diff_stage'], diff_left.info['diff_stage']):
            return 1
    left_unique, right_unique = diff_left.live_unique, diff_right.live_unique
    if filter_apply:
        left_unique, _ = drop_equiv_diff(diff_left.live_unique, diff_left.archive_unique)
        right_unique, _ = drop_equiv_diff(diff_right.live_unique, diff_right.archive_unique)
        
        left_unique = drop_incorrect_left_diff(dirr, left_unique, diff_left_prefix.split('_')[0], 
                                            diff_left_prefix.split('_')[1], diff_left.info['diff_stage'])
        right_unique = drop_incorrect_left_diff(dirr, right_unique, diff_right_prefix.split('_')[0], 
                                                diff_right_prefix.split('_')[1], diff_right.info['diff_stage'])
    if len(left_unique) == 0 and len(right_unique) == 0:
        return None
    # left_unique = [br for branch in left_unique for br in branch]
    # right_unique = [br for branch in right_unique for br in branch]
    return (len(left_unique) - len(right_unique)) / max(len(left_unique), len(right_unique))
 