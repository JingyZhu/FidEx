import fidelity_detect
import os
import json
import sys
import re
from subprocess import PIPE, check_call, Popen, call
import random
import time
from itertools import combinations

sys.path.append('../')
from utils import upload, url_utils

base = 'tests'
arguments = ['-w', '-s', '--scroll', '-i']
REMOTE = True
HOST = 'http://pistons.eecs.umich.edu:8080' if REMOTE else 'http://localhost:8080'

def record_replay(url, archive_name, 
                  wr_archive='test', 
                  pw_archive='test',
                  remote_host=False):
    """
    Args:
        url: URL to record and replay
        archive_name: Name of the archive to be saved
        wr_archive: Name of the archive to save & export on webrecorder
        pw_archive: Name of the archive to import for warc on pywb
        remote_host: True if run on remote host, False if run on local host
    """
    p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                '-f', 'live',
                '-a', wr_archive, 
                *arguments,
                url], stdout=PIPE, cwd='../record_replay')
    ts = None
    while True:
        line = p.stdout.readline()
        if not line:
            break
        line = line.decode()
        if "recorded page" in line:
            info = re.sub(r'.*recorded page: ', '', line)
            info = json.loads(info)
            ts, _ = info['ts'], info['url']
            break
    if ts is None:
        return '', url
    p.wait()

    os.rename(f'../record_replay/downloads/{wr_archive}.warc', f'../record_replay/downloads/{archive_name}.warc')
    if remote_host:
        upload.upload_warc(f'../record_replay/downloads/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'../record_replay/downloads/{archive_name}.warc'], cwd='../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    check_call(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                '-f', 'archive',
                *arguments,
                archive_url], cwd='../record_replay')
    if remote_host:
        upload.upload_write(f'../record_replay/writes/{archive_name}', directory=pw_archive)

    return ts, url


def replay_multi_times(url, archive_name, 
                       wr_archive='test', 
                       pw_archive='test', 
                       remote_host=False, 
                       times=2, random_sleep=True):
    """
    Similar to record_replay, but replay the archive multiple times (for testing non-determinism)
    """
    p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                '-f', 'live',
                '-a', wr_archive, 
                *arguments,
                url], stdout=PIPE, cwd='../record_replay')
    ts = None
    while True:
        line = p.stdout.readline()
        if not line:
            break
        line = line.decode()
        if "recorded page" in line:
            info = re.sub(r'.*recorded page: ', '', line)
            info = json.loads(info)
            ts, url = info['ts'], info['url']
            break
    if ts is None:
        return '', url
    p.wait()

    os.rename(f'../record_replay/downloads/{wr_archive}.warc', f'../record_replay/downloads/{archive_name}.warc')
    if remote_host:
        upload.upload_warc(f'../record_replay/downloads/{archive_name}.warc', pw_archive, directory=pw_archive)
    else:
        check_call(['wb-manager', 'add', pw_archive, 
                    f'../record_replay/downloads/{archive_name}.warc'], cwd='../collections')

    ts = ts.strip()
    archive_url = f"{HOST}/{pw_archive}/{ts}/{url}"
    for i in range(times):
        time.sleep(1)
        print("Start replaying", i)
        p = Popen(['node', 'replay.js', '-d', f'writes/{archive_name}', 
                    '-f', f'archive_{i}', '-m',
                    *arguments,
                    archive_url], stdin=PIPE, stdout=PIPE, cwd='../record_replay')
        while True:
            line = p.stdout.readline()
            if not line:
                break
            line = line.decode()
            if "ready?" in line.lower():
                break
        if random_sleep:
            stime = random.randint(1, 10)
            print("sleeping", stime)
            time.sleep(stime)
        # Press enter to continue
        p.stdin.write(b'\n')
        p.stdin.flush()
        p.wait()
    if remote_host:
        upload.upload_write(f'../record_replay/writes/{archive_name}', directory=pw_archive)

    return ts, url

