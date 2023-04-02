#!/home/jingyz/Research/fidelity/env/bin/python3
from subprocess import call

metadata = 'carta_metadata.json'
default_archive = 'carta'

call(['rm', metadata])
call(f"rm -rf pageinfo/*", shell=True)
call(f"rm downloads/*", shell=True)

call(['rm', '-rf', f'../collections/collections/{default_archive}'])
call(['wb-manager', 'init', default_archive], cwd='../collections')