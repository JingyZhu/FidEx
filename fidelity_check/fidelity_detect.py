import json
from . import check_utils, check_meaningful
import time
import os

class LoadInfo:
    def __init__(self, dirr, prefix):
        self.dirr = dirr
        self.prefix = prefix
        self.base, self.stage = self.prefix.split('_') if '_' in self.prefix else (self.prefix, 'onload')
        self.read_info()

    @staticmethod
    def read_write_stacks(dirr, base):
        write_stacks = json.load(open(f"{dirr}/{base}_writeStacks.json"))
        write_stacks_flattered = []
        for obj in write_stacks:
            stackInfo, wids = obj['stackInfo'], obj['wids']
            for wid in wids:
                write_stacks_flattered.append({
                    'wid': wid,
                    'stackInfo': stackInfo
                })
        return sorted(write_stacks_flattered, key=lambda x: int(x['wid'].split(':')[0]))

    @staticmethod
    def stage_nolater(s1, s2):
        if s1 == 'onload':
            return True
        if s2 == 'onload':
            return False
        s1 = s1.replace('interaction_', '')
        s2 = s2.replace('interaction_', '')
        return int(s1) <= int(s2)

    @staticmethod
    def dedeup_elements(layout):
        seen_xpath = set()
        new_elements = []
        for element in layout:
            if element['xpath'] not in seen_xpath:
                seen_xpath.add(element['xpath'])
                new_elements.append(element)
        return new_elements
    
    def read_info(self):
        self.elements = json.load(open(f"{self.dirr}/{self.prefix}_dom.json"))
        
        self.elements = LoadInfo.dedeup_elements(self.elements)
        self.writes = json.load(open(f"{self.dirr}/{self.base}_writes.json"))
        # Filter writes based on stages
        self.writes = [w for w in self.writes if LoadInfo.stage_nolater(w['currentStage'], self.stage)]
        self.write_stacks = LoadInfo.read_write_stacks(self.dirr, self.base)


def fidelity_issue(dirr, left_prefix='live', right_prefix='archive', meaningful=True) -> (bool, (list, list)):
    """Returns: (if fidelity issue, detailed unique elements in live and archive)"""
    left_info = LoadInfo(dirr, left_prefix)
    right_info = LoadInfo(dirr, right_prefix)

    left_unique, right_unique = check_utils.diff(left_info, right_info)
    if meaningful:
        left_unique, right_unique = check_meaningful.meaningful_diff(left_info.elements, left_unique, right_info.elements, right_unique)
    # * Same visual part
    if len(left_unique) + len(right_unique) > 0:
        if os.path.exists(f"{dirr}/{left_prefix}.png") and os.path.exists(f"{dirr}/{right_prefix}.png"):
            left_img, right_img = f"{dirr}/{left_prefix}.png", f"{dirr}/{right_prefix}.png"
            left_unique, right_unique = check_utils.filter_same_visual_part(left_img, left_unique, left_info.elements,
                                                                            right_img, right_unique, right_info.elements)
        else:
            print("Warning: diff layout tree but no screenshots found")
    return len(left_unique) + len(right_unique) > 0, (left_unique, right_unique)


def fidelity_issue_screenshot(dirr, left_file='live', right_file='archive') -> (bool, float):
    """Screenshot-based method to check fidelity issue
    
    Returns:
        (if fidelity issue, similarity score between left and right screenshots)
    """
    left_screenshot = f"{dirr}/{left_file}.png"
    right_screenshot = f"{dirr}/{right_file}.png"
    simi = check_utils.compare_screenshot(left_screenshot, right_screenshot)
    return simi < 1, simi


def fidelity_issue_all(dirr, left_prefix='live', right_prefix='archive', screenshot=False, meaningful=True) -> dict:
    """
    Check fidelity issue for all stages (i.e. onload, extraInteraction, and interaction)
    """
    start = time.time()
    # * Overall diff for layout and screenshot
    diff, s_diff = False, False
    # * If any stage is different, which one
    diff_stage, s_diff_stage, s_simi = None, None, None
    # * Checking onload
    ol_diff, _ = fidelity_issue(dirr, left_prefix, right_prefix, meaningful=meaningful)
    ol_s_diff = None
    if screenshot:
        ol_s_diff, s_simi = fidelity_issue_screenshot(dirr, left_prefix, right_prefix)
    if ol_diff:
        diff = True
        diff_stage = 'onload'
    if ol_s_diff:
        s_diff = True
        s_diff_stage = 'onload'
    if diff_stage and (not screenshot or s_diff_stage):
        return {
            'hostname': dirr,
            'diff': diff,
            'screenshot_diff': s_diff,
            'diff_stage': diff_stage,
            'screenshot_diff_stage': s_diff_stage,
            'similarity': s_simi
        }
    
    # * Check for number of interaction
    left_events = json.load(open(f"{dirr}/{left_prefix}_events.json"))
    left_elements = json.load(open(f"{dirr}/{left_prefix}_dom.json"))
    left_elements_map = {e['xpath']: e for e in left_elements}
    right_events = json.load(open(f"{dirr}/{right_prefix}_events.json"))
    right_elements = json.load(open(f"{dirr}/{right_prefix}_dom.json"))
    right_elements_map = {e['xpath']: e for e in right_elements}
    
    print(dirr, 'onload elasped:', time.time()-start)
    left_idx, right_idx = [], []
    for event in left_events:
        if check_meaningful.meaningful_interaction(event, elements_map=left_elements_map) and os.path.exists(f'{dirr}/{left_prefix}_{event["idx"]}_dom.json'):
            left_idx.append(event['idx'])
    for event in right_events:
        if check_meaningful.meaningful_interaction(event, elements_map=right_elements_map) and os.path.exists(f'{dirr}/{right_prefix}_{event["idx"]}_dom.json'):
            right_idx.append(event['idx'])
    if len(left_idx) > len(right_idx):
        return {
            'hostname': dirr,
            'diff': True,
            'screenshot_diff': True,
            'diff_stage': 'extraInteraction',
            'screenshot_diff_stage': 'extraInteraction'
        }
    
    # * Check for each interaction
    for k in range(len(left_idx)):
        i, j = left_idx[k], right_idx[k]
        i_diff, _ = fidelity_issue(dirr, f'{left_prefix}_{i}', f'{right_prefix}_{j}', meaningful=True)
        i_s_diff, i_s_simi = None, None
        if screenshot:
            i_s_diff, i_s_simi = fidelity_issue_screenshot(dirr, f'{left_prefix}_{i}', f'{right_prefix}_{j}')
        if i_diff and not diff:
            diff = True
            diff_stage = f'interaction_{i}'
        if i_s_diff and not s_diff:
            s_diff = True
            s_diff_stage = f'interaction_{i}'
            s_simi = i_s_simi
        print(dirr, f'{k+1}/{len(left_idx)}', 'elasped:', time.time()-start)
        if diff_stage and (not screenshot or s_diff_stage):
            return {
                'hostname': dirr,
                'diff': diff,
                'screenshot_diff': s_diff,
                'diff_stage': diff_stage,
                'screenshot_diff_stage': s_diff_stage,
                'similarity': s_simi
            }
    return {
        'hostname': dirr,
        'diff': diff,
        'screenshot_diff': s_diff,
        'diff_stage': diff_stage,
        'screenshot_diff_stage': s_diff_stage,
        'similarity': s_simi
    }