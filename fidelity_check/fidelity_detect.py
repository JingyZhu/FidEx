import json
import time
import os
import logging
import cv2
from dataclasses import dataclass
from Levenshtein import distance

from fidex.fidelity_check import check_utils, check_meaningful
from fidex.utils import common, logger, url_utils

def dedeup_elements(layout):
    seen_xpath = set()
    new_elements = []
    for element in layout:
        if element['xpath'] not in seen_xpath:
            seen_xpath.add(element['xpath'])
            new_elements.append(element)
    return new_elements

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
    
    def read_info(self):
        self.elements = json.load(open(f"{self.dirr}/{self.prefix}_dom.json"))
        
        self.elements = dedeup_elements(self.elements)
        self.writes = json.load(open(f"{self.dirr}/{self.base}_writes.json"))
        # Filter writes based on stages
        self.writes = [w for w in self.writes if common.stage_nolater(w['currentStage'], self.stage)]
        self.write_stacks = LoadInfo.read_write_stacks(self.dirr, self.base)
    
    def read_events(self, available=True) -> list:
        if not os.path.exists(f"{self.dirr}/{self.base}_events.json"):
            self.events = []
            return self.events
        self.events = json.load(open(f"{self.dirr}/{self.base}_events.json"))
        if available:
            self.available_events()
        return self.events
    
    def read_excep_ff(self) -> list:
        return json.load(open(f"{self.dirr}/{self.base}_exception_failfetch.json"))

    def gen_xpath_map(self):
        self.elements_map = {e['xpath']: e for e in self.elements}
    
    def available_events(self):
        events = []
        for e in self.events:
            if not os.path.exists(f"{self.dirr}/{self.base}_{e['idx']}_dom.json"):
                continue
            events.append(e)
        self.events = events


def fidelity_issue(dirr, left_prefix='live', right_prefix='archive', meaningful=True) -> (bool, (list, list)):
    """Returns: (if fidelity issue, detailed unique elements in live and archive)"""
    left_info = LoadInfo(dirr, left_prefix)
    right_info = LoadInfo(dirr, right_prefix)

    left_unique, right_unique = check_utils.diff(left_info, right_info)
    if meaningful:
        left_unique, right_unique = check_meaningful.meaningful_diff(left_info.elements, left_unique, right_info.elements, right_unique)
    # * Same visual part
    if len(left_unique) + len(right_unique) > 0:
        if os.path.exists(f"{dirr}/{left_prefix}.jpg") and os.path.exists(f"{dirr}/{right_prefix}.jpg"):
            left_img, right_img = f"{dirr}/{left_prefix}.jpg", f"{dirr}/{right_prefix}.jpg"
            left_unique, right_unique = check_utils.filter_same_visual_part(left_img, left_unique, left_info.elements,
                                                                            right_img, right_unique, right_info.elements)
        else:
            logging.warning("Warning: diff layout tree but no screenshots found")
    return len(left_unique) > 0, (left_unique, right_unique)


def fidelity_issue_screenshot(dirr, left_file='live', right_file='archive') -> "(float, numpy.NDArray)":
    """Screenshot-based method to check fidelity issue
    
    Returns:
        (if fidelity issue, similarity score between left and right screenshots)
    """
    left_screenshot = f"{dirr}/{left_file}.jpg"
    right_screenshot = f"{dirr}/{right_file}.jpg"
    simi, diff = check_utils.compare_screenshot(left_screenshot, right_screenshot)
    return simi, diff

def fidelity_issue_more_errs(dirr, left_prefix='live', right_prefix='archive', stage='onload') -> (bool, int):
    """More error based method to check fidelity issue

    Returns:
        (if fidelity issue, number of more errors in right than left)
    """
    left_exceptions = LoadInfo(dirr, left_prefix).read_excep_ff()
    left_exceptions = [e for exceptions in left_exceptions if common.stage_nolater(exceptions['stage'], stage) for e in exceptions['exceptions']]
    right_exceptions = LoadInfo(dirr, right_prefix).read_excep_ff()
    right_exceptions = [e for exceptions in right_exceptions if common.stage_nolater(exceptions['stage'], stage) for e in exceptions['exceptions']]
    left_exceptions = set([(e.get('description', ''), url_utils.filter_archive(e.get('scriptURL', ''))) for e in left_exceptions])
    right_exceptions = set([(e.get('description', ''), url_utils.filter_archive(e.get('scriptURL', ''))) for e in right_exceptions])
    more_errs = [{'description': e[0], 'scriptURL': e[1]} for e in right_exceptions - left_exceptions]
    return len(more_errs) > 0, more_errs

