from bs4 import BeautifulSoup
import functools
import json
from fidex.utils import execution, common

def _tag_from_arg(args):
    if not isinstance(args, list):
        args = [args]
    tags = []
    for arg in args:
        if 'xpath' in arg:
            tags.append(common.tagname_from_xpath(arg['xpath']))
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
    def __init__(self, write: dict, stack: list = None, node_map: dict = None):
        self.wid = write['wid']
        self.method = write['method']
        self.xpath = write['xpath']
        self.args = write['args']
        self.currentDS = write.get('currentDS', {})
        self.stack = execution.Stack(stack) if stack else None
        self._effective = write.get('effective', False)
        self.write = write
        self.node_map = node_map or {}
        self._hash = None
        
    def _img_set_src(self):
        """If the write is setting src of img, it is always effective"""
        target_name = common.tagname_from_xpath(self.xpath)
        if target_name not in ['img']:
            return False
        if self.method in ['set:src']:
            return True
        if self.method in ['setAttribute']:
            first_arg = self.args[0]
            if first_arg.get('html', '') in ['src']:
                return True
        return False

    def _write_to_text(self) -> "bool":
        """If the write is writing to text node, it is always effective"""
        if self.method == 'set:textContent':
            return True
        for arg in self.args:
            if not isinstance(arg, dict):
                continue
            if arg.get('html', '') in ['#text']:
                return True
        return False
    
    @functools.cached_property
    def effective(self) -> "bool":
        """
        Filter out effective writes
        Combine the hint from the dict and other factors
        """
        # setTextContent should always be effective on the text children
        if self._effective:
            return True
        if self._write_to_text():
            return True
        if self._img_set_src():
            return True
        # Set html has more chance to be effective 
        if self.method in ['insertAdjacentHTML', 'set:innerHTML']:
            return True
        return False
    
    def _adjacent_nodes(self, html=None) -> list:
        """Proceess the adjacent related operations looking for related path
        Currently, it is not 100% accurate, since only one actual child (and its descendants) will be affected, but we're considering all children
        
        Args:
            html (str): the html (if any) that is being inserted
        """
        first_arg = self.args[0].get('html', '')
        related_xpaths = []
        if first_arg not in ['beforebegin', 'afterend', 'beforeend', 'afterbegin']:
            return related_xpaths
        self_node = self.node_map.get(self.xpath)
        if first_arg in ['afterbegin', 'beforeend']:
            self_node = self.node_map.get(self.xpath)
            if self_node:
                related_xpaths.append(self.xpath)
                related_xpaths += [n.xpath for n in self_node.descendants() if html is None or n.tagname in html]
            return related_xpaths
        if first_arg == 'beforebegin':
            related_xpaths.append(self.xpath)
            prev_siblings = self_node.prev_siblings()
            for p_sib in prev_siblings:
                related_xpaths.append(p_sib.xpath)
                related_xpaths += [n.xpath for n in p_sib.descendants() if html is None or n.tagname in html]
            return related_xpaths
        if first_arg == 'afterend':
            related_xpaths.append(self.xpath)
            next_siblings = self_node.next_siblings()
            for n_sib in next_siblings:
                related_xpaths.append(n_sib.xpath)
                related_xpaths += [n.xpath for n in n_sib.descendants() if html is None or n.tagname in html]
            return related_xpaths

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
        if self.effective:
            xpaths.append(self.xpath + '/#text[1]')
        # * For set:innerHTML, consider all descendants as associated
        if self.method == 'set:innerHTML':
            self_node = self.node_map.get(self.xpath)
            args_0 = self.args[0] if isinstance(self.args[0], dict) else {}
            html = args_0.get('html', '')
            if self_node:
                xpaths += [n.xpath for n in self_node.descendants() if n.tagname in html]
        # * For insertAdjacentHTML, consider prev sibling / next sibling or children as associated
        if self.method == 'insertAdjacentHTML':
            html = self.args[1].get('html', '')
            related_xpaths = self._adjacent_nodes(html)
            xpaths += related_xpaths
        return list(set(xpaths))
    
    @functools.cached_property
    def serialized_stack(self) -> "tuple(tuple)":
        serialized_stack = self.stack.serialized[0]
        return tuple([tuple([s.functionName]) for s in serialized_stack])
    
    @functools.cached_property
    def serialized_stack_async(self) -> "tuple(tuple)":
        serialized_stack = []
        for async_stack in self.stack.serialized:
            serialized_stack += [tuple([s.functionName]) for s in async_stack]
        return tuple(serialized_stack)

    @functools.cached_property
    def scripts(self) -> "set[str]":
        return self.stack.scripts
    
    @functools.cached_property
    def plain_form(self) -> "tuple":
        args_strs = []
        for arg in self.args:
            args_strs.append(json.dumps(arg, sort_keys=True))
        return (self.method, self.xpath, tuple(args_strs))
    
    def _hash_tuple(self):
        target = common.tagname_from_xpath(self.xpath)
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