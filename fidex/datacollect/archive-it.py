import requests
import time
from bs4 import BeautifulSoup
import json

requests_header = {'user-agent': "Our-Project-Page/1.0 (web.eecs.umich.edu/~jingyz/web-research/) Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36"}


def archiveit_index(url, org_id='all', param_dict={}, wait=True, proxies={}):
    """
    Get the archive-it index of certain url by querying the CDX
    wait: wait unitl not getting block
    total_link: Returned url are in full(wayback) links

    return: ( [(timestamp, url, stauts_code)], SUCCESS/EMPTY/ERROR_MSG)
    """
    wayback_home = f'https://wayback.archive-it.org/{org_id}/timemap/cdx'
    params = {
        # 'output': 'json',
        'url': url,
    }   
    params.update(param_dict)
    count = 0
    r = None

    def _parse_response(text, status=None, mime=None):
        text = text.strip()
        fields = ['urlkey', 'timestamp', 'original', 'mimetype', 'status code', 'digest', 'login1', 'login2', 'length', 'offset', 'fullname']
        results = []
        seen_url = set()
        for line in text.split('\n'):
            line = line.split(' ')
            attributes = {fields[i]: line[i] for i in range(len(fields))}
            if status and status not in attributes['status code']:
                continue
            if mime:
                satisfy = False
                if isinstance(mime, str):
                    satisfy = mime in attributes['mimetype']
                else:
                    for m in mime:
                        if m in attributes['mimetype']:
                            satisfy = True
                            break
                if not satisfy:
                    continue
            if attributes['urlkey'] not in seen_url:
                seen_url.add(attributes['urlkey'])
                results.append(attributes)
        return results

    while True:
        try:
            query_str = "&".join(f"{k}={v}" for k, v in params.items())
            r = requests.get(wayback_home, headers=requests_header, params=query_str, proxies=proxies, timeout=120)
            # print(r.url)
            r = _parse_response(r.text, status='2', mime='html')
            time.sleep(0.5)
            break
        except requests.exceptions.ConnectionError as e:
            print(str(e))
            time.sleep(20)
            continue
        except Exception as e:
            error_msg = str(e).split('\n')[0]
            if not r or not wait or r.status_code not in [429, 445, 501, 503]:
                return [], str(e)
            if count > 3:
                return [], str(e)
            count += 1
            time.sleep(10)
    
    r = [(i['timestamp'], i['original'], i['status code']) for i in r]
    if len(r) != 0:
        return r, "Success",
    else:
        return [], "Empty"


def get_all_sites():
    """
    Get all sites listed on carta
    """
    base_url = "https://archive-it.org/home/carta/"
    page_num = 1
    query_param = {'page': page_num, 'show': 'Sites'}
    sites = []
    newsite = True
    while newsite:
        print(page_num)
        query_param['page'] = page_num
        try:
            search_page = requests.get(base_url, params=query_param, timeout=20)
        except:
            break
        soup = BeautifulSoup(search_page.text, 'lxml')
        search = soup.find('div', {'id': 'search-results'})
        newsite = False
        for h3 in search.find_all('h3', {'class': 'url'}):
            if 'URL:' in h3.text:
                newsite = True
                sites.append(h3.find('a')['title'])
        page_num += 1
        time.sleep(1)
    json.dump(sites, open('data/carta_sites.json', 'w+'), indent=2)

# get_all_sites()

def all_sites_archives():
    sites = json.load(open('data/carta_sites.json', 'r'))
    org_id = 'org-2229'
    result = []
    for i, site in enumerate(sites):
        site_url = f'{site}*'
        param_dict = {
            # 'output': 'json',
            'url': site_url,
            # 'filter': ['mimetype:text/html', 'statuscode:200'],
            # 'collapse': 'urlkey',
            'limit': 100000
        }
        archives, _ = archiveit_index(site, org_id, param_dict)
        print(i, site, len(archives))
        result.append({
            'site': site,
            'archives': [a[1] for a in archives]
        })
        json.dump(result, open('data/carta_archives.json', 'w+'), indent=2)
    json.dump(result, open('data/carta_archives.json', 'w+'), indent=2)

all_sites_archives()