def fidelity_issue_text(dirr, left_prefix='live', right_prefix='archive') -> (bool, float):
    """Text-based method to check fidelity issue

    Returns:
        (if fidelity issue, similarity score between left and right text)
    """
    left_dom = json.load(open(f"{dirr}/{left_prefix}_dom.json"))
    right_dom = json.load(open(f"{dirr}/{right_prefix}_dom.json"))
    left_text = check_utils.extract_text(left_dom)
    right_text = check_utils.extract_text(right_dom)
    lev_dist = distance(left_text, right_text)
    max_len = max(len(left_text), len(right_text))
    if max_len == 0:
        return False, 1
    score = (max_len - lev_dist) / max_len
    return score < 1, score

@dataclass
class FidelityResult:
    info: dict
    live_unique: list
    archive_unique: list
    more_errs: list = None

    def load_from_dict(self, d: dict):
        self.info = d['info']
        self.live_unique = d['live_unique']
        self.archive_unique = d['archive_unique']
        self.more_errs = d.get('more_errs', None)

class FidelityDetector:
    def __init__(self, dirr, left_prefix='live', right_prefix='archive', 
                 fidex_check=True, screenshot=False, more_errs=False, html_text=False, 
                 meaningful=True):
        self.dirr = dirr
        self.left_prefix = left_prefix
        self.right_prefix = right_prefix
        self.fidex_check = fidex_check
        self.screenshot = screenshot
        self.more_errs = more_errs
        self.html_text = html_text
        self.meaningful = meaningful
        self.diff = False
        self.diff_stage = None
        self.screenshot_diff = False
        self.screenshot_diff_stage = None
        self.screenshot_simi = None
        self.more_errs_diff = False
        self.more_errs_diff_stage = None
        self.more_errs_num = None
        self.more_errs_list = None
        self.html_text_diff = False
        self.html_text_diff_stage = None
        self.html_text_simi = None

        self.left_unique = []
        self.right_unique = []
    
    def detect_stage(self, left_stage, right_stage) -> "Tuple(bool, bool, bool, bool)":
        left = self.left_prefix if left_stage == 'onload' else f'{self.left_prefix}_{left_stage.split("_")[1]}'
        right = self.right_prefix if right_stage == 'onload' else f'{self.right_prefix}_{right_stage.split("_")[1]}'
        if self.fidex_check and not self.diff:
            # Only check fidelity issue if no diff found so far
            diff, (left_unique, right_unique) = fidelity_issue(self.dirr, left, right, meaningful=self.meaningful)
            self.diff = self.diff or diff
            if self.diff:
                # Only set unique elements if diff is found
                self.diff_stage = left_stage
                self.left_unique = left_unique
                self.right_unique = right_unique
        if self.screenshot and not self.screenshot_diff:
            s_simi, s_diff_array = fidelity_issue_screenshot(self.dirr, left, right)
            s_diff = s_simi < 1
            if s_diff:
                cv2.imwrite(f"{self.dirr}/diff_{self.right_prefix}.jpg", s_diff_array)
            self.screenshot_diff = self.screenshot_diff or s_diff
            if self.screenshot_diff:
                self.screenshot_diff_stage = left_stage
                self.screenshot_simi = s_simi
        if self.more_errs and not self.more_errs_diff:
            m_diff, m_errs = fidelity_issue_more_errs(self.dirr, left, right, left_stage)
            self.more_errs_diff = self.more_errs_diff or m_diff
            if self.more_errs_diff:
                self.more_errs_diff_stage = left_stage
                self.more_errs_num = len(m_errs)
                self.more_errs_list = m_errs
        if self.html_text and not self.html_text_diff:
            t_diff, t_simi = fidelity_issue_text(self.dirr, left, right)
            self.html_text_diff = self.html_text_diff or t_diff
            if self.html_text_diff:
                self.html_text_diff_stage = left_stage
                self.html_text_simi = t_simi
        return (not self.fidex_check or self.diff), \
                (not self.screenshot or self.screenshot_diff), \
                (not self.more_errs or self.more_errs_diff), \
                (not self.html_text or self.html_text_diff)
    
    def extra_interaction(self, need_exist=True):
        left_info = LoadInfo(self.dirr, self.left_prefix)
        right_info = LoadInfo(self.dirr, self.right_prefix)
        left_info.read_events(available=need_exist), right_info.read_events(available=need_exist)
        left_info.gen_xpath_map(), right_info.gen_xpath_map()
        left_unique_events, right_unique_events, left_common_events, right_common_events = check_utils.diff_interaction(left_info, right_info)
        self.left_common_events = left_common_events
        self.right_common_events = right_common_events
        left_unique_events = [e for e in left_unique_events if check_meaningful.meaningful_interaction(e, elements_map=left_info.elements_map)]
        right_unique_events = [e for e in right_unique_events if check_meaningful.meaningful_interaction(e, elements_map=right_info.elements_map)]
        if len(left_unique_events) > 0:
            self.diff = True
            self.diff_stage = self.diff_stage or 'extraInteraction'
            self.screenshot_diff = True
            self.screenshot_diff_stage = self.screenshot_diff_stage or 'extraInteraction'
            self.left_unique = [[e.xpath] for e in left_unique_events]
            self.right_unique = [[e.xpath] for e in right_unique_events]
        return len(left_unique_events) > 0
    
    def generate_result(self, writedown=True) -> FidelityResult:
        info = {
            'hostname': self.dirr,
            'diff': self.diff,
            'screenshot_diff': self.screenshot_diff,
            'more_errs_diff': self.more_errs_diff,
            'html_text_diff': self.html_text_diff,
            'diff_stage': self.diff_stage,
            'screenshot_diff_stage': self.screenshot_diff_stage,
            'more_errs_diff_stage': self.more_errs_diff_stage,
            'html_text_diff_stage': self.html_text_diff_stage,
            'similarity': self.screenshot_simi,
            'more_errs_num': self.more_errs_num,
            'text_similarity': self.html_text_simi,
        }
        if writedown:
            json.dump({
                'info': info,
                'live_unique': self.left_unique,
                'archive_unique': self.right_unique,
                'more_errs': self.more_errs_list
            }, open(f"{self.dirr}/diff_{self.left_prefix}_{self.right_prefix}.json", 'w'), indent=2)
        return FidelityResult(info=info, 
            live_unique=self.left_unique,
            archive_unique=self.right_unique,
            more_errs=self.more_errs_list)

