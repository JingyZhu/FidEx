"""
Plot utilities for plotly libraries
"""
import plotly.graph_objects as go
import plotly
import pandas as pd
import numpy as np
from urllib.parse import urlparse
from collections import defaultdict
import re
import os
import json
import igraph
from igraph import Graph, EdgeSeq
from IPython.core.display import display, HTML
import bs4

default_scheme = plotly.colors.qualitative.Dark2
dashes = ["solid", "dash", "dashdot", "5px,5px,10px,5px,5px", "dot"]
contrast_scheme = ["#f5d5d5", "#e3af14", "#005c96"]

class SiteTree:
    """
    Generate a tree from the given urls
    The intermediate node will be elimiated if there is only one child (leaf is exception)
    Use plotly to plot the tree
    """
    def generate_tree(self):
        tree = lambda: defaultdict(tree)
        url_tree = tree()
        # Insert urls into 
        for obj in self.urls:
            url, status, sic_broken, detail = obj['url'], obj['status'], obj.get('sic_broken'), obj['detail']
            up = urlparse(url)
            subhost, path, query = up.netloc.split(':')[0], up.path, up.query
            if path == '': path += '/'
            directories = [subhost] + path.split('/')[1:]
            if query: directories += ['?' + query]
            cur_node, parent_node = url_tree, url_tree
            parent_key = directories[0]
            for d in directories[:-1]:
                if isinstance(cur_node, list): # Case of /a and /a/b
                    cur_list = cur_node
                    cur_node = tree()
                    cur_node[''] = cur_list
                    parent_node[parent_key] = cur_node
                parent_key, parent_node = d, cur_node
                cur_node = cur_node[d]
            filename = directories[-1]
            if isinstance(cur_node, list): # Case of /a and /a/b
                cur_list = cur_node
                cur_node = tree()
                cur_node[''] = cur_list
                parent_node[parent_key] = cur_node
            cur_node[filename] = [status, sic_broken, detail]
        count1 = self.check(url_tree)
        print(count1)
        json.dump(url_tree, open('tmp/tree_pre.json', 'w+'))
        # Delete intermediate nodes with only one child (link list)
        if self.flatten:
            stack = [url_tree]
            while len(stack) > 0:
                cur_node = stack.pop()
                if isinstance(cur_node, list): continue
                keys = list(cur_node.keys())
                for k in keys:
                    cur_k, v = k, cur_node[k]
                    while not (len(v) > 1 or isinstance(v, list)):
                        sub_k, v = list(v.keys())[0], list(v.values())[0]
                        new_k = '{}/{}'.format(cur_k, sub_k)
                        cur_node[new_k] = v
                        del(cur_node[cur_k])
                        cur_k = new_k
                    stack.append(cur_node[cur_k])
            json.dump(url_tree, open('tmp/tree.json', 'w+'))
            count2 = self.check(url_tree)
            print(count2)
            assert(count1 == count2)
        return url_tree

    def check(self, url_tree):
        stack = [url_tree]
        leaf_count = 0
        while len(stack) > 0:
            cur_node = stack.pop()
            if isinstance(cur_node, list):
                leaf_count += 1
                continue
            for v in cur_node.values():
                stack.append(v)
        return leaf_count
    
    def categorize(self, status, sic_broken, detail):
        if re.compile('^[45]').match(status): return '45xx'
        if re.compile('^(DNSError|OtherError)').match(status): return 'network_error'
        two_hundred_map = {
            'no redirection': 'no redir',
            'non-home redirection': 'non-home redir',
            'homepage redirection': 'home redir'
        }
        return f'{two_hundred_map[detail]} broken' if sic_broken else f'{two_hundred_map[detail]} fine'

    def __init__(self, urls, hostname, colors=None, flatten=True):
        """
        urls should include status and broken metadata (refer to db_format-->url_status_implicit_broken)
        Colors is the color mapping for status (45xx, etc)
        Flatten is to decide whether is intermediate nodes of tree are flattened
        """
        self.urls = urls
        self.flatten = flatten
        self.tree = self.generate_tree()
        self.hostname = hostname
        self.colors = colors if colors else \
            {'45xx': 'red', 'network_error': '#582477','not_leaf': 'grey',
            'no redir fine': '#F7F7BC', 'no redir broken': '#E7AD00', 
            'home redir fine': '#AEE17F', 'home redir broken': '#2D7A10',
            'non-home redir fine': '#B3D7D7', 'non-home redir broken': '#02748F'}
    
    def plot_tree(self, save_html=None, width=None):
        """save_html: If specified, should be path/filename for html to be saved"""
        G = Graph()
        vcount = 0
        G.add_vertices(1)
        url_map, cate_map = {'': vcount}, defaultdict(set)
        vcount += 1
        q = [(self.tree, '')]
        while len(q) > 0:
            cur_node, cur_url = q.pop()
            if isinstance(cur_node, list):
                cate = self.categorize(cur_node[0], cur_node[1], cur_node[2])
                cate_map[cate].add(url_map[cur_url])
                continue
            for path, value in cur_node.items():
                if cur_url == '': new_path = path
                elif len(path) > 0 and path[0] == '?': new_path = cur_url + path
                else: new_path = cur_url + '/' + path
                G.add_vertices(1)
                url_map[new_path] = vcount
                q.insert(0, (value, new_path))
                G.add_edges([(url_map[cur_url], url_map[new_path])])
                vcount += 1
        leaf_nodes = set([n for cates in cate_map.values() for n in cates])
        non_leaf_nodes = set([n for n in range(vcount) if n not in leaf_nodes])
        cate_map['not_leaf'] = non_leaf_nodes
        reverse_url_map = {v: k for k, v in url_map.items()}
        layout = G.layout('rt', root=[0])
        position = {k: layout[k] for k in range(vcount)}
        M = max([layout[k][1] for k in range(vcount)])
        E = [e.tuple for e in G.es] # list of edges
        Xedge, Yedge = [], []
        for edge in E:
            Xedge += [position[edge[0]][0], position[edge[1]][0], None]
            Yedge += [2*M - position[edge[0]][1], 2*M - position[edge[1]][1], None]

        fig = go.Figure()
        # Plot edges
        fig.add_trace(go.Scatter(x=Xedge,
            y=Yedge,
            mode='lines',
            line=dict(color='rgb(210,210,210)', width=1),
            hoverinfo='none'
        ))
        # Plot nodes
        for cate, nodes in cate_map.items():
            nodes = list(nodes)
            labels = [reverse_url_map[n] for n in nodes]
            Xn = [position[k][0] for k in nodes]
            Yn = [2*M - position[k][1] for k in nodes]
            fig.add_trace(go.Scatter(x=Xn, y=Yn, mode='markers', name=cate,
                marker={
                    'symbol': 'circle-dot',
                    'size': 18,
                    'color': self.colors[cate],    #'#DB4551',
                    'line': {'color': 'rgb(50,50,50)', 'width': 1}
                },
                text=labels,
                hoverinfo='text',
                opacity=0.8
            ))
        axis = {
            'showline': False, # hide axis line, grid, ticklabels and  title
            'zeroline': False,
            'showgrid': False,
            'showticklabels': False,
        }
        fig.update_layout(
            title={
                'text': self.hostname,
                'x':0.5,
                'yanchor': 'top',
                'font': {'size': 28}
            },
            font={'size': 16},
            height=1000,
            xaxis=axis,
            yaxis=axis,
            margin=dict(l=40, r=40, b=85, t=100),
            plot_bgcolor='rgb(248,248,248)',
            hovermode='closest',
            hoverlabel={
                'align': 'left',
                'bgcolor': "white", 
                'font_size': 20, 
            }
        )
        if save_html and width:
            fig.update_layout(width=width)
        text = [reverse_url_map[k].split('/')[-1] for k in range(vcount)]
        div = plotly.offline.plot(fig, include_plotlyjs=False, output_type='div')
        soup = bs4.BeautifulSoup(div, 'lxml')
        div_id = soup.find('div', {'class': 'plotly-graph-div'}).get('id')
        js =f'''
            <script>
            var myDiv = document.getElementById('{div_id}');
            myDiv.on('plotly_click',
                function(eventdata) {{
                    let url = 'http://' + eventdata.points[0].text;
                    const el = document.createElement('textarea');
                    el.value = url;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                    window.open(url, '_blank');
                }}
            );
            </script>'''
        header = soup.new_tag("head")
        soup.html.insert(0, header)
        plotly_src = soup.new_tag("script", src="https://cdn.plot.ly/plotly-latest.min.js")
        soup.head.insert(0, plotly_src)
        js_soup = bs4.BeautifulSoup(js, 'lxml')
        soup.body.append(js_soup.script)
        html = str(soup)
        # # show the plot 
        # display(HTML(html))
        if save_html:
            if save_html[-1] == '/': path = os.path.join(save_html, f'{self.hostname}.html')
            else: path = save_html
            with open(path, 'w+') as f: f.write(html)
    
    def make_annotations(self, pos, text, M):
        L = len(pos)
        if len(text) != L:
            raise ValueError('The lists pos and text must have the same len')
        annotations = []
        for k in range(L):
            annotations.append(
                dict(
                    text=text[k], # or replace labels with a different list for the text within the circle
                    x=pos[k][0], y=2*M - pos[k][1],
                    xref='x1', yref='y1',
                    font=dict(color='rgb(250,250,250)', size=10),
                    showarrow=False)
            )
        return annotations


