#!/usr/bin/env bash
# ============================================================
# HC Dave Cloud — Storage Agent Setup Script
# Run this on your TV Box / Router (Linux arm64 / x86_64)
# Usage: chmod +x setup-agent.sh && sudo bash setup-agent.sh
# ============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

INSTALL_DIR="/opt/hcdave-agent"
SERVICE_NAME="hcdave-agent"

header() { echo -e "\n${CYAN}${BOLD}▶  $1${NC}"; }
ok()     { echo -e "  ${GREEN}✔  $1${NC}"; }
warn()   { echo -e "  ${YELLOW}⚠  $1${NC}"; }
fail()   { echo -e "  ${RED}✖  $1${NC}"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   HC Dave Cloud — Agent Installer v2.0  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"

# ── 1. Root check
[[ "$EUID" -ne 0 ]] && fail "Please run as root: sudo bash setup-agent.sh"

# ── 2. OS check & core utilities
if ! command -v apt-get &>/dev/null && ! command -v pacman &>/dev/null && ! command -v yum &>/dev/null; then
  fail "Unsupported package manager. Use Debian/Ubuntu/Arch/CentOS."
fi

if ! command -v curl &>/dev/null; then
  header "Installing curl (required for setup)"
  if command -v apt-get &>/dev/null; then apt-get update -y && apt-get install -y curl; fi
  if command -v pacman &>/dev/null; then pacman -Sy --noconfirm curl; fi
  if command -v yum &>/dev/null; then yum install -y curl; fi
fi

# ── 3. Install Node.js
header "Checking Node.js"
if ! command -v node &>/dev/null; then
  warn "Node.js not found — installing..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm nodejs npm
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  fi
fi
NODE_VER=$(node -v)
ok "Node.js $NODE_VER installed"

# ── 4. Create install directory
header "Setting up directories"
mkdir -p "$INSTALL_DIR"
cp -r "$(dirname "$0")/agent/"* "$INSTALL_DIR/"
ok "Agent files copied to $INSTALL_DIR"

# ── 5. Install npm dependencies
header "Installing dependencies"
cd "$INSTALL_DIR"
npm install --omit=dev --silent
ok "npm packages installed"

# ── 6. Configure password
header "Security Password Setup"
DEFAULT_PW="HCDave@$(date +%Y)"
echo ""
echo -e "  ${BOLD}Set a strong password to protect your storage.${NC}"
echo -n "  Enter password (or press Enter for auto-generated): "
read -r -s INPUT_PW
echo ""
FINAL_PW="${INPUT_PW:-$DEFAULT_PW}"

# Write .env
cat > "$INSTALL_DIR/.env" <<EOF
AUTH_PASSWORD=$FINAL_PW
PORT=3001
ALLOWED_ORIGIN=https://drive.hcdavecloud.in
EOF
chmod 600 "$INSTALL_DIR/.env"
ok "Password saved to $INSTALL_DIR/.env (mode 600)"
echo -e "  ${YELLOW}→  Your password: ${BOLD}$FINAL_PW${NC}"
echo -e "  ${YELLOW}   Keep this safe! You will need it to log in.${NC}"

# ── 7. Create systemd service
header "Creating systemd service"
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=HC Dave Cloud Storage Agent
After=network.target

[Service]
Type=simple
ExecStart=$(command -v node) $INSTALL_DIR/server.js
WorkingDirectory=$INSTALL_DIR
Restart=always
RestartSec=5
User=root
EnvironmentFile=$INSTALL_DIR/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
ok "Service $SERVICE_NAME started and enabled on boot"

# ── 8. Status check
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  header "Status"
  ok "Agent is RUNNING on port 3001"
else
  warn "Service may have failed. Check: journalctl -u $SERVICE_NAME -n 30"
fi

echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅  HC Dave Cloud Agent Setup Complete!     ${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Next step:${NC} Run setup-cloudflare-tunnel.sh"
echo ""
