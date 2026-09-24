#!/usr/bin/env bash
# ============================================================
# HC Dave Cloud — Master Setup Wizard
# ============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

header() { echo -e "\n${CYAN}${BOLD}▶  $1${NC}"; }
ok()     { echo -e "  ${GREEN}✔  $1${NC}"; }
warn()   { echo -e "  ${YELLOW}⚠  $1${NC}"; }

[[ "$EUID" -ne 0 ]] && { echo -e "${RED}✖ Please run as root: sudo bash install.sh${NC}"; exit 1; }

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  HC Dave Cloud — Unified Setup Wizard v2.0     ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════╝${NC}"

chmod +x setup-agent.sh setup-cloudflare-tunnel.sh

header "Step 1: Installing Agent..."
bash setup-agent.sh

header "Step 2: Installing Cloudflare Tunnel..."
bash setup-cloudflare-tunnel.sh

header "Step 3: Plugging in Drives"
echo -e "  ${YELLOW}${BOLD}Please plug in your SSD and HDD drives into the Dell now.${NC}"
echo -e "  Wait about 10 seconds for Linux to detect them..."
echo -n "  Press [Enter] when you have plugged them in: "
read -r

header "Auto-Mounting Drives"
drive_count=1
mounted_any=false

# In Linux, USB drives usually appear as /dev/sda1, /dev/sdb1, etc.
# (The internal eMMC is usually /dev/mmcblk0p1)
for device in /dev/sd*[1-9]; do
  if [ -e "$device" ]; then
    mount_dir="/mnt/drive$drive_count"
    mkdir -p "$mount_dir"
    if mount "$device" "$mount_dir" 2>/dev/null || true; then
      ok "Mounted $device to $mount_dir"
      mounted_any=true
      
      # Add to fstab for persistence across reboots
      UUID=$(blkid -s UUID -o value "$device" || true)
      if [ -n "$UUID" ]; then
        if ! grep -q "$UUID" /etc/fstab; then
          echo "UUID=$UUID $mount_dir auto defaults,nofail 0 2" >> /etc/fstab
          ok "Added $device to auto-boot list"
        fi
      fi
      ((drive_count++))
    fi
  fi
done

if ! $mounted_any; then
  warn "No USB partitions found (/dev/sd*). Make sure they are formatted correctly (NTFS, exFAT, or ext4)."
fi

echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅  SETUP 100% COMPLETE!                                 ${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}You can now disconnect the monitor and keyboard from the Dell!${NC}"
echo -e "  It will run silently in the background forever."
echo ""
echo -e "  ${BOLD}Web Access (Anywhere in the world):${NC}"
echo -e "  ${CYAN}  https://drive.hcdavecloud.in${NC}"
echo ""
echo -e "  ${BOLD}Terminal SSH Access (When on home WiFi):${NC}"
echo -e "  ${YELLOW}  ssh root1@$(hostname -I | awk '{print $1}')${NC}"
echo ""
