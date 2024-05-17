"""
Auto run load_wayback.js
Read metadata that including archive URLs, and run load_wayback.js accordingly
"""
import json
import subprocess
import os, socket
import time
from threading import Thread
from urllib.parse import urlsplit, urlunsplit

HOME = os.path.expanduser("~")
MACHINE = socket.gethostname()
HOSTNAME = f'{MACHINE}.eecs.umich.edu'
input_file = 'm1m_sampled.json'
write_dir = 'writes_m1m'
data = json.load(open(f'inputs/{input_file}', 'r'))

def run_load_override(decider=False, interact=False):
    start = time.time()
    for i, datum in enumerate(data):
        hostname, archive_url = datum['hostname'], datum['archive_url']
        print(i, archive_url)
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            print(f'{hostname} already processed')
            continue
        # Try removing the directory (it is fine the if the directory does not exist)
        try:
            subprocess.call(['rm', '-rf', f'{write_dir}/{hostname}'])
        except:
            pass
        try:
            args = ['node', 'load_override.js', '-d', f'{write_dir}/{hostname}', archive_url]
            if decider:
                args.append('-o')
            if interact:
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
        f = open(f'{write_dir}/{hostname}/log.log', 'w+')
        f.write(output)
        f.close()
        print('Till Now:', time.time()-start)

def run_load_override_multiproc(num_workers=8, decider=False, interact=False, load_all=False):
    def start_worker(worker_id):
        subprocess.call(f'. /x/jingyz/pywb/env/bin/activate && wayback -p {15000+worker_id} > /dev/null 2>&1', shell=True, cwd=f'{HOME}/fidelity-files/')

    def worker_load_override(data, worker_id):
        def replace_port(url, port):
            us = urlsplit(url)
            hostname = us.hostname.split(':')[0]
            us = us._replace(netloc=f'{HOSTNAME}:{port}')
            return urlunsplit(us)

        start = time.time()
        for i, datum in enumerate(data):
            hostname, archive_url = datum['hostname'], datum['archive_url']
            print(worker_id, i, archive_url)
            archive_url = replace_port(archive_url, 15000+worker_id)
            # Try removing the directory (it is fine the if the directory does not exist)
            try:
                subprocess.call(['rm', '-rf', f'{write_dir}/{hostname}'])
            except:
                pass
            try:
                if load_all:
                    args = ['node', 'load_override_all.js', 
                        '-d', f'{write_dir}/{hostname}', 
                        '-c', f'{HOME}/chrome_data/load_override_{MACHINE}_{worker_id}',
                        archive_url]
                else:
                    args = ['node', 'load_override.js', 
                            '-d', f'{write_dir}/{hostname}', 
                            '-c', f'{HOME}/chrome_data/load_override_{MACHINE}_{worker_id}',
                            archive_url]
                if decider:
                    args.append(f'-o {worker_id}')
                if interact:
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
            f = open(f'{write_dir}/{hostname}/log.log', 'w+')
            f.write(output)
            f.close()
            print('Till Now:', time.time()-start)

    for i in range(num_workers):
        subprocess.call(['rm', '-rf', f'{HOME}/chrome_data/load_override_{MACHINE}_{i}'])
        subprocess.call(['cp', '-r', f'{HOME}/chrome_data/base', f'{HOME}/chrome_data/load_override_{MACHINE}_{i}'])
    torun_data = []
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            print(f'{hostname} already processed')
            continue
        torun_data.append(datum)
    
    waybacks = []
    for i in range(num_workers):
        waybacks.append(Thread(target=start_worker, args=(i,)))
        waybacks[-1].start()
    time.sleep(5)
    
    pools = []
    for i in range(num_workers):
        data_slice = torun_data[i::num_workers]
        pools.append(Thread(target=worker_load_override, args=(data_slice, i)))
        pools[-1].start()
    for p in pools:
        p.join()
    print("Finished all")
    

