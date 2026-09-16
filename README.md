# ☁️ My Home Cloud Drive

A self-hosted, Google Drive-style Personal Cloud Storage application designed for accessing a **2TB HDD** and **512GB SSD** attached to your home router / TV Box from anywhere in the world — without purchasing a static IP!

---

## 🌟 Architecture Overview

1. **Frontend Web App (Deployed on Vercel):**
   - Sleek Google Drive-like interface built with React + Vite + Glassmorphism Dark Mode.
   - Dual-drive support (Toggle between **2TB HDD** and **512GB SSD**).
   - In-browser video streaming, photo lightboxes, drag-and-drop file uploads, and storage gauges.
   - Built-in **Demo / Mock Mode** to test UI without hardware connected.

2. **Backend Storage Agent (Runs on Home TV Box / Router):**
   - Ultra-lightweight Node.js server (~30MB RAM footprint).
   - Automatically reads mounted USB drives at `/mnt/hdd` and `/mnt/ssd`.
   - Handles video streaming (HTTP `Range` requests), file listing, chunked uploads, and downloads.

3. **Remote Bridge (Cloudflare Tunnel or WireGuard / Tailscale):**
   - Connects Vercel to your home hard drive over HTTPS.
   - **Zero Static IP required** • **Bypasses ISP CGNAT** • **Zero Open Router Ports**.

---

## 🚀 Quick Start (Running Locally / Testing Mock Mode)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser.
4. By default, **Demo / Mock Mode** is active! You can toggle between 2TB HDD and 512GB SSD, preview sample files, and test uploads right away.

---

## 📦 How to Deploy Frontend to Vercel via GitHub

1. Initialize git and commit:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Home Cloud Drive"
   ```

2. Create a new repository on [GitHub](https://github.com) and push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/home-cloud-drive.git
   git branch -M main
   git push -u origin main
   ```

3. Go to [Vercel.com](https://vercel.com) -> **Add New Project** -> Select your GitHub repository.
4. Click **Deploy**. Your drive web app is now live on a global `https://my-drive.vercel.app` URL!

---

## 🔌 Plug & Play Hardware Setup (When TV Box / Router Arrives)

When your TV Box, mini PC, or single-board computer arrives:

1. Plug your **2TB HDD** and **512GB SSD** into the USB ports.
2. Clone this repo on the device and run the installer:
   ```bash
   chmod +x setup-agent.sh
   ./setup-agent.sh
   ```
3. The installer creates an auto-boot background service running on port `3001`.

---

## 🔒 Connecting Vercel to Home Storage (2 Easy Ways)

### Option A: Cloudflare Tunnel (Zero Apps Needed on Phone)
1. Install `cloudflared` on your TV box:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```
2. Copy the generated `https://xxx.trycloudflare.com` URL.
3. Open your Vercel Web App -> Click **Config** (Settings) -> Paste URL -> Click **Save & Connect**.

### Option B: Tailscale WireGuard (Maximum Speed & Privacy)
1. Install Tailscale on TV box: `curl -fsSL https://tailscale.com/install.sh | sh`
2. Install Tailscale app on your phone.
3. Open Vercel Web App -> Click **Config** -> Enter your Tailscale IP `http://100.x.y.z:3001`.
