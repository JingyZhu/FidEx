from subprocess import call
import os

WB_PATH = f'{os.path.expanduser("~")}/fidelity-files'
PYWB_PATH = '/x/jingyz/pywb/env/bin/activate'

def init_test():
    call(f"rm -rf writes", shell=True)
    call(f"rm -rf determinism", shell=True)
    call(f"rm -rf {WB_PATH}/writes/test", shell=True)
    call(f"rm -rf {WB_PATH}/warcs/test", shell=True)

    call(['rm', '-rf', f'{WB_PATH}/collections/test'])
    call(f'/bin/bash -c "source {PYWB_PATH} && wb-manager init test"', cwd=WB_PATH, shell=True)