def fidelity_issue_all(dirr, left_prefix='live', right_prefix='archive', 
                       fidex_check=True, screenshot=False, more_errs=False, html_text=False,
                       meaningful=True, need_exist=True, finish_all=False) -> FidelityResult:
    """
    Check fidelity issue for all stages (i.e. onload, extraInteraction, and interaction)
    """
    start = time.time()
    fidelity_detector = FidelityDetector(dirr, left_prefix=left_prefix, 
                                               right_prefix=right_prefix, 
                                               fidex_check=fidex_check,
                                               screenshot=screenshot,
                                               more_errs=more_errs, 
                                               html_text=html_text,
                                               meaningful=meaningful)
    diff, s_diff, m_diff, t_diff = fidelity_detector.detect_stage('onload', 'onload')
    if not finish_all and diff and s_diff and m_diff and t_diff:
        return fidelity_detector.generate_result()
    logging.info(f'{dirr.split("/")[-1]} onload elasped: {time.time()-start}')
    
    # * Check extraInteraction
    extra_intact = fidelity_detector.extra_interaction(need_exist=need_exist)
    if not finish_all and extra_intact:
        return fidelity_detector.generate_result()

    # * Check for each interaction
    for left_e, right_e in zip(fidelity_detector.left_common_events, 
                               fidelity_detector.right_common_events):
        if (not os.path.exists(f"{dirr}/{left_prefix}_{left_e.idx}_dom.json") or 
            not os.path.exists(f"{dirr}/{right_prefix}_{right_e.idx}_dom.json")):
            assert(not need_exist), f"Interaction {left_e.idx} or {right_e.idx} not found and need_exist is True"
            continue
        i, j = left_e.idx, right_e.idx
        diff, s_diff, m_diff, t_diff = fidelity_detector.detect_stage(f'interaction_{i}', f'interaction_{j}')
        logging.info(f'{dirr.split("/")[-1]}, {i+1}/{len(fidelity_detector.left_common_events)} elasped: {time.time()-start}')
        if not finish_all and diff and s_diff and m_diff and t_diff:
            return fidelity_detector.generate_result()
    return fidelity_detector.generate_result()