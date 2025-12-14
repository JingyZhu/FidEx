import functools
import re
import json
import hashlib

from fidex.utils import execution, common, url_utils

class JSException:
    def __init__(self, excep: dict):
        self.ts = excep['ts']
        self.description = excep.get('description', '')
        self.scriptURL = excep.get('scriptURL')
        self.line = excep['line']
        self.column = excep['column']
        self.stack = execution.Stack(excep.get('stack')) if excep.get('stack') else None
        self._hash = None
    
    def __reduce__(self):
        excep = {
            'ts': self.ts,
            'description': self.description,
            'scriptURL': self.scriptURL,
            'line': self.line,
            'column': self.column,
            'stack': self.stack.stack if self.stack else None,
        }
        return (self.__class__, (excep,))
    
    @functools.cached_property
    def is_syntax_error(self):
        return re.compile('^SyntaxError:').match(self.description) is not None
    
    @functools.cached_property
    def is_reference_error(self):
        return re.compile('^ReferenceError:').match(self.description) is not None

    @functools.cached_property
    def has_stack(self):
        return self.stack is not None
    
    def __hash__(self):
        if self._hash:
            return self._hash
        self._hash = hash((self.description, self.scriptURL, self.line, self.column))
        return self._hash
    
    def __repr__(self):
        return f"{self.description} at {self.scriptURL}:{self.line}:{self.column}"
    
    def to_dict(self):
        return {
            'description': self.description,
            'scriptURL': self.scriptURL,
            'line': self.line,
            'column': self.column,
        }

class JSExcepSelector:
    """Generate exception selector from dict"""
    def __init__(self, excep: dict):
        self.description = excep.get('description', '')
        if url_utils.is_archive(excep.get('scriptURL')):
            self.scriptURL = url_utils.filter_archive(excep.get('scriptURL'))
        else:
            self.scriptURL = excep.get('scriptURL')
    
    def match(self, excep: JSException):
        return self.description == excep.description and self.scriptURL == url_utils.filter_archive(excep.scriptURL)

    def __hash__(self):
        return hash(self.to_tuple())

    def md5(self, digit=10):
        return hashlib.md5(','.join([self.scriptURL, self.description]).encode()).hexdigest()[:digit]
    
    def to_tuple(self):
        return (self.description, self.scriptURL)

    def to_dict(self):
        return {
            'description': self.description,
            'scriptURL': self.scriptURL,
        }

def read_exceptions(dirr, base, stage):
    exceptions = json.load(open(f"{dirr}/{base}_exception_failfetch.json"))
    exceptions = [e for e in exceptions if common.stage_nolater(e['stage'], stage)]
    return [JSException(e) for exceps in exceptions for e in exceps['exceptions']]