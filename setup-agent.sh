#!/bin/bash

# Plug & Play Setup Script for Home Storage Agent
# Runs on TV Box / Single-Board Computer / Linux Router

echo "=================================================="
echo "🚀 Setting up Home Cloud Storage Agent..."
echo "=================================================="

# Update & install Node.js if missing
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install dependencies inside agent directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/agent" || exit 1

echo "📦 Installing agent dependencies..."
npm install

# Create Systemd service for auto-start on boot
SERVICE_FILE="/etc/systemd/system/home-storage-agent.service"

echo "⚙️ Creating auto-start background service ($SERVICE_FILE)..."
sudo bash -c "cat <<EOT > $SERVICE_FILE
[Unit]
Description=Home Storage Agent Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR/agent
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3001
Environment=HDD_PATH=/mnt/hdd
Environment=SSD_PATH=/mnt/ssd

[Install]
WantedBy=multi-user.target
EOT"

# Enable & Start Service
sudo systemctl daemon-reload
sudo systemctl enable home-storage-agent
sudo systemctl start home-storage-agent

echo ""
echo "=================================================="
echo "✅ SETUP COMPLETE!"
echo "=================================================="
echo "📡 Storage Agent is now running on port 3001"
echo "📁 Plug your HDD to /mnt/hdd and SSD to /mnt/ssd"
echo "🔗 Connect with Tailscale or Cloudflare Tunnel!"
echo "=================================================="
