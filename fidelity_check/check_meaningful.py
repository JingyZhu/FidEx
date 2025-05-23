import re
from bs4 import BeautifulSoup

from fidex.utils import common, url_utils

def _ignore_tag(branch):
    ignore_list = ['ruffle-embed', 'rs-progress-bar', 'br']
    for xpath in branch:
        for ig in ignore_list:
            if common.tagname_from_xpath(xpath).startswith(ig):
                return True
    return False

def _visible(branch, xpaths_map):
    any_visible = False
    # Check for minus z-index
    top_element = xpaths_map[branch[0]]
    tag = BeautifulSoup(top_element['text'].lower(), 'html.parser')
    if tag.find():
        style = tag.find().attrs.get('style', '')
        n_zindex = re.compile('z-index: -\d+;')
        if n_zindex.search(style):
            return False

    for xpath in branch:
        tag = common.tagname_from_xpath(xpath)
        if tag == '#text':
            xpath = '/'.join(xpath.split('/')[:-1])
        dimension = xpaths_map[xpath].get('dimension', None)
        if not dimension:
            continue
        if dimension.get('width', 0) > 1 and dimension.get('height', 0) > 1:
            any_visible = True
            break
    return any_visible

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
            recaptcha_background = re.compile('<div style="width: 100%; height: 100%; position: fixed; top: 0px; left: 0px; z-index: \d+; background-color: rgb\\(255, 255, 255\\);\\ opacity:\\ 0\\.\d+;">')
            if recaptcha_background.search(element['text'].lower()):
                return True
        return False

def _from_youtube(branch, xpaths_map):
    parsed_xpath = set()
    for br in branch:
        actual_br = br
        if actual_br in parsed_xpath:
            continue
        element = xpaths_map[actual_br]
        while common.tagname_from_xpath(element['xpath']) == '#text' and len(actual_br.split('/')) > 1:
            actual_br = '/'.join(actual_br.split('/')[:-1])
            element = xpaths_map[actual_br]
        parsed_xpath.add(actual_br)
        element_tag = BeautifulSoup(element['text'], 'html.parser')
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

def _from_ads(branch, xpaths_map):
    for br in branch:
        element = xpaths_map[br]
        element_tag = BeautifulSoup(element['text'], 'html.parser')
        # if element_tag is pure text continue
        if element_tag.find() is None:
            continue
        # First element's class name includes ad related
        ad_class = ['adsbygoogle', 'ad', 'ads', 'advertisement', 'infinite', 'gpt']
        ad_class_ids = []
        if element_tag.find().attrs.get('class', ''):
            ad_class_ids += element_tag.find().attrs.get('class', '')
        if element_tag.find().attrs.get('id', ''):
            ad_class_ids.append(element_tag.find().attrs.get('id', ''))
        # ad_classlist = ' '.join(ad_classlist)
        ad_class_ids = [c for cl in ad_class_ids for c in re.split(r'[ \-_]+', cl)]
        for ad in ad_class:
            if ad in ad_class_ids:
                return True
        
        ad_src = ['counter.yadro.ru/hit']
        src = element_tag.find().attrs.get('src', '')
        for ad in ad_src:
            if ad in src:
                return True
    return False

def _from_dynamic(branch, xpaths_map):
    """Dynamic elements should be matched in matching phase. Here just to tackle some corner cases"""
    for br in branch:
        element = xpaths_map[br]
        element_tag = BeautifulSoup(element['text'], 'html.parser')
        if element_tag.find() is None:
            continue
        # First element's class name includes ad related
        dynamic_class = ['progress']
        dynamic_class_ids = []
        if element_tag.find().attrs.get('class', ''):
            dynamic_class_ids += element_tag.find().attrs.get('class', '')
        if element_tag.find().attrs.get('id', ''):
            dynamic_class_ids.append(element_tag.find().attrs.get('id', ''))
        dynamic_class_ids = [c for cl in dynamic_class_ids for c in re.split(r'[ \-_]+', cl)]
        for dynamic in dynamic_class:
            if dynamic in dynamic_class_ids:
                return True
    return False

