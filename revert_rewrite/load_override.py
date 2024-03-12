"""
Auto run load_wayback.js
Read metadata that including archive URLs, and run load_wayback.js accordingly
"""
import json
import subprocess
import os

input_file = 'second_all_sampled_200.json'
data = json.load(open(input_file, 'r'))

def run_load_override():
    for i, datum in enumerate(data):
        hostname, archive_url = datum['hostname'], datum['archive_url']
        print(i, archive_url)
        # Try removing the directory (it is fine the if the directory does not exist)
        try:
            subprocess.call(['rm', '-rf', f'writes/{hostname}'])
        except:
            pass
        try:
            process = subprocess.Popen(['node', 'load_override.js', '-d', f'writes/{hostname}', archive_url], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
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

def count_results():
    count = []
    for datum in data:
        hostname = datum['hostname']
        if os.path.exists(f'writes/{hostname}/result_log.json'):
            result = json.load(open(f'writes/{hostname}/result_log.json', 'r'))
            print(hostname, result['fixedIdx'])
            if result['fixedIdx'] != -1:
                count.append(hostname)
        else:
            print(hostname, 'No result log')
    print(len(count))
    json.dump(count, open('fixed_count.json', 'w+'), indent=2)

run_load_override()
# count_results()