def record_multi_times(url, archive_name, 
                       wr_archive='test', 
                       pw_archive='test', 
                       remote_host=False, 
                       times=2, random_sleep=False):
    """
    Similar to replay_multitimes, but record (for testing non-determinism)
    """
    for i in range(times):
        print("Start recording", i)
        p = Popen(['node', 'record.js', '-d', f'writes/{archive_name}',
                    '-f', f'live_{i}',
                    '-a', wr_archive, '-m',
                    *arguments,
                    url], stdin=PIPE, stdout=PIPE, cwd='../record_replay')
        while True:
            line = p.stdout.readline()
            if not line:
                break
            line = line.decode()
            if "ready?" in line.lower():
                break
        if random_sleep:
            stime = random.randint(1, 10)
            print("sleeping", stime)
            time.sleep(stime)
        # Press enter to continue
        p.stdin.write(b'\n')
        p.stdin.flush()
        p.wait()
    if remote_host:
        upload.upload_write(f'../record_replay/writes/{archive_name}', directory=pw_archive)

def test_issue_gt():
    dirs = [
        # 'dpb-web.instantencore.com_8316c708d4', # ! Inner scroll bar, live recording unable to scroll
        # 'www.pnnl.gov_75feec7fe3', # ! Non determinisitic a tag href
        # 'ctcwcs.com_f3bd46bcc1', # ! Twitter timeline missing
        # 'statedept.tumblr.com_6964c1d8fc', # ! Missing signup and cookie (indeed fidelity issue)
        # 'iteams.dshs.texas.gov_3d8b742055', # !! 404 on archive

        # 'investuttarakhand.com_9e8f65e491', # ! Same screenshot, same <product-modal>, on live directly under body, on archive below some main section
        # 'media.ksc.nasa.gov_793c637518', # ! Screenshot size seems different
    ]

def test_issue_tosolve():
    dirs = [
        # 'turbatol.org_cbdb6e0dfe', # ? Does have a fidelity problem on the height of the page
        'www.ndhin.nd.gov_ee2fb23579', # ? No issue, but might be a good example for testing carousel
        'www.morganlehmangallery.com_1e48d26ec2', # ? No issue, but might be a good example for testing carousel
    ]

def test_nodiff_screenshotdiff():
    dirs = [
        'simonehandbagmuseum.co.kr_7707fced6a', # ? Background image different in live and archive (archive not showing the background)
    ]

def test_no_issue_gt():
    dirs = [
        # 'organizations.lanl.gov_02c5db70be', # * Needs scroll, solved
        # 'collinlab.blogspot.com_42eabc0e86', # * Iframe bugs, Solved
        # 'sr06.senate.ca.gov_8ed59cf9e3', # * Vimeo video autoplayed on record, solved
        # 'www.fhcm.paris_3caeb1608e', # * No problem
        # 'www.cisa.gov_ccfd9a5f56', # * Solved
        # 'archives.akaartistrun.com_9e33d7e5a3', # * Image's URL percent-encoded. Solved
        # 'pap.georgia.gov_668dfba58e', # * youtube video, solved
        # 'romanialiterara.com_4c8a3a4110', # * Links differs in amp in query. But BeatifulSoup seems to throw the amp away. Needs nested unquote
        # 'www.ukb-nsn.gov_fec24a6a0c', # * Needs scroll, solved
        # 'www.ornl.gov_51d02c8501', # * Style background URL relative vs. absolute. Solved
        # 'swcmembers.si.edu_fe044475b4', # * Needs scroll, solved
        # 'www.mauiarts.org_20f3dfba2f' # * Solved
        # 'highpressurexrd.lbl.gov_841ce0fe1e', # * 503, solved
        # 'patientsafety.va.gov_ed652f3b55', # * 503, solved
        'usda-fsa.usajobs.gov_18db8a141d_rr', # ? Non-detereminism on recording
        # 'ssaiseattle.usajobs.gov_eb0e05b0b6', # * Similar to usda, loading on original URL auto-redirect (no navigation) to with query
        # 'www.kyeb.uscourts.gov_c42759e5f6', # * Non-determinism on certain elements' dimension, solve with adding screenshot
        # 'www.jankossen.com_d8c929d7d5', # * Non-determinism on certain elements' dimension, solve with adding screenshot
    ]
    for dirr in dirs:
        print(dirr)
        full_dir = os.path.join(base, dirr)
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
        if issue:
            print('Issue:', issue)
            print('Left unique:', len(left_u), [len(u) for u in left_u], '\n', json.dumps(left_u, indent=2))
            print('Right unique:', len(right_u), [len(u) for u in right_u], '\n', json.dumps(right_u, indent=2))
        else:
            print('No issue')

