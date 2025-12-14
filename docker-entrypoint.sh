#!/bin/bash
set -e

cd ${HOME_DIR}/fidelity-files
cp -r ${HOME_DIR}/chrome_data/base ${HOME_DIR}/chrome_data/${HOSTNAME}
cd ${HOME_DIR}

# Execute the main command
exec "$@"
