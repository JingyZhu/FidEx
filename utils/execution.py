"""Python library for parsing execution traces dumped by nodeJS"""
import functools
import sys
import esprima
sys.setrecursionlimit(3000)

# Python implementation of js-parse for abling to multiprocess
class ASTNode:
    def __init__(self, node, info, scopes=None):
        self.node = node
        self.type = node.type
        self.start = node.range[0]
        self.end = node.range[1]
        self.start_rowcol = {'line': node.loc.start.line, 'column': node.loc.start.column}
        self.end_rowcol = {'line': node.loc.end.line, 'column': node.loc.end.column}
        self.info = info
        self.text = info.get('text', '')
        self.children = []
        self.parent = None
        self._hash = None
        self.scopes = [] if scopes is None else scopes.copy()
        self.keywords = {
            'window',
            'contentWindow',
            'postMessage',
            'document',
            'domain',
            'isSameNode',
            'call',
            'value',
        }
    
    def add_child(self, child):
        self.children.append(child)
        child.parent = self
    
    def find_path(self, pos):
        """
        Args:
            pos: int - position in the text
        """
        cur_node = self
        path = []
        found = True
        while found:
            found = False
            for idx, child in enumerate(cur_node.children):
                if child.start <= pos < child.end:
                    path.append({'idx': idx, 'node': child})
                    cur_node = child
                    found = True
                    break
        # TODO: Might need to handle IIFE cases here
        return path

    def find_pos(self, path):
        cur_node = self
        for step in path:
            # TODO: Might need to handle IIFE cases here
            cur_node = cur_node.children[step['idx']]
        return {'start': cur_node.start, 'end': cur_node.end}

    def find_child(self, pos) -> "ASTNode":
        path = self.find_path(pos)
        return path[-1]['node']
    
    def same_scope(self, other):
        if len(self.scopes) != len(other.scopes):
            return False
        for s1, s2 in zip(self.scopes, other.scopes):
            if s1 != s2:
                return False
        return True

    def __str__(self):
        return f'type: {self.type} '           \
            #  + f'Info: {self.info}'            \
            #  + f'Start: {self.start_rowcol} '  \
            #  + f'End: {self.end_rowcol} '

    def __repr__(self):
        return self.__str__()
    
    def print_all(self, depth=0, index=0):
        print('--'*(depth+1), index, self)
        child_index = 0
        for child in self.children:
            child.print_all(depth+1, child_index)
            child_index += 1
    
    def filter_wayback(self):
        # TODO: Implement this function
        pass

    def __hash__(self) -> int:
        """Hash the node based on merkle tree method"""
        if self._hash:
            return self._hash
        child_hashes = hash(tuple(self.children))
        hash_list = [self.type]
        if self.type == 'Identifier':
            if self.node.name in self.keywords:
                hash_list.append(self.node.name)
        self_hash = hash(tuple(hash_list))
        self._hash = hash((self_hash, child_hashes))
        return self._hash

    def __iter__(self):
        """Iterate self and children"""
        yield self
        for child in self.children:
            yield from child
    
    @staticmethod
    def linecol_2_pos(line, col, text):
        """Transform line column to position"""
        lines = text.split('\n')
        pos = 0
        for i in range(len(lines)):
            if i == line:
                pos += col
                break
            pos += len(lines[i]) + 1
        return pos


class JSTextParser:
    def __init__(self, js_file):
        """
        Example usage:
          program = "document.documentElement.isSameNode(documentElement)"
          parser = JSTextParser(program)
          ast_node = parser.get_ast_node()
        """
        self.source_file = esprima.parseScript(js_file, {'loc': True, 'range': True, 'tolerant': True})
        self.text = js_file
        self.ast_node = None

    def get_text(self, start, end):
        return self.text[start:end]

    def collect_node_info(self, node):
        full_text = self.get_text(node.range[0], node.range[1])
        info = {
            'text': full_text,
        }
        return info

    def is_node(self, node):
        return isinstance(node, esprima.nodes.Node)

    def get_ast_node(self, archive=False):
        if self.ast_node:
            return self.ast_node
        scopes = []
        def traverse_helper(node, depth=0):
            info = self.collect_node_info(node)
            ast_node = ASTNode(node, info, scopes)
            if ast_node.type in ['FunctionDeclaration',
                                 'FunctionExpression', 
                                 'BlockStatement',
                                 'ArrowFunctionExpression', 
                                 'Program',]:
                scopes.append(ast_node)
            for key, value in node.items():
                if key in ['type', 'range', 'loc']:
                    continue
                if not isinstance(value, list):
                    value = [value]
                for child in value:
                    if not self.is_node(child):
                        continue
                    child_node = traverse_helper(child, depth + 1)
                    ast_node.add_child(child_node)
            if len(scopes) and scopes[-1] == ast_node:
                scopes.pop()
            return ast_node

        self.ast_node = traverse_helper(self.source_file)
        if archive:
            self.ast_node = self.ast_node.filter_wayback()
        return self.ast_node


class Stack:
    def __init__(self, stack: list):
        """
        stack: 
          [
            {
              callFrame: [
                {
                  url: str,
                  functionName: str,
                  lineNumber: int,
                  columnNumber: int
                }
              ],
              description: str
            }
          ]
        """
        self.stack = stack
    
    @functools.cached_property
    def serialized(self) -> "tuple(tuple)":
        all_frames = []
        for call_frames in self.stack[:1]:
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                if 'wombat.js' not in frame['url']:
                    # all_frames.append((frame['functionName'], frame['url'], frame['lineNumber'], frame['columnNumber']))
                    all_frames.append((frame['functionName']))
        return tuple(all_frames)

    @functools.cached_property
    def scripts(self) -> "set[str]":
        """
        Get the scripts that are related to this write
        """
        scripts = set()
        for call_frames in self.stack:
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                if 'wombat.js' not in frame['url']:
                    scripts.add(frame['url'])
        return scripts