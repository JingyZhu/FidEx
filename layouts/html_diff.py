from xmldiff import main as xmlmain
from xmldiff import formatting as xmlformat
from bs4 import BeautifulSoup
from bs4 import Comment

import json

filter_nodes = ['script'] 

# filter comments and certain nodes
def filter_html(html, filter_nodes):
    soup = BeautifulSoup(html, 'html.parser')
    for node in filter_nodes:
        for tag in soup.find_all(node):
            tag.decompose()
    # decompose comments tag
    for tag in soup.find_all(string=lambda text: isinstance(text, Comment)):
        tag.extract()
    return soup

live_file = f'../recording/pageinfo/test/dimension.html'
archive_file = f'../recording/pageinfo/test_archive/dimension.html'
live_html = open(live_file, 'r').read()
archive_html = open(archive_file, 'r').read()
live_html = str(filter_html(live_html, filter_nodes))
archive_html = str(filter_html(archive_html, filter_nodes))

# live_html = "<div><a><p>AHA</p></a></div>"
# archive_html = "<div>fff<p>AHA</p></div>"

formatter = xmlformat.DiffFormatter(pretty_print=True)
# diff = xmlmain.diff_texts(live_html, archive_html, diff_options={'fast_match':True, "F": 0.99})
diff = xmlmain.diff_texts(live_html, archive_html,
                        diff_options={'F': 0.8, 'ratio_mode': 'accurate'},
                        formatter=formatter)
print(diff)
# pickle.dump(diff, open('diff.pickle', 'wb+'))
# json.dump(diff, open('diff.json', 'w+'), indent=2)

# left = '<document><node>Content</node></document>'
# right = '<document><node>Content</node><a href="/aa">new stuff</a><a href="/aa">new stuff</a></document>'
# diff = xmlmain.diff_texts(left, right)
# print(diff)
# for d in diff:
#     print(type(d))
