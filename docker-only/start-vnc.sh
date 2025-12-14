#!/bin/bash
set -e

# VNC display number (1 = port 5901, 2 = port 5902, etc.)
VNC_DISPLAY=${VNC_DISPLAY:-1}
VNC_PORT=$((5900 + VNC_DISPLAY))
DISPLAY_NUM=":${VNC_DISPLAY}"

# Create .vnc directory if it doesn't exist
mkdir -p ~/.vnc

# Create xstartup script for fluxbox
if [ ! -f ~/.vnc/xstartup ]; then
    cat > ~/.vnc/xstartup << 'EOF'
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
[ -x /etc/vnc/xstartup ] && exec /etc/vnc/xstartup
[ -r $HOME/.Xresources ] && xrdb $HOME/.Xresources
x-window-manager &
fluxbox &
EOF
    chmod +x ~/.vnc/xstartup
fi

# Kill any existing vncserver on this display
vncserver -kill $DISPLAY_NUM 2>/dev/null || true
sleep 1

# Start vncserver
# -geometry: screen resolution
# -depth: color depth
# -localhost no: allow connections from outside the container
# -SecurityTypes: None = no password, VncAuth = use password file
echo "Starting VNC server on display $DISPLAY_NUM (port $VNC_PORT)..."
vncserver $DISPLAY_NUM \
    -geometry 1920x1080 \
    -depth 24 \
    -localhost no \
    -SecurityTypes None

# Wait for vncserver to be ready
sleep 2

# Set DISPLAY environment variable
export DISPLAY=$DISPLAY_NUM

echo ""
echo "=========================================="
echo "VNC server is ready!"
echo "Display: $DISPLAY_NUM"
echo "Port: $VNC_PORT"
echo "Connect using VNC viewer to: localhost:$VNC_PORT"
echo "=========================================="
echo ""

# Keep the script running and monitor vncserver
while pgrep -x "Xvnc" > /dev/null; do
    sleep 5
done

echo "VNC server has stopped"