def plot_CDF(df, xtitle="", ytitle="", title="", cut=1, xrange=None, clear_bound=True):
    """
    Plot the CDF for different class
    data should be a pandas dataframe, where each row is a set of data. 
    cut: Percent of CDF to show 1 means all
    """
    fig = go.Figure()
    max_v = float("-inf")
    min_v = float("inf")
    fig.update_layout(
        autosize=False,
        title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        },
        xaxis_title=xtitle,
        yaxis_title=ytitle,
        width=1000,
        height=600,
        font=dict(
            family="Time New Roman",
            size=24,
            color="#7f7f7f"
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        margin=go.layout.Margin(
            l=50,
            r=50,
            b=50,
            t=30,
            pad=4
        ),
    )
    for name, col in df.items():
        length = len(col)
        sorted_col = col.sort_values()[col.notnull()]
        sorted_col = sorted_col[: int(length*cut)]
        y = np.linspace(0, 1, len(sorted_col))
        min_v = min(min_v, sorted_col.iloc[0])
        max_v = max(max_v, sorted_col.iloc[-1])
        fig.add_trace(go.Scatter(x=sorted_col, y=y,  \
                                 mode='lines', name=name, line={'width': 3}))
    diff = (max_v - min_v) / 100
    fig.update_xaxes(showgrid=True, gridwidth=2,  gridcolor='#ededed')
    fig.update_yaxes(showgrid=True, gridwidth=2, gridcolor='#ededed')
    if clear_bound: fig.update_xaxes(range=[min_v - diff, max_v + diff])
    if xrange:
        fig.update_xaxes(range=xrange)
    fig.show()


