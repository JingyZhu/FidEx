"""
Check if the archive preserves all the fidelity from liveweb page
"""
import difflib
import json
import re, os
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
from collections import defaultdict
import cv2
import numpy as np

from fidex.utils import url_utils
from fidex.fidelity_check import layout_tree as layout_tree
import warnings
warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)

def compare_screenshot(live_img, archive_img):
    if not os.path.exists(live_img) or not os.path.exists(archive_img):
        return -1
    img1 = cv2.imread(live_img)
    img2 = cv2.imread(archive_img)
    height = min(img1.shape[0], img2.shape[0])
    width = min([img1.shape[1], img2.shape[1]])
    img1 = img1[:height,:width,:]
    img2 = img2[:height,:width,:]
    diff = img1 - img2
    total = img1.shape[0]*img1.shape[1]*img1.shape[2]
    same = np.count_nonzero(diff == 0)
    return same / total


def _html_2_xpath(html, element):
    """Translate each line in html to xpath"""
    lines = html.split('\n')
    xpaths = []
    for line in lines:
        line = line.strip()
        # Match the first number before :
        idx = re.search(r'^\d+:', line)
        idx = idx.group()[:-1] if idx else None
        if idx is None:
            continue
        xpath = element[int(idx)]
        xpaths.append(xpath)
    return xpaths


def verify(left_element: dict, right_element: dict) -> bool:
    """
    Args:
        left_element (dict): element's path and dimension info in the liveweb page
        right_element (dict): element's path and dimension info in the archive page
    
    Returns:
        fidelity_preserved: Whether the fidelity is preserved
    """
    left_xpaths = [e['xpath'] for e in left_element]
    right_xpaths = [e['xpath'] for e in right_element]
    if left_xpaths != right_xpaths:
        print("html not same")
        print(json.dumps([d for d in
            list(difflib.ndiff(left_xpaths, right_xpaths)) if d[0] in ['-', '+']], indent=2))
        return False
    # * Currently for each element, only check the width and height
    if len(left_element) != len(right_element):
        print("Element number is different")
        return False
    for le, ae in zip(left_element, right_element):
        live_dimension = layout_tree._collect_dimension(le)
        archive_dimension = layout_tree._collect_dimension(ae)
        if live_dimension != archive_dimension:
            print("Dimension is different", le, ae)
            return False
    return True

def _merge_xpaths(xpaths):
    """
    Merge the xpaths that have the same prefix
    
    Returns:
        List[List]: List of xpaths that share the same prefix
    """
    xpaths = sorted(xpaths)
    merged_xpaths = []
    for xpath in xpaths:
        if not merged_xpaths:
            merged_xpaths.append([xpath])
            continue
        last = merged_xpaths[-1]
        if xpath.startswith(last[0]):
            last.append(xpath)
        else:
            merged_xpaths.append([xpath])
    return merged_xpaths

def xpaths_2_text(xpaths, xpath_map):
    """Transform xpaths to their text"""
    text = ''
    for xpath in xpaths:
        element = xpath_map[xpath]
        text += '  ' * element['depth'] + element['text'] + '\n'
    return text

def diff(left_elements, left_writes, left_writeStacks, right_elements, right_writes, right_writeStacks) -> (list, list):
    # Currently we assue left element is always the live page and right element is the archive/proxy page 
    left_layout = layout_tree.build_layout_tree(left_elements, left_writes, left_writeStacks, True)
    right_layout = layout_tree.build_layout_tree(right_elements, right_writes,right_writeStacks, False)

    # print(f"{json.dumps(list(left_write_stacks - right_write_stacks), indent=2)}")
    # print(f"{json.dumps(list(right_write_stacks - left_write_stacks), indent=2)}")
    for layout_order in [False, True]:
        left_unique, right_unique = layout_tree.diff_layout_tree_xpath(left_layout, right_layout, layout_order=layout_order)
        if len(left_unique) == 0 and len(right_unique) == 0:
            break
    
    left_unique = _merge_xpaths(left_unique)
    # print("left_unique number", [len(xpaths) for xpaths in left_unique])
    
    right_unique = _merge_xpaths(right_unique)
    # print("right_unique number", [len(xpaths) for xpaths in right_unique])
    return left_unique, right_unique


