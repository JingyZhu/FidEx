#!/home/jingyz/Research/fidelity/env/bin/python3
from subprocess import call

metadata = 'sync_metadata.json'
default_archive = 'sync'

call(['rm', metadata])
call(f"rm downloads/*", shell=True)
# call(f"rm -rf writes/*", shell=True)

call(['rm', '-rf', f'../collections/collections/{default_archive}'])
call(['wb-manager', 'init', default_archive], cwd='../collections')