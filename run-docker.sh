#!/bin/bash
# Script to run the fidex Docker container with volume mappings

# Build the image if it doesn't exist
if ! docker images | grep -q "fidex"; then
    echo "Building Docker image..."
    docker build -t fidex .
fi

# Run the container with volume mappings
# VNC_DISPLAY=1 means display :1, which maps to port 5901

# To fix permissions for mounted volumes, use FIX_VOLUME_PERMISSIONS env var
# Example: -e FIX_VOLUME_PERMISSIONS="/mounted/path1:/mounted/path2"
# The entrypoint script will automatically fix ownership and permissions
docker run -it --rm \
    --name fidex \
    -p 5901:5901 \
    -e VNC_DISPLAY=1 \
    -e FIX_VOLUME_PERMISSIONS="/root/fidelity-files/writes:/root/fidelity-files/warcs:/root/measurement" \
    -v $(pwd)/fidelity-files/writes:/root/fidelity-files/writes \
    -v $(pwd)/fidelity-files/warcs:/root/fidelity-files/warcs \
    -v $(pwd)/measurement:/root/measurement \
    -v $(pwd)/fidex:/root/fidex \
    fidex