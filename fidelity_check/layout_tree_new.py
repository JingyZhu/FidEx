from bs4 import BeautifulSoup, Tag
from urllib.parse import unquote
import re
import json, time
import functools

from fidex.fidelity_check import js_writes
from fidex.utils import url_utils

CSS_ANIMATION_STYLES = [
    'transform.*',
    'translate.*',
    'transition.*',
    'animation.*',
    'width', 
    'height',
    'left',
    'top',
    'bottom',
    'right',
]

FILTERED_STYLES = CSS_ANIMATION_STYLES + [
    'background',
    'background-image',
    'background-color',
    'opacity', 
    'inset',
    'display', 
]

def _filter_style(style, filter_keys=FILTERED_STYLES):
    """Add style and throw away certain attr"""
    # Strip the ending ;
    style = re.sub(r';\s+', ';', style.strip(';'))
    new_style = []
    filter_keys = [re.compile(k) for k in filter_keys]
    for s in style.split(';'):
        # Replace all :\s+ with :
        s = re.sub(r':\s+', ':', s)
        to_filter = False
        s_split = s.split(':')
        for k in filter_keys:
            if k.match(s_split[0]):
                to_filter = True
                break
        if not to_filter:
            new_style.append(': '.join(s_split))
    return ';'.join(new_style)


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

class LayoutElement:
    def __init__(self, element: dict, stale=False):
        """
        stale: If the layout element could be stale. This is used for dynamic comparison
        """
        self.stale = stale
        self.depth = element['depth']
        self.xpath = element['xpath']
        self.text = element['text']
        self.tag = self._get_tag()
        self.tagname = self.tag.name if isinstance(self.tag, Tag) else self.tag
        self.id = self._get_id()
        self.writes = []
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
            wdiff = abs(d1w - d2w) / max(d1w, d2w, 1)
            hdiff = abs(d1h - d2h) / max(d1h, d2h, 1)
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
        
        def js_dynamism_self_eq(e1, e2):
            """
            If one is stale and the other is not, and the stale one has subset of writes of the other. Return True
            """
            if len(e1.writes) + len(e2.writes) > 0 and e1.stale + e2.stale == 1:
                e1_subset = set(e1.writes).issubset(set(e2.writes))
                e2_subset = set(e2.writes).issubset(set(e1.writes))
                if e1_subset or e2_subset:
                    return True
            return False

        def css_dynamism_self_eq(e1, e2):
            """Check if css dynamic elements can be matched"""
            if not isinstance(e1.tag, Tag) or not isinstance(e2.tag, Tag):
                return False
            if 'style' in e1.tag.attrs and 'style' in e2.tag.attrs:
                s1 = _filter_style(e1.tag.attrs['style'], filter_keys=CSS_ANIMATION_STYLES)
                s2 = _filter_style(e2.tag.attrs['style'], filter_keys=CSS_ANIMATION_STYLES)
                if s1 == s2 and e1.tagname == e2.tagname:
                    return True
            return False
        
        # Static matching
        if features_eq(self, other) and dimension_eq(self.dimension, other.dimension):
            return True
        # Dynamic element that changes itself 
        if js_dynamism_self_eq(self, other): 
            return True
        # Dynamism caused by css
        if css_dynamism_self_eq(self, other):
            return True
        return False

    def visible(self, check_viewport=False):
        has_dimension = self.dimension.get('width', 0) > 1 and self.dimension.get('height', 0) > 1
        if check_viewport:
            in_viewport = self.dimension.get('left', 0) + self.dimension.get('width', 0) > 0 and self.dimension.get('top', 0) + self.dimension.get('height', 0) > 0
        return has_dimension and (not check_viewport or in_viewport)

    def tag_new_writes(self, other):
        """tag unique writes for both self and others"""
        if set(self.writes).issubset(set(other.writes)):
            other.new_writes = list(set(other.writes) - set(self.writes))
            self.new_writes = []
        elif set(other.writes).issubset(set(self.writes)):
            self.new_writes = list(set(self.writes) - set(other.writes))
            other.new_writes = []
    
    def made_by_new_writes(self):
        if not self.parent or not hasattr(self.parent, 'new_writes'):
            return False
        for w in self.parent.new_writes:
            if self.xpath in w.associated_xpaths:
                return True
        return False

    def add_child(self, child):
        self.children.append(child)
        child.parent = self
    
    def add_writes(self, writes: "list[js_writes.JSWrite]"):
        self.writes += writes
    
    def list_tree(self, layout=True, layout_order=False) -> "list(LayoutElement)":
        """List all elements in the tree
        Args:
            layout (bool): If True, return the layout tree. If False, return the DOM tree
            layout_order (bool): If True, return the three in layout order (top to bottom, left to right)
        """
        tree_list = []
        if layout:
            if self.visible():
                tree_list.append(self)
            elif self.tag == '#text' and self.parent.visible():
                tree_list.append(self)
        else:
            tree_list.append(self)
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
    nodes = {root_e['xpath']: LayoutElement(root_e, stale)} # {xpath: LayoutElement}

    def get_parent_xpath(xpath, elements):
        for e in reversed(elements):
            if xpath.startswith(e['xpath']):
                return e['xpath']
        assert False, 'No parent found'

    for i in range(1, len(elements)):
        element = elements[i]
        xpath = element['xpath']
        layout_element = LayoutElement(element, stale)
        nodes[xpath] = layout_element
        parent_xpath = get_parent_xpath(xpath, elements[:i])
        parent_node = nodes[parent_xpath]
        parent_node.add_child(layout_element)
    
    writes_obj = [js_writes.JSWrite(w) for w in writes if w['effective']]
    for w in writes_obj:
        for xpath in w.associated_xpaths:
            if xpath in nodes:
                nodes[xpath].add_writes([w])
    return nodes[root_e['xpath']]


