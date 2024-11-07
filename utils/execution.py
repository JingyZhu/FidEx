"""Python library for parsing execution traces dumped by nodeJS"""
import sys
import esprima
import re
import requests
from dataclasses import dataclass, asdict
from functools import cached_property
from fidex.config import CONFIG
from fidex.utils import url_utils, logger
import logging
sys.setrecursionlimit(3000)

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ALL_ASTS = {} # Cache for all the ASTs {url: ASTInfo}
ALL_SCRIPTS = {} # Cache for all the code {url: code}

@dataclass
class ASTInfo:
    ast: "ASTNode"
    parser: "JSTextParser"


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
            if s1.type != s2.type:
                return False
        return True
    
    @cached_property
    def within_loop(self):
        """Check if the node is within a loop"""
        cur_parent = self.parent
        while cur_parent:
            if cur_parent.type in ['ForStatement', 'WhileStatement', 'DoWhileStatement']:
                return True
            cur_parent = cur_parent.parent
        return False
    
    def after(self, other):
        def path_to_root(node):
            path = []
            cur, cur_parent = node, node.parent
            while cur_parent:
                idx = 0
                for idx, child in enumerate(cur_parent.children):
                    if child is cur:
                        break
                path.insert(0, idx)
                cur = cur.parent
                cur_parent = cur_parent.parent
            return path
        a_path_to_root = path_to_root(self)
        b_path_to_root = path_to_root(other)
        for i in range(min(len(a_path_to_root), len(b_path_to_root))):
            if a_path_to_root[i] != b_path_to_root[i]:
                return a_path_to_root[i] > b_path_to_root[i]
        return len(a_path_to_root) > len(b_path_to_root)

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
    
    def filter_archive(self):
        # * First, strip all the headers and block added by rewriting tools
        actual_root = self.children[2].children[9]
        actual_root.parent = None
        
        # * Second, traverse through the tree and skip all the nodes that follows the rewriting pattern
        def skip_node(node, skip):
            node.parent.children = [skip if c is node else c for c in node.parent.children]
            skip.parent = node.parent
        def choose_skip_node(node):
            node.scopes = [node.scopes[0]] + node.scopes[3:]
            # * Skip "_____WB$wombat$check$this$function_____(this)"
            if node.type == 'CallExpression' \
               and node.text.startswith('_____WB$wombat$check$this$function_____') \
               and len(node.info['arguments']) and node.info['arguments'][0] == 'this':
                    skip_node(node, node.children[1])
            # * Skip ".__WB_pmw(self)" (CallExpression)
            if node.type == 'CallExpression' \
               and '__WB_pmw(self)' in node.text \
               and len(node.info['arguments']) and node.info['arguments'][0] == 'self':
                skip_node(node, node.children[0])
            # * Skip ".__WB_pmw(self)" (PropertyAccessExpression)
            if node.type == 'PropertyAccessExpression' \
               and node.info['property'] == '__WB_pmw':
                skip_node(node, node.children[0])
            for child in node.children:
                choose_skip_node(child)
        choose_skip_node(actual_root)
        
        return actual_root

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

    @staticmethod
    def pos_2_linecol(pos, text):
        """Transform position to line column"""
        lines = text.split('\n')
        line = 0
        for i in range(len(lines)):
            if pos < len(lines[i]):
                return (line, pos)
            pos -= len(lines[i]) + 1
            line += 1
        return (line, pos)


def filter_archive(text):
    replace_ruls = {
            '_____WB$wombat$check$this$function_____(this)': 'this',
            '.__WB_pmw(self)': '',
            '.__WB_pmw': '',
            '__WB_pmw': '',
        }
    for key, value in replace_ruls.items():
        text = text.replace(key, value)
    return text

