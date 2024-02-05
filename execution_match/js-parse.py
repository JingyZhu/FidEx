"""Python implementation of js-parse for abling to multiprocess"""
import esprima

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
             + f'Start: {self.start_rowcol} '  \
             + f'End: {self.end_rowcol} '      \
             + f'Info: {self.info}'

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


class JSTextParser:
    def __init__(self, js_file):
        self.sourceile = esprima.parseScript(js_file, {'loc': True, 'range': True})
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

        self.ast_node = traverse_helper(self.sourceile)
        if archive:
            self.ast_node = self.ast_node.filter_wayback()
        return self.ast_node


if __name__ == '__main__':
    program = "const x = 10;"
    parser = JSTextParser(program)
    ast_node = parser.get_ast_node()
    path = ast_node.find_path(12)
    print(path[-1])
