import os
from subprocess import call
import json

writes = 'writes'
metadata = 'sync_metadata.json'

downloads = 'downloads'

directory_path = '../results_sync_v1/carta'

os.makedirs(directory_path, exist_ok=True)
call(['cp', '-rf', writes, f'{directory_path}/writes'])
call(['cp', '-rf', metadata, f'{directory_path}/metadata.json'])
call(['cp', '-rf', downloads, f'{directory_path}/downloads'])
# call(['cp', '-rf', valid_ff, f'{directory_path}/valid_failfetch.json'])
# call(['cp', '-rf', imgs, f'{directory_path}/img'])

# for d in directories:
#     call(['mv', f'{directory_path}/pageinfo/{d}/index.html', f'{directory_path}/pageinfo/{d}/html.html'])