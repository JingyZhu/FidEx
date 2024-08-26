import re
from bs4 import BeautifulSoup

def _ignore_tag(branch):
    ignore_list = ['ruffle-embed', 'rs-progress-bar']
    for xpath in branch:
        for ig in ignore_list:
            if xpath.split('/')[-1].startswith(ig):
                return True
    return False

def _from_recaptcha(branch, xpaths_map):
        xpath = branch[0]
        # * Check parent
        paths = xpath.split('/')
        iframe_idx = -1
        for i, p in enumerate(paths):
            if p.startswith('iframe'):
                iframe_idx = i
                break
        iframe_path = paths[:iframe_idx+1]
        iframe_element = xpaths_map.get('/'.join(iframe_path), None)
        if iframe_element is not None:
            if 'recaptcha' in iframe_element['text'].lower():
                return True
        # * Check children
        for br in branch:
            element = xpaths_map[br]
            if 'recaptcha' in element['text'].lower():
                return True
        # * Check background
        if len(branch) == 1:
            element = xpaths_map[xpath]
            recaptcha_background = re.compile('<div style="width: 100%; height: 100%; position: fixed; top: 0px; left: 0px; z-index: \d+; background-color: rgb\\(255, 255, 255\\);\\ opacity:\\ 0\\.05;">')
            if recaptcha_background.search(element['text'].lower()):
                return True
        return False

def _from_youtube(branch, xpaths_map):
    for br in branch:
        element = xpaths_map[br]
        element_tag = BeautifulSoup(element['text'], 'html.parser')
        # if element_tag is pure text continue
        if element_tag.find() is None:
            continue
        # First element's class name includes "ytp"
        if 'ytp' in ' '.join(element_tag.find().attrs.get('class', '')):
            return True
    return False

def _from_vimeo(branch, xpaths_map):
    xpath = branch[0]
    # * Check parent
    paths = xpath.split('/')
    iframe_idx = -1
    for i, p in enumerate(paths):
        if p.startswith('iframe'):
            iframe_idx = i
            break
    iframe_path = paths[:iframe_idx+1]
    iframe_element = xpaths_map.get('/'.join(iframe_path), None)
    if iframe_element is not None:
        if 'player.vimeo.com' in iframe_element['text'].lower():
            return True
    
def _remove_wrapping_elements(branch, xpaths_map):
    removed = 1 # dummy first
    cur_branch = branch
    while removed > 0:
        removed = 0
        new_branch = []
        for br in cur_branch:
            has_child = False
            has_xpathmap_child = False
            for b in cur_branch:
                if b != br and b.startswith(br):
                    has_child = True
                    break
            if has_child:
                new_branch.append(br)
                continue
            # Check if xpaths_map has any br's children
            # If so, this mean the br is just a wrapping element, where all the children are matched or ignored
            for b in xpaths_map:
                if b != br and b.startswith(br):
                    has_xpathmap_child = True
                    removed += 1
                    break
            if not has_xpathmap_child:
                new_branch.append(br)
        cur_branch = new_branch
    return cur_branch


def meaningful_branch(branch, elements) -> bool:
    xpath_map = {e['xpath']: e for e in elements}
    branch_meaningful = True
    if _ignore_tag(branch):
        branch_meaningful = False
    if _from_recaptcha(branch, xpath_map):
        branch_meaningful = False
    return branch_meaningful


def meaningful_diff(left_element, left_unique, right_element, right_unique) -> (list, list):
    """
    Classify if the unique layout tree is actually meaningfug, not some random noise(e.g. recaptcha)
    Currently, filtration involves:
        - All recaptcha like elements
        - All youtube video elements (class includes "ytp")
        - All vimeo video elements (iframe src includes "player.vimeo.com")
        - Any wrapping element that all the children is matched

    Returns:
        (List, List): updated left_unique and right_unique
    """
    left_xpaths_map = {e['xpath']: e for e in left_element}
    right_xpaths_map = {e['xpath']: e for e in right_element}

    new_left_unique = []
    for branch in left_unique:
        branch_meaningful = True
        if _ignore_tag(branch):
            branch_meaningful = False
        if _from_recaptcha(branch, left_xpaths_map):
            branch_meaningful = False
        if _from_youtube(branch, left_xpaths_map):
            branch_meaningful = False
        if _from_vimeo(branch, left_xpaths_map):
            branch_meaningful = False
        if branch_meaningful:
            branch = _remove_wrapping_elements(branch, left_xpaths_map)
            new_left_unique.append(branch) if len(branch) > 0 else None
    
    new_right_unique = []
    for branch in right_unique:
        branch_meaningful = True
        if _ignore_tag(branch):
            branch_meaningful = False
        if _from_recaptcha(branch, right_xpaths_map):
            branch_meaningful = False
        if _from_youtube(branch, right_xpaths_map):
            branch_meaningful = False
        if _from_vimeo(branch, right_xpaths_map):
            branch_meaningful = False
        if branch_meaningful:
            branch = _remove_wrapping_elements(branch, right_xpaths_map)
            new_right_unique.append(branch) if len(branch) > 0 else None

    return new_left_unique, new_right_unique