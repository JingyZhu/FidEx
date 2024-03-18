import subprocess
import os
import json

def check_result(dirr):
    result = {"hostname": dirr.split('/')[-1]}
    if os.path.exists(f'{dirr}/results.json'):
        log = json.load(open(f'{dirr}/result_log.json', 'r'))
        result['fixedIdx'] = log['fixedIdx']
        if log['fixedIdx'] == -1:
            return result
        idx = result['fixedIdx']
        initial_writes = json.load(open(f'{dirr}/initial_writes.json', 'r'))
        final_writes = json.load(open(f'{dirr}/exception_{idx}_writes.json', 'r'))
        result['initial_writes'] = len(initial_writes["rawWrites"])
        result['final_writes'] = len(final_writes["rawWrites"])
        result['more_writes'] = len(initial_writes["rawWrites"]) <= len(final_writes["rawWrites"])
        return result
    else:
        result['fixedIdx'] = "No result log"
    return result

def run_on_testcases(urls):
    results = []
    for i, datum in enumerate(urls):
        hostname, archive_url = datum['hostname'], datum['archive_url']
        print(i, archive_url)
        # Try removing the directory (it is fine the if the directory does not exist)
        try:
            subprocess.call(['rm', '-rf', f'test/load_override/writes/{hostname}'])
        except:
            pass
        try:
            process = subprocess.Popen(['node', 'load_override.js', '-d', 
                                        f'test/load_override/writes/{hostname}', archive_url], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
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
        result = check_result(f'test/load_override/writes/{hostname}')
        results.append(result)
    return results


def test_run_load_override_syntax():
    urls = [
        {
            'archive_url': "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161129042437/http:/lni.wa.gov/safety/topics/atoz/primarymetals/",
            'hostname': "lni.wa.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118071551/http:/nccpaboard.gov/",
            "hostname": "nccpaboard.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118025017/http:/suicideprevention.nv.gov/",
            "hostname": "suicideprevention.nv.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161123082314/https://occ.gov/",
            "hostname": "ots.gov",
        }
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
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161129125821/http:/azsos.gov/",
            "hostname": "azsos.gov",
        },

    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))

def test_run_load_override_temp():
    urls = [
        {
            # ! Need to test with more detail!
            "hostname": "www.trade.gov_1",
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot-1k/20231106005746/https://www.trade.gov/buyusa"
        },
        # {
        #     # ! Takes very long to load
        #     "hostname": "booneville.ars.usda.gov_6518",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200_2/20161118050448/https://www.ars.usda.gov/"
        # },
        # {
        #     # ! Takes very long to load
        #     "hostname": "www.buyusa.gov_982",
        #     "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200_2/20130309080613/http:/www.buyusa.gov/"
        # }
    ]
    results = run_on_testcases(urls)
    print(json.dumps(results, indent=2))

test_run_load_override_temp()