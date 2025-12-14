"""
Upload crawled warc files and screenshots to group servers
Remove the files after uploading
"""
import os
import re
import glob
import paramiko
import json
import time
import socket, threading
from collections import defaultdict
from scp import SCPClient
from subprocess import check_call, call, check_output, Popen, DEVNULL, PIPE
from concurrent import futures

from fidex.config import CONFIG
from fidex.utils import common

# SERVER is from the .ssh/config file
ssh_config = paramiko.SSHConfig()
ssh_alias = 'pistons'
# with open(os.path.expanduser('~/.ssh/config')) as f:
#     ssh_config.parse(f)
ARCHIVEDIR = CONFIG.archive_dir
PYWBENV = CONFIG.pywb_env

class PYWBServer:
    def __init__(self, proxy=False, client_replay=False, archive='test'):
        self.port = None
        self.server = None
        self.thread = None
        self.archive = archive
        self.proxy = proxy
        self.client_replay = client_replay

    def _start_server(self):
        if self.proxy:
            cmd = f'{PYWBENV} && cd {ARCHIVEDIR} && wayback --proxy {self.archive} -p {self.port} > /dev/null 2>&1 & echo $!'
        elif self.client_replay:
            cmd = f'{PYWBENV} && cd {ARCHIVEDIR} && PYWB_CONFIG_FILE=config_client.yaml wayback -p {self.port} > /dev/null 2>&1 & echo $!'
        else:
            cmd = f'{PYWBENV} && cd {ARCHIVEDIR} && wayback -p {self.port} > /dev/null 2>&1 & echo $!'
        server = Popen(cmd, shell=True, stdout=PIPE)
        self.server = server.communicate()[0].decode().strip()
        print(f"Started pywb server port:{self.port} process:{self.server}")

    def start(self) -> int:
        # Get free port
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('localhost', 0))
        self.port = s.getsockname()[1]
        s.close()
        self.thread = threading.Thread(target=self._start_server)
        self.thread.daemon = True
        self.thread.start()
        return self.port
    
    def stop(self):
        if self.server:
            print(f"Killing server {self.port}")
            call(f"kill -9 {self.server} > /dev/null 2>&1", shell=True)
            self.thread = None
            self.server = None
    
    def restart(self, archive=None):
        self.stop()
        if archive:
            self.archive = archive
        if not os.path.exists(f'{ARCHIVEDIR}/collections/{self.archive}'):
            call(f"{PYWBENV} && cd {ARCHIVEDIR} && wb-manager init {self.archive}", shell=True)
        self.thread = threading.Thread(target=self._start_server)
        self.thread.daemon = True
        self.thread.start()
        return True

    def __del__(self):
        self.stop()

class WBManager:
    def __init__(self, split=False, worker_id=None):
        self.split = split
        assert not split or worker_id is not None, "If split is True, worker_id should be provided"
        self.hostname = common.get_hostname()
        self.id = worker_id

    def collection(self, col_name):
        if not self.split:
            return col_name
        else:
            return f"{col_name}-{self.hostname}-{self.id}"
    
    @staticmethod
    def merge_collections(col_name):
        def rm_col(col):
            rm_col_cmd = f"cd {ARCHIVEDIR} && rm -rf collections/{col}"
            call(rm_col_cmd, shell=True)
        rm_col(col_name)
        sub_cols_cmd = f"{PYWBENV} && cd {ARCHIVEDIR} && wb-manager list | grep {col_name}"
        sub_cols = check_output(sub_cols_cmd, shell=True).decode().strip().split('\n')
        sub_cols = [s for s in sub_cols if re.search(rf"- {col_name}-.*-.*", s)]
        sub_cols = [s.split('- ')[1] for s in sub_cols]
        init_cmd = f"{PYWBENV} && cd {ARCHIVEDIR} && wb-manager init {col_name}"
        call(init_cmd, shell=True)
        for sub_col in sub_cols:
            mv_cmd = f"mv {ARCHIVEDIR}/collections/{sub_col}/archive/* {ARCHIVEDIR}/collections/{col_name}/archive/"
            call(mv_cmd, shell=True)
            rm_col(sub_col)
        reindex_cmd = f"{PYWBENV} && cd {ARCHIVEDIR} && wb-manager reindex {col_name}"
        call(reindex_cmd, shell=True)
        

class BaseManager:
    def __init__(self, wb_manager=None):
        self.wb_manager = wb_manager or WBManager()

    @staticmethod
    def escape(collection):
           return collection.replace('.', '_')


