"""
Check if the archive preserves all the fidelity from liveweb page
"""
import difflib
import json
import re, os

def _collect_dimension(element):
    if 'dimension' not in element or element['dimension'] is None:
        return {}
    return {
        'width': element['dimension']['width'],
        'height': element['dimension']['height']
    }

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


def verify(live_element, archive_element):
    """
    Args:
        live_element (dict): element's path and dimension info in the liveweb page
        archive_element (dict): element's path and dimension info in the archive page
    
    Returns:
        fidelity_preserved (bool): Whether the fidelity is preserved
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

def _xpaths_2_text(xpaths, xpath_map):
    """Transform xpaths to their text"""
    text = ''
    for xpath in xpaths:
        element = xpath_map[xpath]
        text += '  ' * element['depth'] + element['text'] + '\n'
    return text

def diff(live_element, archive_element):
    live_xpaths_map = {e['xpath']: e for e in live_element}
    archive_xpaths_map = {e['xpath']: e for e in archive_element}
    live_xpaths = [e['xpath'] for e in live_element]
    archive_xpaths = [e['xpath'] for e in archive_element]
    diffs = list(difflib.ndiff(live_xpaths, archive_xpaths))
    live_unique, archive_unique = [], []
    for diff in diffs:
        # Liveweb unique
        if diff[:2] == '- ':
            live_unique.append(diff[2:])
        # Archive unique
        if diff[:2] == '+ ':
            archive_unique.append(diff[2:])
    live_unique = _merge_xpaths(live_unique)
    live_unique_html = [_xpaths_2_text(xpaths, live_xpaths_map) for xpaths in live_unique]
    archive_unique = _merge_xpaths(archive_unique)
    archive_unique_html = [_xpaths_2_text(xpaths, archive_xpaths_map) for xpaths in archive_unique]
    return live_unique_html, archive_unique_html