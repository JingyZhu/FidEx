import socket
import re
import os
from diff_match_patch import diff_match_patch

from fidex.utils import url_utils

def get_hostname():
    return socket.gethostname()

def stage_nolater(s1, s2):
    """Check if s1 is earlier or equal to s2"""
    order = ['onload', 'extraInteraction']
    o1 = order.index(s1) if s1 in order else -1
    o2 = order.index(s2) if s2 in order else -1
    if o1 == -1:
        o1 = int(s1.replace('interaction_', '')) + 2
    if o2 == -1:
        o2 = int(s2.replace('interaction_', '')) + 2
    return o1 <= o2

def stage_later(s1, s2):
    """Check if s1 is strictly later than s2"""
    return not stage_nolater(s1, s2)

def tagname_from_xpath(xpath):
    """Get the tag name from the xpath"""
    return xpath.split('/')[-1].split('[')[0]

def normal_text(text):
    return text.strip()

def get_img_src(img_tag) -> set:
    src_terms = [re.compile('^src$'), re.compile('.*lazy.+src'), re.compile('.*data.+src'), re.compile('.*data.+lazy')]
    srcs = []
    img = img_tag
    for attr in img.attrs:
        for term in src_terms:
            if term.match(attr):
                src = img.attrs[attr]
                srcs.append(src)
    srcs = set([url_utils.url_norm(src, ignore_scheme=True, ignore_netloc=True, trim_slash=True, archive=True) for src in srcs])
    return srcs

def finished_record_replaY(write_dir, check_prefix):
    return os.path.exists(f"{write_dir}/{check_prefix}_done")

def merge_strings(original: str, new_strs: list) -> str:
    """Merge the strings in news from the original string"""
    # Initialize diff_match_patch
    dmp = diff_match_patch()
    
    # Start with the original string as the base for merging
    merged_string = original
    
    # Loop through each modified version in the list
    for new_str in new_strs:
        # Compute the diff and create a patch based on the original
        diff = dmp.diff_main(original, new_str)
        patches = dmp.patch_make(original, diff)
        
        # Apply the patch to the current merged string
        merged_string, _ = dmp.patch_apply(patches, merged_string)
    
    return merged_string