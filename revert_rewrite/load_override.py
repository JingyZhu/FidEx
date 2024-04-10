"""
Auto run load_wayback.js
Read metadata that including archive URLs, and run load_wayback.js accordingly
"""
import json
import subprocess
import os
import time

input_file = 'ground_truth_200.json'
write_dir = 'writes'
data = json.load(open(f'inputs/{input_file}', 'r'))

def run_load_override(decider=False, interact=False):
    start = time.time()
    for i, datum in enumerate(data):
        hostname, archive_url = datum['hostname'], datum['archive_url']
        print(i, archive_url)
        if os.path.exists(f'writes/{hostname}/results.json'):
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
        f = open(f'writes/{hostname}/log.log', 'w+')
        f.write(output)
        f.close()
        print('Till Now:', time.time()-start)

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
    labels = json.load(open('inputs/ground_truth_200.json', 'r'))
    labels = {l['hostname']: l['diff'] for l in labels}
    fixed = json.load(open('fixed_count.json', 'r'))
    table = {'tp': [], 'fp': [], 'tn': [], 'fn': []}
    for hostname, diff in labels.items():
        if diff:
            if hostname in fixed:
                table['tp'].append(hostname)
            else:
                table['fn'].append(hostname)
        else:
            if hostname in fixed:
                if 'interaction' not in fixed[hostname]:
                    table['fp'].append(hostname)
                else:
                    table['tp'].append(hostname)
            else:
                table['tn'].append(hostname)
    print({k: len(v) for k, v in table.items()})
    json.dump(table, open('ground_truth_results_new.json', 'w+'), indent=2)

# run_load_override(decider=False, interact=True)
# count_results(strict=True)
correlate_labels()