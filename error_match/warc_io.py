from warcio.archiveiterator import ArchiveIterator

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

def executable(headers):
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
    return False

def read_warc(file, executable_only=True):
    """Parse a warc file into responses
    
    Args:
        executable_only: return only executable content
    
    Returns: {warc_path, responses}
    """
    responses = []
    with open(file, 'rb') as stream:
        for record in ArchiveIterator(stream):
            if (record.rec_type == 'response'):
                url = record.rec_headers.get_header('WARC-Target-URI')
                ts = record.rec_headers.get_header('WARC-Date')
                ts = ts.replace('T', ' ').replace('Z', '').replace('-', '').replace(':', '').replace(' ', '')
                ts = ts.split('.')[0]
                headers = dict(record.http_headers.headers)
                if executable_only and not executable(headers):
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