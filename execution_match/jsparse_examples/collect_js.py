import requests
import json
from urllib.parse import urlsplit

js_list = json.load(open('list.json', 'r'))
for obj in js_list:
    url = obj['url']
    archive = obj['archive']
    filename = urlsplit(url).path.split('/')[-1]
    filename = filename.split('.')[0]
    filename = url.split('/')[-1]
    r1 = requests.get(url)
    r2 = requests.get(archive)
    with open(f'{filename}_url.js', 'w+') as f:
        f.write(r1.text)
    with open(f'{filename}_archive.js', 'w+') as f:
        f.write(r2.text)