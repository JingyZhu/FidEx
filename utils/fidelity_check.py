"""
Check if the archive preserves all the fidelity from liveweb page
"""
import difflib
import json
import re

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
        idx = re.search(r'\d+:', line)
        idx = idx.group()[:-1] if idx else None
        if idx is None:
            continue
        xpath = element[int(idx)]['xpath']
        xpaths.append(xpath)
    return xpaths


def verify(live_html, live_element, archive_html, archive_element):
    """
    Args:
        live_html (str): html of the liveweb page
        live_element (dict): element's path and dimension info in the liveweb page
        archive_html (str): html of the archive page
        archive_element (dict): element's path and dimension info in the archive page
    """
    live_xpaths = _html_2_xpath(live_html, live_element)
    archive_xpaths = _html_2_xpath(archive_html, archive_element)
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