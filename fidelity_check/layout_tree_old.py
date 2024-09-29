from bs4 import BeautifulSoup, Tag
from urllib.parse import unquote
import re
import random
import functools
import json

from fidex.utils import url_utils

def _sibling_xpath(path1, path2, max_diff=1, only_last=False):
    """Check if path1 and path2 are siblings (same length, differ by one element)
    
    Arguments:
        max_diff (int): Max number of different elements for path to be considered as "sibling" (default 1)
        only_last (bool): Only compare the last element of the path (default False)
    """
    max_diff = 1 if only_last else max_diff
    path1 = path1.split('/')
    path2 = path2.split('/')
    if len(path1) != len(path2):
        return False
    diff = 0
    for i, (p1, p2) in enumerate(zip(path1, path2)):
        e1 = p1.split('[')[0]
        e2 = p2.split('[')[0]
        if e1 != e2:
            return False
        if only_last and i < len(path1) - 1:
            continue
        if p1 != p2:
            diff += 1
    return diff <= max_diff

def _collect_dimension(element):
    if 'dimension' not in element or element['dimension'] is None:
        return {}
    return {
        'width': round(element['dimension']['width'], 1),
        'height': round(element['dimension']['height'], 1),
        'top': round(element['dimension']['top'], 1),
        'left': round(element['dimension']['left'], 1)
    }

def associate_writes(element_xpath: str, writes: list) -> list:
    """
    Associate JS writes with the input element
    Add:    1. Parent node append self
    Update: 1. Same node set attribute
            2. Parent node set HTML
    Remove: 1. Same node remove child

    Args:
        element (str): element's xpath
        writes (list): list of writes
    
    Returns:
        list: list of writes that are associated with the element
    """
    # TODO: Potential next step
    # In node_writes_override.js, collect info for beforeIsConnected and afterIsConnected for args
    # When collect info, also collect all args' children and there corresponding xpath
    # When matching, even if the target element is the child of arg, we can find it out, and whether is has any visible effect.                                                

    # Or we can diff the writes between live and archive first (how? may be using target and stackTrace first?)
    # Then only associate writes within the diff parts.

    # Operations that affect element if element is the target
    target_operation = {
        'replaceChild': None,
        'removeChild': None,
        'set:nodeValue': None,
        'set:textContent': None,
        'set:src': None,
        'set:style': None,
        'removeAttribute': None,
        'removeAttributeNode': None,
        'removeAttributeNS': None,
        'replaceChildren': None,
        'replaceWith': None,
        'setAttribute': None,
        'setAttributeNode': None,
        'setAttributeNodeNS': None,
        'setAttributeNS': None,
        'setHTML': None,
        'set:className': None,
        'set:id': None,
        'set:innerHTML': None,

        'classList.add': None,
        'classList.remove': None,
        'classList.toggle': None,
    }
    # {operation name: [related arguments idx]}
    # If empty list, all arguments are related
    args_operation = {
        'appendChild': [0],
        'insertBefore': [0],
        'replaceChild': [0],
        'removeChild': [0],
        'after': [],
        'append': [],
        'before': [],
        'remove': [],
        'replaceChildren': [],
        'replaceWith': [],
    }
    # Set HTML operation. Since there is no xpath, need to check separately
    set_html_operation = {
        'setHTML': None,
        'set:innerHTML': None
    }
    
    def target_operation_check(write):
        return write['xpath'] == element_xpath
    
    def args_operation_check(write, idxs):
        args = []
        if len(idxs) == 0:
            args = write['arg']
        else:
            for idx in idxs:
                args.append(write['arg'][idx])
        for arg in args:
            arg = [arg] if not isinstance(arg, list) else arg
            for a in arg:
                if a['html'] in ['#comment']:
                    continue
                if 'xpath' in a and element_xpath.startswith(a['xpath']):
                    return True
        return False

    # TODO: Implement check for set_html_operation
    
    related_writes, related_seen = [], set()
    for write in writes:
        method = write['method']
        if method in target_operation and target_operation_check(write):
            if write['wid'] not in related_seen:
                related_writes.append(write)
                related_seen.add(write['wid'])
    for write in writes:
        method = write['method']
        if method in args_operation and args_operation_check(write, args_operation[method]):
            if write['wid'] not in related_seen:
                related_writes.append(write)
                related_seen.add(write['wid'])
    return related_writes



