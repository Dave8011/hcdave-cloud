# HC Dave Cloud 🖥️💾
> **Personal home cloud storage** — Access your HDD/SSD from anywhere via your browser.  
> Live at: **[drive.hcdavecloud.in](https://drive.hcdavecloud.in)**

---

## How It Works

```
Your Phone / Browser
       ↓ HTTPS
drive.hcdavecloud.in  ←→  Cloudflare Tunnel  ←→  [TV Box / Mini PC]
                                                       ↕  USB
                                                  HDD 2TB + SSD 512GB
```

- **Frontend** — React + Vite, deployed on Vercel (always on, free)
- **Agent** — Node.js server running on your TV Box / Mini PC at home
- **Tunnel** — Cloudflare Tunnel (free) — **no static IP, no port forwarding required.**

> 💡 **Network Independent:** Because the Cloudflare Tunnel initiates an *outbound* connection, it is completely plug-and-play. If you move houses, change your ISP, or buy a new WiFi router, you do **not** need to reconfigure anything. Just plug the Home Server into the new router, and it will instantly reconnect to `hcdavecloud.in`!

---

## Requirements

| What | Why |
|------|-----|
| TV Box or Mini PC (Android / Linux) | Runs the storage agent 24/7 |
| USB HDD or SSD | Your storage device |
| Cloudflare account | Free tunnel + DNS for hcdavecloud.in |
| Home internet | Must be ON for access |

> **Important:** Your TV Box / Mini PC must be running Linux or have a Linux-based environment.  
> Android TV Boxes can run Linux via Termux or a lightweight Linux distro.

---

## Step-by-Step Setup on TV Box / Mini PC

### Step 1 — Get the Code

Clone this repo on your TV Box or Mini PC:
```bash
git clone https://github.com/Dave8011/hcdave-cloud.git
cd hcdave-cloud
```

Or copy the files using a USB stick.

---

### Step 2 — Run the Agent Setup

```bash
chmod +x setup-agent.sh
sudo bash setup-agent.sh
```

This script will:
1. **Install Node.js** (automatically, if not present)
2. **Install npm dependencies** for the storage agent
3. Ask you to **set a security password** (used to log in to the web drive)
4. Create a **systemd service** so the agent starts automatically on boot

At the end you'll see:
```
✅  HC Dave Cloud Agent Setup Complete!
```

---

### Step 3 — Connect to Cloudflare Tunnel

```bash
chmod +x setup-cloudflare-tunnel.sh
sudo bash setup-cloudflare-tunnel.sh
```

This script will:
1. **Install cloudflared** (the Cloudflare tunnel client)
2. Open a **browser link** for you to log into your Cloudflare account
3. **Create a tunnel** named `hcdave-agent`
4. **Route** `api.hcdavecloud.in` → your TV Box (port 3001)
5. Create a **systemd service** to keep the tunnel alive forever

At the end you'll see:
```
✅  Cloudflare Tunnel Setup Complete!
   https://api.hcdavecloud.in — is your live agent
   https://drive.hcdavecloud.in — is your web drive
```

---

### Step 4 — Plug In Your Drives

Simply **plug in your USB HDD or SSD** to any USB port on your TV Box.

The agent **auto-detects** any drive mounted under:
- `/mnt/` (e.g. `/mnt/my-hdd`)
- `/media/` (most Linux distros auto-mount here)
- `/run/media/username/` (Arch / Manjaro style)

No configuration needed — just plug it in and it appears in your browser! 🎉

---

### Step 5 — Open Your Web Drive

Go to **[drive.hcdavecloud.in](https://drive.hcdavecloud.in)** from any browser — phone, tablet, laptop, anywhere.

Enter the **password** you set in Step 2 and you're in.

---

## Managing the Agent

```bash
# Check status
sudo systemctl status hcdave-agent

# View logs
sudo journalctl -u hcdave-agent -f

# Restart agent
sudo systemctl restart hcdave-agent

# Check Cloudflare tunnel
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

---

## Change the Password

Edit `/opt/hcdave-agent/.env`:
```bash
sudo nano /opt/hcdave-agent/.env
```

Change:
```
AUTH_PASSWORD=YourNewStrongPassword@2024
```

Then restart the agent:
```bash
sudo systemctl restart hcdave-agent
```

---

## Security Features

| Feature | Status |
|---------|--------|
| Bearer token auth | ✅ All API routes protected |
| Brute-force protection | ✅ 10 failed attempts = 15 min block |
| CORS whitelist | ✅ Only drive.hcdavecloud.in |
| Path traversal guard | ✅ All file paths sanitized |
| No token in URLs | ✅ Token only in Authorization header |
| HTTPS everywhere | ✅ Via Cloudflare (free TLS) |
| Video streaming | ✅ HTTP Range headers supported |

---

## Architecture

```
/home/dave/dev/drive-wifi/
├── src/                          # React frontend
│   ├── App.jsx                   # Main app + auth gate
│   ├── index.css                 # Design system + animations
│   ├── components/
│   │   ├── LoginPage.jsx         # Animated login page
│   │   ├── Sidebar.jsx           # Drive list + navigation
│   │   ├── TopBar.jsx            # Search + upload + settings
│   │   ├── FileExplorer.jsx      # Grid/list file browser
│   │   ├── FilePreviewModal.jsx  # Image/video preview + download
│   │   ├── UploadModal.jsx       # Drag & drop multi-file upload
│   │   └── SettingsModal.jsx     # Agent URL configuration
│   └── services/
│       └── api.js                # Secure API client (StorageService)
│
├── agent/
│   ├── server.js                 # Production Node.js agent
│   ├── package.json              # Agent dependencies
│   └── .env.example              # Config template
│
├── setup-agent.sh                # TV Box setup script
├── setup-cloudflare-tunnel.sh    # Cloudflare Tunnel setup script
├── vercel.json                   # Vercel deployment config
└── README.md                     # This file
```

---

## Troubleshooting

**Drive not showing up?**
- Check if it's mounted: `df -h`
- Manually mount: `sudo mount /dev/sda1 /mnt/my-hdd`
- Check agent logs: `journalctl -u hcdave-agent -n 50`

**Cannot login / wrong password?**
- Check your password in `/opt/hcdave-agent/.env`
- Restart agent after changes: `sudo systemctl restart hcdave-agent`

**Tunnel not connecting?**
- Check tunnel: `sudo cloudflared tunnel info hcdave-agent`
- Check service: `sudo systemctl status cloudflared`
- Re-authenticate: `sudo cloudflared tunnel login`

**Vercel build failing?**
- Go to Vercel → Project Settings → General
- Set **Root Directory** to blank (empty)
- Set **Build Command** to `npm run build`
- Set **Output Directory** to `dist`

---

## License

MIT — Personal use. Your data stays on your drives.
