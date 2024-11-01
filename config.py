import json
import os, sys
import time
from functools import cached_property

_FILEDIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(_FILEDIR))

class Config:
    def __init__(self, path):
        self.path = path
        self.config = json.load(open(path))

    @cached_property
    def host(self):
        return self.config.get('host')

    @cached_property
    def host_proxy(self):
        return self.config.get('host_proxy')
    
    @cached_property
    def host_proxy_test(self):
        return self.config.get('host_proxy_test')
    
    @cached_property
    def pywb_env(self):
        return self.config.get('pywb_env', ':')
    
    @cached_property
    def collection(self):
        return self.config.get('collection')
    
    @property
    def ts(self):
        """Return a 12-digit timestamp by YYYYMMDDHHMM"""
        return time.strftime('%Y%m%d%H%M')

config_path = os.path.join(_FILEDIR, 'config.json') if not os.environ.get('FIDEX_CONFIG') else os.environ.get('FIDEX_CONFIG')
CONFIG = Config(config_path)