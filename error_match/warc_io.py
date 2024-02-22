from warcio.archiveiterator import ArchiveIterator
from urllib.parse import urlsplit

import json
import os, sys, re
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils import url_utils

ARCHIVE_HOST = 'http://pistons.eecs.umich.edu:8080/eot-1k'

def _is_rewritable(headers):
    content_type = None
    for header in headers:
        if header.lower() == 'content-type':
            content_type = headers[header]
            break
    if content_type is None:
        return False
    rewritable_types = ['text/html', 'text/css', 'text/javascript', 'application/javascript', 'application/x-javascript']
    for rewritable_type in rewritable_types:
        if rewritable_type in content_type:
            return True
    return False

def executable(url, headers):
    if headers:
        content_type = None
        for header in headers:
            if header.lower() == 'content-type':
                content_type = headers[header]
                break
        if content_type is None:
            return False
        executable_types = ['javascript']
        for executable_type in executable_types:
            if executable_type in content_type:
                return True
    else:
        path = urlsplit(url).path
        if path.endswith('.js'):
            return True
    return False

def read_warc(file, executable_only=True):
    """Parse a warc file into responses
    
    Args:
        executable_only: return only executable content
    
    Returns: {warc_path, responses:[{'url', 'ts', 'headers', 'body'}]}
    """
    responses = []
    with open(file, 'rb') as stream:
        for record in ArchiveIterator(stream):
            if (record.rec_type == 'response'):
                url = record.rec_headers.get_header('WARC-Target-URI')
                ts = record.rec_headers.get_header('WARC-Date')
                ts = ts.replace('T', ' ').replace('Z', '').replace('-', '').replace(':', '').replace(' ', '')
                ts = ts.split('.')[0]
                content_type = record.rec_headers.get_header('Content-Type')
                headers = {'Content-Type':  content_type}
                if record.http_headers and record.http_headers.headers:
                    headers = dict(record.http_headers.headers)
                if executable_only and not executable(url, headers):
                    continue
                body = record.content_stream().read()
                responses.append({
                    'url': url,
                    'ts': ts,
                    'headers': headers,
                    'body': body
                })
    return {
        'warc': file,
        'responses': responses
    }

def response_2_warc(response_file, executable_only=True):
    """Parse a response into a warc record
    
    Args:
        response_file: response json file from responses/
        executable_only: return only executable content
    
    Returns: warc record
    """
    response = json.load(open(response_file, 'r'))
    responses = []
    for obj in response:
        if 'body' not in obj:
            continue
        url = url_utils.filter_archive(obj['url'])
        ts = url_utils.get_ts(obj['url'])
        if url is None or ts is None: # Probably wayback's internal resources
            continue
        ts = re.sub('\D', '', ts)
        headers = obj['headers']
        body = obj['body']
        if executable_only and not executable(url, headers):
            continue
        record = {
            'url': url,
            'ts': ts,
            'headers': headers,
            'body': body.encode()
        }
        responses.append(record)
    return {
        'warc': response_file,
        'responses': responses
    }