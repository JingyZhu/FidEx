import subprocess
import os
import json
import time

def check_results(dirr):
    results = {"hostname": dirr.split('/')[-1], 'fixedIdx': -1}
    if os.path.exists(f'{dirr}/results.json'):
        logs = json.load(open(f'{dirr}/results.json', 'r'))
        for stage, log in logs.items():
            result = {}
            result['fixedIdx'] = log['fixedIdx']
            if log['fixedIdx'] == -1:
                continue
            idx = result['fixedIdx']
            stage = log['stage']
            result['stage'] = stage
            initial_writes = json.load(open(f'{dirr}/{stage}_initial_writes.json', 'r'))
            final_writes = json.load(open(f'{dirr}/{stage}_exception_{idx}_writes.json', 'r'))
            result['initial_writes'] = len(initial_writes["rawWrites"])
            result['final_writes'] = len(final_writes["rawWrites"])
            result['more_writes'] = len(initial_writes["rawWrites"]) <= len(final_writes["rawWrites"])
            results[stage] = result
            if "fixedIdx" in results:
                del results['fixedIdx']
    else:
        results['fixedIdx'] = "No result log"
    return results

def run_on_testcases(urls, decider=False, manual=False, interaction=False):
    all_results = []
    for i, datum in enumerate(urls):
        hostname, archive_url = datum['hostname'], datum['archive_url']
        print(i, archive_url)
        # Try removing the directory (it is fine the if the directory does not exist)
        try:
            subprocess.call(['rm', '-rf', f'test/load_override/writes/{hostname}'])
        except:
            pass
        try:
            args = ['node', 'load_override.js', '-d', f'test/load_override/writes/{hostname}', archive_url]
            # args = ['node', 'load_override_all.js', '-d', f'test/load_override/writes/{hostname}', archive_url]
            if decider:
                args.append('-o')
            if manual:
                args.append('-m')
            if interaction:
                args.append('-i')
            process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            output = ''
            for line in iter(process.stdout.readline, b''):
                line = line.decode()
                print(line, end='')  # print to stdout immediately
                output += line  # save to the output string
            process.stdout.close()
            process.wait()
        except subprocess.CalledProcessError as e:
            output = e.output.decode()
        f = open(f'test/load_override/writes/{hostname}/log.log', 'w+')
        f.write(output)
        f.close()
        results = check_results(f'test/load_override/writes/{hostname}')
        all_results.append(results)
    return all_results


def test_run_load_override_gt():
    urls = [
        # # 404 + 503？
        # {
        #     "hostname": "www.utb.uscourts.gov_3e9fd71510",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403070039/https://www.utb.uscourts.gov/",
        # },
        # # Syntax + DOMException
        # {
        #     "hostname": "tahoe.ca.gov_f2a21b3d59",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403070044/https://tahoe.ca.gov/#main-content",
        # },
        # # Google translate
        # {
        #     "hostname": "ltgov.nv.gov_2597bb1290",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403061730/https://ltgov.nv.gov/",
        # },
        # # illegal invocation
        # {
        #     "hostname": "dws.arkansas.gov_f80b6da677",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403055906/https://dws.arkansas.gov/",
        # },
        # * Starting from here 200 ground truth are added
        # SyntaxError
        # {
        #     "hostname": "www.laphil.com_1634459bf8",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240404054835/https://www.laphil.com/campaigns/celebrate-inglewood-community-festival",
        # },
        # # ! Buggy (promise is collected on collecting render tree) SyntaxError
        # {
        #     "hostname": "airandspace.si.edu_5bf8cf6ff5",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240404060436/https://airandspace.si.edu/",
        # },
        # # Google translate
        # {
        #     "hostname": "bmt.ky.gov_9f4115a9f2",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405052121/https://bmt.ky.gov/",
        # },
        # # Need fidelity check strict mode embeded
        # {
        #     "hostname": "dot.alaska.gov_7aa47e3461",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405042829/https://dot.alaska.gov/",
        # },
        # # Syntax error, back to top not available
        # {
        #     "hostname": "boe.ca.gov_58486781a5",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405053533/https://boe.ca.gov/",
        # },
        # # Syntax error + Suspect google translate
        # {
        #     "hostname": "www.in.gov_4559663ea2",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409081734/https://www.in.gov/sos/elections/voter-information/photo-id-law/",
        # }
        # # Revert Fetches (should work now)
        # {
        #     "hostname": "www.nyed.uscourts.gov_245517ae3e",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409075227/https://www.nyed.uscourts.gov/",
        # },
        # # Revert line of eval should help
        # {
        #     "hostname": "www.reginajosegalindo.com_f8c82b5bef",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409080113/https://www.reginajosegalindo.com/en/home-en/",
        # }
    ]
    results = run_on_testcases(urls, manual=True)
    print(json.dumps(results, indent=2))

