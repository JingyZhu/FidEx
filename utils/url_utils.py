import re
from urllib.parse import urlsplit, parse_qsl, urlunsplit
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

def url_norm(url, case=False, ignore_scheme=False, trim_www=False,\
                trim_slash=False, sort_query=True):
    """
    Perform URL normalization
    common: Eliminate port number, fragment
    ignore_scheme: Normalize between http and https
    trim_slash: For non homepage path ending with slash, trim if off
    trim_www: For hostname start with www, trim if off
    sort_query: Sort query by keys
    """
    us = urlsplit(url)
    netloc, path, query = us.netloc, us.path, us.query
    netloc = netloc.split(':')[0]
    if ignore_scheme:
        us = us._replace(scheme='http')
    if trim_www and netloc.split('.')[0] == 'www':
        netloc = '.'.join(netloc.split('.')[1:])
    us = us._replace(netloc=netloc, fragment='')
    if not case:
        path, query = path.lower(), query.lower()
    if path == '': 
        us = us._replace(path='/')
    elif trim_slash and path[-1] == '/':
        us = us._replace(path=path[:-1])
    if query and sort_query:
        qsl = sorted(parse_qsl(query), key=lambda kv: (kv[0], kv[1]))
        if len(qsl):
            us = us._replace(query='&'.join([f'{kv[0]}={kv[1]}' for kv in qsl]))
    return urlunsplit(us)

def calc_hostname(url):
    """Given a URL, extract its hostname + 10 char hash to construct a unique id"""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
    return f"{urlsplit(url).netloc.split(':')[0]}_{url_hash}"