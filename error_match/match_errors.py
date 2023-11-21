from warcio.archiveiterator import ArchiveIterator
import re, os, pickle
import json
import requests

ARCHIVE_HOST = 'http://pistons.eecs.umich.edu:8080/eot-1k'


def _filter_archive(archive_url):
    pattern = r'https?://[^/]+/[^/]+/(\d+)[^/]+/(https?://.+)'
    match = re.search(pattern, archive_url)
    if match:
        return match.group(2)
    else:
        return None

def _get_ts(archive_url):
    pattern = r'https?://[^/]+/[^/]+/(\d+)[^/]+/(https?://.+)'
    match = re.search(pattern, archive_url)
    if match:
        return match.group(1)
    else:
        return None

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

def read_warc(path, rewritten=False):
    """
    Parse a warc file into responses
    
    rewritten: whether the responses are already rewritten by the pywb
    """
    responses = []
    with open(path, 'rb') as stream:
        for record in ArchiveIterator(stream):
            if (record.rec_type == 'response'):
                url = record.rec_headers.get_header('WARC-Target-URI')
                ts = record.rec_headers.get_header('WARC-Date')
                ts = ts.replace('T', ' ').replace('Z', '').replace('-', '').replace(':', '').replace(' ', '')
                ts = ts.split('.')[0]
                headers = dict(record.http_headers.headers)
                if not rewritten or _is_rewritable(headers):
                    body = record.content_stream().read()
                else:
                    r = requests.get(f'{ARCHIVE_HOST}/{ts}/{url}')
                    headers = r.headers
                    body = r.content
                responses.append({
                    'url': url,
                    'ts': ts,
                    'headers': headers,
                    'body': body
                })
    return {
        'warc': path,
        'responses': responses
    }

def extract_response_from_warc(warc_path, url):
    """Extract certain response of a URL from a warc file"""
    with open(warc_path, 'rb') as stream:
        for record in ArchiveIterator(stream):
            if (record.rec_type == 'response'):
                if record.rec_headers.get_header('WARC-Target-URI') == url:
                    ts = record.rec_headers.get_header('WARC-Date')
                    ts = ts.replace('T', ' ').replace('Z', '').replace('-', '').replace(':', '').replace(' ', '')
                    headers = dict(record.http_headers.headers)
                    body = record.content_stream().read()
                    return {
                        'url': url,
                        'ts': ts.split('.')[0],
                        'headers': headers,
                        'body': body
                    }
    return None

def static_line_match(line, warc_responses):
    """Match a line of code to all responses from warc_responses. Done statically"""
    line_re = re.escape(line)
    target_urls = []
    for warc_response in warc_responses:
        for response in warc_response['responses']:
            if not _is_rewritable(response['headers']):
                continue
            matches = []
            try:
                body = response['body'].decode()
            except:
                # print('Failed decoding body for url', response['url'])
                continue
            for m in re.finditer(line_re, body):
                matches.append((m.start(), m.end()))
            if len(matches) > 0:
                target_urls.append({
                    'warc': warc_response['warc'],
                    'url': response['url'],
                    'matches': matches
                })
    return target_urls

def dynamic_exception_match(exception, write, warc_responses):
    """
    Match an exception to all exceptions in a write. Done dynamically.

    Args:
        write: directory name under writes/
    """
    if not os.path.exists(f'../writes/{write}/archive_exception_failfetch.json'):
        return []
    exception_re = re.escape(exception)
    write = json.load(open(f'../writes/{write}/archive_exception_failfetch.json', 'r'))
    warc = warc_responses['warc'].split('/')[1]
    responses = warc_responses['responses']
    resources_map = {response['url']: response for response in responses}
    target_urls = []
    for interaction in write:
        for exception_obj in interaction['exceptions']:
            try:
                if not re.search(exception_re, exception_obj['description']):
                    continue
                resource = exception_obj['scriptURL']
                ts = _get_ts(resource)
                resource = _filter_archive(resource)
                line, column = exception_obj['line'], exception_obj['column']
                body = resources_map[resource]['body'].decode()
                ts = resources_map[resource]['ts']
                # line = body.split('\n')[line - 1]
                # start_line = line[column - 1:]
                # # Slice till any ends deliminter of an actual js line
                # deliminter = [';', '{', '}']
                # for d in deliminter:
                #     if d in start_line:
                #         start_line = start_line[:start_line.index(d)]
                target_urls.append({
                    'warc': warc,
                    'url': resource,
                    # 'line': start_line,
                    'exception': exception_obj['description']
                })
            except Exception as e:
                print(f"Exception:", str(e), f"on {exception_obj['scriptURL']} from {warc}")
    return target_urls


# collections = ['synchronization', 'eot-1k']
collections = ['eot-1k']

