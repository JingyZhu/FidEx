def stage_nolater(s1, s2):
    """Check if s1 is earlier or equal to s2"""
    order = ['onload', 'extraInteraction']
    o1 = order.index(s1) if s1 in order else -1
    o2 = order.index(s2) if s2 in order else -1
    if o1 == -1:
        o1 = int(s1.replace('interaction_', '')) + 2
    if o2 == -1:
        o2 = int(s2.replace('interaction_', '')) + 2
    return o1 <= o2

def stage_later(s1, s2):
    """Check if s1 is strictly later than s2"""
    return not stage_nolater(s1, s2)