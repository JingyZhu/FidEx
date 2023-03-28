import os
from subprocess import call
import pandas as pd
import json

pageinfo = 'pageinfo'
metadata = 'carta_interact_metadata.json'

valid_ff = '../baseline/valid_failfetch.json'
imgs = '../baseline/img'
downloads = 'downloads'

directory_path = '../results_interact_v1/carta'

os.makedirs(directory_path, exist_ok=True)
call(['cp', '-rf', pageinfo, f'{directory_path}/pageinfo'])
call(['cp', '-rf', metadata, f'{directory_path}/metadata.json'])
call(['cp', '-rf', downloads, f'{directory_path}/downloads'])
# call(['cp', '-rf', valid_ff, f'{directory_path}/valid_failfetch.json'])
# call(['cp', '-rf', imgs, f'{directory_path}/img'])

metadata_obj = []
for url, value in json.load(open(metadata, 'r')).items():
    value['url'] = url
    metadata_obj.append(value)
df = pd.DataFrame(metadata_obj)
df.to_csv(f'{directory_path}/metadata.csv')

directories = os.listdir(f'{directory_path}/pageinfo')
# for d in directories:
#     call(['mv', f'{directory_path}/pageinfo/{d}/index.html', f'{directory_path}/pageinfo/{d}/html.html'])