def test_no_issue_record_replay_gt():
    # ! Clean webrecorder's test before running
    home_dir = os.path.expanduser("~")
    call(f'rm -rf {home_dir}/fidelity-files/writes/test/*_rr', shell=True)
    call(f'rm -rf {base}/*_rr', shell=True)
    call(f'rm -rf {home_dir}/fidelity-files/collections/test/', shell=True)
    call(f'source /x/jingyz/pywb/env/bin/activate && wb-manager init test', shell=True, executable="/bin/bash", cwd=f'{home_dir}/fidelity-files')
    urls = [
        # "https://organizations.lanl.gov/ees-division/",
        # "http://collinlab.blogspot.com/",
        # "https://sr06.senate.ca.gov/",
        # "https://www.fhcm.paris/fr",
        # "https://www.cisa.gov/safecom",
        # "https://archives.akaartistrun.com/",
        # "https://pap.georgia.gov/",
        # "https://romanialiterara.com/2021/06/in-viziunea-lui-frank-gehry-o-transformare-neobisnuita-a-muzeului-de-arta-din-philadelphia/",
        # "https://www.ukb-nsn.gov/",
        # "https://www.ornl.gov/",
        # "https://swcmembers.si.edu/",
        # "https://www.mauiarts.org/exhibits.php?filter=current",
        # "https://highpressurexrd.lbl.gov/",
        # "https://patientsafety.va.gov/",
        # "https://usda-fsa.usajobs.gov/search/results/",
        # "https://ssaiseattle.usajobs.gov/search/results/",
        # "https://www.kyeb.uscourts.gov/",
        # 'https://www.jankossen.com/',
        # 'https://piers.wyo.gov/', # * Test for extraInteraction (should have no extraInteraction)
        'https://statehood.dc.gov/', # * Test for A tag interaction in archive (previously wrongly filtered out)
    ]
    dir_issue = {}
    for i, url in enumerate(urls):
        print(i, url)
        archive_name = url_utils.calc_hostname(url)
        archive_name = f'{archive_name}_rr'
        ts, url = record_replay(url, archive_name, wr_archive='test', pw_archive='test', remote_host=REMOTE)
        dirr = archive_name
        call(f'cp -r {home_dir}/fidelity-files/writes/test/{dirr} {base}/{dirr}', shell=True)
        full_dir = os.path.join(base, dirr)
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
        dir_issue[dirr] = issue
    print("\n\n==========Test Results==========")
    for dirr, issue in dir_issue.items():
        print(dirr, issue)

def test_no_issue_multi_record_gt():
    # ! Clean webrecorder's test before running
    home_dir = os.path.expanduser("~")
    call(f'rm -rf {home_dir}/fidelity-files/writes/test/*_mr', shell=True)
    call(f'rm -rf {base}/*_mr', shell=True)
    call(f'rm -rf {home_dir}/fidelity-files/collections/test/', shell=True)
    call(f'source /x/jingyz/pywb/env/bin/activate && wb-manager init test', shell=True, executable="/bin/bash", cwd=f'{home_dir}/fidelity-files')
    urls = [
        # 'https://usda-fsa.usajobs.gov/search/results/', # ? Non-determinism on certain elements' dimension (leaning towards different between record & replay)
        "https://www.kyeb.uscourts.gov/", # ? Non-determinism on certain elements' dimension
        'https://www.jankossen.com/',
    ]
    dir_issue = {}
    check_times = 10
    for i, url in enumerate(urls):
        print(i, url)
        archive_name = url_utils.calc_hostname(url)
        archive_name = f'{archive_name}_mr'
        record_multi_times(url, archive_name, wr_archive='test', pw_archive='test', remote_host=REMOTE, 
                                    times=check_times, random_sleep=False)
        dirr = archive_name
        call(f'cp -r {home_dir}/fidelity-files/writes/test/{dirr} {base}/{dirr}', shell=True)
        full_dir = os.path.join(base, dirr)
        dir_issue[dirr] = []
        # Choose all combinations of 2 from check_times
        for i, j in combinations(range(check_times), 2):
            issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, f'live_{i}', f'live_{j}', meaningful=True)
            dir_issue[dirr].append((i, j, issue))
    print("\n\n==========Test Results==========")
    for dirr, issue in dir_issue.items():
        print(dirr, issue)

