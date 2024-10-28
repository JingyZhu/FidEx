from bs4 import BeautifulSoup
import functools
from fidex.utils import execution

def _tag_from_xpath(xpath):
    return xpath.split('/')[-1].split('[')[0]

def _tag_from_arg(args):
    if not isinstance(args, list):
        args = [args]
    tags = []
    for arg in args:
        if 'xpath' in arg:
            tags.append(_tag_from_xpath(arg['xpath']))
        else:
            html = BeautifulSoup(str(arg['html']), 'html.parser')
            tag = html.find()
            if tag:
                tags.append(tag.name)
            else:
                tags.append('text')
    return tags

def writes_stacks_match(writes_1: "List[JSWrite]", writes_2: "List[JSWrite]") -> "bool":
    """
    Check if the two writes have the same stack
    """
    writes_1_set = set([w.serialized_stack for w in writes_1])
    writes_2_set = set([w.serialized_stack for w in writes_2])
    if writes_1_set == writes_2_set:
        return True
    # Check unique stack is prefix or including any of the element in the other stack
    w1_unique = writes_1_set - writes_2_set
    for w1 in w1_unique:
        matched = False
        for w2 in writes_2_set:
            w1_is_prefix = len(w1) <= len(w2) and w1 == w2[:len(w1)]
            w1_includes = len(w1) > len(w2) and w1[:len(w2)] == w2
            if w1_is_prefix or w1_includes:
                matched = True
                break
        if not matched:
            return False
    w2_unique = writes_2_set - writes_1_set
    for w2 in w2_unique:
        matched = False
        for w1 in writes_1_set:
            w2_is_prefix = len(w2) <= len(w1) and w2 == w1[:len(w2)]
            w2_includes = len(w2) > len(w1) and w2[:len(w1)] == w1
            if w2_is_prefix or w2_includes:
                matched = True
                break
        if not matched:
            return False
    return True

class JSWrite:
    def __init__(self, write: dict, stack: list = None):
        self.wid = write['wid']
        self.method = write['method']
        self.xpath = write['xpath']
        self.args = write['args']
        self.currentDS = write.get('currentDS', {})
        self.stack = execution.Stack(stack) if stack else None
        self.write = write
        self._hash = None

    @staticmethod
    def effective(write: dict) -> "bool":
        """
        Filter out effective writes
        """
        # setTextContent should always be effective on the text children
        def _write_to_text(write):
            if write['method'] == 'set:textContent':
                return True
            for arg in write['args']:
                if not isinstance(arg, dict):
                    continue
                if arg['html'] in ['#text']:
                    return True
            return False
        
        def _img_set_src(write):
            target_name = _tag_from_xpath(write['xpath'])
            if target_name not in ['img']:
                return False
            if write['method'] in ['set:src']:
                return True
            if write['method'] in ['setAttribute']:
                first_arg = write.get('args', [{}])[0]
                if first_arg.get('html', '') in ['src']:
                    return True
            return False
        
        return write['effective']  \
                or _write_to_text(write) \
                or _img_set_src(write)

    def _write_to_text(self) -> "bool":
        if self.method == 'set:textContent':
            return True
        for arg in self.args:
            if not isinstance(arg, dict):
                continue
            if arg['html'] in ['#text']:
                return True
        return False
                
    @functools.cached_property
    def associated_xpaths(self) -> "list[str]":
        """
        Associate this JS write to related elements' xpaths
        Add:    1. Parent node append self
        Update: 1. Same node set attribute
                2. Parent node set HTML
        Remove: 1. Same node remove child
        
        Returns:
            list: list of xpaths that are associated with this write
        """
        xpaths = [self.xpath]
        for arg in self.args:
            arg_flat = []
            if not isinstance(arg, list):
                arg_flat.append(arg)
            for a in arg:
                if isinstance(a, dict):
                    arg_flat.append(a)
                elif isinstance(a, list):
                    arg_flat += a
            for a in arg_flat:
                if a['html'] in ['#comment']:
                    continue
                if 'xpath' in a:
                    xpaths.append(a['xpath'])
        if JSWrite.effective(self.write):
            xpaths.append(self.xpath + '/#text[1]')
        return xpaths
    
    @functools.cached_property
    def serialized_stack(self) -> "tuple(tuple)":
        serialized_stack = self.stack.serialized[0]
        return tuple([tuple([s.functionName]) for s in serialized_stack])

    @functools.cached_property
    def scripts(self) -> "set[str]":
        return self.stack.scripts
    
    def _hash_tuple(self):
        target = _tag_from_xpath(self.xpath)
        args = []
        for arg in self.args:
            args += _tag_from_arg(arg)
        sig = [target, self.method] + args
        return tuple([tuple(s) if isinstance(s, list) else s for s in sig])

    def __hash__(self):
        if self._hash:
            return self._hash
        # self._hash = hash(self._hash_tuple())
        self._hash = hash(self.serialized_stack)
        return self._hash

    def __eq__(self, other):
        return self.__hash__() == other.__hash__()
    
    def __repr__(self) -> str:
        return f"JSWrite({self.wid}, {self._hash_tuple()})"

    def __str__(self) -> str:
        return self.__repr__()
    
    def __reduce__(self):
        return (self.__class__, (self.write, self.stack.stack))