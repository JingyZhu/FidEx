import re, os
from urllib.parse import urlsplit, parse_qsl, urlunsplit, urljoin, unquote, urlparse
from publicsuffixlist import PublicSuffixList
import hashlib
import requests
from bs4 import BeautifulSoup

HEADERS = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'}
ARCHIVE_PATTERN = r'(https?://[^/]+)/([^/]+)/([12]\d{9,})[^/\d]*/(((https?:)?//)?.+)'

def filter_archive(archive_url):
    match = re.search(ARCHIVE_PATTERN, archive_url)
    if match:
        url = match.group(4)
        if url.startswith('http'):
            return url
        if url.startswith('//'):
            return 'https:' + url
        else:
            return 'https://' + url
    else:
        return archive_url

def is_archive(url):
    return re.search(ARCHIVE_PATTERN, url) is not None

def replace_archive_host(url, new_host):
    if not is_archive(url):
        return url
    us = urlsplit(url)
    return urlunsplit(us._replace(netloc=new_host))

def replace_archive_collection(url, new_collection):
    if not is_archive(url):
        return url
    matches = re.search(ARCHIVE_PATTERN, url)
    if not matches:
        return url
    return f'{url[:matches.start(2)-1]}/{new_collection}/{url[matches.end(2)+1:]}'

def add_id(url):
    """Add id_ to archive URL to get original resource"""
    if not is_archive(url):
        return url
    arsp = archive_split(url)
    return f"{arsp['hostname']}/{arsp['collection']}/{arsp['ts']}id_/{arsp['url']}"

def url_match(url1, url2, archive=True, case=False):
    """
    Compare whether two urls are identical on filepath and query
    If archive is set to True, will first try to filter out archive's prefix

    case: whether token comparison is token sensitive
    """
    if archive:
        url1 = filter_archive(url1) if is_archive(url1) else url1
        url2 = filter_archive(url2) if is_archive(url2) else url2
    up1, up2 = urlsplit(url1), urlsplit(url2)
    netloc1, path1, query1 = up1.netloc.split(':')[0], up1.path, up1.query
    netloc2, path2, query2 = up2.netloc.split(':')[0], up2.path, up2.query
    if not case:
        netloc1, path1, query1 = netloc1.lower(), path1.lower(), query1.lower()
        netloc2, path2, query2 = netloc2.lower(), path2.lower(), query2.lower()
    netloc1, netloc2 = netloc1.split('.'), netloc2.split('.')
    if netloc1[0] == 'www': netloc1 = netloc1[1:]
    if netloc2[0] == 'www': netloc2 = netloc2[1:]
    if '.'.join(netloc1) != '.'.join(netloc2):
        return False
    if path1 == '': path1 = '/'
    if path2 == '': path2 = '/'
    if path1 != '/' and path1[-1] == '/': path1 = path1[:-1]
    if path2 != '/' and path2[-1] == '/': path2 = path2[:-1]
    dir1, file1 = os.path.split(path1)
    dir2, file2 = os.path.split(path2)
    if re.compile('^index').match(file1): path1 = dir1
    if re.compile('^index').match(file2): path2 = dir2
    if path1 != path2:
        return False
    if query1 == query2:
        return True
    qsl1, qsl2 = sorted(parse_qsl(query1), key=lambda kv: (kv[0], kv[1])), sorted(parse_qsl(query2), key=lambda kv: (kv[0], kv[1]))
    return len(qsl1) > 0 and qsl1 == qsl2

def get_ts(archive_url):
    match = re.search(ARCHIVE_PATTERN, archive_url)
    if match:
        return match.group(3)
    else:
        return None

def archive_split(archive_url):
    result = {
        'hostname': None,
        'collection': None,
        'ts': None,
        'url': None,
    }
    match = re.search(ARCHIVE_PATTERN, archive_url)
    if match:
        result['hostname'] = match.group(1)
        result['collection'] = match.group(2)
        result['ts'] = match.group(3)
        result['url'] = match.group(4)
    else:
        raise Exception(f"Invalid archive url: {archive_url}")
    return result

def unescape_url(url):
        # Decode the percent-encoded parts of the URL
    decoded_url = unquote(url)
    
    # Parse the URL into components
    parsed_url = urlparse(decoded_url)
    
    # Decode the domain name (punycode) if necessary
    try:
        netloc = parsed_url.netloc.encode("idna").decode("idna")  # Safely decode to Unicode
    except UnicodeError:
        netloc = parsed_url.netloc  # Use the original if no punycode present
    
    # Reconstruct the URL with the decoded domain
    unescaped_url = parsed_url._replace(netloc=netloc).geturl()
    return unescaped_url

def url_norm(url, case=False, ignore_scheme=False, ignore_netloc=False, \
             trim_www=False, trim_slash=False, sort_query=True, archive=False):
    """
    Perform URL normalization
    common: Eliminate port number, fragment
    ignore_scheme: Normalize between http and https
    trim_slash: For non homepage path ending with slash, trim if off
    trim_www: For hostname start with www, trim if off
    sort_query: Sort query by keys
    archive: If set to True, will check if the url is an archive url and filter out the prefix
    """
    if archive:
        url = filter_archive(url) if is_archive(url) else url
    if '%' in url:
        url = unquote(url)
    try:
        us = urlsplit(url)
    except: return url
    netloc, path, query = us.netloc, us.path, us.query
    netloc = netloc.split(':')[0]
    if ignore_scheme:
        us = us._replace(scheme='http')
    if trim_www and netloc.split('.')[0] == 'www':
        netloc = '.'.join(netloc.split('.')[1:])
    if ignore_netloc:
        netloc = ''
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

def request_live_url(url):
    r = requests.get(url, timeout=10, headers=HEADERS)
    if r.status_code >= 400:
        return url
    final_url = r.url
    soup = BeautifulSoup(r.text, 'html.parser')
    # Find http-equiv refresh
    refresh = soup.find('meta', attrs={'http-equiv': 'refresh'})
    if refresh:
        contents = refresh.get('content', '').split(';')
        for content in contents:
            content = content.strip()
            if content.startswith('url='):
                final_url = urljoin(url, content[4:])
    return final_url

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