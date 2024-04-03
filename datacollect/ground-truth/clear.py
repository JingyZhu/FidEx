#!/home/jingyz/Research/fidelity/env/bin/python3
from subprocess import call
import os

HOME = os.path.expanduser("~")

metadata = 'eot_gt_metadata'
default_archive = 'ground_truth'

call(f"rm {metadata}*.json", shell=True)
call(f"rm -rf writes/*", shell=True)
call(f"rm -rf {HOME}/fidelity-files/writes/{default_archive}", shell=True)
call(f"rm -rf {HOME}/fidelity-files/warcs/{default_archive}", shell=True)

call(['rm', '-rf', f'{HOME}/fidelity-files/collections/{default_archive}'])
call(['wb-manager', 'init', default_archive], cwd=f'{HOME}/fidelity-files/')