"""
Wrapper for marking archive page's layout diff
Require running ruby html_diff.rb and mark_diff.py
"""
from subprocess import call

path = '../results/topsites/pageinfo/padlet.com_1'
url = "https://padlet.com"

call(['ruby', 'html_diff.rb', path])
call(['python3', 'mark_diff.py', path, url])