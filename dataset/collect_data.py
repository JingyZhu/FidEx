import json
import socket
import os
import re
import glob
import random
from concurrent.futures import ThreadPoolExecutor
from subprocess import call

machine = socket.gethostname()
DATASET_DIR = '/vault-swift/jingyz/fidex-dataset'
DIRR = 'all'

def make_dirs(dirr):
    call(f'mkdir -p {DATASET_DIR}/{dirr}/warcs', shell=True)
    call(f'mkdir -p {DATASET_DIR}/{dirr}/instrumentations', shell=True)

def get_hostnames_pinpoint_example():
    examples = json.load(open('/vault-swift/jingyz/fidex-dataset/metadata/pinpoint/pinpoint_examples.json', 'r'))
    return [e['FidelityResult']['hostname'] for e in examples]

def get_hostnames_pinpoint_reason(reason):
    pinpoint_results = json.load(open('/vault-swift/jingyz/fidex-dataset/metadata/pinpoint/pinpoint.json', 'r'))
    target_hostnames = []
    for pinpoint_result in pinpoint_results:
        errors = pinpoint_result['Errors']
        for error in errors:
            desc = error['description']
            if reason.match(desc):
                target_hostnames.append(pinpoint_result['FidelityResult']['hostname'])
                break
    return target_hostnames

def get_hostnames_detection():
    det = json.load(open('/vault-swift/jingyz/fidex-dataset/metadata/detection/detection.json', 'r'))
    return [e['hostname'] for e in det if e['diff']]

def copy_warc_write(coll, hostname, dirr):
    call(f'cp    /y/jingyz/fidelity-files/warcs/{coll}/{hostname}.warc {DATASET_DIR}/{dirr}/warcs/', shell=True)
    call(f'cp -r /y/jingyz/fidelity-files/writes/{coll}/{hostname} {DATASET_DIR}/{dirr}/instrumentations/', shell=True)

metadata = json.load(open('/vault-swift/jingyz/fidex-dataset/metadata/metadata.json', 'r'))
metadata = {m['directory']: m for m in metadata}

def copy_example():
    DIRR = 'examples'
    hostnames = get_hostnames_pinpoint_example()
    make_dirs(DIRR)
    for i, hostname in enumerate(hostnames):
        meta = metadata[hostname]
        print(f'Processing {i+1}/{len(hostnames)}: {hostname}')
        if machine not in meta['sub_archive']:
            continue
        coll = meta['archive']
        copy_warc_write(coll, hostname, DIRR)

def copy_sample(reason=None, n=10):
    hostnames = get_hostnames_pinpoint_reason(reason)
    random.shuffle(hostnames)
    make_dirs(DIRR)
    counter = 0
    for hostname in hostnames:
        meta = metadata[hostname]
        sub_archive = meta['sub_archive']
        if machine not in sub_archive:
            continue
        counter += 1
        print(f'Processing {counter}: {hostname}')
        coll = meta['archive']
        copy_warc_write(coll, hostname, DIRR)
        if counter >= n:
            break

def copy_all():
    hostnames = get_hostnames_detection()
    all_dirs = set()
    counter = 0
    for hostname in hostnames:
        meta = metadata[hostname]
        sub_archive = meta['sub_archive']
        all_dirs.add(sub_archive)
        if machine not in sub_archive:
            continue
        make_dirs(sub_archive)
        counter += 1
        print(f'Processing {counter}: {hostname}')
        coll = meta['archive']
        copy_warc_write(coll, hostname, sub_archive)
    json.dump(list(all_dirs), open('dirs.json', 'w'), indent=2)

def tar_all():
    dirs = os.listdir('/vault-swift/jingyz/fidex-dataset/')
    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = []
        for d in dirs:
            if machine not in d:
                continue
            print(f'Tarring {d}')
            futures.append(executor.submit(call, f'tar -czf ~/fidex-dataset/{d}.tar.gz -C ~/fidex-dataset/{d} .', shell=True))
        for future in futures:
            future.result()


def upload_all():
    cmd = ('az storage blob upload '
            '--account-name fidexdataset '
            '--container-name dataset ')
    tars = glob.glob('/vault-swift/jingyz/fidex-dataset/*.tar.gz')
    for tar in tars:
        call(f'{cmd} --name {os.path.basename(tar)} --file {tar}', shell=True)

DATASET_DIR = '/vault-swift/jingyz/fidex-dataset-top'
DIRR = 'srcdoc_contains_wb_pmw'
copy_sample(reason=re.compile(re.escape("Fidex (wombat invariant violated): srcdoc contains __WB_pmw(), which could raise errors")), n=10)
# tar_all()
# upload_all()