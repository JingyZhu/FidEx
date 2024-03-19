"""
Auto run load_wayback.js
Read metadata that including archive URLs, and run load_wayback.js accordingly
"""
import json
import subprocess
import os
import time

input_file = 'second_all_sampled_200.json'
write_dir = 'writes'
data = json.load(open(input_file, 'r'))

def run_load_override(decider=False):
    start = time.time()
    for i, datum in enumerate(data):
        hostname, archive_url = datum['hostname'], datum['archive_url']
        print(i, archive_url)
        if os.path.exists(f'writes/{hostname}/result_log.json'):
            print(f'{hostname} already processed')
            continue
        # Try removing the directory (it is fine the if the directory does not exist)
        try:
            subprocess.call(['rm', '-rf', f'writes/{hostname}'])
        except:
            pass
        try:
            args = ['node', 'load_override.js', '-d', f'writes/{hostname}', archive_url]
            if decider:
                args.append('-o')
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
        f = open(f'writes/{hostname}/log.log', 'w+')
        f.write(output)
        f.close()
        print('Till Now:', time.time()-start)

def count_results(strict=True):
    count = []
    total = 0
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'{write_dir}/{hostname}/results.json'):
            result = json.load(open(f'{write_dir}/{hostname}/results.json', 'r'))
            total += 1
            print(hostname, result['fixedIdx'])
            if result['fixedIdx'] == -1:
                continue
            if not strict:
                count.append(hostname)
            else:
                idx = result['fixedIdx']
                initial_writes = json.load(open(f'{write_dir}/{hostname}/initial_writes.json', 'r'))
                final_writes = json.load(open(f'{write_dir}/{hostname}/exception_{idx}_writes.json', 'r'))
                if len(initial_writes["rawWrites"]) <= len(final_writes["rawWrites"]):
                    count.append(hostname)
        else:
            print(hostname, 'No result log')
    print(total, len(count))
    json.dump(count, open('fixed_count.json', 'w+'), indent=2)

run_load_override(decider=False)
# count_results(strict=True)