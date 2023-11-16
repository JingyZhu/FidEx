"""
Mark different part for archive screenshot vs live screenshot
usage python3 mark_diff.py <archive_dir_path> <url>
"""
import cv2
import json
from collections import defaultdict
import numpy as np
from bs4 import BeautifulSoup
from lxml import etree
import pickle
import xmldiff
from urllib.parse import urljoin
from collections import defaultdict
import sys


path = sys.argv[1]
url = sys.argv[2]

live_path = path
archive_path = f'{path}_archive'

live = json.load(open(f'{live_path}/dimension.json', 'r'))
archive = json.load(open(f'{archive_path}/dimension.json', 'r'))
live_img = cv2.imread(f'{live_path}/dimension.png')
archive_img = cv2.imread(f'{archive_path}/dimension.png')
print("Screenshot shape:", live_img.shape, archive_img.shape)


def rectangle(img, elem, loc, typ):
    # * BGR
    font = cv2.FONT_HERSHEY_SIMPLEX
    fontScale = 1
    text_color = (0, 0, 0)  
    thickness = 2
    typ_map = {'miss': (0, 0, 255), 'diff': (255, 0, 0)}
    start = (int(loc['x']), int(loc['y']))
    end = (int(loc['right']), int(loc['bottom']))
    color = typ_map[typ]
    # print(start, end, color)
    img = cv2.rectangle(img, start, end, color, 3)
    # print(loc['y'], loc['bottom'], loc['height'])
    region = img[start[1]:end[1], start[0]:end[0]]
    overlay = np.tile(np.array(color), list(region.shape[:2])+[1])
    overlay = overlay.astype('uint8')
    region = cv2.addWeighted(region, 0.75, overlay, 0.25, 0)
    img[start[1]:end[1], start[0]:end[0]] = region
    # img = cv2.putText(img, elem, start, font, fontScale, text_color, thickness)
    return img

def get_elem_id(elem):
    # TODO: Implement it
    eid = elem.name.upper()
    if 'id' in elem.attrs:
        eid += "#"
        eid += elem.attrs['id'] if isinstance(elem.attrs['id'], str) else ' '.join(elem.attrs['id'])
    if 'class' in elem.attrs:
        eid += "."
        eid += elem.attrs['class'] if isinstance(elem.attrs['class'], str) else ' '.join(elem.attrs['class'])
    if elem.name == "a" and 'href' in elem.attrs:
        eid += f"#href:{urljoin(url, elem.attrs['href'])}"
    return eid


def dimensional_diff():
    height = ['y', 'top', 'bottom', 'x', 'left', 'right']
    # height = ['height', 'width']
    archive_diff = defaultdict(dict)
    archive_miss = defaultdict(dict)
    t = 0
    for elem, dimem in live['dimensions'].items():
        if dimem['height'] == 0 or dimem['width'] == 0:
            continue
        if elem not in archive['dimensions']:
            archive_miss[elem] = dimem
            continue
        adimem = archive['dimensions'][elem]
        
        is_diff = False
        for k, v in dimem.items():
            if v == 0 or adimem[k] == 0:
                continue
            if k not in height and abs(v - adimem[k]) > 0:
                is_diff = True
                break
        if is_diff:
            archive_diff[elem] = adimem

    return archive_miss, archive_diff

def _construct_map(root):
    childmap = defaultdict(list)
    for t in root.find_all():
        tid = get_elem_id(t)
        tparent = t.parent
        tparentid = get_elem_id(tparent)
        childmap[tparentid].append(tid)
    return childmap

def _subtree_diff_dimem(root, childmap, dimensional_diff):
    rid = get_elem_id(root)
    uncovered = [rid]
    visited = set()
    results = []
    while len(uncovered) > 0:
        cid = uncovered.pop(0)
        visited.add(cid)
        if cid in dimensional_diff:
            results.append(cid)
        else:
            for child in childmap:
                if child not in visited:
                    uncovered.append(child)
    return results

def structural_diff(dimensional_diff={}):
    diff = json.load(open(f'{archive_path}/diff.json', 'r'))
    
    archive_miss = []
    archive_diff = []
    for add in diff:
        typ = add['type'].split('::')[-1]
        if typ not in ["Element"]:
            continue
        node = BeautifulSoup(add['text'], "html.parser")
        node = list(node.children)[0]
        childmap = _construct_map(node)
        uncovered_nodes = _subtree_diff_dimem(node, childmap, dimensional_diff)
        archive_miss += uncovered_nodes

    print(len(archive_miss), len(archive_diff))
    return archive_miss, archive_diff
    json.dump(archive_miss, open('archive_miss.json', 'w+'), indent=2)


def paint_diff(dmiss, ddiff, smiss=None, sdiff=None):
    global archive_img, live_img
    miss_count, diff_count = 0, 0
    for elem, dimem in dmiss.items():
        if smiss is None or elem in smiss:
            print(elem)
            miss_count += 1
            live_img = rectangle(live_img, elem, dimem, 'miss')

    for elem, dimem in ddiff.items():
        if sdiff is None or elem in sdiff:
            diff_count += 1
            archive_img = rectangle(archive_img, elem, dimem, 'diff')
    print("#miss, #diff", miss_count, diff_count)
    # return archive_diff, archive_miss
    cv2.imwrite(f"{live_path}/dimension_diff.png", live_img)
    cv2.imwrite(f"{archive_path}/dimension_diff.png", archive_img)

def paint_diff_2(smiss, sdiff):
    """Only liveweb page's added element is considered"""
    global archive_img, live_img
    miss_count, diff_count = 0, 0
    for elem in smiss:
        if elem in live['dimensions']:
            dimem = live['dimensions'][elem]
            if dimem['height'] == 0 or dimem['width'] == 0:
                continue
            print(elem)
            # TODO: Need to deal with negative location better way
            if len([v for v in dimem.values() if v < 0]) > 0:
                continue
            miss_count += 1
            live_img = rectangle(live_img, elem, dimem, 'miss')

    print("#miss, #diff", miss_count, diff_count)
    cv2.imwrite(f"{archive_path}/dimension_diff.png", live_img)

dmiss, ddiff = dimensional_diff()
all_diff = dmiss.copy()
all_diff.update(ddiff)
smiss, sdiff = structural_diff(all_diff)
# paint_diff(dmiss, ddiff)
# paint_diff(dmiss, ddiff, smiss)
paint_diff_2(smiss, sdiff)
