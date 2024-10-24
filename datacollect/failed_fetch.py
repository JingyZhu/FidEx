import json
import os

from fidex.utils import url_utils, common

NON_IMPORTANT_KEYWORDS = [
    'googlesyndication.com',
    'favicon.ico',
    'doubleclick.net',
    'google-analytics.com',
    'googleadservices.com',
    'gstatic.com',
    'connect.facebook.net',
    'analytics.min.js',
    'ads-twitter.com'
]

class FailFetchDetector:
    def __init__(self, dirr, left, right):
        left_excep_ff = json.load(open(f"{dirr}/{left}_exception_failfetch.json"))
        right_excep_ff = json.load(open(f"{dirr}/{right}_exception_failfetch.json"))
        self.left_ff = []
        for excep_ff in left_excep_ff:
            self.left_ff.append({
                'stage': excep_ff['stage'],
                'interaction': excep_ff['interaction'],
                'failedFetches': [ff for ff in excep_ff['failedFetches'] if FailFetchDetector.meaningful_failfetch(ff)]
            })
        self.right_ff = []
        for excep_ff in right_excep_ff:
            self.right_ff.append({
                'stage': excep_ff['stage'],
                'interaction': excep_ff['interaction'],
                'failedFetches': [ff for ff in excep_ff['failedFetches'] if FailFetchDetector.meaningful_failfetch(ff)]
            })

    @staticmethod
    def meaningful_failfetch(ff) -> bool:
        if ff['status'] != 404:
            return False
        if ff['method'] != 'GET':
            return False
        if ff['mime'] in ['Ping']:
            return False
        for keyword in NON_IMPORTANT_KEYWORDS:
            if keyword in ff['url']:
                return False
        return True

    def extra_failfetch(self, stage=None) -> list[dict]:
        left_ff = [ff for ff in self.left_ff if stage is None or common.stage_nolater(ff['stage'], stage)]
        right_ff = [ff for ff in self.right_ff if stage is None or common.stage_nolater(ff['stage'], stage)]
        all_left_urls = {ff['url']: ff for ffs in left_ff for ff in ffs['failedFetches']}
        all_right_urls = {ff['url']: ff for ffs in right_ff for ff in ffs['failedFetches']}
        extra_right = []
        for rurl, rff in all_right_urls.items():
            for lurl in all_left_urls:
                if url_utils.url_match(rurl, lurl):
                    break
            else:
                extra_right.append(rff)
        return extra_right


def extra_failfetch(dirr, left, right, stage=None) -> "tuple(bool, list[dict])":
    """Decide if right has more meaningful failed fetches than left
    If no stage filtration is needed, set stage to None
    """
    if not os.path.exists(f"{dirr}/{left}_exception_failfetch.json") or not os.path.exists(f"{dirr}/{right}_exception_failfetch.json"):
        return True, [{"message": "No failfetch files"}]
    ff = FailFetchDetector(dirr, left, right)
    extra_right = ff.extra_failfetch(stage)
    return len(extra_right) > 0, extra_right
    
    