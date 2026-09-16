#!/usr/bin/env bash
# ============================================================
# HC Dave Cloud — Headless USB Auto-Mount Setup
# Run this on your Dell Wyse / TV Box to enable true plug-and-play
# ============================================================

set -e
echo "Setting up headless USB auto-mounting..."

# 1. Install udisks2 if not present
if ! command -v udisksctl &>/dev/null; then
  echo "Installing udisks2..."
  if command -v apt-get &>/dev/null; then
    apt-get update && apt-get install -y udisks2
  elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm udisks2
  fi
fi

# 2. Create udev rule to automatically mount USB drives using udisks2
cat > /etc/udev/rules.d/99-usb-automount.rules << 'EOF'
ACTION=="add", SUBSYSTEMS=="usb", SUBSYSTEM=="block", ENV{ID_FS_USAGE}=="filesystem", RUN+="/usr/bin/systemd-run --no-block --collect /usr/bin/udisksctl mount -b %N"
EOF

# 3. Reload udev
udevadm control --reload-rules
udevadm trigger

echo "✅ USB Auto-Mount is now active!"
echo "Any drive plugged in will instantly mount to /run/media or /media."
