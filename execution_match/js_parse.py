"""Python implementation of js-parse for abling to multiprocess"""
import esprima
import sys
sys.setrecursionlimit(3000)

class ASTNode:
    def __init__(self, node, info):
        self.node = node
        self.kind = node.type
        self.start = node.range[0]
        self.end = node.range[1]
        self.start_rowcol = {'line': node.loc.start.line, 'column': node.loc.start.column}
        self.end_rowcol = {'line': node.loc.end.line, 'column': node.loc.end.column}
        self.info = info
        self.children = []
        self.parent = None
        self.hash = None
        self.keywords = {
            'window',
            'contentWindow',
            'postMessage'
            'document',
            'isSameNode',
            'call',
            'value'
        }
    
    def add_child(self, child):
        self.children.append(child)
        child.parent = self
    
    def find_path(self, pos):
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

    def __str__(self):
        return f'Kind: {self.kind} '           \
            #  + f'Start: {self.start_rowcol} '  \
            #  + f'End: {self.end_rowcol} '      \
            #  + f'Info: {self.info}'

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
        if self.hash:
            return self.hash
        child_hashes = hash(tuple(self.children))
        hash_list = [self.kind]
        if self.kind == 'Identifier':
            if self.node.name in self.keywords:
                hash_list.append(self.node.name)
        self_hash = hash(tuple(hash_list))
        self.hash = hash((self_hash, child_hashes))
        return self.hash

    def __iter__(self):
        """Iterate self and children"""
        yield self
        for child in self.children:
            yield from child


class JSTextParser:
    def __init__(self, js_file):
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
        def traverse_helper(node, depth=0):
            info = self.collect_node_info(node)
            ast_node = ASTNode(node, info)
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
            return ast_node

        self.ast_node = traverse_helper(self.source_file)
        if archive:
            self.ast_node = self.ast_node.filter_wayback()
        return self.ast_node


if __name__ == '__main__':
    program_1 = "document.documentElement.isSameNode(documentElement)"
    parser = JSTextParser(program_1)
    ast_node = parser.get_ast_node()
    assert(len(ast_node.children) == 1)
    ast_node = ast_node.children[0]
    assert(len(ast_node.children) == 1)
    ast_node = ast_node.children[0]
    # path = ast_node.find_path(12)
    # print(path[-1])
    ast_node.print_all()
    print(hash(ast_node))

    program_2 = """if (!document.documentElement.isSameNode(documentElement)) {
      opts.root = documentElement;
    }"""
    parser = JSTextParser(program_2)
    ast_node = parser.get_ast_node()
    stack = [ast_node]
    while len(stack):
        cur_node = stack.pop()
        print("\n\n")
        cur_node.print_all()
        print(cur_node.kind, hash(cur_node))
        for child in cur_node.children:
            stack.append(child)