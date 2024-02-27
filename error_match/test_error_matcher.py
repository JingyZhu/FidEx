import error_matcher
import time

lines = [
    # 'isSameNode(',
    # 'n.domain=document.domain',
    # '.value.call(',
    # '.contentWindow.postMessage'
]

lines = [r'\bb-lazy\b']

ast_matcher = error_matcher.LineErrorMatcher()
ast_matcher.read_responses('../../wayback-crawl/responses/working_5000', max_sample=5000, num_workers=32, target_types=['html'])
matched_urls = ast_matcher.match_error_multiproc(lines, num_workers=32, save_file=f'test', is_re=True)


# # url match
# filenames = ['news-carousel.js', 'equalizer.js']
# ast_matcher = error_matcher.FilenameErrorMatcher()
# ast_matcher.read_responses('../../wayback-crawl/responses/working_5000', max_sample=5000, num_workers=32, target_types=[])
# matched_urls = ast_matcher.match_error_multiproc(filenames, num_workers=32, save_file=f'test', is_re=False)