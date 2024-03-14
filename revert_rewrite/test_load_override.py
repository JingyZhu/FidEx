import subprocess
import os
import json

def check_result(dirr):
    result = {"hostname": dirr.split('/')[-1]}
    if os.path.exists(f'{dirr}/result_log.json'):
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

def test_run_load_override_w_fidelity_syntax():
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
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20170119135226/http:/usafacademyband.af.mil/index.asp",
            "hostname": "usafacademyband.af.mil_8934"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118025017/http:/suicideprevention.nv.gov/",
            "hostname": "suicideprevention.nv.gov_5851"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot-1k/20240129135149/https://eta.lbl.gov/",
            "hostname": "eta.lbl.gov"
        }
    ]
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
    print(json.dumps(results, indent=2))


def test_run_load_override_w_fidelity_exception():
    urls = [
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot-1k/20240129135149/https://eta.lbl.gov/",
            "hostname": "eta.lbl.gov"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118001619/http:/economist.uat.usajobs.gov/",
            "hostname": "economist.uat.usajobs.gov_5943"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118043257/https://ssaiseattle.usajobs.gov/Search/",
            "hostname": "ssaiseattle.usajobs.gov_8322"
        }
    ]
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
    print(json.dumps(results, indent=2))


def test_run_load_override_wo_fidelity():
    urls = [
        {
            'archive_url': "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161123085535/http:/rader.nrmc.amedd.army.mil/sitepages/home.aspx",
            'hostname': "rader.nrmc.amedd.army.mil"
        },
        {
            "archive_url": "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118023543/http:/newhaven.jobcorps.gov/home.aspx",
            "hostname": "newhaven.jobcorps.gov_10578"
        }
    ]
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
    print(json.dumps(results, indent=2))

test_run_load_override_w_fidelity_exception()