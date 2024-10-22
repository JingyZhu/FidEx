import functools
import re
import json

from fidex.utils import execution

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

def stage_nolater(s1, s2):
    """s1 is nolater than s2"""
    if s1 == 'onload':
        return True
    if s2 == 'onload':
        return False
    s1 = s1.replace('interaction_', '')
    s2 = s2.replace('interaction_', '')
    return int(s1) <= int(s2)

def read_exceptions(dirr, base, stage):
    exceptions = json.load(open(f"{dirr}/{base}_exception_failfetch.json"))
    exceptions = [e for e in exceptions if stage_nolater(stage, e['stage'])]
    return [JSException(e) for exceps in exceptions for e in exceps['exceptions']]