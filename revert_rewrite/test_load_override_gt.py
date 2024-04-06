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
        # 404 + 503？
        {
            "hostname": "www.utb.uscourts.gov_3e9fd71510",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403070039/https://www.utb.uscourts.gov/",
        },
        # Syntax + DOMException
        {
            "hostname": "tahoe.ca.gov_f2a21b3d59",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403070044/https://tahoe.ca.gov/#main-content",
        },
        # Google translate
        {
            "hostname": "ltgov.nv.gov_2597bb1290",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403061730/https://ltgov.nv.gov/",
        },
        # illegal invocation
        {
            "hostname": "dws.arkansas.gov_f80b6da677",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240403055906/https://dws.arkansas.gov/",
        },
        # SyntaxError
        {
            "hostname": "www.laphil.com_1634459bf8",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240404054835/https://www.laphil.com/campaigns/celebrate-inglewood-community-festival",
        },
        # SyntaxError
        {
            "hostname": "airandspace.si.edu_5bf8cf6ff5",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240404060436/https://airandspace.si.edu/",
        },
        # Google translate
        {
            "hostname": "bmt.ky.gov_9f4115a9f2",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405052121/https://bmt.ky.gov/",
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


def test_run_load_override_temp():
    urls = [
        # Google translate
        {
            "hostname": "bmt.ky.gov_9f4115a9f2",
            "archive_url": "http://pistons.eecs.umich.edu:8080/ground_truth/20240405052121/https://bmt.ky.gov/",
        },
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))



test_run_load_override_temp()