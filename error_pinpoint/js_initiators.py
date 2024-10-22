import json
from fidex.utils import execution


class JSInitiator:
    def __init__(self, url, stack):
        self.url = url
        self.stack = execution.Stack(stack)
        self.initiators = []

    def add_initiator(self, initiator):
        self.initiators.append(initiator)

    def __hash__(self):
        return hash(self.url)


def read_initiators(dirr, base) -> "Dict[str, JSInitiator]":
    initiators = json.load(open(f"{dirr}/{base}_requestStacks.json"))
    js_initiator_map = {}
    for obj in initiators:
        for url in obj['urls']:
            initiator = JSInitiator(url, obj['stackInfo'])
            for script in initiator.stack.scripts:
                if script in js_initiator_map:
                    initiator.add_initiator(js_initiator_map[script])
            js_initiator_map[url] = initiator
    return js_initiator_map