class SSHClientManager(BaseManager):
    def __init__(self, server=None, user=None, password=None, wb_manager=None):
        assert not server or (server and user and password), "If server provided, user and password should also be provided"
        if server is None:
            server = ssh_config.lookup(ssh_alias)['hostname']
            user = ssh_config.lookup(ssh_alias)['user']
            identity = ssh_config.lookup(ssh_alias)['identityfile']
        
        self.ssh_client = paramiko.SSHClient()
        self.ssh_client.load_system_host_keys()
        
        self.ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        if password:
            self.ssh_client.connect(server, username=user, password=password)
        else:
            self.ssh_client.connect(server, username=user, key_filename=identity)
        self.ssh_client.get_transport().set_keepalive(30)
        self.scp_client = SCPClient(self.ssh_client.get_transport())
        self.wb_manager = wb_manager or WBManager()


    def close(self):
        if self.scp_client:
            self.scp_client.close()

    def ssh_exec(self, cmd, check=True):
        stdin, stdout, stderr = self.ssh_client.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        stderr = stderr.read()
        if check and exit_status != 0:
            raise Exception(f"Exit status != 0: {exit_status}. stderr: {stderr.decode()}")
        return stdout.read(), stderr

    def scp_copy(self, local_path, remote_path):
        self.scp_client.put(local_path, remote_path, recursive=True)
    
    def _lock(self, col_name):
        lock_file = f"{ARCHIVEDIR}/collections/{col_name}/lock"
        # Try create lock if not exist
        self.ssh_exec(f"touch {lock_file}", check=False)
        count = 0
        while True:
            stdout, stderr = self.ssh_exec(f"ln {lock_file} {lock_file}.lock && echo 'locked' || echo 'waiting'", check=False)
            if stdout.decode().strip() == 'locked':
                break
            else:
                time.sleep(5)
                count += 1
                if count % 2 == 0:
                    # If waiting for too long, unlock and try again
                    self._unlock(col_name)

    def _unlock(self, col_name):
        lock_file = f"{ARCHIVEDIR}/collections/{col_name}/lock.lock"
        self.ssh_exec(f"rm -f {lock_file}", check=False)
        
    def upload_screenshot(self, screenshot_path, directory='default'):
        try:
            # Create directory if not exist on the remote server
            self.ssh_exec(f"mkdir -p {ARCHIVEDIR}/screenshots/{directory}")
            self.scp_copy(screenshot_path, f'{ARCHIVEDIR}/screenshots/{directory}')
            call(f"rm -rf {screenshot_path}", shell=True)
        except Exception as e:
            print("Exception on uploading screenshots", str(e))
    
    def get_metadata(self, col_name, directory):
        # TODO
        raise NotImplementedError

    def merge_metadata(self, col_name, directory, metadata):
        # TODO
        raise NotImplementedError

    def upload_write(self, write_path, directory='default'):
        try:
            # Create directory if not exist on the remote server
            self.ssh_exec(f"mkdir -p {ARCHIVEDIR}/writes/{directory}")
            self.scp_copy(write_path, f'{ARCHIVEDIR}/writes/{directory}')
            call(f"rm -rf {write_path}", shell=True)
        except Exception as e:
            print("Exception on uploading writes", str(e))
    
    def remove_write(self, directory):
        try:
            self.ssh_exec(f"rm -rf {ARCHIVEDIR}/writes/{directory}")
        except Exception as e:
            print("Exception on removing writes", str(e))

    def upload_warc(self, warc_path, col_name, directory='default', lock=True):
        col_name = self.wb_manager.collection(col_name)
        try:
            self.ssh_exec(f"mkdir -p {ARCHIVEDIR}/warcs/{directory}")
            self.scp_copy(warc_path, f'{ARCHIVEDIR}/warcs/{directory}')
            warc_name = warc_path.split('/')[-1]
            command_prefix = f"{PYWBENV} && cd {ARCHIVEDIR}"
            command_init = f"test -d {ARCHIVEDIR}/collections/{col_name} || ({command_prefix} && wb-manager init {col_name}) && touch {ARCHIVEDIR}/collections/{col_name}/lock"
            self.ssh_exec(command_init, check=False)

            # First keep waiting until  gather lock
            if lock:
                self._lock(col_name)

            command_add = f"{command_prefix} && wb-manager add {col_name} {ARCHIVEDIR}/warcs/{directory}/{warc_name}"
            self.ssh_exec(command_add)
            call(f"rm -rf {warc_path}", shell=True)

            # Then unlock
            if lock:
                self._unlock(col_name)
        except Exception as e:
            print("Exception on uploading warc", str(e))


