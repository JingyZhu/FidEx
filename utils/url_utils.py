import re
from urllib.parse import urlsplit
from publicsuffixlist import PublicSuffixList
import hashlib

    
def filter_archive(archive_url):
    pattern = r'https?://[^/]+/[^/]+/(\d+)[^/]+/(https?://.+)'
    match = re.search(pattern, archive_url)
    if match:
        return match.group(2)
    else:
        return None

class HostExtractor:
    def __init__(self):
        self.psl = PublicSuffixList()
    
    def extract(self, url, wayback=False):
        """
        Wayback: Whether the url is got from wayback
        """
        if wayback:
            url = filter_archive(url)
        if 'http://' not in url and 'https://' not in url:
            url = 'http://' + url
        hostname = urlsplit(url).netloc.strip('.').split(':')[0]
        return self.psl.privatesuffix(hostname)

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

def calc_hostname(url):
    """Given a URL, extract its hostname + 10 char hash to construct a unique id"""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
    return f"{urlsplit(url).netloc.split(':')[0]}_{url_hash}"