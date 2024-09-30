from subprocess import call
from fidex.utils import url_utils
import os

BASE = os.path.join(os.path.expanduser("~"), 'fidelity-files')

def clear_by_url(url, dirr, pw_archive):
    hostname = url_utils.calc_hostname(url)
    call(f"rm -rf {dirr}/writes/{pw_archive}/{hostname}", shell=True)
    call(f"rm -rf {dirr}/warcs/{pw_archive}/{hostname}.warc", shell=True)


def clear_all(metadata, pw_archive):
    call(['rm', metadata])
    call(f"rm downloads/*", shell=True)
    call(f"rm -rf writes/*", shell=True)

    call(['rm', '-rf', f'{BASE}/collections/{pw_archive}'])
    call(['wb-manager', 'init', pw_archive], cwd=BASE)