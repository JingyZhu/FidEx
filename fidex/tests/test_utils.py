from subprocess import call
import os
from fidex.utils import execution, url_utils

WB_PATH = f'{os.path.expanduser("~")}/fidelity-files'
PYWB_PATH = '/x/jingyz/pywb/env/bin/activate'

def init_test():
    call(f"rm -rf writes/*", shell=True)
    call(f"rm -rf determinism/*", shell=True)
    call(f"rm -rf metadata/*", shell=True)
    call(f"rm -rf {WB_PATH}/writes/test", shell=True)
    call(f"rm -rf {WB_PATH}/warcs/test", shell=True)

    call(['rm', '-rf', f'{WB_PATH}/collections/test'])

    call('mkdir -p writes', shell=True)
    call('mkdir -p determinism', shell=True)
    call('mkdir -p metadata', shell=True)
    call(f'/bin/bash -c "source {PYWB_PATH} && wb-manager init test"', cwd=WB_PATH, shell=True)

def test_archive_url():
    archive_url1 = 'http://pistons.eecs.umich.edu:38119/test/20241021000407js_///ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4'
    assert(url_utils.is_archive(archive_url1))
    assert(url_utils.filter_archive(archive_url1) == 'https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4')

    archive_url2 = 'http://pistons.eecs.umich.edu:38119/test/20241021000407js_/ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4'
    assert(url_utils.is_archive(archive_url2))
    assert(url_utils.filter_archive(archive_url2) == 'https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4')

    archive_url3 = 'http://pistons.eecs.umich.edu:38119/test/20241021000407js_/http://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4'
    assert(url_utils.is_archive(archive_url3))
    assert(url_utils.filter_archive(archive_url3) == 'http://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4')
    assert(url_utils.url_match(archive_url3, 'http://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js?ver=2.2.4'))

    archive_url4 = 'http://pistons.eecs.umich.edu:37111/test/20241021203631js_/https://cdn.userway.org/widgetapp/2024-10-08-15-28-17/widget_app_base_1728401297040.js'
    assert(url_utils.is_archive(archive_url4))
    assert(url_utils.filter_archive(archive_url4) == 'https://cdn.userway.org/widgetapp/2024-10-08-15-28-17/widget_app_base_1728401297040.js')

    archive_url5 = 'http://pistons.eecs.umich.edu:50355/gt_tranco/20241022064653/https://www.wireshark.org/_astro/client.6ea6e353.js'
    assert(url_utils.is_archive(archive_url5))
    assert(url_utils.filter_archive(archive_url5) == 'https://www.wireshark.org/_astro/client.6ea6e353.js')

    live_url1 = 'https://cdn.userway.org/widgetapp/2024-10-08-15-28-17/widget_app_base_1728401297040.js'
    assert(not url_utils.is_archive(live_url1))

def test_same_scope():
    program = """
    function foo() {
        var a = 1;
        function bar() {
            var b = 2;
            b.toString();
        }
        function baz() {
            try {
                var c = 3;
            } catch (e) {
                var d = 4;
            }
        }
    }
    """
    parser = execution.JSTextParser(program)
    ast_node = parser.get_ast_node()
    p1 = execution.ASTNode.linecol_2_pos(2, 8, parser.text) # var a = 1;
    c1 = ast_node.find_child(p1)
    p2 = execution.ASTNode.linecol_2_pos(4, 12, parser.text) # var b = 2;
    c2 = ast_node.find_child(p2)
    assert(not c1.same_scope(c2))
    p3 = execution.ASTNode.linecol_2_pos(5, 12, parser.text) # b.toString();
    c3 = ast_node.find_child(p3)
    assert(c2.same_scope(c3))
    
    p4 = execution.ASTNode.linecol_2_pos(9, 16, parser.text) # var c = 3;
    c4 = ast_node.find_child(p4)
    assert(not c2.same_scope(c4))
    p5 = execution.ASTNode.linecol_2_pos(11, 16, parser.text) # var d = 4;
    c5 = ast_node.find_child(p5)
    assert(not c4.same_scope(c5))

    program_2 = """
    (function (){
        let a = (() => {return b.toString()});
    })();
    """
    parser = execution.JSTextParser(program_2)
    ast_node = parser.get_ast_node()
    p_21 = execution.ASTNode.linecol_2_pos(2, 8, program_2) # let a = () => {
    c_21 = ast_node.find_child(p_21)
    p_22 = execution.ASTNode.linecol_2_pos(2, 23, program_2) # let b = 2;
    c_22 = ast_node.find_child(p_22)
    assert(not c_21.same_scope(c_22))
    
    program_3 = """
    originFn.call(this, ()=>b.toString());
    """
    parser = execution.JSTextParser(program_3)
    ast_node = parser.get_ast_node()
    p_31 = execution.ASTNode.linecol_2_pos(1, 18, program_3) # this
    c_31 = ast_node.find_child(p_31)
    p_32 = execution.ASTNode.linecol_2_pos(1, 28, program_3) # return b.toString();
    c_32 = ast_node.find_child(p_32)
    assert(not c_31.same_scope(c_32))