def count_results(strict=True):
    count = {}
    total = 0
    def decide(initial_elements, initial_writes, final_writes, final_elements):
        """
        1. More writes
        2. Same writes no missing elements
        """
        if len(initial_writes["rawWrites"]) < len(final_writes["rawWrites"]):
            return True
        elif len(initial_writes["rawWrites"]) == len(final_writes["rawWrites"]):
            return len(initial_elements) <= len(final_elements)
        return False
    def get_stage_key(stage):
        """Load first, followed by interaction_0, 1, ..."""
        stage = stage.split('_')
        if len(stage) == 1:
            return -1
        else:
            return int(stage[1])
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            results = json.load(open(f'{write_dir}/{hostname}/results.json', 'r'))
            total += 1
            any_fixed = False
            results = sorted(list(results.items()), key=lambda x: get_stage_key(x[0]))
            for stage, result in results:
                if result['fixedIdx'] == -1:
                    continue
                any_fixed = stage
                if stage == 'extraInteraction':
                    result['fixedIdx'] = 0
                if not strict:
                    count[hostname] = f"{stage}_{result['fixedIdx']}"
                else:
                    idx = result['fixedIdx']
                    initial_writes = json.load(open(f'{write_dir}/{hostname}/{stage}_initial_writes.json', 'r'))
                    initial_elements = json.load(open(f'{write_dir}/{hostname}/{stage}_initial_elements.json', 'r'))
                    final_writes = json.load(open(f'{write_dir}/{hostname}/{stage}_exception_{idx}_writes.json', 'r'))
                    final_elements = json.load(open(f'{write_dir}/{hostname}/{stage}_exception_{idx}_elements.json', 'r'))
                    if decide(initial_elements, initial_writes, final_writes, final_elements):
                        count[hostname] = f"{stage}_{result['fixedIdx']}"
                    else:
                        continue
                print(hostname, stage, result['fixedIdx'])
                break
            if not any_fixed:
                print(hostname, '-1')
        else:
            print(hostname, 'No result log')
    print(total, len(count))
    json.dump(count, open('fixed_count.json', 'w+'), indent=2)

def correlate_labels():
    labels = json.load(open('../datacollect/ground-truth/gt_diff.json'))
    labels = {l['hostname']: l['diff'] for l in labels}
    data_dict = {d['hostname']: d for d in data}
    fixed = json.load(open('fixed_count.json', 'r'))
    table = {'tp': [], 'fp': [], 'tn': [], 'fn': []}
    def is_working_fix(f):
        working_fix = ['interaction', 'nw']
        for wf in working_fix:
            if wf in f.lower():
                return True
        return False
    for hostname, diff in labels.items():
        if hostname not in data_dict or not os.path.exists(f'{write_dir}/{hostname}/results.json'):
            continue
        if diff:
            if hostname in fixed:
                table['tp'].append(hostname)
            else:
                table['fn'].append(hostname)
        else:
            if hostname in fixed:
                if not is_working_fix(fixed[hostname]):
                    table['fp'].append(hostname)
                else:
                    labels[hostname] = True
                    table['tp'].append(hostname)
            else:
                table['tn'].append(hostname)
    print({k: len(v) for k, v in table.items()})
    labels = {k: v for k, v in labels.items() if k in table['tp'] + table['fp'] + table['tn'] + table['fn']}
    json.dump(labels, open('gt_diff.json', 'w+'), indent=2)
    json.dump(table, open('ground_truth_results.json', 'w+'), indent=2)

# run_load_override(decider=False, interact=True)
# run_load_override_multiproc(decider=False, interact=True, num_workers=16)

count_results(strict=True)
# correlate_labels()


# write_dir = 'writes_performance_opt'
# write_dir = 'writes_performance_raw'
# run_load_override_multiproc(num_workers=8, decider=False, interact=True, load_all=False)
# count_results(strict=True)