class LayoutElement:
    def __init__(self, element: dict, writes: list, stale=False):
        """
        stale: If the layout element could be stale. This is used for dynamic comparison
        """
        self.stale = stale
        self.depth = element['depth']
        self.xpath = element['xpath']
        self.text = element['text']
        self.writes = associate_writes(self.xpath, writes)
        self.tag = self._get_tag()
        self.tagname = self.tag.name if isinstance(self.tag, Tag) else self.tag
        self.id = self._get_id()
        self.dynamic = self._is_dynamic()
        self.dimension = _collect_dimension(element)

        self.children = []
        self.parent = None
    
    def _norm_href(self, href):
        if href is None:
            return None
        href = href.strip()
        non_target_prefix = ['javascript:', 'mailto:', 'tel:', 'sms:']
        for c in non_target_prefix:
            if href.startswith(c):
                return None
        # If the href is puny encoded or percent encoded, decode it
        i = 0
        while i < 3 and '%' in href:
            href = unquote(href)
            i += 1
        if href.endswith('#'):
            href = href[:-1]
        return href

    def _norm_rgb(color) -> str:
        if color[0] == '#':
            color = color.lstrip('#')

            # Convert hex to RGB
            rgb = tuple(int(color[i:i+2], 16) for i in (0, 2, 4))
            return f'rgb({rgb})'
        if color.startswith('rgb'):
            rgb = re.findall(r'\d+', color)
            return f'rgb({rgb[:3]})'
        return color

    def _get_src(self, img):
        src_terms = [re.compile('^src$'), re.compile('.*lazy.+src')]
        src = None
        for attr in img.attrs:
            for term in src_terms:
                if term.match(attr):
                    src = img.attrs[attr]
                    break
            if src is not None:
                break
        if src is None:
            return None
        src = url_utils.url_norm(src, ignore_scheme=True, trim_www=True, trim_slash=True)
        return src
    
    def _get_tag(self):
        """Extract tag name from the text"""
        tag = BeautifulSoup(self.text, 'html.parser').find()
        if tag is None:
            tagname = self.xpath.split('/')[-1].split('[')[0]
            return tagname
        return tag

    def _get_id(self):
        """Extract id from the tag"""
        if isinstance(self.tag, Tag):
            return self.tag.attrs.get('id', None)
        return
    
    def _is_dynamic(self):
        assert(hasattr(self, 'tag'))
        if not isinstance(self.tag, Tag):
            return False
        style = self.tag.attrs.get('style', '')
        for s in style.split(';'):
            if 'transform' in s:
                return True
        spin_keywords = ['spin']
        for k in spin_keywords:
            if k in self.text.lower():
                return True
        return False
    
    @functools.cached_property
    def is_carousel(self) -> bool:
        """Heuristic to decide if the element is part of the carousel
        2 candidate methods:
        a. Check if all chilren has the same structure (and if has dimension, same dimension and same top/left)
        b. If singleton in the children, check if the singleton has keywords
        """
        assert(hasattr(self, 'tag'))
        if self.tag == '#text':
            return False
        # * Method a
        if len(self.children) <= 1:
            return False
        tops, lefts = set(), set()
        children_types, dimensions = set(), set()
        for c in self.children:
            if c.tag == '#text':
                return False
            children_types.add(c.tag.name)
            # More flex dimension detection
            dimension = (round(c.dimension.get('width', 0), -1), round(c.dimension.get('height', 0), -1))
            if dimension[0] + dimension[1] > 0:
                dimensions.add(dimension)
                tops.add(c.dimension.get('top', random.randint(0, 100)))
                lefts.add(c.dimension.get('left', random.randint(0, 100)))
            if len(tops) > 1 and len(lefts) > 1:
                return False
            if len(children_types) > 1:
                return False
        
        def has_keywords():
            class_keywords = ['carousel', 'slider', 'slideshow', 'gallery', 'slick', 'swiper']
            for c in class_keywords:
                if c in self.text.lower():
                    return True
            return False
        if len(dimensions) != 1 and not has_keywords():
            return False
        child_writes = sum([len(c.writes) for c in self.children])
        if self.xpath == '/html[1]/body[1]/div[1]/div[2]/article[1]/aside[1]/div[1]/div[1]/div[1]':
            print("Carousel", dimensions, has_keywords(), child_writes)
        return child_writes > 0

        # * Method b
        

    @functools.cached_property
    def features(self) -> tuple:
        """Collect tag name and other important attributes that matters to the rendering"""
        all_rules = [] # List of lambda func to get the attribute
        tag_rules = {
            'img': [lambda img: self._get_src(img)],
            'a': [
                # lambda a: a.attrs.get('class'), 
                lambda a: self._norm_href(a.attrs.get('href'))],
        }
        if isinstance(self.tag, str):
            return tuple([self.tag])
        tag = self.tag
        tagname = tag.name
        features = [tagname]
        rules = tag_rules.get(tagname, []) + all_rules
        for r in rules:
            tag_r = r(tag)
            if tag_r is not None:
                features.append(tag_r)
        # * Add style and throw away certain attr
        def _filter_style(style):
            # Strip the ending ;
            style = re.sub(r';\s+', ';', style.strip(';'))
            new_style = []
            filter_keys = [
                            'animation',
                            'background',
                            'background-image',
                            'background-color',
                            'opacity', 
                            'inset',
                            'width', 
                            'height',
                            'left',
                            'top',
                            'bottom',
                            'right',
                            'display', 
                            'transform',
                            'transition'
                        ]
            for s in style.split(';'):
                # Replace all :\s+ with :
                s = re.sub(r':\s+', ':', s)
                to_filter = False
                s_split = s.split(':')
                for k in filter_keys:
                    if k in s_split[0]:
                        to_filter = True
                        break
                if not to_filter:
                    new_style.append(': '.join(s_split))
            return ';'.join(new_style)
        if 'style' in tag.attrs and tag.attrs['style'] != '':
            style = _filter_style(tag.attrs['style'])
            if len(style) > 0:
                features.append(style)
        return tuple(features)
    
    def __eq__(self, other):
        if self.tagname != other.tagname:
            return False

        def dimension_eq(d1, d2):
            d1w, d1h = d1.get('width', 1), d1.get('height', 1)
            d2w, d2h = d2.get('width', 1), d2.get('height', 1)
            wdiff = abs(d1w - d2w) / max(d1w, d2w)
            hdiff = abs(d1h - d2h) / max(d1h, d2h)
            return wdiff <= 0.05 and hdiff <= 0.05

        def features_eq(e1, e2):
            if e1.features[0].lower() == 'a' and e2.features[0].lower() == 'a':
                identical = True
                if len(e1.features) != len(e2.features):
                    return False
                for f1, f2 in zip(e1.features, e2.features):
                    if type(f1) != str or type(f2) != str:
                        identical = identical and f1 == f2
                        continue
                    identical = identical and (f1.endswith(f2) or f2.endswith(f1))
                return identical
            elif e1.features[0].lower() == '#text' and e2.features[0].lower() == '#text':
                return e1.text == e2.text
            else:
                return e1.features == e2.features

        def dynamic_eq(e1, e2):
            if not e1.dynamic or not e2.dynamic:
                return False
            if e1.xpath == e2.xpath:
                return True
            # remove style in text
            e1_text = re.sub(r'style=".*?"', '', e1.text)
            e2_text = re.sub(r'style=".*?"', '', e2.text)
            if e1_text == e2_text:
                return True
            return False
        
        def carousel_eq(e1, e2):
            if not (e1.stale or e1.is_carousel) or not (e2.stale or e2.is_carousel):
                return False
            if e1.xpath == e2.xpath:
                e1.is_carousel = e2.is_carousel = True
                return True
            # Dimension has the same top/left width and height
            e1_text = re.sub(r'style=".*?"', '', e1.text)
            e2_text = re.sub(r'style=".*?"', '', e2.text)
            if dimension_eq(e1.dimension, e2.dimension) and e1_text == e2_text:
                e1.is_carousel = e2.is_carousel = True
                return True
            return False
        
        if carousel_eq(self, other):
            return True
        elif dynamic_eq(self, other):
            return True
        else:
            return features_eq(self, other) and dimension_eq(self.dimension, other.dimension)

    def add_child(self, child):
        self.children.append(child)
        child.parent = self
    
    def list_tree(self, layout=True, layout_order=False) -> "list(LayoutElement)":
        """List all elements in the tree
        Args:
            layout (bool): If True, return the layout tree. If False, return the DOM tree
            layout_order (bool): If True, return the three in layout order (top to bottom, left to right)
        """
        def _visible(element):
            has_dimension = element.dimension.get('width', 0) > 1 and element.dimension.get('height', 0) > 1
            in_viewport = element.dimension.get('left', 0) + element.dimension.get('width', 0) > 0 and element.dimension.get('top', 0) + element.dimension.get('height', 0) > 0
            return has_dimension and in_viewport
        tree_list = []
        if layout:
            if _visible(self):
                tree_list.append(self)
            elif self.tag == '#text' and _visible(self.parent):
                tree_list.append(self)
        else:
            tree_list.append(self)
        if self.is_carousel:
            return tree_list
        children = sorted(self.children, key=lambda x: (x.dimension.get('top', 0)+x.dimension.get('height', 0), x.dimension.get('left', 0)+x.dimension.get('width', 0))) if layout_order else self.children
        for child in children:
            tree_list += child.list_tree(layout=layout)
        return tree_list

    def __hash__(self) -> int:
        return hash((self.xpath, self.text, self.dimension.get('width', 0), self.dimension.get('height', 0)))

    def __repr__(self) -> str:
        return f"{self.xpath} {self.text} {self.dimension}"


