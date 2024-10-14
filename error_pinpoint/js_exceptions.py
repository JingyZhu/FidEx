import functools
import re

class JSException:
    def __init__(self, excep: dict):
        self.ts = excep['ts']
        self.description = excep['description']
        self.scriptURL = excep['scriptURL']
        self.line = excep['line']
        self.column = excep['column']
        self._hash = None
    
    @functools.cached_property
    def is_syntax_error(self):
        return re.compile('^SyntaxError:').match(self.description) is not None
    
    def __hash__(self):
        if self._hash:
            return self._hash
        self._hash = hash((self.description, self.scriptURL, self.line, self.column))
        return self._hash
    
    def __repr__(self):
        return f"{self.description} at {self.scriptURL}:{self.line}:{self.column}"