from fidex.config import CONFIG
from subprocess import call

call(f'rm -rf {CONFIG.archive_dir}/writes/*', shell=True)
call(f'rm -rf {CONFIG.archive_dir}/warcs/*', shell=True)
call(f'rm -rf {CONFIG.archive_dir}/collections/*', shell=True)