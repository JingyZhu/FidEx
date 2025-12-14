#!/bin/bash
set -e

# Fix permissions for mounted volumes
# This allows the container user (pptruser) to write to host-mounted directories
# if [ -n "$FIX_VOLUME_PERMISSIONS" ]; then
#     # Get the current user's UID and GID
#     CURRENT_UID=$(id -u)
#     CURRENT_GID=$(id -g)
    
#     # Fix permissions for directories specified in FIX_VOLUME_PERMISSIONS (colon-separated)
#     IFS=':' read -ra DIRS <<< "$FIX_VOLUME_PERMISSIONS"
#     for dir in "${DIRS[@]}"; do
#         if [ -d "$dir" ]; then
#             # echo "Fixing permissions for $dir (UID: $CURRENT_UID, GID: $CURRENT_GID)"
#             sudo chown -R $CURRENT_UID:$CURRENT_GID "$dir" 2>/dev/null || true
#             sudo chmod -R u+w "$dir" 2>/dev/null || true
#         fi
#     done
# fi

cd ${HOME_DIR}/fidelity-files
cp -r ${HOME_DIR}/chrome_data/base ${HOME_DIR}/chrome_data/${HOSTNAME}
cd ${HOME_DIR}

exec "$@"