class TextMatcher:
    """If ASTNode is not available, use this to match text"""
    def __init__(self, code):
        self.code = code
        self.is_archive = False
    
    def find_unique_text(self, pos):
        """Starting from the given position, keep expanding until a unique text is found"""
        t_len = 1
        while pos + t_len < len(self.code):
            text = self.code[pos:pos+t_len]
            matches = [m.start() for m in re.finditer(re.escape(text), self.code)]
            if len(matches) == 1:
                return filter_archive(text)
            t_len += 1
        t_len = 1
        while pos - t_len >= 0:
            text = self.code[pos-t_len:pos]
            matches = [m.start() for m in re.finditer(re.escape(text), self.code)]
            if len(matches) == 1:
                return filter_archive(text)
            t_len += 1
        # Non ideal, use the character at the position for now
        return self.code[pos]

    def within_loop(self, pos, scope_name):
        """Check if the position is within a loop"""
        loop_keywords = ['for', 'while']
        t_len = 1
        while pos - t_len >= 0:
            text = self.code[pos-t_len:pos]
            if scope_name and scope_name in text:
                return False
            for keyword in loop_keywords:
                if keyword in text:
                    return True
            t_len += 1
        return False
    
    def archive_pos_2_live(self, pos):
        """Convert archive position to live position"""
        # Assume the header added to the code is fixed
        line, col = ASTNode.pos_2_linecol(pos, self.code)
        lines = self.code.split('\n')
        lines[14] = lines[14][1:]
        if line == 14:
            col -= 1
        new_pos = 0
        for i in range(14, line):
            new_pos += len(filter_archive(lines[i])) + 1
        final_line = filter_archive(lines[line][:col])
        new_pos += len(final_line)
        return new_pos

    def scope(self, pos) -> int:
        """Simply check the scope of the position"""
        right_bracket_offset = 0
        while pos < len(self.code):
            if self.code[pos] == '{':
                right_bracket_offset -= 1
            if self.code[pos] == '}':
                right_bracket_offset += 1
            pos += 1
        return max(0, right_bracket_offset - 2 * self.is_archive)
    
    def after(self, pos, other, other_pos):
        scope = self.scope(pos)
        other_scope = other.scope(other_pos)
        # * If A is top scope, B is not. Then B is always after A
        # * This is not true in general case, since there can be "func a() { ... } a(); b();" Then b() is after any within a()
        # * However, in the context when this is called, it is the case:
        # * 1. If there's some common frames ahead, no pos can be in the top scope
        # * 2. If there's no common frames ahead, then both frame are from bottom, then one not in top scope definitely after the other
        if scope > 0 and other_scope == 0:
            return True
        if self.is_archive:
            pos = self.archive_pos_2_live(pos)
        if other.is_archive:
            other_pos = other.archive_pos_2_live(other_pos)
        # Taking into consideration of some error in the position
        return pos >= other_pos - len('_____WB$wombat$check$this$function_____(this)')


class JSTextParser:
    def __init__(self, js_file):
        """
        Example usage:
          program = "document.documentElement.isSameNode(documentElement)"
          parser = JSTextParser(program)
          ast_node = parser.get_ast_node()
        """
        try:
            self.source_file = esprima.parseScript(js_file, {'loc': True, 'range': True, 'tolerant': True})
        except Exception as e:
            logging.error(f"Error in parsing js: {e}")
            self.source_file = None
        self.text = js_file
        self.ast_node = None

    def get_text(self, start, end):
        return self.text[start:end]

    def collect_node_info(self, node):
        full_text = self.get_text(node.range[0], node.range[1])
        info = {
            'text': full_text,
        }
        if node.type == 'CallExpression':
            info['arguments'] = []
            for arg in node.arguments:
                info['arguments'].append(self.get_text(arg.range[0], arg.range[1]))
        if node.type == 'PropertyAccessExpression':
            info['property'] = node.name
        return info

    def is_node(self, node):
        return isinstance(node, esprima.nodes.Node)

    def get_ast_node(self, archive=False):
        if self.ast_node:
            return self.ast_node
        if not self.source_file:
            return None
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
            self.ast_node = self.ast_node.filter_archive()
        return self.ast_node
    
    def get_text_matcher(self):
        return TextMatcher(self.text)


