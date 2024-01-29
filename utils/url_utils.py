import re

def filter_archive(archive_url):
    pattern = r'https?://[^/]+/[^/]+/(\d+)[^/]+/(https?://.+)'
    match = re.search(pattern, archive_url)
    if match:
        return match.group(2)
    else:
        return None

def get_ts(archive_url):
    pattern = r'https?://[^/]+/[^/]+/(\d+)[^/]+/(https?://.+)'
    match = re.search(pattern, archive_url)
    if match:
        return match.group(1)
    else:
        return None