"""
Upload crawled warc files and screenshots to group servers
Remove the files after uploading
"""
import os
from subprocess import check_output, call, DEVNULL

# SERVER is from the .ssh/config file
SERVER = 'pistons'
ARCHIVEDIR = os.path.join(os.path.expanduser("~"), 'fidelity-files')
PYWBENV = 'source /x/jingyz/pywb/env/bin/activate'

def ssh_exec(cmd, check=True):
    if check:
        check_output(['ssh', SERVER, cmd])
    else:
        call(['ssh', SERVER, cmd], stdout=DEVNULL, stderr=DEVNULL)

def scp_copy(local_path, remote_path):
    check_output(['scp', '-r', local_path, f'{SERVER}:{remote_path}'])    

def upload_screenshot(screenshot_path, directory='default'):
    try:
        # Create directory if not exist on the remote server
        ssh_exec(f"mkdir -p {ARCHIVEDIR}/screenshots/{directory}")
        scp_copy(screenshot_path, f'{ARCHIVEDIR}/screenshots/{directory}')
        call(f"rm -rf {screenshot_path}", shell=True)
    except Exception as e:
        print("Exception on uploading screenshots", str(e))

def upload_write(write_path, directory='default'):
    try:
        # Create directory if not exist on the remote server
        ssh_exec(f"mkdir -p {ARCHIVEDIR}/writes/{directory}")
        scp_copy(write_path, f'{ARCHIVEDIR}/writes/{directory}')
        call(f"rm -rf {write_path}", shell=True)
    except Exception as e:
        print("Exception on uploading writes", str(e))

def upload_warc(warc_path, col_name, directory='default'):
    try:
        ssh_exec(f"mkdir -p {ARCHIVEDIR}/warcs/{directory}")
        scp_copy(warc_path, f'{ARCHIVEDIR}/warcs/{directory}')
        warc_name = warc_path.split('/')[-1]
        command_prefix = f"{PYWBENV} && cd {ARCHIVEDIR}"
        command_init = f"{command_prefix} && wb-manager init {col_name}"
        ssh_exec(command_init, check=False)

        command_add = f"{command_prefix} && wb-manager add {col_name} {ARCHIVEDIR}/warcs/{directory}/{warc_name}"
        ssh_exec(command_add)
        call(f"rm -rf {warc_path}", shell=True)
    except Exception as e:
        print("Exception on uploading warc", str(e))