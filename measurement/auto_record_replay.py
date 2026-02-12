import json
import os
import random
from collections import defaultdict
from subprocess import call
import argparse

from fidex.record_replay import autorun
# from fidex.utils import logger
from fidex.config import CONFIG
from fidex.utils import url_utils
import utils

parser = argparse.ArgumentParser(description='Flags for the script')
parser.add_argument('--input_file', type=str, help='Input file to run URLs on')

args = parser.parse_args()
input_file = args.input_file or 'test_urls.json'

timestamp = '202412010008'
arguments = ['-s', '--scroll', '-t', '-w', '-e', '--headless', '-i', '20']
# arguments = ['-s', '--scroll', '-t', '-i', '20', '--manual']


HOME = os.path.expanduser("~")
chrome_data_dir = CONFIG.chrome_data_dir

if os.environ.get('SEPARATE_COLLECTION') is not None:
    CONFIG.separate_collection = os.environ['SEPARATE_COLLECTION']
hostname = utils.get_hostname()

# * 1 Collect URLs to run on this machine
# all_metadata = utils.get_metadata(in_hostname=True)  # Not used, commented out to avoid FileNotFoundError
input_urls = json.load(open(input_file, 'r'))
urls = [obj['url'] for obj in input_urls]
print("Total URLs:", len(urls), flush=True)

# * 2 Setup stage
STAGE = os.environ.get('STAGE')
assert STAGE in ['record', 'proxy', 'archive'], f"STAGE must be one of 'record', 'proxy', 'archive', got {STAGE}"
file_prefix = 'test'
record_live = False
replay_archive = False
replay_proxy = False
if STAGE == 'record':
    file_prefix = 'live'
    record_live = True
if STAGE == 'proxy':
    file_prefix = 'proxy'
    replay_proxy = True
if STAGE == 'archive':
    file_prefix = 'archive'
    replay_archive = True
# * 3. Run 
# # For test
# CUT=1
# urls = urls[:CUT]
autorun.record_replay_all_urls_multi(urls, num_workers=1,
                                    file_prefix=file_prefix,
                                    file_suffix=None,
                                    chrome_data_dir=chrome_data_dir,
                                    record_live=record_live,
                                    replay_archive=replay_archive,
                                    replay_proxy=replay_proxy,
                                    replay_ts=timestamp,
                                    replay_proxy_ts=timestamp,
                                    arguments=arguments)
