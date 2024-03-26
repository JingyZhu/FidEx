import subprocess
import os
import json
import time

def check_results(dirr):
    results = {"hostname": dirr.split('/')[-1]}
    if os.path.exists(f'{dirr}/results.json'):
        logs = json.load(open(f'{dirr}/results.json', 'r'))
        for stage, log in logs.items():
            result = {}
            result['fixedIdx'] = log['fixedIdx']
            if log['fixedIdx'] == -1:
                return result
            idx = result['fixedIdx']
            stage = log['stage']
            result['stage'] = stage
            initial_writes = json.load(open(f'{dirr}/{stage}_initial_writes.json', 'r'))
            final_writes = json.load(open(f'{dirr}/{stage}_exception_{idx}_writes.json', 'r'))
            result['initial_writes'] = len(initial_writes["rawWrites"])
            result['final_writes'] = len(final_writes["rawWrites"])
            result['more_writes'] = len(initial_writes["rawWrites"]) <= len(final_writes["rawWrites"])
            results[stage] = result
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


def test_run_load_override_syntax():
    urls = [
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/carta_crawled_200/20180408214205/http://www.lsunow.com/daily/louisiana-pottery-maker-osa-atoe-draws-inspiration-from-african-culture/article_bc397420-ed81-11e6-babb-ffb62db3acdb.html/",
            "hostname": "www.lsunow.com_170_2_4edec4f00b28cf508d6e5a3983e6f969ab47e525ded74f0fd27dd0f03fb527c0",
         
        },
        # {
        #     'archive_url': "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161129042437/http:/lni.wa.gov/safety/topics/atoz/primarymetals/",
        #     'hostname': "lni.wa.gov"
        # },
        # {
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118071551/http:/nccpaboard.gov/",
        #     "hostname": "nccpaboard.gov"
        # },
        # {
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118025017/http:/suicideprevention.nv.gov/",
        #     "hostname": "suicideprevention.nv.gov"
        # },
        # {
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161123082314/https://occ.gov/",
        #     "hostname": "ots.gov",
        # }
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


def test_run_load_override_exception():
    urls = [
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot-1k/20240129135149/https://eta.lbl.gov/",
            "hostname": "eta.lbl.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118001619/http:/economist.uat.usajobs.gov/",
            "hostname": "economist.uat.usajobs.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118043257/https://ssaiseattle.usajobs.gov/Search/",
            "hostname": "ssaiseattle.usajobs.gov"
        }
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))

def test_run_load_override_network():
    urls = [
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161208013654/http:/miami.va.gov/",
            "hostname": "miami.va.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20170119135226/http:/usafacademyband.af.mil/index.asp",
            "hostname": "usafacademyband.af.mil"
        },
        {
            'archive_url': "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161123085535/http:/rader.nrmc.amedd.army.mil/sitepages/home.aspx",
            'hostname': "rader.nrmc.amedd.army.mil"
        },
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))

def test_run_load_override_network_wayback():
    urls = [
        {   
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161221210058/http:/plus.google.com/101548568475678729022/videos",
            "hostname": "plus.google.com_8518"
        }
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


def test_run_load_override_wo_fidelity():
    urls = [
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20170125231240/http:/public.govdelivery.com/accounts/uspbgc/subscriber/new?topic_id=uspbgc_31",
            "hostname": "public.govdelivery.com_4953"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161216030450/http:/youtube.com/user/npsparkclp",
            "hostname": "youtube.com"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20170215055154/https://www.ready.gov/",
            "hostname": "ready.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023543/http:/newhaven.jobcorps.gov/home.aspx",
            "hostname": "newhaven.jobcorps.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725/http:/myssaisanfrancisco.usajobs.gov/search/",
            "hostname": "myssaisanfrancisco.usajobs.gov"
        },
        # * This could take long if run correctly
        # {
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161129125821/http:/azsos.gov/",
        #     "hostname": "azsos.gov",
        # },

    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))

def test_run_load_override_temp():
    urls = [
        # {
        #     # ! Need to test with more detail!
        #     "hostname": "www.trade.gov_1",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot-1k/20231106005746/https://www.trade.gov/buyusa"
        # },
        # {
        #     # ! Takes very long to load
        #     "hostname": "booneville.ars.usda.gov_6518",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200_2/20161118050448/https://www.ars.usda.gov/"
        # },
        # {
        #     # ! Takes very long to load
        #     "hostname": "www.buyusa.gov_982",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200_2/20130309080613/http:/www.buyusa.gov/"
        # },
        # * Takes long to run, should have many exceptions
        # {
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023725/http:/myssaisanfrancisco.usajobs.gov/search/",
        #     "hostname": "myssaisanfrancisco.usajobs.gov"
        # },
        {
            "hostname": "burnaway.org_718_0_2d8d144992bed8a2317732ad814d3b8a2578dc330b325f11d68b95397b622b63",
            "archive_url": "http://pistons.eecs.umich.edu:8080/carta_crawled_200/20210816182809/https://burnaway.org/magazine/krista-clark-moca-ga/"
        }
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))


def test_run_load_override_with_decider():
    try:
        subprocess.call(['rm', '.fix_decider_rules.json'])
    except: pass
    urls = [
        # {
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118014857/https://txsll.libraryreserve.com/10/1334/en/SignIn.htm?url=Default.htm",
        #     "hostname": "overdrive.sll.texas.gov",
        # },
    ]
    start = time.time()
    results = run_on_testcases(urls, decider=False)
    gap1 = time.time() - start
    subprocess.call(['mv', f'test/load_override/writes/{urls[0]["hostname"]}', f'test/load_override/writes/{urls[0]["hostname"]}_1stload'])
    print(json.dumps(results, indent=2))
    subprocess.call(['node', 'run_fix-decider_readlogs.js', '-d', 
                     f'../revert_rewrite/test/load_override/writes/{urls[0]["hostname"]}_1stload', 
                     '-o', '../revert_rewrite'], cwd='../error_match')
    start = time.time()
    results = run_on_testcases(urls, decider=True)
    gap2 = time.time() - start
    print(json.dumps(results, indent=2))
    print("Gap 1:", gap1, "Gap 2:", gap2)


def test_run_load_override_with_decider_onfly():
    try:
        subprocess.call(['rm', '.fix_decider_rules.json'])
    except: pass
    urls = [
        # * This example has many exceptions
        # * Used to test the decider's ability on the fly
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161208050417/https://calvert.house.gov/",
            "hostname": "kencalvert.house.gov",
        },
    ]
    start = time.time()
    results = run_on_testcases(urls, decider=True)
    gap = time.time() - start
    print(json.dumps(results, indent=2))
    print("Gap:", gap)


def test_run_load_override_with_interaction():
    urls = [
        # Should be run till the end
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118031632/https://www.usitc.gov/?f=info",
            "hostname": "info.usitc.gov",
        },
        # # Seen event is not iterable bug
        # {
        #     "hostname": "diversitynews.msfc.nasa.gov_6527",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118013517/http://www.nasa.gov/centers/marshall/news/diversity/index.html"
        # },
        # # Seen execution context was destroyed bug
        # {
        #     "hostname": "kyenroll.ky.gov_13500",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118010244/https://kynect.ky.gov/"
        # },
        # # Context destroyed, because of navigation
        # {
        #     "hostname": "modoc.lafco.ca.gov_11284",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118031108/http:/modoc.lafco.ca.gov/"
        # }
    ]
    start = time.time()
    results = run_on_testcases(urls, interaction=True)
    gap = time.time() - start
    print(json.dumps(results, indent=2))
    print("Gap:", gap)

test_run_load_override_with_interaction()