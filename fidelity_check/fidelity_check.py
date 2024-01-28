"""
Check if the archive preserves all the fidelity from liveweb page
"""
import difflib
import json
import re, os
from bs4 import BeautifulSoup

def _collect_dimension(element):
    if 'dimension' not in element or element['dimension'] is None:
        return {}
    return {
        'width': element['dimension']['width'],
        'height': element['dimension']['height']
    }


class htmlElement:
    def __init__(self, element: dict):
        self.xpath = element['xpath']
        self.text = element['text']
        self.features = self.features()
        self.dimension = _collect_dimension(element)
    
    def features(self):
        """Collect tag name and other important attributes that matters to the rendering"""
        all_rules = ['style']
        tag_rules = {
            'img': ['src']
        }
        tag = BeautifulSoup(self.text, 'html.parser').find()
        if tag is None:
            tagname = self.xpath.split('/')[-1].split('[')[0]
            return (tagname)
        tagname = tag.name
        features = [tagname]
        rule = tag_rules.get(tagname, []) + all_rules
        for r in rule:
            if r in tag.attrs:
                features.append(tag.attrs[r])
        return tuple(features)

    def __eq__(self, other):
        if self.text == other.text:
            return True
            return self.dimension == other.dimension
        if self.features == other.features and self.dimension == other.dimension:
            return True
        return False

    def __hash__(self) -> int:
        return hash((self.xpath, self.text, self.dimension.get('width', 0), self.dimension.get('height', 0)))

    def __repr__(self) -> str:
        return f"{self.xpath} {self.text} {self.dimension}"


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

def _diff_html(live_html: "List[element]", archive_html: "List[element]"):
    """
    Compute the diff between live_html and archive_html by computing the longest common subsequence
    
    Returns:
        (List[str], List[str]): List of xpaths that are different, for live and archive respectively.
    """
    live_html = [htmlElement(e) for e in live_html]
    archive_html = [htmlElement(e) for e in archive_html]
    # Apply longest common subsequence to get the diff of live and archive htmls
    lcs_lengths = [[0 for _ in range(len(archive_html) + 1)] for _ in range(len(live_html) + 1)]
    for i, live_elem in enumerate(live_html, 1):
        for j, archive_elem in enumerate(archive_html, 1):
            if live_elem == archive_elem:
                lcs_lengths[i][j] = lcs_lengths[i-1][j-1] + 1
            else:
                lcs_lengths[i][j] = max(lcs_lengths[i-1][j], lcs_lengths[i][j-1])
    # Backtrack to get the diff
    lcs_live, lcs_archive = [], []
    i, j = len(live_html), len(archive_html)
    while i > 0 and j > 0:
        if live_html[i-1] == archive_html[j-1]:
            lcs_live.append(live_html[i-1].xpath)
            lcs_archive.append(archive_html[j-1].xpath)
            i -= 1
            j -= 1
        # This means live_html[i] is not in the lcs
        elif lcs_lengths[i-1][j] > lcs_lengths[i][j-1]:
            i -= 1
        # Archive_html[j] is not in the lcs
        elif lcs_lengths[i-1][j] < lcs_lengths[i][j-1]:
            j -= 1
        # This case can be either both live_html[i] and archive_html[j] are not in the lcs (e.g. abcx and abcy) 
        # or both can be in (e.g. abca and abac)
        else:
            j -= 1
    lcs_live.reverse()
    lcs_archive.reverse()
    live_diff = [e.xpath for e in live_html if e.xpath not in set(lcs_live)]
    archive_diff = [e.xpath for e in archive_html if e.xpath not in set(lcs_archive)]
    return live_diff, archive_diff


def verify(live_element: dict, archive_element: dict) -> bool:
    """
    Args:
        live_element (dict): element's path and dimension info in the liveweb page
        archive_element (dict): element's path and dimension info in the archive page
    
    Returns:
        fidelity_preserved: Whether the fidelity is preserved
    """
    live_xpaths = [e['xpath'] for e in live_element]
    archive_xpaths = [e['xpath'] for e in archive_element]
    if live_xpaths != archive_xpaths:
        print("html not same")
        print(json.dumps([d for d in
            list(difflib.ndiff(live_xpaths, archive_xpaths)) if d[0] in ['-', '+']], indent=2))
        return False
    # * Currently for each element, only check the width and height
    if len(live_element) != len(archive_element):
        print("Element number is different")
        return False
    for le, ae in zip(live_element, archive_element):
        live_dimension = _collect_dimension(le)
        archive_dimension = _collect_dimension(ae)
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

def diff(live_element, archive_element, returnHTML=False) -> (list, list):
    live_xpaths_map = {e['xpath']: e for e in live_element}
    archive_xpaths_map = {e['xpath']: e for e in archive_element}
    live_unique, archive_unique = _diff_html(live_element, archive_element)
    
    live_unique = _merge_xpaths(live_unique)
    print("live_unique number", [len(xpaths) for xpaths in live_unique])
    if returnHTML:
        live_unique = [xpaths_2_text(xpaths, live_xpaths_map) for xpaths in live_unique]
    
    archive_unique = _merge_xpaths(archive_unique)
    print("archive_unique number", [len(xpaths) for xpaths in archive_unique])
    if returnHTML:
        archive_unique = [xpaths_2_text(xpaths, archive_xpaths_map) for xpaths in archive_unique]
    return live_unique, archive_unique

def associate_writes(element: dict, writes: list) -> list:
    """
    Associate JS writes with the input element
    Add:    1. Parent node append self
    Update: 1. Same node set attribute
            2. Parent node set HTML
    Remove: 1. Same node remove child

    Args:
        element (dict): element's path and dimension info in the liveweb page
        writes (list): list of writes
    
    Returns:
        list: list of writes that are associated with the element
    """
    # TODO: Potential next step
    # In override.js, collect info for beforeIsConnected and afterIsConnected for args
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
        'set:innerHTML': None
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
        return write['xpath'] == element['xpath']
    
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
                if 'xpath' in a and a['xpath'] == element['xpath']:
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