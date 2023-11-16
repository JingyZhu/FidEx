from warcio.archiveiterator import ArchiveIterator
import re, os
import json

def read_warc(path):
    responses = []
    with open(path, 'rb') as stream:
        for record in ArchiveIterator(stream):
            if (record.rec_type == 'response'):
                url = record.rec_headers.get_header('WARC-Target-URI')
                headers = dict(record.http_headers.headers)
                body = record.content_stream().read()
                responses.append({
                    'url': url,
                    'headers': headers,
                    'body': body
                })
    return {
        'warc': path,
        'responses': responses
    }


def match_line(line, warc_responses):
    def _is_js(headers):
        content_type = None
        for header in headers:
            if header.lower() == 'content-type':
                content_type = headers[header]
                break
        return content_type and 'javascript' in content_type.lower()
    line_re = re.escape(line)
    target_urls = []
    for response in warc_responses['responses']:
        if not _is_js(response['headers']):
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
                'warc': warc_responses['warc'],
                'url': response['url'],
                'matches': matches
            })
    return target_urls


# line = 'a.rc.contentWindow.postMessage' # theftaz.azag.gov
# line = 'Re.lk.value.call(n.Av,"iframe")' # slideshare.net
# line = 'var today = new Date()' # sewp.nasa.gov
# line = 'n.domain!==document.domain&&(n.domain=document.domain)' # globe.gov
line = '!document.documentElement.isSameNode(documentElement)' # eta.lbl.gov

matched_resources = []
collections = ['synchronization', 'eot-1k']
i = 0
for collection in collections:
    files = os.listdir(collection)
    for file in files:
        i += 1
        if i % 100 == 0:
            print(i)
        path = f'{collection}/{file}'
        warc_responses = read_warc(path)
        matched_resources += match_line(line, warc_responses)
        json.dump(matched_resources, open('matched_resources.json', 'w+'), indent=2)