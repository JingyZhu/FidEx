"""
Check if the archive preserves all the fidelity from liveweb page
"""
import difflib
import json

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
        if line not in element:
            xpaths.append(line)
        else:
            xpath = element[line]['xpath']
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
    for element in live_element:
        if element not in archive_element:
            return False
        live_dimension = _collect_dimension(live_element[element])
        archive_dimension = _collect_dimension(archive_element[element])
        if live_dimension != archive_dimension:
            print("Dimension is different", element)
            return False
    return True