import functools
import re

from fidex.utils import execution

class JSException:
    def __init__(self, excep: dict):
        self.ts = excep['ts']
        self.description = excep['description']
        self.scriptURL = excep.get('scriptURL')
        self.line = excep['line']
        self.column = excep['column']
        self.stack = execution.Stack(excep.get('stack')) if excep.get('stack') else None
        self._hash = None
    
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