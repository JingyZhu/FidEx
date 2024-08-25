import sys
import os
from subprocess import call

_cur_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(_cur_dir))
import fidelity_detect
sys.path.append(os.path.dirname(os.path.dirname(_cur_dir)))
from utils import url_utils
from record_replay import autorecord

TESTDIR = 'test_data'
# Need to change to where the pywb is running on and the archive is stored
ARCHIVEDIR = os.path.join(os.path.expanduser("~"), 'fidelity-files')
PYWBVENV = '/x/jingyz/pywb/env/bin/activate'


def test_no_issue_record_replay_gt():
    # ! Clean and setup webrecorder's test archive before running
    call(f'rm -rf {ARCHIVEDIR}/writes/test/*_rr', shell=True)
    call(f'rm -rf {TESTDIR}/*_rr', shell=True)
    call(f'rm -rf {ARCHIVEDIR}/collections/test/', shell=True)
    call(f'source {PYWBVENV} && wb-manager init test', shell=True, executable="/bin/bash", cwd=f'{ARCHIVEDIR}')
    urls = [
        "https://www.google.com/",
        # Some manually checked testcases from Tranco. No guarantee of future correctness
        # "https://bookhodai.jp/",
        # "https://www.dearfoams.com/", # * Issue caused by fail to clear storage (popup only on first visit)
        # "https://crpt.ru/", # * Image carousel
        # "https://mojohost.com/", # * Recaptcha
    ]
    dir_issue = {}
    for i, url in enumerate(urls):
        print(i, url)
        archive_name = url_utils.calc_hostname(url)
        archive_name = f'{archive_name}_rr'
        _, url = autorecord.record_replay(url, archive_name,
                                          write_path=f'{_cur_dir}/{TESTDIR}', 
                                          download_path=f'{_cur_dir}/downloads', 
                                          archive_path=ARCHIVEDIR,
                                          wr_archive='test', pw_archive='test', remote_host=False)
        dirr = archive_name
        call(f'cp -r {ARCHIVEDIR}/writes/test/{dirr} {TESTDIR}/{dirr}', shell=True)
        full_dir = os.path.join(TESTDIR, dirr)
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
        dir_issue[dirr] = issue
    print("\n\n==========Test Results==========")
    for dirr, issue in dir_issue.items():
        print(dirr, "has issue", issue)


if __name__ == "__main__":
    test_no_issue_record_replay_gt()


# Below needs refactoring
def test_no_issue_gt():
    dirs = [
        'organizations.lanl.gov_02c5db70be', # * Needs scroll, solved
        'collinlab.blogspot.com_42eabc0e86', # * Iframe bugs, Solved
        'sr06.senate.ca.gov_8ed59cf9e3', # * Vimeo video autoplayed on record, solved
        'www.fhcm.paris_3caeb1608e', # * No problem
        'www.cisa.gov_ccfd9a5f56', # * Solved
        'archives.akaartistrun.com_9e33d7e5a3', # * Image's URL percent-encoded. Solved
        'pap.georgia.gov_668dfba58e', # * youtube video, solved
        'romanialiterara.com_4c8a3a4110', # * Links differs in amp in query. But BeatifulSoup seems to throw the amp away. Needs nested unquote
        'www.ukb-nsn.gov_fec24a6a0c', # * Needs scroll, solved
        'www.ornl.gov_51d02c8501', # * Style background URL relative vs. absolute. Solved
        'swcmembers.si.edu_fe044475b4', # * Needs scroll, solved
        'www.mauiarts.org_20f3dfba2f' # * Solved
        'highpressurexrd.lbl.gov_841ce0fe1e', # * 503, solved
        'patientsafety.va.gov_ed652f3b55', # * 503, solved
        'usda-fsa.usajobs.gov_18db8a141d_rr', # ? Non-detereminism on recording
        'ssaiseattle.usajobs.gov_eb0e05b0b6', # * Similar to usda, loading on original URL auto-redirect (no navigation) to with query
        'www.kyeb.uscourts.gov_c42759e5f6', # * Non-determinism on certain elements' dimension, solve with adding screenshot
        'www.jankossen.com_d8c929d7d5', # * Non-determinism on certain elements' dimension, solve with adding screenshot
    ]
    for dirr in dirs:
        print(dirr)
        full_dir = os.path.join(TESTDIR, dirr)
        issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, 'live', 'archive', meaningful=True)
        if issue:
            print('Issue:', issue)
            print('Left unique:', len(left_u), [len(u) for u in left_u], '\n', json.dumps(left_u, indent=2))
            print('Right unique:', len(right_u), [len(u) for u in right_u], '\n', json.dumps(right_u, indent=2))
        else:
            print('No issue')

def test_no_issue_multi_record_gt():
    # ! Clean webrecorder's test before running
    home_dir = os.path.expanduser("~")
    call(f'rm -rf {ARCHIVEDIR}/writes/test/*_mr', shell=True)
    call(f'rm -rf {TESTDIR}/*_mr', shell=True)
    call(f'rm -rf {ARCHIVEDIR}/collections/test/', shell=True)
    call(f'source {PYWBVENV} && wb-manager init test', shell=True, executable="/bin/bash", cwd=f'{ARCHIVEDIR}')
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
        test_utils.record_multi_times(url, archive_name, wr_archive='test', pw_archive='test', remote_host=REMOTE, 
                                    times=check_times, random_sleep=False)
        dirr = archive_name
        call(f'cp -r {ARCHIVEDIR}/writes/test/{dirr} {TESTDIR}/{dirr}', shell=True)
        full_dir = os.path.join(TESTDIR, dirr)
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
    call(f'rm -rf {ARCHIVEDIR}/writes/test/*_mr', shell=True)
    call(f'rm -rf {TESTDIR}/*_mr', shell=True)
    call(f'rm -rf {ARCHIVEDIR}/collections/test/', shell=True)
    call(f'source {PYWBVENV} && wb-manager init test', shell=True, executable="/bin/bash", cwd=f'{ARCHIVEDIR}')
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
        ts, url = test_utils.replay_multi_times(url, archive_name, wr_archive='test', pw_archive='test', remote_host=REMOTE, 
                                    times=check_times, random_sleep=False)
        dirr = archive_name
        call(f'cp -r {ARCHIVEDIR}/writes/test/{dirr} {TESTDIR}/{dirr}', shell=True)
        full_dir = os.path.join(TESTDIR, dirr)
        dir_issue[dirr] = []
        # Choose all combinations of 2 from check_times
        for i, j in combinations(range(check_times), 2):
            issue, (left_u, right_u) = fidelity_detect.fidelity_issue(full_dir, f'archive_{i}', f'archive_{j}', meaningful=True)
            dir_issue[dirr].append((i, j, issue))
    print("\n\n==========Test Results==========")
    for dirr, issue in dir_issue.items():
        print(dirr, issue)