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
    def __init__(self, write: dict):
        self.wid = write['wid']
        self.method = write['method']
        self.xpath = write['xpath']
        self.args = write['args']
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

    def __hash__(self):
        if self._hash:
            return self._hash
        target = _tag_from_xpath(self.xpath)
        args = []
        for arg in self.args:
            args += _tag_from_arg(arg)
        sig = [target] + args + [self.method]
        sig = tuple([tuple(s) if isinstance(s, list) else s for s in sig])
        self._hash = hash(sig)
        return self._hash
    
    def __repr__(self) -> str:
        return f"JSWrite({self.wid}, {self.xpath}, {self.method}, {[_tag_from_arg(a) for a in self.args]})"

    def __str__(self) -> str:
        return self.__repr__()