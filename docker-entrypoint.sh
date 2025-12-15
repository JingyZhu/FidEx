#!/bin/bash
set -e

cd ${HOME_DIR}/fidelity-files
cp -r ${HOME_DIR}/chrome_data/base ${HOME_DIR}/chrome_data/${HOSTNAME}
. ${HOME_DIR}/venv/pywb/bin/activate && wayback -p 8080 &
cd ${HOME_DIR}

exec "$@"