def _from_lazyload_image(branch, xpaths_map, other_invisible_img_srcs: set):
    for br in branch:
        element = xpaths_map[br]
        element_tag = BeautifulSoup(element['text'], 'html.parser')
        if element_tag.find() is None:
            continue
        # First element's class name includes ad related
        img_tag = element_tag.find('img')
        if img_tag is None:
            continue
        if 'lazy' in ' '.join(img_tag.attrs.get('class', '')):
            return True
        if img_tag.attrs.get('loading', '') != 'eager':
            return False
        srcs = common.get_img_src(img_tag)
        if 'currentSrc' in element.get('extraAttr', {}):
            srcs.add(url_utils.url_norm(element['extraAttr']['currentSrc'], 
                     ignore_scheme=True, trim_www=True, trim_slash=True, archive=True))
        if srcs.intersection(other_invisible_img_srcs):
            return True
    return False


def branch_meaningful(branch, xpaths_map: dict=None) -> bool:
    if not _visible(branch, xpaths_map):
        return False
    if _ignore_tag(branch):
        return False
    if _from_recaptcha(branch, xpaths_map):
        return False
    if _from_youtube(branch, xpaths_map):
        return False
    if _from_vimeo(branch, xpaths_map):
        return False
    if _from_ads(branch, xpaths_map):
        return False
    if _from_dynamic(branch, xpaths_map):
        return False
    return True

def _remove_unnecessary_elements(branch, xpaths_map, other_xpaths_map: dict):
    """Throw away sub-branches, not the whole branch"""
    # * Construct invisible img srcs
    invisible_img_srcs = set()
    for xpath, obj in other_xpaths_map.items():
        if not _visible([xpath], other_xpaths_map) and common.tagname_from_xpath(xpath) == 'img':
            img_tag = BeautifulSoup(obj['text'], 'html.parser').find('img')
            srcs = common.get_img_src(img_tag)
            if 'currentSrc' in obj.get('extraAttr', {}):
                srcs.add(url_utils.url_norm(obj['extraAttr']['currentSrc'], 
                                            ignore_scheme=True, trim_www=True, trim_slash=True, archive=True))
            invisible_img_srcs.update(srcs)

    new_branch = []
    filtered_branch = []
    for br in branch:
        in_filter_branch = False
        for fbr in filtered_branch:
            if br.startswith(fbr):
                in_filter_branch = True
                break
        if in_filter_branch:
            continue
        if _from_ads([br], xpaths_map) \
          or _from_dynamic([br], xpaths_map) \
          or _from_recaptcha([br], xpaths_map) \
          or _from_lazyload_image([br], xpaths_map, invisible_img_srcs):
            filtered_branch.append(br)
            continue
        new_branch.append(br)
    return new_branch

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


def interaction_branch_meaningful(branch, elements_map: dict=None) -> bool:
    branch_meaningful = True
    if _ignore_tag(branch):
        branch_meaningful = False
    if _from_recaptcha(branch, elements_map):
        branch_meaningful = False
    return branch_meaningful


def meaningful_interaction(event: "events.Event", elements: list=None, elements_map: dict=None) -> bool:
    assert elements is not None or elements_map is not None, 'Either elements or elements_map should be provided'
    xpath_map = elements_map if elements_map is not None else {e['xpath']: e for e in elements}
    non_meaningful = set([('a', 'click'), ('a', 'mousedown')])
    xpath = event.xpath
    tag = common.tagname_from_xpath(xpath)
    event_types = [t for t in event.events]
    # All event types and tag combination is in non_meaningful
    event_types_not_meaningful = [(tag, t) in non_meaningful for t in event_types]
    if all(event_types_not_meaningful):
        return False
    if xpath not in xpath_map:
        return False
    dimen = xpath_map[xpath].get('dimension', {'width': 0, 'height': 0})
    if dimen['width'] <= 1 or dimen['height'] <= 1:
        return False
    return interaction_branch_meaningful([xpath], elements_map=xpath_map)


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
        if not branch_meaningful(branch, left_xpaths_map):
            continue
        branch = _remove_unnecessary_elements(branch, left_xpaths_map, right_xpaths_map)
        branch = _remove_wrapping_elements(branch, left_xpaths_map)
        new_left_unique.append(branch) if len(branch) > 0 else None
    
    new_right_unique = []
    for branch in right_unique:
        if not branch_meaningful(branch, right_xpaths_map):
            continue
        branch = _remove_unnecessary_elements(branch, right_xpaths_map, left_xpaths_map)
        branch = _remove_wrapping_elements(branch, right_xpaths_map)
        new_right_unique.append(branch) if len(branch) > 0 else None

    return new_left_unique, new_right_unique