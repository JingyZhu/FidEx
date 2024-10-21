import json
import os, sys
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

CONFIG = Config(os.path.join(_FILEDIR, 'config.json'))