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
    'ads-twitter.com',
    # 'google.com/recaptcha',
]

class FailFetchDetector:
    def __init__(self, dirr, left, right):
        self.left_excep_ff = json.load(open(f"{dirr}/{left}_exception_failfetch.json"))
        self.right_excep_ff = json.load(open(f"{dirr}/{right}_exception_failfetch.json"))
        self.left_ff = []
        for excep_ff in self.left_excep_ff:
            self.left_ff.append({
                'stage': excep_ff['stage'],
                'interaction': excep_ff['interaction'],
                'failedFetches': [ff for ff in excep_ff['failedFetches'] if FailFetchDetector.meaningful_failfetch(ff)]
            })
        self.right_ff = []
        for excep_ff in self.right_excep_ff:
            self.right_ff.append({
                'stage': excep_ff['stage'],
                'interaction': excep_ff['interaction'],
                'failedFetches': [ff for ff in excep_ff['failedFetches'] if FailFetchDetector.meaningful_failfetch(ff)]
            })

    @staticmethod
    def meaningful_failfetch(ff) -> bool:
        if ff.get('status') != 404:
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

    def blocked_as_404(self) -> list[dict]:
        left_blocked = [ff['url'] for obj in self.left_excep_ff 
                        for ff in obj['failedFetches'] if 'BLOCKED' in ff.get('errorText', '')]
        left_blocked = (set([url_utils.url_norm(url, ignore_scheme=True) for url in left_blocked]))
        right_aborted = [ff['url'] for obj in self.right_excep_ff 
                        for ff in obj['failedFetches'] if 'ABORTED' in ff.get('errorText', '')]
        right_aborted = (set([url_utils.url_norm(url, ignore_scheme=True, archive=True) for url in right_aborted]))
        blocked_404s = []
        for obj in self.right_excep_ff:
            for ff in obj['failedFetches']:
                if ff.get('status') != 404:
                    continue
                if ff.get('mime', '')not in ['Document']:
                    continue
                norm_url = url_utils.url_norm(ff['url'], ignore_scheme=True, archive=True)
                if norm_url not in right_aborted and norm_url in left_blocked:
                    blocked_404s.append(ff)
        return blocked_404s


def extra_failfetch(dirr, left, right, stage=None) -> "tuple(bool, list[dict])":
    """Decide if right has more meaningful failed fetches than left
    If no stage filtration is needed, set stage to None
    """
    if not os.path.exists(f"{dirr}/{left}_exception_failfetch.json") or not os.path.exists(f"{dirr}/{right}_exception_failfetch.json"):
        return True, [{"message": "No failfetch files"}]
    ff = FailFetchDetector(dirr, left, right)
    extra_right = ff.extra_failfetch(stage)
    return len(extra_right) > 0, extra_right

def blocked_as_404(dirr, left, right) -> "tuple(bool, list[dict])":
    """If compared against archive. Check if there are 404s that should originally be blocked
    Since we observed 404 and blocked resources could have different behaviors
    """
    if right != 'archive':
        return False, [{"message": "Not compared against archive"}]
    ff = FailFetchDetector(dirr, left, right)
    blocked_404s = ff.blocked_as_404()
    return len(blocked_404s) > 0, blocked_404s

    
    