def generate_sig(write, live=False):
    sig = []
    stackInfo = write['stackInfo']
    for stack in stackInfo:
        sig.append([])
        for callFrame in stack['callFrames']:
            url = callFrame['archive_url'] if live else callFrame['url']
            real_url = url_utils.filter_archive(url)
            if real_url in [None, '']:
                continue
            line = callFrame['archive_start'][0] if live else callFrame['lineNumber']
            col = callFrame['archive_start'][1] if live else callFrame['columnNumber']
            frame = f'{real_url}:{line}:{col}'
            sig[-1].append(frame)
    return sig

def diff_writes(left_writes: list, right_writes: list, attribute: str='rawWrites'):
    """
    Diff the writes between live and archive pages
    Same criteria is based on write's stack trace

    Args:
        left_writes: List from left_writes
        right_writes: List from right_writes
    """
    left_writes = left_writes[attribute]
    right_writes = right_writes[attribute]

    def _tag_from_xpath(xpath):
        return xpath.split('/')[-1].split('[')[0]

    def _tag_from_arg(args):
        if not isinstance(args, list):
            args = [args]
        tags = []
        for arg in args:
            if 'xpath' in arg:
                tags.append(_tag_from_xpath(arg['xpath']))
            else:
                html = BeautifulSoup(str(arg['html']), 'html.parser')
                tag = html.find()
                if tag:
                    tags.append(tag.name)
                else:
                    tags.append('text')
        return tags

    left_sigs, right_sigs = defaultdict(list), defaultdict(list)
    for write in left_writes:
        # write_sig = generate_sig(live_stacks_id[write['wid']], live=True)
        write_sig = [write['method']]
        target = _tag_from_xpath(write['xpath'])
        args = []
        for arg in write['arg']:
            args += _tag_from_arg(arg)
        sig = [target] + args + write_sig
        sig = tuple([tuple(s) if isinstance(s, list) else s for s in sig])
        left_sigs[sig].append(write)
    
    for write in right_writes:
        # write_sig = generate_sig(archive_stacks_id[write['wid']], live=False)
        write_sig = [write['method']]
        target = _tag_from_xpath(write['xpath'])
        args = []
        for arg in write['arg']:
            args += _tag_from_arg(arg)
        sig = [target] + args + write_sig
        sig = tuple([tuple(s) if isinstance(s, list) else s for s in sig])
        right_sigs[sig].append(write)
    
    left_unique, right_unique = {}, {}
    for sig in left_sigs:
        if sig not in right_sigs  or len(left_sigs[sig]) > len(right_sigs[sig]):
            left_unique[sig] = left_sigs[sig]
    for sig in right_sigs:
        if sig not in left_sigs or len(right_sigs[sig]) > len(left_sigs[sig]):
            right_unique[sig] = right_sigs[sig]
    return left_unique, right_unique


def filter_dynamism(left_unique, left_writes,
                    right_unique, right_writes):
    """
    Filter out unique elements that are caused by dynamic components
    Currently mainly focus on image carousel with the following heuristics
        - Sibling elements appear at both unique branches
        - For all writes associated with the sibling elements, there are repetitive writes
    
    Returns:
        (List, List): updated left_unique and right_unique
    """
    new_left_unique, new_right_unique = [], []
    
    def select_writes(writes, xpaths):
        xpaths_set = set(xpaths)
        new_writes = []
        is_set_class = lambda w: w['method'] == 'setAttribute' and len(w['arg']) == 2 and w['arg'][0]['html'] == 'class'
        is_set_classname = lambda w: w['method'] == 'set:className'
        for write in writes:
            if write['xpath'] not in xpaths_set:
                continue
            if is_set_class(write):
                new_writes.append(write)
            elif is_set_classname(write):
                new_writes.append(write)
        return new_writes
    
    def overlap_write(left_writes, right_writes):
        for left_write in left_writes:
            for right_write in right_writes:
                left_write_info = {'method': left_write['method'], 'arg': left_write['arg']}
                right_write_info = {'method': right_write['method'], 'arg': right_write['arg']}
                if left_write_info == right_write_info:
                    return True
        return False
    
    for left_br in left_unique:
        match_other_unique = False
        for j, right_br in enumerate(right_unique):
            sibling_branch = len(left_br) == len(right_br) \
                           and all([_sibling_xpath(l, r) for l, r in zip(left_br, right_br)])
            if not sibling_branch:
                continue
            left_associate_writes = []
            for l in left_br:
                left_associate_writes += associate_writes(l, left_writes)
            left_associate_writes = select_writes(left_associate_writes, left_br)
            for r in right_br:
                right_associate_writes = associate_writes(r, right_writes)
            right_associate_writes = select_writes(right_associate_writes, right_br)
            # print("left associate writes", left_br, json.dumps(left_associate_writes, indent=2))
            # print("right associate writes", right_br, json.dumps(right_associate_writes, indent=2))
            if overlap_write(left_associate_writes, right_associate_writes):
                match_other_unique = True
                right_unique = right_unique[:j] + right_unique[j+1:]
                break
        if not match_other_unique:
            new_left_unique.append(left_br)
    new_right_unique = right_unique
    return new_left_unique, new_right_unique

