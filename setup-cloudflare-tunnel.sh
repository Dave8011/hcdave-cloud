#!/bin/bash

# Cloudflare Tunnel Automated Setup for hcdavecloud.in
# Links your Home Storage Agent (port 3001) to api.hcdavecloud.in

DOMAIN="hcdavecloud.in"
API_SUBDOMAIN="api.hcdavecloud.in"

echo "=================================================="
echo "🌐 Setting up Cloudflare Tunnel for $DOMAIN"
echo "=================================================="

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "📦 Downloading and installing cloudflared..."
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared.deb || sudo apt-get install -f -y
    rm cloudflared.deb
fi

echo "🔐 Step 1: Login to your Cloudflare Account..."
echo "A browser window or link will pop up. Select your domain: $DOMAIN"
cloudflared tunnel login

echo ""
echo "⚙️ Step 2: Creating Tunnel 'hcdave-tunnel'..."
cloudflared tunnel create hcdave-tunnel

echo ""
echo "⚙️ Step 3: Routing DNS $API_SUBDOMAIN to your Tunnel..."
cloudflared tunnel route dns hcdave-tunnel $API_SUBDOMAIN

# Create Cloudflare config file
mkdir -p ~/.cloudflared
CONFIG_FILE="$HOME/.cloudflared/config.yml"
TUNNEL_ID=$(cloudflared tunnel list | grep hcdave-tunnel | awk '{print $1}')
CRED_FILE="$HOME/.cloudflared/$TUNNEL_ID.json"

cat <<EOT > $CONFIG_FILE
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $API_SUBDOMAIN
    service: http://localhost:3001
  - service: http_status:404
EOT

echo ""
echo "🚀 Step 4: Installing Cloudflare Tunnel as a 24/7 Background System Daemon..."
sudo cloudflared --config $CONFIG_FILE service install

echo ""
echo "=================================================="
echo "✅ CLOUDFLARE TUNNEL SETUP COMPLETE!"
echo "=================================================="
echo "🔗 Domain $API_SUBDOMAIN is now connected to your Home Storage Agent!"
echo "🌐 Open https://$API_SUBDOMAIN in your browser to test!"
echo "=================================================="
