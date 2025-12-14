import os
import socket
import json
import re

CURDIR = os.path.dirname(os.path.abspath(__file__))

def get_hostname():
    return socket.gethostname()

def get_idx():
    HOSTNAMES = ['redwings', 'pistons', 'wolverines', 'lions']
    hostname = get_hostname()
    idx = HOSTNAMES.index(hostname)
    assert 0 <= idx < 4
    return idx

def get_metadata(in_hostname=False):
    metadata = json.load(open(f'{CURDIR}/fidex_result/final_metadata.json', 'r'))
    metadata = {m['directory']: m for m in metadata}
    if in_hostname:
        hostname = get_hostname()
        metadata = {k: v for k, v in metadata.items() if hostname in v['sub_archive']}
    return metadata

def get_diff_info():
    diff_info = json.load(open(f'{CURDIR}/fidex_result/final_diffs.json', 'r'))
    return {m['hostname']: m['diff'] for m in diff_info}

def get_pinpoint_info():
    pinpoints = json.load(open(f'{CURDIR}/fidex_result/archive_pinpoint_final.json', 'r'))
    return {m['FidelityResult']['hostname']: m for m in pinpoints}


def cluster_errors(error):
    commom_prefixes = {
        # re.compile('^Fidex (wombat error): JSON parse error:'): 'Fidex (wombat error): JSON parse error',
        re.compile("SyntaxError: Unexpected token 'v', \"\nvar _____W\"... is not valid JSON"): 'JSON parse rewritten error',
        re.compile('^SyntaxError: Identifier'): 'SyntaxError: Identifier',
        re.compile('^TypeError: Cannot read properties of null'): 'TypeError: Cannot read properties of null',
        re.compile('^TypeError: Cannot read properties of undefined'): 'TypeError: Cannot read properties of undefined',
        re.compile('^ReferenceError: (?!__)\S+ is not defined'): 'ReferenceError: variable is not defined',
        re.compile("^DOMException: Failed to read a named property '__WB_pmw' from 'Window': Blocked a frame with origin"): "DOMException: Failed to read a named property '__WB_pmw' from 'Window': Blocked a frame with origin",
        re.compile('^Fidex \(wombat error\): JSON parse error: SyntaxError: Unexpected token'): 'Fidex (wombat error): JSON parse error: SyntaxError: Unexpected token',
        re.compile("^Fidex \(wombat exception thrown\): Worker NetworkError: Failed to execute 'send' on 'XMLHttpRequest':"): "Fidex (wombat exception thrown): Worker NetworkError: Failed to execute 'send' on 'XMLHttpRequest':",
        re.compile("^Fidex \(wombat invariant violated\): WindowProxy invariant violated"): 'Fidex (wombat invariant violated): WindowProxy invariant violated',
        re.compile('^Fidex \(wombat invariant violated\): srcdoc contains __WB_pmw\(\), which could raise errors'): 'Fidex (wombat invariant violated): srcdoc contains __WB_pmw(), which could raise errors',
        re.compile("^Fidex \(wombat exception thrown\): overrideIframeContentAccessGetter contentFrame can't access __WB_pmw"): "Fidex (wombat invariant violated): srcdoc contains __WB_pmw(), which could raise errors",
    }
    def desc_pattern(desc):
        for pattern, replacement in commom_prefixes.items():
            if pattern.search(desc):
                return replacement
        return desc

    descriptions = [e['description'] for e in error if 'description' in e]
    descriptions = list(set([desc_pattern(desc) for desc in descriptions]))
    return descriptions


def reason_to_inputname(reason):
    filename = ''.join(['_' if c in ' :.,;/-\\' else c.lower() for c in reason])
    return filename

def reason_to_filename(reason):
    reason_map = {
        'SyntaxError: Unexpected eval or arguments in strict mode': 'syntaxerror-arguments',
        'Fidex (wombat invariant violated): WindowProxy invariant violated for top [object Window] !== [object Window]': 'wombat-windowproxy',
        'ReferenceError: variable is not defined': 'referenceerror',
        # "Fidex (wombat exception thrown): overrideIframeContentAccessGetter contentFrame can't access __WB_pmw": "crossframe",
        'Fidex (wombat invariant violated): srcdoc contains __WB_pmw(), which could raise errors': 'crossframe',
        'all-fix': 'all-fix',
        'random-sample': 'random-sample',
    }
    return reason_map.get(reason, reason)