def test_no_issue_multi_replay_gt():
    # ! Clean webrecorder's test before running
    home_dir = os.path.expanduser("~")
    call(f'rm -rf {home_dir}/fidelity-files/writes/test/*_mr', shell=True)
    call(f'rm -rf {base}/*_mr', shell=True)
    call(f'rm -rf {home_dir}/fidelity-files/collections/test/', shell=True)
    call(f'source /x/jingyz/pywb/env/bin/activate && wb-manager init test', shell=True, executable="/bin/bash", cwd=f'{home_dir}/fidelity-files')
    urls = [
        # "https://www.ndhin.nd.gov/", # ? No issue, but might be a good example for testing carousel
        # "https://www.morganlehmangallery.com/", # ? No issue, but might be a good example for testing carousel
        # 'https://usda-fsa.usajobs.gov/search/results/', # ? Non-determinism on certain elements' dimension
        'https://fitbir-demo.cit.nih.gov/', # ? Need test, but looks to be a good example for carousel
        'https://statehood.dc.gov/', # ? Need test, but looks to be a good example for carousel
    ]
    dir_issue = {}
    check_times = 5
    for i, url in enumerate(urls):
        print(i, url)
        archive_name = url_utils.calc_hostname(url)
        archive_name = f'{archive_name}_mr'
        ts, url = replay_multi_times(url, archive_name, wr_archive='test', pw_archive='test', remote_host=REMOTE, 
                                    times=check_times, random_sleep=False)
        dirr = archive_name
        call(f'cp -r {home_dir}/fidelity-files/writes/test/{dirr} {base}/{dirr}', shell=True)
        full_dir = os.path.join(base, dirr)
        dir_issue[dirr] = []
        # Choose all combinations of 2 from check_times
        for i, j in combinations(range(check_times), 2):
            issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, f'archive_{i}', f'archive_{j}', meaningful=True)
            dir_issue[dirr].append((i, j, issue))
    print("\n\n==========Test Results==========")
    for dirr, issue in dir_issue.items():
        print(dirr, issue)


def test_no_issue_historical():
    def get_stage_fixedIdx(dirr):
        results = json.load(open(os.path.join(dirr, 'results.json'), 'r'))
        stage, fixedIdx = None, None
        for stage, result in results.items():
            if result['fixedIdx'] == -1:
                continue
            fixedIdx = result['fixedIdx']
            break
        return stage, fixedIdx

    dirs = [
        "elizabethchitty.ca_735_0", # No issue but different (dedup + crop sreenshot)
    ]
    for dirr in dirs:
        print(dirr)
        full_dir = os.path.join(base, dirr)
        stage, fixedIdx = get_stage_fixedIdx(full_dir)
        left = f'{stage}_initial'
        right = f'{stage}_exception_{fixedIdx}'
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, left, right, meaningful=True)
        if issue:
            print('Issue:', issue)
            print('Left unique:', len(left_u), [len(u) for u in left_u], '\n', json.dumps(left_u, indent=2))
            print('Right unique:', len(right_u), [len(u) for u in right_u], '\n', json.dumps(right_u, indent=2))
        else:
            print('No issue')

# test_no_issue_gt()
# test_no_issue_record_replay_gt()
# test_no_issue_multi_record_gt()
# test_no_issue_multi_replay_gt()

test_no_issue_historical()