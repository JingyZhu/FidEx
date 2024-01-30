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

def archive_split(archive_url):
    pattern = r'(https?://[^/]+)/([^/]+)/(\d+)[^/]+/(https?://.+)'
    result = {
        'hostname': None,
        'collection': None,
        'ts': None,
        'url': None,
    }
    match = re.search(pattern, archive_url)
    if match:
        result['hostname'] = match.group(1)
        result['collection'] = match.group(2)
        result['ts'] = match.group(3)
        result['url'] = match.group(4)
    else:
        raise Exception(f"Invalid archive url: {archive_url}")
    return result