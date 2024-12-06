from bs4 import BeautifulSoup, Tag
from urllib.parse import unquote
from collections import namedtuple
import re, os
import json, time
import html
import functools

from fidex.fidelity_check import js_writes
from fidex.utils import url_utils, common

CSS_ANIMATION_STYLES = [
    'clip-path',
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
    'opacity',
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
    style = html.unescape(style)
    style = re.sub(r';\s+', ';', style.strip(';'))
    new_style = []
    filter_keys = [re.compile(k) for k in filter_keys]
    pattern = r';(?=(?:[^\'"]|\'[^\']*\'|"[^"]*")*$)'
    for s in sorted(re.split(pattern, style)):
        # Replace all :\s+ with :
        s = re.sub(r':\s+', ':', s)
        to_filter = False
        s_split = s.split(':')
        for k in filter_keys:
            if k.match(s_split[0]):
                to_filter = True
                break
        if not to_filter:
            if len(s_split) > 1:
                s_split[1] = ' '.join(sorted(s_split[1].split()))
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
    @staticmethod
    def dummy_element():
        return LayoutElement({
            'depth': 0,
            'xpath': '/',
            'text': 'html',
            'extraAttr': {}
        })
    
    def __init__(self, element: dict):
        self.depth = element['depth']
        self.xpath = element['xpath']
        self.text = element['text']
        self.extraAttr = element.get('extraAttr', {})
        self.tag = self._get_tag()
        self.tagname = self.tag.name if isinstance(self.tag, Tag) else self.tag
        self.id = self._get_id()
        self.writes = []
        self.verbose_writes = []
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
        return url_utils.unescape_url(href)

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

    def _get_src(self) -> set:
        srcs = common.get_img_src(self.tag)
        if 'currentSrc' in self.extraAttr:
            srcs.add(url_utils.url_norm(self.extraAttr['currentSrc'], ignore_scheme=True, ignore_netloc=True, trim_www=True, trim_slash=True, archive=True))
        # TODO: Try only consider the directory part for random images orders
        srcs = set(['/'.join(s.split('/')[:-1] if s[-1]!='/' else s.split('/')[:-2]) for s in srcs])
        return srcs
    
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
    def features(self) -> list:
        """Collect tag name and other important attributes that matters to the rendering"""
        all_rules = [] # List of lambda func to get the attribute
        tag_rules = {
            'img': [lambda _: self._get_src()],
            'a': [
                # lambda a: a.attrs.get('class'), 
                lambda a: self._norm_href(a.attrs.get('href'))],
        }
        if isinstance(self.tag, str):
            return [self.tag]
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
        return features
    
    def __eq__(self, other):
        if self.tagname != other.tagname:
            return False
        
        def full_stack_eq(e1, e2):
            e1_elements = [e1] + e1.descendants()
            e2_elements = [e2] + e2.descendants()
            e1_write_stacks = [w for e in e1_elements for w in e.writes]
            e2_write_stacks = [w for e in e2_elements for w in e.writes]
            return len(e1_write_stacks) > 0 and js_writes.writes_stacks_match(e1_write_stacks, e2_write_stacks)

        def dimension_eq(e1, e2):
            if e1.tagname == 'img' and e2.tagname == 'img':
                return True
            d1, d2 = e1.dimension, e2.dimension
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
                return common.normal_text(e1.text) == common.normal_text(e2.text)
            elif e1.features[0].lower() == 'img' and e2.features[0].lower() == 'img':
                src_match = len(set(e1.features[1]).intersection(set(e2.features[1]))) > 0
                return src_match and tuple(e1.features[2:]) == tuple(e2.features[2:])
            else:
                return tuple(e1.features) == tuple(e2.features)
        
        def js_dynamism_self_eq(e1, e2):
            """
            If two elements have the same set of stack traces of writes
            """
            if len(e1.writes) + len(e2.writes) > 0:
                e1_related_writes, e2_related_writes = [], []
                if e1.parent:
                    e1_related_writes = [w for e in e1.parent.children for w in e.writes]
                else:
                    e1_related_writes = e1.writes
                if e2.parent:
                    e2_related_writes = [w for e in e2.parent.children for w in e.writes]
                else:
                    e2_related_writes = e2.writes
                # e1_related_writes = e1.writes
                # e2_related_writes = e2.writes

                e1_subset = set(e1_related_writes).issubset(set(e2_related_writes))
                e2_subset = set(e2_related_writes).issubset(set(e1_related_writes))
                if e1_subset and e2_subset:
                    return True
                
                e1_related_writes_plain = [w.plain_form for w in e1_related_writes]
                e2_related_writes_plain = [w.plain_form for w in e2_related_writes]
                e1_subset = set(e1_related_writes_plain).issubset(set(e2_related_writes_plain))
                e2_subset = set(e2_related_writes_plain).issubset(set(e1_related_writes_plain))
                if e1_subset and e2_subset:
                    return True
            return False

        def css_dynamism_self_eq(e1, e2):
            """Check if css dynamic elements can be matched"""
            if e1.tagname != e2.tagname:
                return False
            # SVG cases
            if (e1.parent and e1.parent.tagname == 'svg') and (e2.parent and e2.parent.tagname == 'svg'):
                if e1.tagname == '#text' and e2.tagname == '#text':
                    return True
            # svg related, depend on parent dimension could change from time to time
            if e1.tagname in ['path', 'g'] and e1.text == e2.text:
                return True
            if e1.extraAttr.get('animation') and e2.extraAttr.get('animation'):
                return True
            if not isinstance(e1.tag, Tag) or not isinstance(e2.tag, Tag):
                return False
            if 'style' in e1.tag.attrs and 'style' in e2.tag.attrs:
                s1 = _filter_style(e1.tag.attrs['style'], filter_keys=CSS_ANIMATION_STYLES)
                s2 = _filter_style(e2.tag.attrs['style'], filter_keys=CSS_ANIMATION_STYLES)
                if s1 == s2:
                    return True
            return False
        
        # # Full stack matching
        # # If matched, the whole branch will be considered as matched
        # # And descendants matches will be passed
        # if full_stack_eq(self, other):
        #     self.full_matched = True
        #     other.full_matched = True
        #     return True

        # Static matching
        if features_eq(self, other) and dimension_eq(self, other):
            return True
        # Dynamic element that changes itself 
        if js_dynamism_self_eq(self, other):
            # Exclude body dynamic match tagging
            if self.tagname != 'body':
                self.dynamic_matched = True
            if other.tagname != 'body':
                other.dynamic_matched = True
            return True
        # Dynamism caused by css
        if css_dynamism_self_eq(self, other):
            return True
        return False

    def visible(self, check_viewport=False, check_visibility=False, historical=False):
        """
        Args:
            check_viewport (bool): If True, check if the element is in the viewport
            historical (bool): If True, check if the element is visible historically
        """
        if self.tag == '#text':
            return self.parent.visible(check_viewport=check_viewport, historical=historical, check_visibility=check_visibility)
        has_dimension = self.dimension.get('width', 0) > 0 and self.dimension.get('height', 0) > 0
        if check_viewport:
            in_viewport = self.dimension.get('left', 0) + self.dimension.get('width', 0) > 0 and self.dimension.get('top', 0) + self.dimension.get('height', 0) > 0
        if check_visibility:
            visibility = self.extraAttr.get('visibility', 'visible')
            has_visibility = visibility == 'visible'
        if historical:
            has_dimension = has_dimension or len(self.writes) > 0
        return has_dimension and (not check_viewport or in_viewport) and (not check_visibility or has_visibility)

    def ancestors(self) -> "list[LayoutElement]":
        ancestors = []
        cur_node = self
        while cur_node.parent:
            ancestors.append(cur_node.parent)
            cur_node = cur_node.parent
        return ancestors
    
    def descendants(self) -> "list[LayoutElement]":
        descendants = []
        for child in self.children:
            descendants.append(child)
            descendants += child.descendants()
        return descendants
    
    def next_siblings(self) -> "List[LayoutElement]":
        if not self.parent:
            return None
        idx = 0
        while idx < len(self.parent.children):
            if self.parent.children[idx] is self:
                break
            idx += 1
        return self.parent.children[idx+1:]
    
    def prev_siblings(self) -> "List[LayoutElement]":
        if not self.parent:
            return None
        idx = 0
        while idx < len(self.parent.children):
            if self.parent.children[idx] is self:
                break
            idx += 1
        return self.parent.children[:idx]

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
    
    def add_writes(self, writes: "list[js_writes.JSWrite]", effective=False):
        self.verbose_writes += writes
        if effective:
            self.writes += writes
    
    def list_tree(self, layout=True, layout_order=False) -> "list(LayoutElement)":
        """List all elements in the tree
        Args:
            layout (bool): If True, return the layout tree. If False, return the DOM tree
            layout_order (bool): If True, return the three in layout order (top to bottom, left to right)
        """
        tree_list = []
        if layout:
            if self.visible(historical=True):
                tree_list.append(self)
            elif self.tag == '#text' and self.parent.visible():
                tree_list.append(self)
        else:
            tree_list.append(self)
        if layout_order:
            children = sorted(self.children, key=lambda x: (x.dimension.get('top', 0), x.dimension.get('left', 0), x.text)) 
        else:
            children = self.children
        for child in children:
            tree_list += child.list_tree(layout=layout)
        return tree_list

    def __hash__(self) -> int:
        return hash((self.xpath, self.text, self.dimension.get('width', 0), self.dimension.get('height', 0)))

    def __repr__(self) -> str:
        return f"{self.xpath} {self.text} {self.dimension}"


def build_layout_tree(elements: "list[element]", writes: list, writeStacks: list, include_verbose_writes=False) -> "Optional[LayoutElement]":
    """
    Args:
        elements (list): List of elements
        writes (list): List of writes
        writeStacks (list): List of write stacks
        include_verbose_writes (bool): If True, include verbose writes
    """
    stack_map = {w['wid']: w for w in writeStacks}
    if len(elements) == 0:
        dummy = LayoutElement.dummy_element()
        dummy.all_writes = []
        dummy.all_nodes = {dummy.xpath: dummy}
        return dummy
    root_e = elements[0]
    nodes = {root_e['xpath']: LayoutElement(root_e)} # {xpath: LayoutElement}

    def get_parent_xpath(xpath, elements):
        for e in reversed(elements):
            if xpath.startswith(e['xpath']):
                return e['xpath']
        assert False, 'No parent found'

    for i in range(1, len(elements)):
        element = elements[i]
        xpath = element['xpath']
        layout_element = LayoutElement(element)
        nodes[xpath] = layout_element
        parent_xpath = get_parent_xpath(xpath, elements[:i])
        parent_node = nodes[parent_xpath]
        parent_node.add_child(layout_element)
    
    # Given addEventlistener could be registered by webrecord ruffle, some wid in writes may not in stack_map
    writes_obj = [js_writes.JSWrite(w, stack_map[w['wid']]['stackInfo'], nodes) \
                  for w in writes if w['wid'] in stack_map]
    for w in writes_obj:
        if not w.effective and not include_verbose_writes:
            continue
        for xpath in w.associated_xpaths:
            if xpath in nodes:
                nodes[xpath].add_writes([w], effective=w.effective)
    root_node = nodes[root_e['xpath']]
    root_node.all_writes = [w for w in writes_obj if w.currentDS.get('width', 0) > 0 and w.currentDS.get('height', 0) > 0]
    root_node.all_nodes = nodes
    return root_node

def _lcs_diff(left_seq, right_seq):
    """Impl 1 based on lcs"""
    # Apply longest common subsequence to get the diff of live and archive htmls
    lcs_lengths = [[0 for _ in range(len(right_seq) + 1)] for _ in range(len(left_seq) + 1)]
    for i, left_elem in enumerate(left_seq, 1):
        for j, right_elem in enumerate(right_seq, 1):
            # xpath = '/html[1]/body[1]/div[7]/div[1]/svg[1]'
            # if left_elem.xpath == xpath and right_elem.xpath == xpath:
            #     print('here\n', left_elem == right_elem)
            if left_elem == right_elem:
                lcs_lengths[i][j] = lcs_lengths[i-1][j-1] + 1
                left_elem.tag_new_writes(right_elem)
            else:
                lcs_lengths[i][j] = max(lcs_lengths[i-1][j], lcs_lengths[i][j-1])
    # Backtrack to get the lcs sequence
    lcs_left, lcs_right = [], []
    i, j = len(left_seq), len(right_seq)
    while i > 0 and j > 0:
        if left_seq[i-1] == right_seq[j-1]:
            lcs_left.append(left_seq[i-1].xpath)
            lcs_right.append(right_seq[j-1].xpath)
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
    lcs_left.reverse()
    # print(json.dumps(lcs_left, indent=2))
    lcs_right.reverse()
    # print(json.dumps(lcs_right, indent=2))
    left_diff = [e for e in left_seq if e.xpath not in set(lcs_left)]
    right_diff = [e for e in right_seq if e.xpath not in set(lcs_right)]
    return left_diff, right_diff


def _myers_diff(left_seq, right_seq):
    """
    Impl 2: Myers diff algorithm
    myers algorithm borrowed from https://gist.github.com/adamnew123456/37923cf53f51d6b9af32a539cdfa7cc4
    """
    # See frontier in myers_diff
    Frontier = namedtuple('Frontier', ['x', 'left_diff', 'right_diff', 'left_common', 'right_common'])

    # This marks the farthest-right point along each diagonal in the edit
    # graph, along with the history that got it there
    frontier = {1: Frontier(0, [], [], [], [])}

    L = len(left_seq)
    R = len(right_seq)
    for d in range(0, L + R + 1):
        for k in range(-d, d + 1, 2):
            # This determines whether our next search point will be going down
            # in the edit graph, or to the right.
            #
            # The intuition for this is that we should go down if we're on the
            # left edge (k == -d) to make sure that the left edge is fully
            # explored.
            #
            # If we aren't on the top (k != d), then only go down if going down
            # would take us to territory that hasn't sufficiently been explored
            # yet.
            go_down = (k == -d or 
                    (k != d and frontier[k - 1].x < frontier[k + 1].x))

            # Figure out the starting point of this iteration. The diagonal
            # offsets come from the geometry of the edit grid - if you're going
            # down, your diagonal is lower, and if you're going right, your
            # diagonal is higher.
            if go_down:
                x, left_diff, right_diff, left_common, right_common = frontier[k + 1]
            else:
                x, left_diff, right_diff, left_common, right_common = frontier[k - 1]
                x += 1

            # We want to avoid modifying the old history, since some other step
            # may decide to use it.
            left_diff, right_diff= left_diff.copy(), right_diff.copy()
            left_common, right_common = left_common.copy(), right_common.copy()
            y = x - k

            # We start at the invalid point (0, 0) - we should only start building
            # up history when we move off of it.
            if 1 <= y <= R and go_down:
                right_diff.append((right_seq[y-1]))
            elif 1 <= x <= L:
                left_diff.append(left_seq[x-1])

            # Chew up as many diagonal moves as we can - these correspond to common lines,
            # and they're considered "free" by the algorithm because we want to maximize
            # the number of these in the output.
            while x < L and y < R and left_seq[x] == right_seq[y]:
                left_e, right_e = left_seq[x], right_seq[y]
                left_common.append(left_e)
                right_common.append(right_e)
                x += 1
                y += 1
                if getattr(left_e, 'full_matched', False):
                    while x < L and left_seq[x].xpath.startswith(left_e.xpath):
                        left_common.append(left_seq[x])
                        x += 1
                if getattr(right_e, 'full_matched', False):
                    while y < R and right_seq[y].xpath.startswith(right_e.xpath):
                        right_common.append(right_seq[y])
                        y += 1

            if x >= L and y >= R:
                # If we're here, then we've traversed through the bottom-left corner,
                # and are done.
                # print(json.dumps([e.xpath for e in left_common], indent=2))
                # print(json.dumps([e.xpath for e in right_common], indent=2))
                return left_diff, right_diff
            else:
                frontier[k] = Frontier(x, left_diff, right_diff, left_common, right_common)

    assert False, 'Could not find edit script'

def diff_layout_tree(left_layout: "LayoutElement", right_layout: "LayoutElement", layout_order=False) -> "tuple[list[LayoutElement], list[LayoutElement]]":
    """
    Compute the diff between left_tree and right_tree by computing the longest common subsequence
        
    Returns:
        (List[LayoutElement], List[LayoutElement]): List of elements that are different, for live and archive respectively.
    """
    left_write_stacks = set([w.serialized_stack for w in left_layout.all_writes])
    right_write_stacks = set([w.serialized_stack for w in right_layout.all_writes])
    
    # print(f'writes {len(left_layout.all_writes)=} {len(right_layout.all_writes)=}')
    # print(f'sets {len(left_write_stacks)=} {len(right_write_stacks)=}')
    # left_write_map = {w.serialized_stack: w.wid for w in reversed(left_layout.all_writes)}
    # right_write_map = {w.serialized_stack: w.wid for w in reversed(right_layout.all_writes)}
    # left_unique = [{'wid': idd, 'stack': stack} for stack, idd in left_write_map.items() if stack not in right_write_stacks]
    # right_unique = [{'wid': idd, 'stack': stack} for stack, idd in right_write_map.items() if stack not in left_write_stacks]
    # print(f'unique {len(left_unique)=} {len(right_unique)=}')
    # json.dump(left_unique, open('left_unique.json', 'w'), indent=2)
    # json.dump(right_unique, open('right_unique.json', 'w'), indent=2)
    
    if left_write_stacks == right_write_stacks:
        # print("Same whole write stacks", left_layout.all_writes, right_layout.all_writes)
        return [], []

    left_layout_list = left_layout.list_tree(layout_order=layout_order)
    right_layout_list = right_layout.list_tree(layout_order=layout_order)
    # print(json.dumps([e.xpath for e in left_layout_list], indent=2))
    # print(json.dumps([e.xpath for e in right_layout_list], indent=2))

    # left_diff, right_diff = _lcs_diff(left_layout_list, right_layout_list)
    left_diff, right_diff = _myers_diff(left_layout_list, right_layout_list)
    left_diff = [e for e in left_diff if post_diff_element(e)]
    right_diff = [e for e in right_diff if post_diff_element(e)]
    return left_diff, right_diff

def diff_layout_tree_xpath(left_layout: "LayoutElement", right_layout: "LayoutElement", layout_order=False) -> "tuple[list[str], list[str]]":
    """
    Wrapper for diff_layout_tree that returns the xpaths only
    
    Returns:
        (List[str], List[str]): List of xpaths that are different, for live and archive respectively.
    """
    left_diff, right_diff = diff_layout_tree(left_layout, right_layout, layout_order=layout_order)
    return [e.xpath for e in left_diff], [e.xpath for e in right_diff]
    

def post_diff_element(element: "LayoutElement") -> bool:
    """
    Post process the diff result to filter out the elements that are wrongly added.
    """
    if not element.visible(check_viewport=True, check_visibility=True):
        return False
    # * Check if the diff could be caused by dynamic ancestors
    # * Since some writes may only change parents, but all descendants are affected
    ancestors = element.ancestors()
    for a in ancestors:
        if getattr(a, 'dynamic_matched', False):
            return False
    return True