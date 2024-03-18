import error_matcher
import time

lines = [
    # 'isSameNode(',
    # 'n.domain=document.domain',
    # '.value.call(',
    # '.contentWindow.postMessage'
]

lines = [r'^\ufeff\$.*']
# lines = ['function']

ast_matcher = error_matcher.LineErrorMatcher()
# ast_matcher.read_responses('../../wayback-crawl/responses/first_all', max_sample=5000, num_workers=32, target_types=['js'])
ast_matcher.read_warcs('../../wayback-crawl/warcs/second_all', max_sample=5000, target_types=['js'])
matched_urls = ast_matcher.match_error_multiproc(lines, num_workers=32, save_file=f'test', is_re=True)
print(len(ast_matcher.warcs))


# # url match
# filenames = ['jquery-ui.js']
# ast_matcher = error_matcher.FilenameErrorMatcher()
# ast_matcher.read_responses('../../wayback-crawl/responses/first_all', max_sample=5000, num_workers=32, target_types=[])
# matched_urls = ast_matcher.match_error_multiproc(filenames, num_workers=32, save_file=f'test', is_re=False)