def diff_layout_tree(left_layout: "LayoutElement", right_layout: "LayoutElement") -> "tuple[list[str], list[str]]":
    """
    Compute the diff between left_tree and right_tree by computing the longest common subsequence
    
    Returns:
        (List[str], List[str]): List of xpaths that are different, for live and archive respectively.
    """
    left_layout_list = left_layout.list_tree()
    right_layout_list = right_layout.list_tree()
    # print(json.dumps([e.xpath for e in left_layout_list], indent=2))
    # print(json.dumps([e.xpath for e in right_layout_list], indent=2))

    # Apply longest common subsequence to get the diff of live and archive htmls
    lcs_lengths = [[0 for _ in range(len(right_layout_list) + 1)] for _ in range(len(left_layout_list) + 1)]
    for i, left_elem in enumerate(left_layout_list, 1):
        for j, right_elem in enumerate(right_layout_list, 1):
            # if left_elem.xpath.startswith('/html[1]/body[1]/div[1]/div[2]/article[1]/aside[1]/div[1]/div[1]/div[4]/span[3]') \
            #     and right_elem.xpath.startswith('/html[1]/body[1]/div[1]/div[2]/article[1]/aside[1]/div[1]/div[1]/div[4]/span[3]'):
            #     print('here\n', left_elem.xpath, left_elem.writes, '\n', right_elem.xpath, right_elem.writes, '\n', left_elem == right_elem)
            if left_elem == right_elem:
                lcs_lengths[i][j] = lcs_lengths[i-1][j-1] + 1
                left_elem.tag_new_writes(right_elem)
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
    left_diff = [e for e in left_layout_list if e.xpath not in set(lcs_live) and e.visible(check_viewport=True) and not e.made_by_new_writes()]
    right_diff = [e for e in right_layout_list if e.xpath not in set(lcs_archive) and e.visible(check_viewport=True) and not e.made_by_new_writes()]
    left_diff = [e.xpath for e in left_diff]
    right_diff = [e.xpath for e in right_diff]
    return left_diff, right_diff
    

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
    