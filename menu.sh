#!/bin/bash
# HC Dave Cloud Server Manager

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}=======================================${NC}"
echo -e "${GREEN}   HC Dave Cloud - Server Manager      ${NC}"
echo -e "${CYAN}=======================================${NC}"
echo "1) 🔄 Update Server Code from GitHub"
echo "2) 🚀 Restart Server (hcdave-agent)"
echo "3) 📊 View Server Status & IP"
echo "4) 🚪 Exit"
echo ""
read -p "Select an option [1-4]: " option

case $option in
  1)
    echo -e "${CYAN}Pulling latest code...${NC}"
    sudo git config --global --add safe.directory "*"
    sudo git reset --hard HEAD
    sudo git pull
    echo -e "${CYAN}Deploying to server directory...${NC}"
    sudo cp -r agent/* /opt/hcdave-agent/
    sudo systemctl restart hcdave-agent
    echo -e "${GREEN}Update Complete!${NC}"
    ;;
  2)
    echo -e "${CYAN}Restarting server...${NC}"
    sudo systemctl restart hcdave-agent
    echo -e "${GREEN}Server restarted!${NC}"
    ;;
  3)
    IP=$(hostname -I | awk '{print $1}')
    echo -e "${CYAN}Server IP:${NC} $IP"
    sudo systemctl status hcdave-agent --no-pager | head -n 10
    ;;
  4)
    exit 0
    ;;
  *)
    echo -e "${RED}Invalid option.${NC}"
    ;;
esac
