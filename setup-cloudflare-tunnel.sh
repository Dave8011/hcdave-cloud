#!/usr/bin/env bash
# ============================================================
# HC Dave Cloud — Cloudflare Tunnel Setup Script
# Connects your TV Box to hcdavecloud.in — No static IP needed
# Usage: chmod +x setup-cloudflare-tunnel.sh && sudo bash setup-cloudflare-tunnel.sh
# ============================================================

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

header() { echo -e "\n${CYAN}${BOLD}▶  $1${NC}"; }
ok()     { echo -e "  ${GREEN}✔  $1${NC}"; }
warn()   { echo -e "  ${YELLOW}⚠  $1${NC}"; }
fail()   { echo -e "  ${RED}✖  $1${NC}"; exit 1; }

TUNNEL_NAME="hcdave-agent"
AGENT_PORT=3001
DOMAIN="api.hcdavecloud.in"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  HC Dave Cloud — Cloudflare Tunnel Setup v2.0 ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════╝${NC}"

[[ "$EUID" -ne 0 ]] && fail "Please run as root: sudo bash setup-cloudflare-tunnel.sh"

# ── 1. Install cloudflared
header "Installing cloudflared"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  CF_ARCH="amd64" ;;
  aarch64) CF_ARCH="arm64" ;;
  armv7l)  CF_ARCH="arm"   ;;
  *)       fail "Unsupported arch: $ARCH" ;;
esac

if command -v cloudflared &>/dev/null; then
  ok "cloudflared already installed: $(cloudflared --version)"
else
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
  curl -fsSL -o /usr/local/bin/cloudflared "$CF_URL"
  chmod +x /usr/local/bin/cloudflared
  ok "cloudflared installed (linux-$CF_ARCH)"
fi

# ── 2. Authenticate with Cloudflare
header "Cloudflare Authentication"
echo ""
echo -e "  ${BOLD}You need to log in to Cloudflare once.${NC}"
echo -e "  A browser link will open (or copy the URL to your phone)."
echo -e "  Log in with the account that manages ${BOLD}hcdavecloud.in${NC}"
echo ""
echo -n "  Press Enter to open Cloudflare login..."
read -r
cloudflared tunnel login

# ── 3. Create the tunnel (idempotent)
header "Creating Tunnel: $TUNNEL_NAME"
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  ok "Tunnel '$TUNNEL_NAME' already exists"
else
  cloudflared tunnel create "$TUNNEL_NAME"
  ok "Tunnel '$TUNNEL_NAME' created"
fi

TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
ok "Tunnel ID: $TUNNEL_ID"

# ── 4. Write cloudflared config
header "Writing Cloudflare config"
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$AGENT_PORT
  - service: http_status:404
EOF
ok "Config written to /etc/cloudflared/config.yml"

# ── 5. Create DNS route
header "Creating DNS Route: $DOMAIN"
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>/dev/null || true
ok "DNS route set: $DOMAIN → Tunnel"

# ── 6. Create systemd service for tunnel
header "Creating systemd service for tunnel"
cat > /etc/systemd/system/cloudflared.service <<EOF
[Unit]
Description=HC Dave Cloud — Cloudflare Tunnel
After=network.target hcdave-agent.service

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cloudflared
systemctl restart cloudflared
ok "Cloudflare Tunnel service started and enabled on boot"

# ── 7. Verify
sleep 3
if systemctl is-active --quiet cloudflared; then
  ok "Cloudflare Tunnel is RUNNING"
else
  warn "Tunnel may be starting. Check: journalctl -u cloudflared -n 30"
fi

echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅  Cloudflare Tunnel Setup Complete!                    ${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Your agent is now accessible at:${NC}"
echo -e "  ${CYAN}  https://$DOMAIN${NC}"
echo ""
echo -e "  ${BOLD}Your web drive is at:${NC}"
echo -e "  ${CYAN}  https://drive.hcdavecloud.in${NC}"
echo ""
echo -e "  ${BOLD}Go to:${NC} https://drive.hcdavecloud.in"
echo -e "  Enter the password you set during setup-agent.sh"
echo ""
