#!/bin/bash
set -e

export USER=pptruser

rm -rf $HOME/.vnc
vncserver -geometry 1920x1080 :1