def plot_CDF_log(df, xtitle="", ytitle="", title="", cut=1, xrange=None, clear_bound=True):
    """
    Plot the CDF for different class
    data should be a pandas dataframe, where each row is a set of data. 
    cut: Percent of CDF to show 1 means all
    """
    fig = go.Figure()
    max_v = float("-inf")
    min_v = float("inf")
    fig.update_layout(
        autosize=False,
        title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        },
        xaxis_title=xtitle,
        yaxis_title=ytitle,
        width=1000,
        height=600,
        font=dict(
            family="Time New Roman",
            size=24,
            color="#7f7f7f"
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        margin=go.layout.Margin(
            l=50,
            r=50,
            b=50,
            t=30,
            pad=4
        ),
    )
    for name, col in df.iteritems():
        length = len(col)
        sorted_col = col.sort_values()[col.notnull()]
        sorted_col = sorted_col[: int(length*cut)]
        y = np.linspace(0, 1, len(sorted_col))
        min_v = min(min_v, sorted_col.iloc[0])
        max_v = max(max_v, sorted_col.iloc[-1])
        fig.add_trace(go.Scatter(x=sorted_col, y=y,  \
                                 mode='lines', name=name, line={'width': 3}))
    
    fig.update_xaxes(type="log", dtick=1)
#     diff = (max_v - min_v) / 100
#     if clear_bound: fig.update_xaxes(range=[min_v - diff, max_v + diff])
    fig.update_xaxes(showgrid=True, gridwidth=2,  gridcolor='#ededed')
    fig.update_yaxes(showgrid=True, gridwidth=2, gridcolor='#ededed')
    if xrange:
        fig.update_xaxes(range=xrange)
    fig['layout']['legend'] = dict(x=0.2, y=1.1, orientation='h')
    fig.show()


