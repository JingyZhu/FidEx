from bs4 import BeautifulSoup
import functools

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

class JSWrite:
    def __init__(self, write: dict, stack: list = None):
        self.wid = write['wid']
        self.method = write['method']
        self.xpath = write['xpath']
        self.args = write['args']
        self.effective = write['effective']
        self.stack = stack
        self._hash = None

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
            arg = [arg] if not isinstance(arg, list) else arg
            for a in arg:
                if a['html'] in ['#comment']:
                    continue
                if 'xpath' in a:
                    xpaths.append(a['xpath'])
        return xpaths
    
    @functools.cached_property
    def serialized_stack(self) -> "tuple(tuple)":
        all_frames = []
        for call_frames in self.stack[:1]:
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                all_frames.append((frame['functionName'], frame['url'], frame['lineNumber'], frame['columnNumber']))
        return tuple(all_frames)
    
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
        self._hash = hash(self._hash_tuple())
        return self._hash

    def __eq__(self, other):
        return self.__hash__() == other.__hash__()
    
    def __repr__(self) -> str:
        return f"JSWrite({self.wid}, {self._hash_tuple()})"

    def __str__(self) -> str:
        return self.__repr__()