def build_layout_tree(elements: "list[element]", writes: list, stale=False) -> "Optional[LayoutElement]":
    """
    Args:
        stale: If the tree being built is stale than the other. Used for counting writes.
    """
    if len(elements) == 0:
        return
    root_e = elements[0]
    nodes = {root_e['xpath']: LayoutElement(root_e, writes, stale)} # {xpath: LayoutElement}

    def get_parent_xpath(xpath, elements):
        for e in reversed(elements):
            if xpath.startswith(e['xpath']):
                return e['xpath']
        assert False, 'No parent found'

    for i in range(1, len(elements)):
        element = elements[i]
        xpath = element['xpath']
        layout_element = LayoutElement(element, writes, stale)
        nodes[xpath] = layout_element
        parent_xpath = get_parent_xpath(xpath, elements[:i])
        parent_node = nodes[parent_xpath]
        parent_node.add_child(layout_element)
    return nodes[root_e['xpath']]

def diff_layout_tree(left_layout: "LayoutElement", right_layout: "LayoutElement") -> "tuple[list[str], list[str]]":
    """
    Compute the diff between left_tree and right_tree by computing the longest common subsequence
    
    Returns:
        (List[str], List[str]): List of xpaths that are different, for live and archive respectively.
    """
    def _diff(layout_order):
        left_layout_list = left_layout.list_tree(layout_order=layout_order)
        right_layout_list = right_layout.list_tree(layout_order=layout_order)
        # import json
        # print(json.dumps([e.xpath for e in left_layout_list], indent=2))
        # print(json.dumps([e.xpath for e in right_layout_list], indent=2))

        # Apply longest common subsequence to get the diff of live and archive htmls
        lcs_lengths = [[0 for _ in range(len(right_layout_list) + 1)] for _ in range(len(left_layout_list) + 1)]
        for i, left_elem in enumerate(left_layout_list, 1):
            for j, right_elem in enumerate(right_layout_list, 1):
                if left_elem == right_elem:
                    lcs_lengths[i][j] = lcs_lengths[i-1][j-1] + 1
                else:
                    lcs_lengths[i][j] = max(lcs_lengths[i-1][j], lcs_lengths[i][j-1])
        # Backtrack to get the lcs sequence
        lcs_live, lcs_archive = [], []
        i, j = len(left_layout_list), len(right_layout_list)
        while i > 0 and j > 0:
            if left_layout_list[i-1] == right_layout_list[j-1]:
                lcs_live.append(left_layout_list[i-1].xpath)
                lcs_archive.append(right_layout_list[j-1].xpath)
                i -= 1
                j -= 1
            # This means left_layout_list[i] is not in the lcs
            # e.g. aaab and aaba
            # last four lcs 2 3
            #               2 3
            elif lcs_lengths[i-1][j] > lcs_lengths[i][j-1]:
                i -= 1
            # right_layout_list[j] is not in the lcs
            elif lcs_lengths[i-1][j] < lcs_lengths[i][j-1]:
                j -= 1
            # This case can be either both left_layout_list[i] and right_layout_list[j] are not in the lcs (e.g. abcx and abcy) 
            # or both can be in (e.g. abca and abac)
            else:
                j -= 1
        lcs_live.reverse()
        # print(json.dumps(lcs_live, indent=2))
        lcs_archive.reverse()
        # print(json.dumps(lcs_archive, indent=2))
        left_diff = [e.xpath for e in left_layout_list if e.xpath not in set(lcs_live)]
        right_diff = [e.xpath for e in right_layout_list if e.xpath not in set(lcs_archive)]
        return left_diff, right_diff

    left_diff, right_diff = _diff(layout_order=False)
    if len(left_diff) == 0 or len(right_diff) == 0:
        return left_diff, right_diff
    left_diff_order, right_diff_order = _diff(layout_order=True)
    return (left_diff, right_diff) if len(left_diff) + len(right_diff) < len(left_diff_order) + len(right_diff_order) else (left_diff_order, right_diff_order)
    


def post_process_diff(unique: list, layout: "LayoutElement") -> "list[str]":
    """
    Post process the diff result to filter out the elements that are wrongly added.
    """
    if len(unique) == 0:
        return []
    new_unique = []
    layout_map = {e.xpath: e for e in layout.list_tree()}
    for u in unique:
        if u in layout_map:
            new_unique.append(u)
    return new_unique
    