def test_ast_filter_archive_0():
    live_program = open('examples/ast_filter_archive_l0.js').read()
    parser_live = execution.JSTextParser(live_program)
    archive_program = open('examples/ast_filter_archive_a0.js').read()
    parser_archive = execution.JSTextParser(archive_program)
    
    ast_node_live = parser_live.get_ast_node()
    ast_node_archive = parser_archive.get_ast_node()
    ast_node_archive = ast_node_archive.filter_archive()
    
    # * Test on last matches of "id: t.data.id,"
    p_live = execution.ASTNode.linecol_2_pos(3952, 56, live_program)
    path_live = ast_node_live.find_path(p_live)
    p_archive = execution.ASTNode.linecol_2_pos(3973, 79, archive_program)
    path_archive = ast_node_archive.find_path(p_archive)
    
    path_live = [{'idx': p['idx'], 'node': p['node'].type} for p in path_live]
    path_archive = [{'idx': p['idx'], 'node': p['node'].type} for p in path_archive]
    assert(path_live == path_archive)

def test_ast_filter_archive_1():
    live_program = open('examples/ast_filter_archive_l1.js').read()
    parser_live = execution.JSTextParser(live_program)
    archive_program = open('examples/ast_filter_archive_a1.js').read()
    parser_archive = execution.JSTextParser(archive_program)
    
    ast_node_live = parser_live.get_ast_node()
    ast_node_archive = parser_archive.get_ast_node()
    ast_node_archive = ast_node_archive.filter_archive()
    
    p_live = execution.ASTNode.linecol_2_pos(1, 27913, live_program)
    path_live = ast_node_live.find_path(p_live)
    p_archive = execution.ASTNode.linecol_2_pos(15, 28779, archive_program)
    path_archive = ast_node_archive.find_path(p_archive)
    
    path_live = [{'idx': p['idx'], 'node': p['node'].type} for p in path_live]
    path_archive = [{'idx': p['idx'], 'node': p['node'].type} for p in path_archive]
    assert(path_live == path_archive)


def test_ast_filter_archive_2():
    live_program = open('examples/ast_filter_archive_l2.js').read()
    parser_live = execution.JSTextParser(live_program)
    archive_program = open('examples/ast_filter_archive_a2.js').read()
    parser_archive = execution.JSTextParser(archive_program)
    
    ast_node_live = parser_live.get_ast_node()
    ast_node_archive = parser_archive.get_ast_node()
    ast_node_archive = ast_node_archive.filter_archive()
    
    p_live = execution.ASTNode.linecol_2_pos(2, 13744, live_program)
    path_live = ast_node_live.find_path(p_live)
    p_archive = execution.ASTNode.linecol_2_pos(16, 13945, archive_program)
    path_archive = ast_node_archive.find_path(p_archive)
    
    path_live = [{'idx': p['idx'], 'node': p['node'].type} for p in path_live]
    path_archive = [{'idx': p['idx'], 'node': p['node'].type} for p in path_archive]
    assert(path_live != path_archive)

def test_text_matcher_archive():
    live_program = open('examples/ast_filter_archive_l2.js').read()
    archive_program = open('examples/ast_filter_archive_a2.js').read()
    parser_archive = execution.JSTextParser(archive_program)
    text_matcher = parser_archive.get_text_matcher()
    pos = execution.ASTNode.linecol_2_pos(16, 13949, archive_program)
    live_pos_trans = text_matcher.archive_pos_2_live(pos)
    live_pos_actual = execution.ASTNode.linecol_2_pos(2, 13744, live_program)
    assert(live_pos_trans == live_pos_actual)


if __name__ == '__main__':
    # test_archive_url()
    test_text_matcher_archive()
    # test_ast_filter_archive_2()