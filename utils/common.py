def stage_nolater(s1, s2):
    if s1 == 'onload':
        return True
    if s2 == 'onload':
        return False
    s1 = s1.replace('interaction_', '')
    s2 = s2.replace('interaction_', '')
    return int(s1) <= int(s2)