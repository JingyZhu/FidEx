from bs4 import BeautifulSoup, Tag
from urllib.parse import unquote
import re

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
        'width': element['dimension']['width'],
        'height': element['dimension']['height']
    }

class LayoutElement:
    def __init__(self, element: dict):
        self.xpath = element['xpath']
        self.text = element['text']
        self.tag = self._get_tag()
        self.dynamic = self._is_dynamic()
        self.in_carousel = self._in_carousel()
        self.features = self.features()
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
    
    def _in_carousel(self):
        """Heuristic to decide if the element is part of the carousel"""
        assert(hasattr(self, 'tag'))
        if self.tag == '#text':
            return False
        class_keywords = ['carousel', 'slider', 'slideshow', 'gallery', 'slick', 'swiper']
        for c in class_keywords:
            if c in self.text.lower():
                return True
        

    def features(self):
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
            if not e1.in_carousel or not e2.in_carousel:
                return False
            if e1.xpath == e2.xpath:
                return True
            # Dimension has the same top, width and height
            if e1.dimension.get('top', 1) == e2.dimension.get('top', 2) and dimension_eq(e1.dimension, e2.dimension):
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
    
    def list_tree(self) -> "list(LayoutElement)":
        tree_list = [self]
        for child in self.children:
            tree_list += child.list_tree()
        return tree_list

    def __hash__(self) -> int:
        return hash((self.xpath, self.text, self.dimension.get('width', 0), self.dimension.get('height', 0)))

    def __repr__(self) -> str:
        return f"{self.xpath} {self.text} {self.dimension}"


def build_layout_tree(elements: "list[elements]") -> "Optional[LayoutElement]":
    if len(elements) == 0:
        return
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
    return nodes[root_e['xpath']]
        