#!/x/jingyz/pywb/env/bin/python3
"""
Used for pistons removing archives
"""
from subprocess import call

default_archive = 'eot-1k'

call(f"rm -rf warcs/{default_archive}/*", shell=True)
call(f"rm -rf writes/{default_archive}/*", shell=True)

call(['rm', '-rf', f'collections/{default_archive}'])
call(['wb-manager', 'init', default_archive])