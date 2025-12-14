#!/bin/bash
# Script to run the fidex Docker container with volume mappings

# Build the image if it doesn't exist
if ! docker images | grep -q "fidex"; then
    echo "Building Docker image..."
    docker build -t fidex .
fi

# Run the container with volume mappings
# Use ENABLE_VNC=1 to enable VNC server for headful Chrome access
# VNC_DISPLAY=1 means display :1, which maps to port 5901
docker run -it --rm \
    --name fidex \
    -p 5901:5901 \
    -e ENABLE_VNC=1 \
    -e VNC_DISPLAY=1 \
    fidex

    # -v "$(pwd)/fidelity-files/writes:/home/pptruser/fidelity-files/writes" \
    # -v "$(pwd)/fidelity-files/warcs:/home/pptruser/fidelity-files/warcs" \