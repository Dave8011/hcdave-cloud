#!/bin/bash
# Deployment script for HC Cloud Permanent Drive Detection and Auto-Mount Fix

set -e

echo "Deploying backend server fix..."
cp agent/server.js /opt/hcdave-agent/server.js

echo "Deploying frontend build..."
rm -rf /opt/dist
cp -r dist /opt/dist

echo "Installing automount mechanism..."
cp scripts/hcdave-automount.sh /usr/local/bin/hcdave-automount.sh
chmod +x /usr/local/bin/hcdave-automount.sh

cp scripts/99-hcdave-automount.rules /etc/udev/rules.d/99-hcdave-automount.rules

echo "Reloading udev rules..."
udevadm control --reload-rules
# Trigger an add event for existing block devices so they get mounted if not already
udevadm trigger --subsystem-match=block --action=add

echo "Restarting HC Cloud Agent..."
systemctl restart hcdave-agent.service

echo "Deployment complete! ✅"
echo "You can check 'systemctl status hcdave-agent.service' or 'ls /mnt' to verify."