def filter_same_visual_part(left_img, left_unique, left_elements, 
                            right_img, right_unique, right_elements):
    """
    Filter out unique elements that are have the same screenshot images
    To be defined as "same visual part", the two 
    
    Returns:
        (List, List): updated left_unique and right_unique
    """
    if not os.path.exists(left_img) or not os.path.exists(right_img):
        return left_unique, right_unique
    left_xpaths_map = {e['xpath']: e for e in left_elements}
    right_xpaths_map = {e['xpath']: e for e in right_elements}
    def update_crop(crop, element, img_dimen):
        if element.get('dimension', None) is None:
            return crop
        dimen = element['dimension']
        im_t, im_b, im_l, im_r = 0, img_dimen[0], 0, img_dimen[1]
        t, b, l, r = crop
        t = max(im_t, min(t, dimen['top']))
        b = min(im_b, max(b, dimen['top'] + dimen['height']))
        l = max(im_l, min(l, dimen['left']))
        r = min(im_r, max(r, dimen['left'] + dimen['width']))
        return [t, b, l, r]
    def crop_intersect(crop1, crop2):
        return crop1[0] < crop2[1] and crop1[1] > crop2[0] and crop1[2] < crop2[3] and crop1[3] > crop2[2]
    def branch_crop(branch, xpaths_map, img_dimen):
        crop_area = [float('inf'), float('-inf'), float('inf'), float('-inf')]
        for xpath in branch:
            crop_area = update_crop(crop_area, xpaths_map[xpath], img_dimen)
        return crop_area
    img1 = cv2.imread(left_img)
    img1_dimen = img1.shape[:2]
    img2 = cv2.imread(right_img)
    img2_dimen = img2.shape[:2]
    img_dimen = [min(img1_dimen[0], img2_dimen[0]), min(img1_dimen[1], img2_dimen[1])]
    left_crops, right_crops = [], []
    for left_br in left_unique:
        left_crops.append(branch_crop(left_br, left_xpaths_map, img1_dimen))
    for right_br in right_unique:
        right_crops.append(branch_crop(right_br, right_xpaths_map, img2_dimen))
    
    new_left_unique, new_right_unique = [], []
    for i in range(len(left_unique)):
        matched_crop = False
        for j in range(len(right_unique)):
            left_crpo, right_crop = left_crops[i], right_crops[j]
            if not crop_intersect(left_crpo, right_crop):
                continue
            merged_crop = [min(left_crpo[0], right_crop[0]), min(img_dimen[0], max(left_crpo[1], right_crop[1])),
                            min(left_crpo[2], right_crop[2]), min(img_dimen[1], max(left_crpo[3], right_crop[3]))]
            merged_crop = [int(c) for c in merged_crop]
            left_crop = img1[merged_crop[0]:merged_crop[1], merged_crop[2]:merged_crop[3], :]
            right_crop = img2[merged_crop[0]:merged_crop[1], merged_crop[2]:merged_crop[3], :]
            diff = left_crop - right_crop
            if np.count_nonzero(diff == 0) == diff.shape[0]*diff.shape[1]*diff.shape[2]:
                matched_crop = True
                right_unique = right_unique[:j] + right_unique[j+1:]
                break
        if not matched_crop:
            new_left_unique.append(left_unique[i])
    new_right_unique = right_unique
    return new_left_unique, new_right_unique