class LocalUploadManager(BaseManager):
    def __init__(self, wb_manager=None):
        self.wb_manager = wb_manager

    def close(self):
        pass

    def _lock(self, col_name):
        lock_file = f"{ARCHIVEDIR}/collections/{col_name}/lock"
        # Try create lock if not exist
        call(f"touch {lock_file}", shell=True)
        count = 0
        while True:
            stdout = ''
            try:
                stdout = check_output(f"ln {lock_file} {lock_file}.lock && echo 'locked' || echo 'waiting'", shell=True, stderr=DEVNULL)
            except: pass
            if stdout and stdout.decode().strip() == 'locked':
                break
            else:
                time.sleep(5)
                count += 1
                if count % 2 == 0:
                    # If waiting for too long, unlock and try again
                    self._unlock(col_name)
    
    def _unlock(self, col_name):
        lock_file = f"{ARCHIVEDIR}/collections/{col_name}/lock.lock"
        call(f"rm -f {lock_file}", shell=True)

    def upload_screenshot(self, screenshot_path, directory='default'):
        try:
            os.makedirs(f'{ARCHIVEDIR}/screenshots/{directory}', exist_ok=True)
            check_call(f"mv -f {screenshot_path} {ARCHIVEDIR}/screenshots/{directory}", shell=True)
        except Exception as e:
            print("Exception on uploading screenshots", str(e))
    
    def upload_write(self, write_path, directory='default'):
        try:
            os.makedirs(f'{ARCHIVEDIR}/writes/{directory}', exist_ok=True)
            call(f"cp -r {write_path} {ARCHIVEDIR}/writes/{directory}", shell=True)
            call(f"rm -rf {write_path}", shell=True)
        except Exception as e:
            print("Exception on uploading writes", str(e))

    def remove_write(self, directory):
        try:
            call(f"rm -rf {ARCHIVEDIR}/writes/{directory}", shell=True)
        except Exception as e:
            print("Exception on removing writes", str(e))
    
    def get_metadata(self, col_name, directory):
        if os.path.exists(f'{ARCHIVEDIR}/writes/{col_name}/{directory}/metadata.json'):
            metadata = json.load(open(f'{ARCHIVEDIR}/writes/{col_name}/{directory}/metadata.json'))
        else:
            metadata = {}
        return metadata

    def merge_metadata(self, col_name, directory, metadata):
        full_metadata = {}
        if os.path.exists(f'{ARCHIVEDIR}/writes/{col_name}/{directory}/metadata.json'):
            full_metadata = json.load(open(f'{ARCHIVEDIR}/writes/{col_name}/{directory}/metadata.json'))
        else:
            os.makedirs(f'{ARCHIVEDIR}/writes/{col_name}/{directory}', exist_ok=True)
        return full_metadata

    def upload_warc(self, warc_path, col_name, directory='default', lock=True, mv_only=False):
        col_name = self.wb_manager.collection(col_name)
        try:
            os.makedirs(f'{ARCHIVEDIR}/warcs/{directory}', exist_ok=True)
            call(f"mv -f {warc_path} {ARCHIVEDIR}/warcs/{directory}", shell=True)
            if mv_only:
                return

            warc_name = warc_path.split('/')[-1]
            command_prefix = f"{PYWBENV} && cd {ARCHIVEDIR}"
            
            
            command_init = f"test -d {ARCHIVEDIR}/collections/{col_name} || ({command_prefix} && wb-manager init {col_name}) && touch {ARCHIVEDIR}/collections/{col_name}/lock"
            call(command_init, shell=True)

            if lock:
                self._lock(col_name)
            
            command_add = f"{command_prefix} && wb-manager add {col_name} {ARCHIVEDIR}/warcs/{directory}/{warc_name}"
            check_call(command_add, shell=True)
            call(f"rm -rf {warc_path}", shell=True)

            if lock:
                self._unlock(col_name)
        except Exception as e:
            print("Exception on uploading warc", str(e), flush=True)
    
    def remove_archive(self, col_name):
        call(f"rm -rf {ARCHIVEDIR}/collections/{col_name}", shell=True)

    def _upload_worker(self, warc_paths, col_name, lock, archive_name=""):
        print("Uploading warcs to archive", col_name, warc_paths, flush=True)
        try:
            command_prefix = f"{PYWBENV} && cd {ARCHIVEDIR}"
            command_init = f"test -d {ARCHIVEDIR}/collections/{col_name} || ({command_prefix} && wb-manager init {col_name}) && touch {ARCHIVEDIR}/collections/{col_name}/lock"
            call(command_init, shell=True)
            if lock:
                self._lock(col_name)
                
            for warc_path in warc_paths:
                call(f'cp -r {warc_path} {ARCHIVEDIR}/collections/{col_name}/archive/', shell=True)
            
            command_reindex = f"{command_prefix} && wb-manager reindex {col_name}"
            check_call(command_reindex, shell=True)
            if lock:
                self._unlock(col_name)
            return archive_name
        except Exception as e:
            print("Exception _upload_worker", str(e))
    
    def upload_warcs_to_archive(self, warc_paths_map, col_name, lock=True, separate_collection=False):
        """
        warc_paths_map ({str: [str]}): {archive_name: [warc paths]}. If separate_collection is True, each sublist will be treated as a separate collection.
        """
        finished = set()
        if not separate_collection:
            warc_paths = [w for warcs in warc_paths_map.values() for w in warcs] # Flatten the list
            self._upload_worker(warc_paths, col_name)
        else: # Create a separate collection for each warc
            with futures.ProcessPoolExecutor(max_workers=16) as executor:
                results = []
                count = 0 
                for archive_name, warcs in warc_paths_map.items():
                    col_name_sub = BaseManager.escape(f'{col_name}_{archive_name}')
                    count += 1
                    results.append(executor.submit(self._upload_worker, warcs, col_name_sub, lock, archive_name))
                while len(results) > 0:
                    try:
                        for result in futures.as_completed(results, timeout=10):
                            finished.add(result.result())
                            results.remove(result)
                    except Exception as e:
                        print("Exception upload_warcs_to_archive", str(e))
        return finished