def plot_bar(df, xtitle="", ytitle="", title="", idx='', stacked=False, yrange=None, unified=False, \
             use_pattern=False, colors=contrast_scheme, width=None):
    """
    idx: name of the key that plot has x index on
    unified: Only useful when stacked is on. Put all the stac into 100%
    """
    patterns = ['', '/', '\\', 'x', '-', '|', '+', '.']
    fig = go.Figure()
    kwargs = {}
    if idx: df = df.set_index(idx)
    if width: kwargs['width'] = width
    if stacked and unified:
        df_sum = df.sum(axis=1)
        df = df.div(df_sum, axis=0)
    if df.shape[1] == 2:
        colors =[colors[0], colors[-1]]
    for i, (name, col) in enumerate(df.items()):
        c = colors[i]
        pattern = patterns[i%len(patterns)] if use_pattern else ''
        fig.add_trace(go.Bar(name=name, x=df.index, y=col, marker_color=c,\
                             marker_line={'width': 1, 'color': 'black'}, \
                             marker_pattern_shape=pattern, **kwargs))
    fig.update_layout(
        autosize=False,
        width=800,
        height=400,
        font=dict(
            family="Helvetica",
            size=24,
            # color="#7f7f7f"
            color="black"
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        margin=go.layout.Margin(
            l=10,
            r=10,
            b=1,
            t=1,
            pad=1
        ),
    )
    if xtitle:
        fig.update_layout(xaxis_title=xtitle)
    if ytitle:
        fig.update_layout(yaxis_title=ytitle)
    if title:
        fig.update_layout(title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        })
    if stacked: fig.update_layout(barmode='stack')

    fig.update_yaxes(showgrid=True, gridwidth=2, gridcolor='#ededed')
    if yrange:
        fig.update_yaxes(range=yrange)

    return fig

    
def plot_box(df, xtitle="", ytitle="", title=""):
    """
    Plot the boxplot for different class
    data should be a pandas dataframe, where each row is a set of data. 
    """
    fig = go.Figure()
    fig.update_layout(
        autosize=False,
        title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        },
        xaxis_title=xtitle,
        yaxis_title=ytitle,
        width=1300,
        height=800,
        font=dict(
            family="Time New Roman",
            size=16,
            color="#7f7f7f"
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        margin=go.layout.Margin(
            l=50,
            r=50,
            b=50,
            t=30,
            pad=4
        ),
        showlegend=False
    )
    for name, col in df.iteritems():
        length = len(col)
        col = col[col.notnull()]
        fig.add_trace(go.Box(y=col, name=name, boxpoints='all'))
    fig.show()


def plot_Scatter(df, xtitle="", ytitle="", title=""):
    """
    Plot the scatter plot for different class
    data should be a pandas dataframe, where each column is a class of data with (x, y). 
    """
    fig = go.Figure()
    fig.update_layout(
        autosize=False,
        title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        },
        xaxis_title=xtitle,
        yaxis_title=ytitle,
        width=1000,
        height=600,
        font=dict(
            family="Time New Roman",
            size=16,
            color="#7f7f7f"
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        margin=go.layout.Margin(
            l=50,
            r=50,
            b=50,
            t=30,
            pad=4
        ),
    )
    for name, col in df.iteritems():
        x = [c[0] for c in col if isinstance(c, list) or isinstance(c, tuple)]
        y = [c[1] for c in col if isinstance(c, list) or isinstance(c, tuple)]
        fig.add_trace(go.Scatter(x=x, y=y,  \
                                 name=name, mode='markers+lines', marker={'size': 5}))
    fig.show()

    
def plot_Line(df, xtitle="", ytitle="", title="", show=True):
    """
    Plot the line plot for different class
    data should be a pandas dataframe, where each column is a class of data with (x, y). 
    """
    fig = go.Figure()
    fig.update_layout(
        autosize=False,
        title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        },
        xaxis_title=xtitle,
        yaxis_title=ytitle,
        width=1000,
        height=600,
        font=dict(
            family="Time New Roman",
            size=16,
            color="#7f7f7f"
        ),
        plot_bgcolor='rgba(0,0,0,0)',
        margin=go.layout.Margin(
            l=50,
            r=50,
            b=50,
            t=30,
            pad=4
        ),
    )
    for name, col in df.iteritems():
        x = [c[0] for c in col if isinstance(c, list) or isinstance(c, tuple)]
        y = [c[1] for c in col if isinstance(c, list) or isinstance(c, tuple)]
        fig.add_trace(go.Scatter(x=x, y=y,  \
                                 name=name, mode='lines', line={'width': 3}))
    fig.update_xaxes(showgrid=True, gridwidth=2,  gridcolor='#ededed')
    fig.update_yaxes(showgrid=True, gridwidth=2, gridcolor='#ededed')
    if show:
        fig.show()
    else:
        return fig