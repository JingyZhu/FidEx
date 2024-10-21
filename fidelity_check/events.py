from functools import cached_property
from collections import namedtuple

class Event:
    def __init__(self, evt: dict):
        self.idx = evt['idx']
        self.element = evt['element']
        self.xpath = evt['path']
        self.events = evt['events']
        self.url = evt['url']
    
    @cached_property
    def has_class_or_id(self):
        return '.' in self.element or '#' in self.element

    def __eq__(self, other):
        if self.xpath == other.xpath:
            return True
        if self.has_class_or_id and other.has_class_or_id and self.element == other.element:
            return True
        return False

def diff_events(left_seq: "List[Event]", right_seq: "List[Event]") -> "List[Event]":
    """
    Same as _myer_diff from layout_tree.py
    """
    Frontier = namedtuple('Frontier', ['x', 'left_diff', 'right_diff', 'left_common', 'right_common'])

    frontier = {1: Frontier(0, [], [], [], [])}

    L = len(left_seq)
    R = len(right_seq)
    for d in range(0, L + R + 1):
        for k in range(-d, d + 1, 2):
            go_down = (k == -d or 
                    (k != d and frontier[k - 1].x < frontier[k + 1].x))

            if go_down:
                x, left_diff, right_diff, left_common, right_common = frontier[k + 1]
            else:
                x, left_diff, right_diff, left_common, right_common = frontier[k - 1]
                x += 1

            left_diff, right_diff= left_diff.copy(), right_diff.copy()
            left_common, right_common = left_common.copy(), right_common.copy()
            y = x - k

            if 1 <= y <= R and go_down:
                right_diff.append((right_seq[y-1]))
            elif 1 <= x <= L:
                left_diff.append(left_seq[x-1])

            while x < L and y < R and left_seq[x] == right_seq[y]:
                left_e, right_e = left_seq[x], right_seq[y]
                left_common.append(left_e)
                right_common.append(right_e)
                x += 1
                y += 1

            if x >= L and y >= R:
                return left_diff, right_diff, left_common, right_common
            else:
                frontier[k] = Frontier(x, left_diff, right_diff, left_common, right_common)
    assert False, 'Could not find edit script'


def load_events(events: list) -> "List[Event]":
    return [Event(evt) for evt in events]