@dataclass
class Frame:
    functionName: str
    url: str
    lineNumber: int
    columnNumber: int

    @staticmethod
    def get_code(url):
        if url not in ALL_SCRIPTS:
            args = {}
            if url_utils.is_archive(url):
                url = url_utils.replace_archive_host(url, CONFIG.host)
            else:
                url = f'http://{CONFIG.host}/{CONFIG.collection}/{CONFIG.ts}id_/{url}'
            try:
                response = requests.get(url, timeout=5)
            except Exception as e:
                logging.error(f"Fail to fetch {url}: {e}")
                return None
            ALL_SCRIPTS[url] = response.text
        return ALL_SCRIPTS[url]
    
    def get_ASTInfo(self):
        if self.url not in ALL_ASTS:
            try:
                parser = JSTextParser(Frame.get_code(self.url))
                ast_node = parser.get_ast_node(archive=url_utils.is_archive(self.url))
            except Exception as e:
                logging.error(f"Error in parsing {self.url}: {e}")
            ALL_ASTS[self.url] = ASTInfo(ast=ast_node, parser=parser)
        return ALL_ASTS[self.url]

    @cached_property
    def associated_ast(self) -> "ASTNode | None":
        ast_info = self.get_ASTInfo()
        ast_node = ast_info.ast
        if not ast_node:
            logging.error(f"AST not found for {self.url}")
            return None
        node = ast_node.find_child(ASTNode.linecol_2_pos(self.lineNumber, self.columnNumber, ast_info.parser.text))
        return node
    
    @cached_property
    def text_matcher(self):
        text_matcher = self.get_ASTInfo().parser.get_text_matcher()
        if url_utils.is_archive(self.url):
            text_matcher.is_archive = True
        return text_matcher

    @cached_property
    def ast_path(self) -> "list[dict]":
        assert self.associated_ast, f"AST not found for {self.url}"
        ast_info = self.get_ASTInfo()
        ast_node = ast_info.ast
        pos = ASTNode.linecol_2_pos(self.lineNumber, self.columnNumber, ast_info.parser.text)
        path = ast_node.find_path(pos)
        return [{'idx': p['idx'], 'type': p['node'].type} for p in path]

    @cached_property
    def within_loop(self):
        if self.associated_ast:
            self.associated_ast.within_loop
        self_pos = ASTNode.linecol_2_pos(self.lineNumber, self.columnNumber, Frame.get_code(self.url))
        return self.text_matcher.within_loop(self_pos, self.functionName)

    def same_file(self, other: "Frame") -> bool:
        return self.url == other.url or url_utils.url_match(self.url, other.url)

    def same_frame(self, other: "Frame") -> bool:
        if self.functionName != other.functionName:
            return False
        if not self.same_file(other):
            return False
        if self.associated_ast and other.associated_ast:
            return self.ast_path == other.ast_path
        if Frame.get_code(self.url) and Frame.get_code(other.url):
            self_pos = ASTNode.linecol_2_pos(self.lineNumber, self.columnNumber, Frame.get_code(self.url))
            other_pos = ASTNode.linecol_2_pos(other.lineNumber, other.columnNumber, Frame.get_code(other.url))
            if self.text_matcher.find_unique_text(self_pos) == other.text_matcher.find_unique_text(other_pos):
                return True
        return False
    
    def same_scope(self, other: "Frame") -> bool:
        if self.associated_ast and other.associated_ast:
            return self.associated_ast.same_scope(other.associated_ast)
        return self.functionName == other.functionName and url_utils.url_match(self.url, other.url)

    def after(self, other: "Frame") -> bool:
        if self.associated_ast and other.associated_ast:
            return self.associated_ast.after(other.associated_ast)
        self_code, other_code = Frame.get_code(self.url), Frame.get_code(other.url)
        if not self_code or not other_code:
            return False
        self_pos = ASTNode.linecol_2_pos(self.lineNumber, self.columnNumber, Frame.get_code(self.url))
        other_pos = ASTNode.linecol_2_pos(other.lineNumber, other.columnNumber, Frame.get_code(other.url))
        return self.text_matcher.after(self_pos, other.text_matcher, other_pos)


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
                  lineNumber: int (0-indexed),
                  columnNumber: int (0-indexed)
                }
              ],
              description: str
            }
          ]
        """
        self.stack = stack
    
    def __reduce__(self):
        return (Stack, (self.stack,))
    
    @cached_property
    def serialized(self) -> "list[list[Frame]]":
        all_frames = []
        for call_frames in self.stack:
            sync_frames = []
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                if 'wombat.js' not in frame['url'] and frame['url'] != '':
                    sync_frames.append(Frame(frame['functionName'], frame['url'], frame['lineNumber'], frame['columnNumber']))
            all_frames.append(sync_frames)
        return all_frames

    @cached_property
    def serialized_flat_reverse(self) -> "list[Frame]":
        return list(reversed([frame for frames in self.serialized for frame in frames]))

    @cached_property
    def scripts(self) -> "set[str]":
        """
        Get the scripts that are related to this write
        """
        scripts = set()
        for call_frames in self.stack:
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                if 'wombat.js' not in frame['url'] and frame['url'] != '':
                    scripts.add(frame['url'])
        return scripts

    def overlap(self, other: "Stack") -> list:
        """Return a list of common callframes between two stacks"""
        a_frames = self.serialized_flat_reverse
        b_frames = other.serialized_flat_reverse
        common_frames = []
        min_depth = min(len(a_frames), len(b_frames))
        for i in range(min_depth):
            if a_frames[i] == b_frames[i]:
                common_frames.append(a_frames[i])
            elif a_frames[i].same_frame(b_frames[i]):
                common_frames.append(a_frames[i])
            else:
                break
        return common_frames
    
    def after(self, other: "Stack") -> bool:
        """Check if this stack is after the other stack"""
        common_frames = self.overlap(other)
        if len(common_frames) == 0 \
              and len(self.serialized_flat_reverse) > 0 \
              and len(other.serialized_flat_reverse) > 0:
            a_base = self.serialized_flat_reverse[0]
            b_base = other.serialized_flat_reverse[0]
            if not a_base.same_file(b_base):
                return False
            return a_base.after(b_base)
        else:
            # * If the last common frame is within a loop, then with static analysis it is impossible to determine
            # * we always assume self is after 
            if self.serialized_flat_reverse[len(common_frames)-1].within_loop:
                return True
            a_divergent = self.serialized_flat_reverse[len(common_frames)]
            b_divergent = other.serialized_flat_reverse[len(common_frames)]
            location_after =  a_divergent.after(b_divergent)
            same_scope = a_divergent.same_scope(b_divergent)
            return location_after and same_scope