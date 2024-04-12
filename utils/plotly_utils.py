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
                                 name=name, mode='markers', marker={'size': 5}))
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

def plot_heatmap(data, xtitle="", ytitle="", title="", show=True):
    """
    Plot the heatmap for different class
    data should be a numpy array. 
    """
    fig = go.Figure()
    fig.add_trace(go.Heatmap(z=data))
    fig.update_layout(
        autosize=False,
        yaxis_autorange='reversed',
        title={
            'text': title,
            'x':0.5,
            'yanchor': 'top'
        },
        xaxis_title=xtitle,
        yaxis_title=ytitle,
        width=1000,
        height=1000,
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
    if show:
        fig.show()
    else:
        return fig