def test_run_load_override_gt_network():
    urls = [
        # # font issue
        # {
        #     "hostname": "ccr.cancer.gov_9e8d77b4b8",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405052525/https://ccr.cancer.gov/molecular-imaging-branch",
        # },
        # # 503
        # {
        #     "hostname": "mirecc.va.gov_f602190372",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409074945/https://mirecc.va.gov/visn3/",
        # },
        # # 503 on xhr
        # {
        #     "hostname": "citrus.floridahealth.gov_48bd35942a",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409082007/https://citrus.floridahealth.gov/",
        # },
        # 503 svg
        {
            "hostname": "patientsafety.va.gov_ed652f3b55",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409080646/https://patientsafety.va.gov/",
        },
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


def test_run_load_override_gt_hard():
    urls = [
        # google not defined + _WB_pmw
        {
            "hostname": "poetlaureate.illinois.gov_ca5d3a1f39",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403062228/https://poetlaureate.illinois.gov/",
        },
        # google not defined + _WB_pmw
        {
            "hostname": "oklahoma.gov_fcad824cde",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403055905/https://oklahoma.gov/health/locations/county-health-departments/woods-county-health-department.html",
        },
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


def test_run_load_override_gt_no_fidelity():
    urls = [
        # # Fragmentation of URL
        # {
        #     "hostname": "www.caringjobs.nd.gov_b7336a3d1c",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405051257/https://www.caringjobs.nd.gov/",
        # },
        # {
        #     "hostname": "blogs.cdc.gov_6cba792575",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405052941/https://blogs.cdc.gov/",
        # },
        # Target closed
        # {
        #     "hostname": "www.miandn.com_339f86e8d5",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405051739/https://www.miandn.com/",
        # },
        # # Interaction 1
        # {
        #     "hostname": "public.govdelivery.com_3052688d2f",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405044112/https://public.govdelivery.com/accounts/IACIO/subscriber/new?qsp=IACIO_22",
        # },
        # # revertVar seems introduce some problem
        # {
        #     "hostname": "bsr.frb.gov_0939bdce0d",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405051425/https://bsr.frb.gov/my.logout.php3?errorcode=19",
        # },
        # # ! Need to remove check for display:block
        # {
        #     "hostname": "www.cdc.gov_e1302c87d2",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405051810/https://www.cdc.gov/#print",
        # },
        # # Last time check, fixed
        # {
        #     "hostname": "www.fws.gov_5f81d32ad8",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409070511/https://www.fws.gov/program/national-wetlands-inventory",
        # },
        # # Last time check, fixed
        # {
        #     "hostname": "dropstuff.nl_d96a6eef1a",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409070628/https://dropstuff.nl/en/",
        # },
        # Diff caused by recaptcha
        {
            "hostname": "www.mnbookarts.org_8057ac1b26",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409160705/https://www.mnbookarts.org/",
        },
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


def test_run_load_override_temp():
    urls = [
        # {
        #     "hostname": "www.nyed.uscourts.gov_245517ae3e",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240409075227/https://www.nyed.uscourts.gov/",
        # },
        {
            "hostname": "mass.gov",
            "archive_url": "http://pistons.eecs.umich.edu:8080/test/20240429200034/https://www.mass.gov/"
        },
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


test_run_load_override_gt()