def static_match():
    """Currently: An entry function"""
    # line = 'a.rc.contentWindow.postMessage' # theftaz.azag.gov
    # line = 'Re.lk.value.call(n.Av,"iframe")' # slideshare.net
    # line = 'var today = new Date()' # sewp.nasa.gov
    # line = 'n.domain!==document.domain&&(n.domain=document.domain)' # globe.gov
    # line = '!document.documentElement.isSameNode(documentElement)' # eta.lbl.gov
    line = "$(document).trigger('addthis.init', addthis)" # test

    matched_resources = []
    i = 0
    for collection in collections:
        files = os.listdir(f'../warcs/{collection}')
        for file in files:
            prefix = os.path.splitext(file)[0]
            i += 1
            if i % 100 == 0:
                print(i)
            path = f'../warcs/{collection}/{file}'
            warc_responses = read_warc(path)
            matched_resources += static_line_match(line, [warc_responses])
            json.dump(matched_resources, open('matched_resources.json', 'w+'), indent=2)


def dynamic_match():
    """Currently, an entry function"""
    # exception = 'TypeError: Illegal invocation' # slideshare.net
    # exception = 'SyntaxError: Unexpected eval or arguments in strict mode' # house.louisiana.gov
    exception = "A browsing context is required to set a domain" # globe.gov

    matched_exceptions = []
    i = 0
    for collection in collections:
        files = os.listdir(f'../warc/{collection}')
        for file in files:
            prefix = os.path.splitext(file)[0]
            i += 1
            if i % 100 == 0:
                print(i)
            path = f'../warcs/{collection}/{file}'
            warc_responses = read_warc(path)
            matched_exceptions += dynamic_exception_match(exception, f'{collection}/{prefix}', warc_responses)
            json.dump(matched_exceptions, open('matched_exceptions.json', 'w+'), indent=2)


def grep_loc(scriptURL, line_no, column_no):
    try:
        script = requests.get(scriptURL).text
    except:
        return None
    lines = script.split('\n')
    line = lines[line_no]
    before_loc = line[:column_no]
    after_loc = line[column_no:]
    deliminter = [';', '{', '}']
    for d in deliminter:
        if d in after_loc:
            after_loc = after_loc[:after_loc.index(d)]
        if d in before_loc:
            before_loc = before_loc[before_loc.rindex(d) + 1:]
    return (before_loc + after_loc).strip()

def dynamic_static_multimatch(all_warcs_pkl=None):
    """
    Grep all exceptions from writes, do two things:
    1. Collect line of code from the exception (top stack), match it statically across all warcs
    2. Match exceptions dynamically
    """
    from check_exceptions import get_all_exceptions, categorize_exceptions
    all_exceptions = get_all_exceptions('eot-1k')
    exception_map = categorize_exceptions(all_exceptions)
    all_warcs = []
    i = 0
    if all_warcs_pkl and os.path.exists(all_warcs_pkl):
        print("Reading all_warcs.pkl")
        all_warcs = pickle.load(open('all_warcs.pkl', 'rb+'))
    else:
        for collection in collections:
            files = os.listdir(f'../warcs/{collection}')
            for file in files:
                i += 1
                if i % 100 == 0:
                    print("Reading warcs", i)
                path = f'../warcs/{collection}/{file}'
                warc_responses = read_warc(path, rewritten=True)
                all_warcs.append(warc_responses)
        pickle.dump(all_warcs, open('all_warcs.pkl', 'wb+'))
    loc_info = []
    for i, exception_obj in enumerate(all_exceptions):
        print("Matching exception", i)
        directory = exception_obj['directory']
        exceptions = exception_obj['exceptions']
        for exception in exceptions:
            if 'scriptURL' not in exception:
                continue
            if 'SyntaxError:' in exception['description']:
                continue
            scriptURL = exception['scriptURL']
            line = exception['line']
            column = exception['column']
            loc = grep_loc(scriptURL, line, column)
            if loc is None:
                continue
            # TODO: Temp removing too general loc
            if loc in ['throw e', 'throw error']:
                continue
            # TODO End of temp

            line_matches = static_line_match(loc, all_warcs)
            # TODO: This is currently just used as patching static matching with 0 matches
            if len(line_matches) == 0:
                line_matches.append({
                    'warc': exception_obj['directory'],
                    'url': scriptURL,
                    'matches': []
                })
            # TODO End of patch
            
            first_line = exception['description'].split('\n')[0]
            loc_info.append({
                'directory': directory,
                'exception': exception['description'],
                'loc': loc,
                'num_static_matches': len(line_matches),
                'num_dynamic_matches': len(set(w[0] for w in exception_map[first_line])),
                'static_matches': line_matches,
                'dynamic_matches': exception_map[first_line]
            })
        json.dump(loc_info, open('loc_info_new.json', 'w+'), indent=2)


if __name__ == '__main__':
    dynamic_static_multimatch(all_warcs_pkl='all_warcs.pkl')
    # static_match()
