const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const http     = require('http');
const https    = require('https');
const net      = require('net');
const { execSync, exec } = require('child_process');
const util     = require('util');
const execAsync = util.promisify(exec);
const crypto   = require('crypto');
const multer   = require('multer');
const os       = require('os');

/* ─────────────────────────────────────────────
   AUTO-INSTALL MISSING DEPENDENCIES
   ───────────────────────────────────────────── */
try {
  require.resolve('sharp');
  require.resolve('archiver');
} catch (e) {
  console.log('🔄 Missing dependencies detected (sharp/archiver). Installing now...');
  execSync('npm install --omit=dev', { cwd: __dirname, stdio: 'inherit' });
}
const sharp = require('sharp');
const archiver = require('archiver');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'Unknown';
}

/* ─────────────────────────────────────────────
   ENV LOADING (agent/.env)
   ───────────────────────────────────────────── */
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    });
}

let GIT_HASH = '';
let GIT_COUNT = '0';
// Try to get version from the repository even if we are running in /opt/hcdave-agent
const repoPaths = [__dirname, '/home/root1/hcdave-cloud', '/home/dave/dev/drive-wifi'];
for (const repo of repoPaths) {
  try {
    GIT_HASH = execSync('git rev-parse --short HEAD', { cwd: repo, stdio: 'pipe' }).toString().trim();
    GIT_COUNT = execSync('git rev-list --count HEAD', { cwd: repo, stdio: 'pipe' }).toString().trim();
    if (GIT_HASH) break;
  } catch (e) {}
}

// Truly automatic versioning based on commit count. 
// Every git commit automatically bumps the version number (e.g. 1.4.52)
const VERSION = `1.4.${GIT_COUNT}${GIT_HASH ? '-' + GIT_HASH : ''}`;
const app           = express();
const PORT          = Number(process.env.PORT) || 3001;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'ChangeMe@2024';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://drive.hcdavecloud.in';
const SCANNER_JWT_SECRET = process.env.SCANNER_JWT_SECRET || 'hcdave-scanner-default-jwt-secret-key-2024';


let scannerUpdateState = { status: 'idle', logs: '', error: null };

/* ─────────────────────────────────────────────
   RATE LIMITER (brute-force protection)
   ───────────────────────────────────────────── */
const failMap = new Map(); // IP -> { count, blockUntil }

function rateLimitAuth(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const entry = failMap.get(ip) || { count: 0, blockUntil: 0 };

  if (entry.blockUntil > now) {
    const secs = Math.ceil((entry.blockUntil - now) / 1000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${secs}s.` });
  }
  req._ip = ip;
  req._entry = entry;
  next();
}

function recordFailure(ip, entry) {
  entry.count += 1;
  if (entry.count >= 10) {
    entry.blockUntil = Date.now() + 15 * 60 * 1000; // 15-minute block
    entry.count = 0;
  }
  failMap.set(ip, entry);
}

/* ─────────────────────────────────────────────
   MIDDLEWARE
   ───────────────────────────────────────────── */

app.use(cors({
  origin: [ALLOWED_ORIGIN, 'https://drive.hcdavecloud.in', 'http://localhost:3000', 'http://localhost:3002', 'http://localhost:5173', 'https://scanner.hcdavecloud.in'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* ─────────────────────────────────────────────
   AUTH MIDDLEWARE
   ───────────────────────────────────────────── */
function auth(req, res, next) {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const hashedPass = crypto.createHash('md5').update(AUTH_PASSWORD).digest('hex');

  // Allow raw password OR hashed password (for public URLs) OR temp share token
  if (token !== AUTH_PASSWORD && token !== hashedPass && !tempTokens.has(token)) {
    recordFailure(req._ip || 'unknown', req._entry || { count: 0, blockUntil: 0 });
    return res.status(403).json({ error: 'Invalid password' });
  }
  // Reset failures on success
  failMap.delete(req._ip);
  next();
}

/* ─────────────────────────────────────────────
   PATH TRAVERSAL GUARD & FILENAME SANITIZATION
   ───────────────────────────────────────────── */
function safePath(baseDir, userPath) {
  const resolvedBase = path.resolve(baseDir);
  // Remove null bytes, control chars, and leading slashes/backslashes
  const cleanPath = (userPath || '/').replace(/[\x00-\x1F\x7F]/g, '').replace(/^(\/|\\)+/, '');
  const resolved = path.resolve(resolvedBase, cleanPath);
  const rel = path.relative(resolvedBase, resolved);
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (rel.startsWith('..') || path.isAbsolute(rel) || (resolved !== resolvedBase && !resolved.startsWith(baseWithSep))) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}

function verifySafeContainment(baseDir, relativeOrFilename, allowSame = false) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, relativeOrFilename || '');
  const rel = path.relative(resolvedBase, resolvedTarget);
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path traversal attempt blocked: path escapes destination directory');
  }
  if (resolvedTarget === resolvedBase) {
    if (!allowSame) {
      throw new Error('Path traversal attempt blocked: path escapes destination directory');
    }
    return resolvedTarget;
  }
  if (!resolvedTarget.startsWith(baseWithSep)) {
    throw new Error('Path traversal attempt blocked: path escapes destination directory');
  }
  return resolvedTarget;
}

function sanitizeFilename(rawName, fallback = 'upload', maxBytes = 255) {
  if (typeof rawName !== 'string') return fallback;
  let name = rawName;
  try {
    name = decodeURIComponent(name);
  } catch (_) {}

  // Strip null bytes and control characters
  name = name.replace(/[\x00-\x1F\x7F]/g, '');

  // Split on both forward slash and backslash
  const segments = name.split(/[/\\]+/).filter(Boolean);
  let base = segments.length > 0 ? segments[segments.length - 1] : '';

  // Remove any leading dots (prevents hidden/dot files)
  base = base.replace(/^\.+/, '');

  // Strip characters unsafe on Windows / Linux / macOS
  base = base.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_').trim();

  // Strip trailing dots or spaces
  base = base.replace(/[. ]+$/, '');

  // Path basename enforcement
  base = path.basename(base);

  // Block Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const stem = base.replace(/\.[^/.]*$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) {
    base = '_' + base;
  }

  if (!base || base === '.' || base === '..' || base.trim() === '') {
    base = fallback;
  }

  // Truncate to maxBytes (Linux ext4/xfs limit is 255 bytes, NOT characters)
  if (Buffer.byteLength(base, 'utf8') > maxBytes) {
    let ext = path.extname(base);
    const maxAllowedExtBytes = Math.floor(maxBytes * 0.7);
    if (Buffer.byteLength(ext, 'utf8') > maxAllowedExtBytes) {
      while (Buffer.byteLength(ext, 'utf8') > maxAllowedExtBytes && ext.length > 0) {
        ext = ext.slice(0, -1);
      }
    }
    const extBytes = Buffer.byteLength(ext, 'utf8');
    const maxStemBytes = Math.max(0, maxBytes - extBytes);
    let s = path.basename(base, path.extname(base));
    while (Buffer.byteLength(s, 'utf8') > maxStemBytes && s.length > 0) {
      s = s.slice(0, -1);
    }
    base = s + ext;
    while (Buffer.byteLength(base, 'utf8') > maxBytes && base.length > 0) {
      base = base.slice(0, -1);
    }
    if (!base || base === '.' || base === '..' || base.trim() === '') {
      base = fallback;
    }
  }

  return base;
}

function getUniqueFilename(dir, baseFilename, maxBytes = 255) {
  const safeBase = sanitizeFilename(baseFilename, 'file', maxBytes);
  const ext = path.extname(safeBase);
  const extBytes = Buffer.byteLength(ext, 'utf8');
  let finalName = safeBase;
  let counter = 1;
  while (fs.existsSync(path.join(dir, finalName))) {
    const suffix = ` (${counter})`;
    const suffixBytes = Buffer.byteLength(suffix, 'utf8');
    const maxStemBytes = Math.max(1, maxBytes - extBytes - suffixBytes);
    let s = path.basename(safeBase, ext);
    while (Buffer.byteLength(s, 'utf8') > maxStemBytes && s.length > 0) {
      s = s.slice(0, -1);
    }
    finalName = `${s}${suffix}${ext}`;
    counter++;
  }
  return finalName;
}

/* ─────────────────────────────────────────────
   SHARE LINKS DATABASE (shares.json)
   ───────────────────────────────────────────── */
const sharesFile = path.join(__dirname, 'shares.json');
function loadShares() {
  try { return JSON.parse(fs.readFileSync(sharesFile, 'utf8')); }
  catch (e) { return {}; }
}
function saveShares(shares) {
  fs.writeFileSync(sharesFile, JSON.stringify(shares, null, 2));
}

// In-memory temp tokens for one-time downloads after the main link is burned
const tempTokens = new Map();

/* ─────────────────────────────────────────────
   DYNAMIC DRIVE DISCOVERY
   ───────────────────────────────────────────── */
let cachedDrives = [];

async function updateDrives() {
  const drives = [];
  const searchDirs = ['/mnt', '/media'];

  // Read drive roles
  let driveRoles = {};
  try {
    const rolesPath = path.join(__dirname, 'drive_roles.json');
    if (fs.existsSync(rolesPath)) {
      driveRoles = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read drive roles:', e);
  }

  // Also check /run/media/<username>
  try {
    const runMedia = '/run/media';
    if (fs.existsSync(runMedia)) {
      fs.readdirSync(runMedia).forEach(user => {
        const userPath = path.join(runMedia, user);
        if (fs.statSync(userPath).isDirectory()) {
          searchDirs.push(userPath);
        }
      });
    }
  } catch (_) {}

  for (const base of searchDirs) {
    if (!fs.existsSync(base)) continue;
    let subs;
    try { subs = fs.readdirSync(base); } catch (_) { continue; }

    for (const sub of subs) {
      if (sub.toLowerCase() === 'cdrom') continue; // Skip cdrom

      const fullPath = path.join(base, sub);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) continue;

        // Must be a real mount point — different device ID from its parent directory
        const parentStat = fs.statSync(base);
        if (stat.dev === parentStat.dev) continue;

        // Skip the OS/internal drive — any filesystem that shares the same
        // device as root ('/') is the system disk (e.g. Dell Wyse 8 GB eMMC)
        const rootStat = fs.statSync('/');
        if (stat.dev === rootStat.dev) continue;
        let totalGB = 0, usedGB = 0, freeGB = 0, sourceDev = "", uuid = "";
        try {
          // 2 s timeout — stale/removed drives hang df indefinitely
          const { stdout } = await execAsync(`df -B1G "${fullPath}" --output=size,used,avail,source 2>/dev/null | tail -n 1`, { timeout: 2000 });
          const df = stdout.trim().split(/\s+/);
          totalGB = parseInt(df[0]) || 0;
          usedGB  = parseInt(df[1]) || 0;
          freeGB  = parseInt(df[2]) || 0;
          sourceDev = df[3] || '';
          
          if (sourceDev.startsWith('/dev/')) {
            try {
              const { stdout: blkidOut } = await execAsync(`blkid -s UUID -o value "${sourceDev}"`, { timeout: 1000 });
              uuid = blkidOut.trim();
            } catch (_) {}
          }
        } catch (_) {}

        if (totalGB === 0) continue; // skip empty/stale/unresolved mounts

        // Determine if SSD/HDD by checking the block device's rotational flag
        let isSSD = sub.toLowerCase().includes('ssd') || sub.toLowerCase().includes('nvme');
        if (!isSSD && sourceDev.startsWith('/dev/')) {
          // Extract base block device name (e.g. sdb1 -> sdb, nvme0n1p1 -> nvme0n1)
          const match = sourceDev.match(/^\/dev\/(sd[a-z]|nvme\d+n\d+|mmcblk\d+|vd[a-z])/);
          if (match) {
            try {
              const rot = fs.readFileSync(`/sys/block/${match[1]}/queue/rotational`, 'utf8').trim();
              if (rot === '0') isSSD = true;
            } catch (_) {}
          }
        }
        
        const stableId = uuid || `drive-${encodeURIComponent(sub)}`;
        const role = driveRoles[stableId] || driveRoles[`drive-${encodeURIComponent(sub)}`] || null;

        drives.push({
          id:      stableId,
          uuid:    uuid,
          name:    sub.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          mount:   fullPath,
          type:    isSSD ? 'SSD' : 'HDD',
          role:    role,
          totalGB,
          usedGB,
          freeGB,
          percent: totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 0,
        });
      } catch (_) {}
    }
  }

  // Track connected vs disconnected drives
  const currentIds = new Set(drives.map(d => d.id));
  for (const d of drives) {
    seenDrivesMap.set(d.id, { id: d.id, name: d.name, lastSeen: Date.now() });
  }
  const newlyDisconnected = [];
  for (const [id, info] of seenDrivesMap.entries()) {
    if (!currentIds.has(id)) {
      newlyDisconnected.push({ id: info.id, name: info.name, disconnectedAt: new Date(info.lastSeen).toISOString() });
    }
  }
  disconnectedDrives = newlyDisconnected;

  cachedDrives = drives;
}

let seenDrivesMap = new Map();
let disconnectedDrives = [];

function getSystemTemperature() {
  try {
    const thermDir = '/sys/class/thermal';
    if (!fs.existsSync(thermDir)) return null;
    const entries = fs.readdirSync(thermDir).filter(f => f.startsWith('thermal_zone'));
    let maxTemp = null;
    for (const f of entries) {
      const p = path.join(thermDir, f, 'temp');
      try {
        if (fs.existsSync(p)) {
          const raw = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
          if (!isNaN(raw) && raw > 0) {
            const val = raw > 1000 ? Math.round(raw / 1000) : raw;
            if (val > 0 && val < 120) {
              if (maxTemp === null || val > maxTemp) maxTemp = val;
            }
          }
        }
      } catch (_) {}
    }
    return maxTemp;
  } catch (_) {
    return null;
  }
}

function checkInternetConnectivity(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '1.1.1.1', port: 53, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function checkCloudflareTunnelStatus() {
  try {
    const out = execSync('systemctl is-active cloudflared 2>/dev/null || pgrep -f cloudflared || echo "inactive"', { encoding: 'utf8', timeout: 1000 }).trim();
    if (out === 'active' || /^\d+$/.test(out)) return 'online';
    return 'offline';
  } catch (_) {
    return 'offline';
  }
}

// Start drive polling immediately
updateDrives();
setInterval(updateDrives, 10000);

function getMountedDrives() {
  return cachedDrives;
}

/* ─────────────────────────────────────────────
   FILE TYPE DETECTION
   ───────────────────────────────────────────── */
const IMAGE_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.heic']);
const VIDEO_EXT  = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v']);
const ARCHIVE_EXT = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']);

function getFileType(name, isDir) {
  if (isDir) return 'folder';
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext))   return 'image';
  if (VIDEO_EXT.has(ext))   return 'video';
  if (ARCHIVE_EXT.has(ext)) return 'archive';
  return 'document';
}

function formatSize(bytes) {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)       return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

/* ─────────────────────────────────────────────
   MULTER UPLOAD STORAGE
   ───────────────────────────────────────────── */
const multerStorage = multer.diskStorage({
  destination(req, file, cb) {
    const drives   = getMountedDrives();
    const drive    = drives.find(d => d.id === req.body.driveId) || drives[0];
    if (!drive) return cb(new Error('No drives available'));
    const destPath = safePath(drive.mount, req.body.path || '/');
    fs.mkdirSync(destPath, { recursive: true });
    cb(null, destPath);
  },
  filename(req, file, cb) {
    cb(null, sanitizeFilename(file.originalname, 'upload'));
  }
});
const upload = multer({ storage: multerStorage, limits: { fileSize: 50 * 1024 * 1024 * 1024 } }); // 50 GB max

// Separate multer instance for chunk pieces — disk storage
const CHUNK_TMP_DIR = '/tmp/hcdave-chunks';
try { fs.mkdirSync(CHUNK_TMP_DIR, { recursive: true }); } catch (_) {}

const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let chunkDir = CHUNK_TMP_DIR;
    if (req.body.driveId) {
      const drives = getMountedDrives();
      const drive = drives.find(d => d.id === req.body.driveId) || drives[0];
      if (drive) {
        chunkDir = path.join(drive.mount, '.hcdave-chunks');
        try { fs.mkdirSync(chunkDir, { recursive: true }); } catch (_) {}
      }
    }
    cb(null, chunkDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.body.uploadId}-${req.body.chunkIndex}`);
  }
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 55 * 1024 * 1024 },
});

/* ─────────────────────────────────────────────
   ROUTES
   ───────────────────────────────────────────── */

// Health check (public)
app.get('/health', (_, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const uptimeHours = (os.uptime() / 3600).toFixed(1);
  const load = os.loadavg()[0].toFixed(2);
  const tempC = getSystemTemperature();
  
  let lastUpdated = 'Unknown';
  try {
    lastUpdated = execSync('git log -1 --format="%cd - %s" --date=short', { cwd: '/home/root1/hcdave-cloud', encoding: 'utf8' }).trim();
  } catch (_) {}

  let scannerVersion = 'Unknown';
  let scannerLastUpdated = 'Unknown';
  try {
    const scannerHash = execSync('git rev-parse --short HEAD', { cwd: '/opt/hcdave-scanner', stdio: 'pipe' }).toString().trim();
    const scannerCount = execSync('git rev-list --count HEAD', { cwd: '/opt/hcdave-scanner', stdio: 'pipe' }).toString().trim();
    if (scannerHash) scannerVersion = `v1.0.${scannerCount}-${scannerHash}`;
    scannerLastUpdated = execSync('git log -1 --format="%cd - %s" --date=short', { cwd: '/opt/hcdave-scanner', encoding: 'utf8' }).trim();
  } catch (_) {}

  res.json({ 
    status: 'ok', 
    version: VERSION, 
    localIp: getLocalIp(), 
    lastUpdated,
    scannerVersion,
    scannerLastUpdated,
    stats: { memUsage, uptimeHours, load, tempC },
    time: new Date().toISOString() 
  });
});

// GET /api/system-health — Full live system metrics & service monitoring
app.get('/api/system-health', rateLimitAuth, auth, async (_, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const uptimeHours = (os.uptime() / 3600).toFixed(1);
  const load = os.loadavg().map(l => parseFloat(l.toFixed(2)));
  const tempC = getSystemTemperature();
  const internetOnline = await checkInternetConnectivity();
  const tunnelStatus = checkCloudflareTunnelStatus();
  const drives = getMountedDrives();

  const alerts = [];

  // 1. Low disk space notifications
  for (const d of drives) {
    if (d.percent >= 90 || d.freeGB < 5) {
      alerts.push({
        id: `disk_${d.id}`,
        level: d.percent >= 95 ? 'error' : 'warn',
        message: `Low disk space on ${d.name}: only ${d.freeGB} GB left (${d.percent}% full)`,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 2. Disconnected drives notifications
  for (const d of disconnectedDrives) {
    alerts.push({
      id: `drive_dc_${d.id}`,
      level: 'error',
      message: `Storage drive "${d.name}" was disconnected!`,
      timestamp: d.disconnectedAt
    });
  }

  // 3. Failed services notifications
  if (!internetOnline) {
    alerts.push({
      id: 'net_offline',
      level: 'error',
      message: 'Internet connectivity is down or unreachable',
      timestamp: new Date().toISOString()
    });
  }

  if (tunnelStatus === 'offline') {
    alerts.push({
      id: 'cf_tunnel_offline',
      level: 'warn',
      message: 'Cloudflare Tunnel service is inactive or stopped',
      timestamp: new Date().toISOString()
    });
  }

  if (tempC && tempC >= 80) {
    alerts.push({
      id: 'temp_critical',
      level: 'error',
      message: `High CPU temperature: ${tempC}°C! Check server ventilation`,
      timestamp: new Date().toISOString()
    });
  }

  let overall = 'online';
  if (!internetOnline || disconnectedDrives.length > 0) {
    overall = 'warning';
  }
  if (alerts.some(a => a.level === 'error')) {
    overall = 'warning';
  }
  if (!internetOnline && tunnelStatus === 'offline') {
    overall = 'offline';
  }

  res.json({
    status: overall,
    version: VERSION,
    localIp: getLocalIp(),
    cpu: {
      load,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
    },
    ram: {
      totalGB: +(totalMem / 1e9).toFixed(2),
      freeGB: +(freeMem / 1e9).toFixed(2),
      usedGB: +((totalMem - freeMem) / 1e9).toFixed(2),
      percent: memUsage,
    },
    temperature: {
      tempC,
    },
    internet: {
      connected: internetOnline,
      status: internetOnline ? 'online' : 'offline',
    },
    cloudflare: {
      status: tunnelStatus,
      domain: 'api.hcdavecloud.in',
    },
    services: {
      agent: 'online',
      tunnel: tunnelStatus,
    },
    drives,
    disconnectedDrives,
    alerts,
    stats: {
      memUsage,
      uptimeHours,
      load: load[0],
      tempC,
    },
    time: new Date().toISOString(),
  });
});

// GET /api/drives
app.get('/api/drives', rateLimitAuth, auth, (_, res) => {
  const drives = getMountedDrives();
  const publicToken = crypto.createHash('md5').update(AUTH_PASSWORD).digest('hex');
  res.json({ status: 'online', domain: 'hcdavecloud.in', drivesCount: drives.length, drives, publicToken });
});

// GET /api/drive-roles
app.get('/api/drive-roles', rateLimitAuth, auth, (req, res) => {
  try {
    const rolesPath = path.join(__dirname, 'drive_roles.json');
    if (fs.existsSync(rolesPath)) {
      res.json(JSON.parse(fs.readFileSync(rolesPath, 'utf8')));
    } else {
      res.json({});
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/drive-roles
app.post('/api/drive-roles', rateLimitAuth, auth, (req, res) => {
  try {
    const roles = req.body;
    if (typeof roles !== 'object') return res.status(400).json({ error: 'Expected object' });
    
    const rolesPath = path.join(__dirname, 'drive_roles.json');
    fs.writeFileSync(rolesPath, JSON.stringify(roles, null, 2), 'utf8');
    
    updateDrives(); // Trigger immediate update so next /api/drives call sees them
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// POST /api/drives/rename
app.post('/api/drives/rename', rateLimitAuth, auth, (req, res) => {
  const { oldMount, newName } = req.body || {};
  if (!oldMount || !newName) return res.status(400).json({ error: 'Parameters required' });
  if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
    return res.status(400).json({ error: 'Invalid characters in new name (use letters, numbers, dash, underscore)' });
  }

  res.json({ success: true });
  
  setTimeout(() => {
    const script = `
      OLD_PATH="${oldMount}"
      NEW_NAME="${newName}"
      if [ ! -d "$OLD_PATH" ]; then exit 1; fi
      NEW_PATH="$(dirname "\$OLD_PATH")/$NEW_NAME"
      umount "$OLD_PATH" 2>/dev/null
      mv "$OLD_PATH" "$NEW_PATH"
      sed -i "s|\$OLD_PATH|\$NEW_PATH|g" /etc/fstab
      mount -a
      systemctl restart hcdave-agent
    `;
    require('child_process').exec(`sudo bash -c '${script}'`, (err, stdout, stderr) => {
       console.log('Rename script output:', stdout, stderr);
    });
  }, 1000);
});

// GET /api/files
app.get('/api/files', rateLimitAuth, auth, async (req, res) => {
  const drives     = getMountedDrives();
  const driveId    = req.query.driveId;
  const drive      = drives.find(d => d.id === driveId) || drives[0];

  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  let targetDir;
  try { targetDir = safePath(drive.mount, req.query.path || '/'); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  if (!fs.existsSync(targetDir)) return res.json([]);

  try {
    const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true });
    const skipStat = dirents.length > 200; // Smart load threshold to prevent HDD thrashing
    const result = [];

    // Process in batches of 50 to prevent blocking the event loop or hitting EMFILE
    const BATCH_SIZE = 50;
    for (let i = 0; i < dirents.length; i += BATCH_SIZE) {
      const batch = dirents.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (dirent, index) => {
        try {
          const name = dirent.name;
          // Hide macOS / Windows system folders to avoid clutter
          if (['.fseventsd', '.Spotlight-V100', '.Trashes', 'System Volume Information', '$RECYCLE.BIN'].includes(name)) {
            return null;
          }
          const isDir = dirent.isDirectory();
          const type  = getFileType(name, isDir);
          const relPath = path.join(req.query.path || '/', name);
          
          let size = isDir ? 'Folder' : 'Unknown';
          let modified = '';
          let rawSize = 0;
          let items;

          if (!skipStat) {
             const full = path.join(targetDir, name);
             try {
               const st = await fs.promises.stat(full);
               modified = st.mtime.toISOString().split('T')[0];
               if (!isDir) {
                 size = formatSize(st.size);
                 rawSize = st.size;
               } else {
                 const dirItems = await fs.promises.readdir(full);
                 items = dirItems.length;
               }
             } catch (e) {}
          }

          return {
            id:       `${i + index}-${name}`,
            name,
            type,
            size,
            rawSize,
            items,
            modified,
            path:     relPath,
            streamUrl: null,
          };
        } catch (_) { return null; }
      }));
      result.push(...batchResults.filter(Boolean));
      // Yield to the event loop between batches so video streams can progress
      if (!skipStat) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    result.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────
   GLOBAL MULTI-DRIVE SEARCH WITH GPS METADATA
   ───────────────────────────────────────────── */
function parseGpsFromExifBuffer(buf) {
  if (!buf || buf.length < 14) return null;
  let tiffStart = 0;
  if (buf.slice(0, 4).toString() === 'Exif') {
    tiffStart = 6;
  }
  if (tiffStart >= buf.length - 8) return null;
  const isLittle = buf[tiffStart] === 0x49 && buf[tiffStart + 1] === 0x49;
  const isBig = buf[tiffStart] === 0x4d && buf[tiffStart + 1] === 0x4d;
  if (!isLittle && !isBig) return null;

  function readUint16(o) {
    if (tiffStart + o + 2 > buf.length) return 0;
    return isLittle ? buf.readUInt16LE(tiffStart + o) : buf.readUInt16BE(tiffStart + o);
  }
  function readUint32(o) {
    if (tiffStart + o + 4 > buf.length) return 0;
    return isLittle ? buf.readUInt32LE(tiffStart + o) : buf.readUInt32BE(tiffStart + o);
  }

  const ifd0Offset = readUint32(4);
  if (ifd0Offset + 2 > buf.length - tiffStart) return null;
  const numEntries = readUint16(ifd0Offset);
  let gpsOffset = null;
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > buf.length - tiffStart) break;
    const tag = readUint16(entryOffset);
    if (tag === 0x8825) { // GPSInfo IFD pointer
      gpsOffset = readUint32(entryOffset + 8);
      break;
    }
  }
  if (!gpsOffset || gpsOffset + 2 > buf.length - tiffStart) return null;

  const numGpsEntries = readUint16(gpsOffset);
  let latRef, latDeg, lonRef, lonDeg;

  function readRational(o) {
    if (tiffStart + o + 8 > buf.length) return 0;
    const num = readUint32(o);
    const den = readUint32(o + 4);
    return den ? num / den : 0;
  }

  for (let i = 0; i < numGpsEntries; i++) {
    const entryOffset = gpsOffset + 2 + i * 12;
    if (entryOffset + 12 > buf.length - tiffStart) break;
    const tag = readUint16(entryOffset);
    const valOffset = readUint32(entryOffset + 8);

    if (tag === 1) { // LatRef
      latRef = String.fromCharCode(buf[tiffStart + entryOffset + 8]);
    } else if (tag === 2) { // Lat
      if (valOffset + 24 <= buf.length - tiffStart) {
        const d = readRational(valOffset);
        const m = readRational(valOffset + 8);
        const s = readRational(valOffset + 16);
        latDeg = d + m / 60 + s / 3600;
      }
    } else if (tag === 3) { // LonRef
      lonRef = String.fromCharCode(buf[tiffStart + entryOffset + 8]);
    } else if (tag === 4) { // Lon
      if (valOffset + 24 <= buf.length - tiffStart) {
        const d = readRational(valOffset);
        const m = readRational(valOffset + 8);
        const s = readRational(valOffset + 16);
        lonDeg = d + m / 60 + s / 3600;
      }
    }
  }

  if (latDeg !== undefined && lonDeg !== undefined && !isNaN(latDeg) && !isNaN(lonDeg)) {
    let lat = latDeg * (latRef === 'S' ? -1 : 1);
    let lng = lonDeg * (lonRef === 'W' ? -1 : 1);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      return {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        coords: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`,
        mapUrl: `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
      };
    }
  }
  return null;
}

async function extractGpsFromImage(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    if (meta && meta.exif) {
      return parseGpsFromExifBuffer(meta.exif);
    }
  } catch (_) {}
  return null;
}

const SEARCH_IGNORED_DIRS = new Set([
  '.hcdave-backups',
  '.hcdave-cache',
  '.recycle_bin',
  '.fseventsd',
  '.Spotlight-V100',
  '.Trashes',
  'System Volume Information',
  '$RECYCLE.BIN',
  '.git',
  'node_modules',
  '.thumbnails'
]);

async function searchDriveRecursive(drive, options) {
  const matches = [];
  const queue = ['/'];
  let dirsVisited = 0;
  const MAX_DIRS = 3000;
  const MAX_MATCHES_PER_DRIVE = 300;

  const qLower = (options.q || '').trim().toLowerCase();
  const folderFilter = (options.folder || '').trim().toLowerCase();

  while (queue.length > 0 && dirsVisited < MAX_DIRS && matches.length < MAX_MATCHES_PER_DRIVE) {
    const relDir = queue.shift();
    dirsVisited++;

    let fullDir;
    try { fullDir = safePath(drive.mount, relDir); } catch (_) { continue; }
    if (!fs.existsSync(fullDir)) continue;

    let entries;
    try {
      entries = await fs.promises.readdir(fullDir, { withFileTypes: true });
    } catch (_) { continue; }

    for (const entry of entries) {
      const name = entry.name;
      if (SEARCH_IGNORED_DIRS.has(name) || name.startsWith('._')) continue;

      const isDir = entry.isDirectory();
      const relPath = path.posix.join(relDir, name);
      const parentFolder = relDir;

      if (isDir) {
        const depth = relPath.split('/').filter(Boolean).length;
        if (depth < 9) queue.push(relPath);
      }

      if (folderFilter && !relPath.toLowerCase().includes(folderFilter)) {
        continue;
      }

      const fileType = getFileType(name, isDir);
      if (options.type && options.type !== 'all') {
        if (options.type === 'folder') {
          if (!isDir) continue;
        } else {
          if (isDir || fileType !== options.type) continue;
        }
      }

      let score = 0;
      if (qLower) {
        const nameLower = name.toLowerCase();
        const relPathLower = relPath.toLowerCase();
        const extIdx = nameLower.lastIndexOf('.');
        const nameNoExt = extIdx > 0 ? nameLower.substring(0, extIdx) : nameLower;

        if (nameLower === qLower || nameNoExt === qLower) {
          score = 100;
        } else if (nameLower.startsWith(qLower)) {
          score = 80;
        } else if (nameLower.includes(qLower)) {
          score = 60;
        } else if (relPathLower.includes(qLower)) {
          score = 40;
        } else {
          continue;
        }
      } else {
        score = 50;
      }

      const fullPath = path.join(fullDir, name);
      let st;
      try {
        st = await fs.promises.stat(fullPath);
      } catch (_) { continue; }

      if (!isDir) {
        if (options.minSize && st.size < options.minSize) continue;
        if (options.maxSize && st.size > options.maxSize) continue;
      }

      if (options.modifiedAfter && st.mtimeMs < options.modifiedAfter) continue;
      if (options.modifiedBefore && st.mtimeMs > options.modifiedBefore) continue;

      let gps = null;
      if (fileType === 'image' && !isDir) {
        try {
          gps = await extractGpsFromImage(fullPath);
        } catch (_) {}
      }

      matches.push({
        id: `${drive.id}:${relPath}`,
        name,
        path: relPath,
        folder: parentFolder,
        driveId: drive.id,
        driveName: drive.name,
        driveRole: drive.role || '',
        isDriveOnline: true,
        type: fileType,
        isDir,
        size: isDir ? 'Folder' : formatSize(st.size),
        rawSize: isDir ? 0 : st.size,
        modified: st.mtime.toISOString().split('T')[0],
        mtimeMs: st.mtimeMs,
        score,
        gps
      });

      if (matches.length >= MAX_MATCHES_PER_DRIVE) break;
    }
  }

  return matches;
}

// GET /api/search — Global multi-drive search with GPS and location awareness
app.get('/api/search', rateLimitAuth, auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const driveFilter = (req.query.driveId || 'all').trim();
    const typeFilter = (req.query.type || 'all').trim();
    const folderFilter = (req.query.folder || '').trim();
    const sort = req.query.sort || 'relevance';
    const limit = Math.min(parseInt(req.query.limit, 10) || 150, 300);

    let minSize = req.query.minSize ? parseInt(req.query.minSize, 10) : null;
    let maxSize = req.query.maxSize ? parseInt(req.query.maxSize, 10) : null;
    let modifiedAfter = req.query.modifiedAfter ? new Date(req.query.modifiedAfter).getTime() : null;
    let modifiedBefore = req.query.modifiedBefore ? new Date(req.query.modifiedBefore).getTime() : null;

    const mountedDrives = getMountedDrives();

    // Check if the requested drive is in disconnected drives
    if (driveFilter !== 'all') {
      const isMounted = mountedDrives.some(d => d.id === driveFilter);
      if (!isMounted) {
        const disco = disconnectedDrives.find(d => d.id === driveFilter);
        return res.json({
          results: [],
          total: 0,
          isDriveOffline: true,
          offlineDriveName: disco?.name || 'Selected Drive',
          searchedDrives: [],
          disconnectedDrives: disconnectedDrives.map(d => ({ id: d.id, name: d.name, disconnectedAt: d.disconnectedAt }))
        });
      }
    }

    const targetDrives = driveFilter === 'all'
      ? mountedDrives
      : mountedDrives.filter(d => d.id === driveFilter);

    const searchOptions = {
      q,
      type: typeFilter,
      folder: folderFilter,
      minSize,
      maxSize,
      modifiedAfter,
      modifiedBefore
    };

    const driveResults = await Promise.all(
      targetDrives.map(drive => searchDriveRecursive(drive, searchOptions))
    );

    const allMatches = driveResults.flat();

    allMatches.sort((a, b) => {
      if (sort === 'relevance') {
        if (b.score !== a.score) return b.score - a.score;
        return b.mtimeMs - a.mtimeMs;
      }
      if (sort === 'newest') return b.mtimeMs - a.mtimeMs;
      if (sort === 'oldest') return a.mtimeMs - b.mtimeMs;
      if (sort === 'largest') return b.rawSize - a.rawSize;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    res.json({
      results: allMatches.slice(0, limit),
      total: allMatches.length,
      searchedDrives: targetDrives.map(d => ({ id: d.id, name: d.name, role: d.role })),
      disconnectedDrives: disconnectedDrives.map(d => ({ id: d.id, name: d.name, disconnectedAt: d.disconnectedAt }))
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET|HEAD /api/download — RFC 7233-compliant bounded range streaming
// Cloudflare-safe: no-transform, no gzip, always unencoded 206 responses
const MAX_STREAM_CHUNK = 16 * 1024 * 1024; // 16 MB cap per response

function serveFile(req, res) {
  const drives  = getMountedDrives();
  const driveId = req.query.driveId;
  const drive   = drives.find(d => d.id === driveId) || drives[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  let filePath;
  try { filePath = safePath(drive.mount, req.query.path || ''); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  // ── Cache lookup: serve pre-converted MP4 if available ──────
  if (req.query.inline === 'true' && VIDEO_EXTS && VIDEO_EXTS.has(path.extname(filePath).toLowerCase())) {
    try {
      const cached = getCachedPath(driveId, filePath);
      if (cached) {
        req._serveFilePath = cached;
        filePath = cached;
      }
    } catch (_) {}
  }
  // ────────────────────────────────────────────────────────────

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a directory' });

  const fileSize = stat.size;
  const mime     = getMime(filePath);
  const isHead   = req.method === 'HEAD';

  const baseHeaders = {
    'Accept-Ranges':   'bytes',
    'Content-Type':    mime,
    'Cache-Control':   'no-transform, private',
    'Last-Modified':   stat.mtime.toUTCString(),
  };

  const streamErrorHandler = (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream error' });
    } else {
      res.end();
    }
  };

  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${fileSize}`, 'Content-Length': 0 });
      return res.end();
    }

    const start        = parseInt(match[1], 10);
    const requestedEnd = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || start > requestedEnd) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${fileSize}`, 'Content-Length': 0 });
      return res.end();
    }

    const end    = Math.min(requestedEnd, fileSize - 1);
    const length = end - start + 1;

    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': length,
    });

    if (isHead) return res.end();
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', streamErrorHandler);
    res.on('close', () => { if (!stream.destroyed) stream.destroy(); });
    stream.pipe(res);

  } else {
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length':      fileSize,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(path.basename(filePath))}"`,
    });

    if (isHead) return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on('error', streamErrorHandler);
    res.on('close', () => { if (!stream.destroyed) stream.destroy(); });
    stream.pipe(res);
  }
}

app.get('/api/download',  rateLimitAuth, auth, serveFile);
app.head('/api/download', rateLimitAuth, auth, serveFile);


// --- Thumbnail Concurrency Queue ---
const THUMB_CONCURRENCY = 2;
let activeThumbs = 0;
const thumbQueue = [];

function processNextThumb() {
  if (activeThumbs >= THUMB_CONCURRENCY || thumbQueue.length === 0) return;
  const { req, res, filePath, imgWidth = 300, imgHeight = 300, quality = 70, fit = 'cover', cacheAge = '86400' } = thumbQueue.shift();
  activeThumbs++;

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    activeThumbs--;
    processNextThumb();
  };

  // Hard timeout: 25 seconds per thumbnail.
  // DSLR RAWs and large 50MB JPEGs can stall sharp indefinitely on slow CPUs.
  // Without a timeout the queue slot is never freed and ALL subsequent thumbnails
  // show a spinning loader forever.
  const timeout = setTimeout(() => {
    if (finished) return;
    console.warn(`⏱ Thumbnail timeout for ${filePath} — releasing queue slot`);
    try { if (!res.headersSent) res.status(504).end(); } catch (_) {}
    done();
  }, 25000);

  // Guard: skip files over 120 MB — sharp would load the whole file into RAM
  // which crashes the process on 2 GB RAM machines like the Dell Wyse 3040
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 120 * 1024 * 1024) {
      clearTimeout(timeout);
      if (!res.headersSent) res.status(413).end(); // 413 Payload Too Large
      done();
      return;
    }
  } catch (_) {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(404).end();
    done();
    return;
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', `public, max-age=${cacheAge}`);

  const readStream = fs.createReadStream(filePath);
  const transform  = sharp({ limitInputPixels: 268402689 }) // max ~16384×16384 px
    .resize(imgWidth, imgHeight, { fit, withoutEnlargement: true })
    .jpeg({ quality });

  res.on('finish', () => { clearTimeout(timeout); done(); });
  res.on('close',  () => { clearTimeout(timeout); done(); });
  res.on('error',  () => { clearTimeout(timeout); done(); });

  readStream.on('error', () => {
    clearTimeout(timeout);
    try { if (!res.headersSent) res.status(500).end(); } catch (_) {}
    done();
  });
  transform.on('error', () => {
    clearTimeout(timeout);
    try { if (!res.headersSent) res.status(500).end(); } catch (_) {}
    done();
  });

  readStream.pipe(transform).pipe(res);
}

// GET /api/thumbnail — supports ?size=thumb (300px, default) or ?size=preview (1200px)
app.get('/api/thumbnail', rateLimitAuth, auth, (req, res) => {
  if (!sharp) return res.status(501).json({ error: 'Sharp not installed' });
  const drives  = getMountedDrives();
  const drive   = drives.find(d => d.id === req.query.driveId) || drives[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });
  let filePath;
  try { filePath = safePath(drive.mount, req.query.path || ''); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const isPreview = req.query.size === 'preview';
  const imgWidth  = isPreview ? 900 : 300;
  const imgHeight = isPreview ? 900 : 300;
  const quality   = isPreview ? 82 : 70;
  const fit       = isPreview ? 'inside' : 'cover';
  const cacheAge  = isPreview ? '3600' : '86400';

  thumbQueue.push({ req, res, filePath, imgWidth, imgHeight, quality, fit, cacheAge });
  processNextThumb();
});

// POST /api/download-zip
app.post('/api/download-zip', rateLimitAuth, auth, (req, res) => {
  if (!archiver) return res.status(501).json({ error: 'Archiver not installed' });
  let { driveId, paths } = req.body;
  if (!paths && req.body['paths[]']) paths = req.body['paths[]'];
  if (typeof paths === 'string') paths = [paths];
  
  if (!paths || !Array.isArray(paths)) return res.status(400).json({ error: 'Paths must be an array' });

  const drives  = getMountedDrives();
  const drive   = drives.find(d => d.id === driveId) || drives[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="hcdave_cloud_download.zip"');

  // Set zlib level: 0 (store only) because CPU is the bottleneck on Atom processors, not network.
  // This drastically speeds up zip downloads over local/tunnel connections.
  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', (err) => { console.error(err); res.status(500).end(); });
  archive.pipe(res);

  for (const p of paths) {
    try {
      const filePath = safePath(drive.mount, p);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          archive.file(filePath, { name: path.basename(filePath) });
        } else if (stat.isDirectory()) {
          archive.directory(filePath, path.basename(filePath));
        }
      }
    } catch(e) {}
  }
  archive.finalize();
});

// ── File Versioning Helper ────────────────────────────────────
function getVersionsDir(driveMount) {
  return path.join(driveMount, '.hcdave-versions');
}

function saveFileVersion(driveMount, relPath) {
  try {
    const full = safePath(driveMount, relPath);
    if (!fs.existsSync(full)) return;
    const stat = fs.statSync(full);
    if (!stat.isFile()) return;

    const vDir = getVersionsDir(driveMount);
    fs.mkdirSync(vDir, { recursive: true });
    const relNorm = relPath.replace(/^(\/|\\)+/, '');
    const safeName = Buffer.from(relNorm).toString('hex').slice(0, 32);
    const verFile = path.join(vDir, `${safeName}___${Date.now()}___${path.basename(full)}`);
    fs.copyFileSync(full, verFile);

    // Keep at most 10 previous versions
    const all = fs.readdirSync(vDir).filter(f => f.startsWith(`${safeName}___`));
    if (all.length > 10) {
      all.sort();
      for (let i = 0; i < all.length - 10; i++) {
        try { fs.unlinkSync(path.join(vDir, all[i])); } catch (_) {}
      }
    }
  } catch (_) {}
}

// GET /api/upload-status (Check uploaded chunks for resuming large file uploads)
app.get('/api/upload-status', rateLimitAuth, auth, (req, res) => {
  try {
    const { uploadId, driveId, totalChunks } = req.query;
    if (!uploadId || !totalChunks) return res.json({ existingChunks: [] });
    
    let chunkDir = CHUNK_TMP_DIR;
    if (driveId) {
      const drives = getMountedDrives();
      const drive = drives.find(d => d.id === driveId) || drives[0];
      if (drive) {
        const dChunk = path.join(drive.mount, '.hcdave-chunks');
        if (fs.existsSync(dChunk)) chunkDir = dChunk;
      }
    }

    const total = parseInt(totalChunks, 10);
    const existingChunks = [];
    for (let i = 0; i < total; i++) {
      const p1 = path.join(chunkDir, `${uploadId}-${i}`);
      const p2 = path.join(CHUNK_TMP_DIR, `${uploadId}-${i}`);
      if (fs.existsSync(p1) || fs.existsSync(p2)) {
        existingChunks.push(i);
      }
    }
    res.json({ uploadId, existingChunks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/upload-chunk
// Receives a single 50 MB slice and writes it to /tmp/hcdave-chunks/
app.post('/api/upload-chunk', rateLimitAuth, auth, chunkUpload.single('chunk'), (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.body;
    if (!uploadId || chunkIndex === undefined || !req.file) {
      return res.status(400).json({ error: 'Missing uploadId, chunkIndex or chunk data' });
    }
    // Multer's diskStorage has already written the file to CHUNK_TMP_DIR
    res.json({ success: true, chunkIndex: Number(chunkIndex) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/upload-complete
// Merges all chunks into the final file and cleans up temp pieces
app.post('/api/upload-complete', rateLimitAuth, auth, async (req, res) => {
  try {
    const { uploadId, driveId, path: uploadPath, filename, totalChunks } = req.body;
    if (!uploadId || !filename || !totalChunks) {
      return res.status(400).json({ error: 'Missing uploadId, filename or totalChunks' });
    }

    const drives = getMountedDrives();
    const drive  = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const destDir  = safePath(drive.mount, uploadPath || '/');
    fs.mkdirSync(destDir, { recursive: true });
    const destFile = path.join(destDir, filename);
    const chunkDir = path.join(drive.mount, '.hcdave-chunks');

    // If destination file already exists, snapshot current version for file recovery!
    if (fs.existsSync(destFile)) {
      saveFileVersion(drive.mount, path.join(uploadPath || '/', filename));
    }

    // Stream-merge chunks in order
    const writeStream = fs.createWriteStream(destFile);
    for (let i = 0; i < Number(totalChunks); i++) {
      let chunkPath = path.join(chunkDir, `${uploadId}-${i}`);
      // Fallback to /tmp just in case it was saved there
      if (!fs.existsSync(chunkPath)) chunkPath = path.join(CHUNK_TMP_DIR, `${uploadId}-${i}`);
      if (!fs.existsSync(chunkPath)) {
        writeStream.destroy();
        return res.status(400).json({ error: `Missing chunk ${i}` });
      }
      
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(chunkPath);
        readStream.pipe(writeStream, { end: false });
        readStream.on('end', resolve);
        readStream.on('error', reject);
      });
      
      fs.unlinkSync(chunkPath); // delete as we go to free space
    }
    await new Promise((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    res.json({ success: true, filename, path: path.join(uploadPath || '/', filename) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/upload (legacy single-file route — kept for small files < 100 MB)
app.post('/api/upload', rateLimitAuth, auth, upload.array('file', 50), (req, res) => {
  res.json({ success: true, uploaded: req.files?.length || 0 });
});

// POST /api/scanner/upload
app.post('/api/scanner/upload', rateLimitAuth, auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const scanRoot = process.env.HC_SCAN_ROOT || path.join(os.homedir(), 'dev', 'drive-wifi', 'Scans');
  
  try {
    if (!fs.existsSync(scanRoot)) {
      fs.mkdirSync(scanRoot, { recursive: true });
    }
    
    // multer stored it in req.file.path (usually where it was meant to go, but we need to move it)
    // Wait, the default multer instance `upload` uses `multerStorage` which saves to a path based on req.body.path
    // If req.body.path isn't provided, it might fail or save in root.
    // Let's just manually move the uploaded file to scanRoot.
    const finalPath = path.join(scanRoot, req.file.originalname);
    fs.renameSync(req.file.path, finalPath);
    
    res.json({ success: true, path: finalPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mkdir
app.post('/api/mkdir', rateLimitAuth, auth, (req, res) => {
  const { driveId, path: parentPath, folderName } = req.body;
  if (!folderName || folderName.includes('/')) return res.status(400).json({ error: 'Invalid folder name' });

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === driveId) || drives[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  try {
    const parentDir = safePath(drive.mount, parentPath || '/');
    const newDir = path.join(parentDir, folderName);
    
    // Ensure the new directory is also within the mount
    if (!newDir.startsWith(path.resolve(drive.mount))) {
      return res.status(403).json({ error: 'Path traversal attempt blocked' });
    }

    if (fs.existsSync(newDir)) {
      return res.status(400).json({ error: 'Folder already exists' });
    }

    fs.mkdirSync(newDir, { recursive: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/check-files
// Checks if files exist with the same size to skip uploading
app.post('/api/check-files', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, files } = req.body;
    if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'Files array required' });

    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const existing = [];
    for (const f of files) {
      try {
        const target = safePath(drive.mount, f.path);
        if (fs.existsSync(target)) {
          const stat = fs.statSync(target);
          if (stat.size === f.size) {
            existing.push(f.path);
          }
        }
      } catch (_) {}
    }
    res.json({ existing });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/rename
app.post('/api/rename', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, path: itemPath, newName } = req.body;
    if (!itemPath || !newName) return res.status(400).json({ error: 'path and newName are required' });

    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const source = safePath(drive.mount, itemPath);
    if (!fs.existsSync(source)) return res.status(404).json({ error: 'Source not found' });

    const dest = path.join(path.dirname(source), newName);
    if (fs.existsSync(dest)) return res.status(409).json({ error: 'Destination name already exists' });

    fs.renameSync(source, dest);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/copy — fast same-drive or cross-drive copy
app.post('/api/copy', rateLimitAuth, auth, (req, res) => {
  try {
    const { sourceDriveId, targetDriveId, paths, destPath } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0 || !destPath) {
      return res.status(400).json({ error: 'paths array and destPath are required' });
    }
    const drives = getMountedDrives();
    const srcDrive = drives.find(d => d.id === sourceDriveId);
    const dstDrive = drives.find(d => d.id === (targetDriveId || sourceDriveId));
    if (!srcDrive) return res.status(404).json({ error: 'Source drive not found' });
    if (!dstDrive) return res.status(404).json({ error: 'Destination drive not found' });

    const targetDir = safePath(dstDrive.mount, destPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    let copiedCount = 0;
    const errors = [];

    for (const p of paths) {
      try {
        const sourcePath = safePath(srcDrive.mount, p);
        if (!fs.existsSync(sourcePath)) {
          errors.push(`Not found: ${p}`);
          continue;
        }
        const base = path.basename(sourcePath);
        let destFile = path.join(targetDir, base);

        // If same drive and same folder: copy as "name - Copy"
        if (srcDrive.id === dstDrive.id && path.dirname(sourcePath) === targetDir) {
          const ext = path.extname(base);
          const nameWithoutExt = path.basename(base, ext);
          destFile = path.join(targetDir, `${nameWithoutExt} - Copy${ext}`);
        }

        // Fast native recursive copy — runs at full bus bandwidth on same machine
        fs.cpSync(sourcePath, destFile, { recursive: true });
        copiedCount++;
      } catch (err) {
        errors.push(`Failed to copy ${p}: ${err.message}`);
      }
    }

    if (errors.length > 0 && copiedCount === 0) {
      return res.status(500).json({ error: 'Copy failed', errors });
    }
    res.json({ success: true, copied: copiedCount, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/move — same-drive (fast rename) or cross-drive (copy then remove source)
app.post('/api/move', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, targetDriveId, paths, destPath } = req.body;
    if (!paths || !Array.isArray(paths) || !destPath) return res.status(400).json({ error: 'paths array and destPath are required' });

    const drives = getMountedDrives();
    const srcDrive = drives.find(d => d.id === driveId) || drives[0];
    const dstDrive = drives.find(d => d.id === (targetDriveId || driveId)) || srcDrive;
    if (!srcDrive || !dstDrive) return res.status(404).json({ error: 'Drive not found' });

    const isCrossDrive = srcDrive.id !== dstDrive.id;
    const targetDir = safePath(dstDrive.mount, destPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const errors = [];
    for (const p of paths) {
      try {
        const source = safePath(srcDrive.mount, p);
        if (fs.existsSync(source)) {
          const dest = path.join(targetDir, path.basename(source));
          if (fs.existsSync(dest)) {
            errors.push(`${path.basename(source)} already exists in destination`);
          } else {
            if (isCrossDrive) {
              // Cross-drive: fast local copy then delete source
              fs.cpSync(source, dest, { recursive: true });
              fs.rmSync(source, { recursive: true, force: true });
            } else {
              // Same-drive: instantaneous inode rename
              fs.renameSync(source, dest);
            }
          }
        }
      } catch (e) {
        errors.push(`Failed to move ${path.basename(p)}: ${e.message}`);
      }
    }

    if (errors.length > 0) return res.status(207).json({ error: 'Some items failed to move', details: errors });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/delete (Permanent deletion)
app.post('/api/delete', rateLimitAuth, auth, (req, res) => {
  let { driveId, paths } = req.body;
  if (!paths && req.body['paths[]']) paths = req.body['paths[]'];
  if (typeof paths === 'string') paths = [paths];

  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'Paths must be a non-empty array' });
  }

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === driveId) || drives[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  let deletedCount = 0;
  const errors = [];

  for (const p of paths) {
    try {
      const fullPath = safePath(drive.mount, p);
      const resolvedMount = path.resolve(drive.mount);
      if (path.resolve(fullPath) === resolvedMount) {
        errors.push(`Cannot delete drive root path: ${p}`);
        continue;
      }
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        deletedCount++;
      } else {
        errors.push(`File not found: ${p}`);
      }
    } catch (err) {
      console.error(`Error deleting ${p}:`, err);
      errors.push(`Failed to delete ${p}: ${err.message}`);
    }
  }

  res.json({ success: true, deleted: deletedCount, errors });
});

// ── Recycle Bin (Trash) ───────────────────────────────────────
function getTrashDir(driveMount) {
  return path.join(driveMount, '.hcdave-trash');
}
function getTrashIndexPath(driveMount) {
  return path.join(getTrashDir(driveMount), 'trash-index.json');
}
function loadTrashIndex(driveMount) {
  try {
    const p = getTrashIndexPath(driveMount);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return [];
}
function saveTrashIndex(driveMount, items) {
  try {
    const tDir = getTrashDir(driveMount);
    fs.mkdirSync(tDir, { recursive: true });
    fs.writeFileSync(getTrashIndexPath(driveMount), JSON.stringify(items, null, 2));
  } catch (_) {}
}

// POST /api/trash/send — move file/folder to recycle bin
app.post('/api/trash/send', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'paths array required' });
    }
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const tDir = getTrashDir(drive.mount);
    fs.mkdirSync(tDir, { recursive: true });
    const index = loadTrashIndex(drive.mount);
    const moved = [];

    for (const p of paths) {
      try {
        const full = safePath(drive.mount, p);
        if (fs.existsSync(full)) {
          const id = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const baseName = path.basename(full);
          const trashFileName = `${id}___${baseName}`;
          const dest = path.join(tDir, trashFileName);
          const st = fs.statSync(full);

          fs.renameSync(full, dest);

          index.unshift({
            id,
            trashPath: trashFileName,
            originalPath: p,
            name: baseName,
            isDir: st.isDirectory(),
            size: st.size,
            deletedAt: new Date().toISOString()
          });
          moved.push(p);
        }
      } catch (err) {
        console.error('Trash error:', err);
      }
    }

    saveTrashIndex(drive.mount, index);
    res.json({ success: true, count: moved.length, moved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/trash — list recycle bin items
app.get('/api/trash', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId } = req.query;
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const tDir = getTrashDir(drive.mount);
    const index = loadTrashIndex(drive.mount);
    const existing = index.filter(item => fs.existsSync(path.join(tDir, item.trashPath)));
    if (existing.length !== index.length) {
      saveTrashIndex(drive.mount, existing);
    }
    res.json(existing);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash/restore — restore item from recycle bin
app.post('/api/trash/restore', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, trashPaths } = req.body;
    if (!trashPaths || !Array.isArray(trashPaths)) return res.status(400).json({ error: 'trashPaths array required' });
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const tDir = getTrashDir(drive.mount);
    let index = loadTrashIndex(drive.mount);
    const restored = [];

    for (const tp of trashPaths) {
      const entry = index.find(i => i.trashPath === tp || i.id === tp);
      if (entry) {
        const src = path.join(tDir, entry.trashPath);
        if (fs.existsSync(src)) {
          let dest = safePath(drive.mount, entry.originalPath);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          if (fs.existsSync(dest)) {
            const ext = path.extname(dest);
            const base = path.basename(dest, ext);
            dest = path.join(path.dirname(dest), `${base} (Restored ${Date.now()})${ext}`);
          }
          fs.renameSync(src, dest);
          restored.push(entry.name);
          index = index.filter(i => i !== entry);
        }
      }
    }

    saveTrashIndex(drive.mount, index);
    res.json({ success: true, count: restored.length, restored });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash/delete — permanently delete from recycle bin
app.post('/api/trash/delete', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, trashPaths } = req.body;
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const tDir = getTrashDir(drive.mount);
    let index = loadTrashIndex(drive.mount);
    let deletedCount = 0;

    for (const tp of trashPaths) {
      const entry = index.find(i => i.trashPath === tp || i.id === tp);
      if (entry) {
        const src = path.join(tDir, entry.trashPath);
        if (fs.existsSync(src)) {
          fs.rmSync(src, { recursive: true, force: true });
          deletedCount++;
        }
        index = index.filter(i => i !== entry);
      }
    }

    saveTrashIndex(drive.mount, index);
    res.json({ success: true, deleted: deletedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash/empty — empty entire recycle bin
app.post('/api/trash/empty', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId } = req.body;
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const tDir = getTrashDir(drive.mount);
    if (fs.existsSync(tDir)) {
      fs.rmSync(tDir, { recursive: true, force: true });
      fs.mkdirSync(tDir, { recursive: true });
    }
    saveTrashIndex(drive.mount, []);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── File Version History Routes ───────────────────────────────
// GET /api/versions — list file versions
app.get('/api/versions', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, path: filePath } = req.query;
    if (!driveId || !filePath) return res.status(400).json({ error: 'driveId and path required' });
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const vDir = getVersionsDir(drive.mount);
    if (!fs.existsSync(vDir)) return res.json([]);

    const relNorm = (filePath || '').replace(/^(\/|\\)+/, '');
    const safeName = Buffer.from(relNorm).toString('hex').slice(0, 32);
    const files = fs.readdirSync(vDir).filter(f => f.startsWith(`${safeName}___`));

    const versions = files.map(f => {
      const parts = f.split('___');
      const timestamp = parseInt(parts[1], 10);
      const st = fs.statSync(path.join(vDir, f));
      return {
        versionId: f,
        name: parts[2] || path.basename(filePath),
        timestamp,
        date: new Date(timestamp).toISOString(),
        size: st.size,
        formattedSize: formatSize(st.size)
      };
    }).sort((a, b) => b.timestamp - a.timestamp);

    res.json(versions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/versions/restore — restore a file version
app.post('/api/versions/restore', rateLimitAuth, auth, (req, res) => {
  try {
    const { driveId, path: filePath, versionId } = req.body;
    if (!driveId || !filePath || !versionId) return res.status(400).json({ error: 'Missing parameters' });
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const vDir = getVersionsDir(drive.mount);
    const verFile = path.join(vDir, path.basename(versionId));
    if (!fs.existsSync(verFile)) return res.status(404).json({ error: 'Version not found' });

    const target = safePath(drive.mount, filePath);
    // Save current as a version first
    saveFileVersion(drive.mount, filePath);
    // Restore
    fs.copyFileSync(verFile, target);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Secure File Sharing ───────────────────────────────────────
// POST /api/share — create share link with optional password, expiry, download limit
app.post('/api/share', rateLimitAuth, auth, (req, res) => {
  const { driveId, filePath, filePaths, burnAfterReading, password, expiresAt, downloadLimit } = req.body;
  const targetPaths = filePaths || (filePath ? [filePath] : null);
  if (!driveId || !targetPaths || !Array.isArray(targetPaths) || targetPaths.length === 0) {
    return res.status(400).json({ error: 'Missing driveId or target file path(s)' });
  }

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === driveId);
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  try {
    for (const p of targetPaths) {
      const fullPath = safePath(drive.mount, p);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: `File not found: ${p}` });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const shares = loadShares();
    shares[token] = {
      driveId,
      filePath: targetPaths.length === 1 ? targetPaths[0] : null,
      filePaths: targetPaths.length > 1 ? targetPaths : null,
      burnAfterReading: !!burnAfterReading,
      password: password ? String(password).trim() : null,
      expiresAt: expiresAt || null,
      downloadLimit: downloadLimit ? Number(downloadLimit) : null,
      downloadCount: 0,
      createdAt: new Date().toISOString()
    };
    saveShares(shares);

    res.json({ token, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shares — list all active shares (admin)
app.get('/api/shares', rateLimitAuth, auth, (req, res) => {
  const shares = loadShares();
  const list = Object.entries(shares).map(([token, s]) => ({
    token,
    driveId: s.driveId,
    filePath: s.filePath,
    filePaths: s.filePaths,
    burnAfterReading: s.burnAfterReading,
    hasPassword: !!s.password,
    expiresAt: s.expiresAt || null,
    downloadLimit: s.downloadLimit || null,
    downloadCount: s.downloadCount || 0,
    createdAt: s.createdAt,
  }));
  res.json(list);
});

// DELETE /api/share/:token and POST /api/share/:token/revoke — revoke link
app.delete('/api/share/:token', rateLimitAuth, auth, (req, res) => {
  const shares = loadShares();
  if (!shares[req.params.token]) return res.status(404).json({ error: 'Share not found' });
  delete shares[req.params.token];
  saveShares(shares);
  res.json({ success: true });
});

app.post('/api/share/:token/revoke', rateLimitAuth, auth, (req, res) => {
  const shares = loadShares();
  if (!shares[req.params.token]) return res.status(404).json({ error: 'Share not found' });
  delete shares[req.params.token];
  saveShares(shares);
  res.json({ success: true });
});

// PUT /api/share/:token — update share settings
app.put('/api/share/:token', rateLimitAuth, auth, (req, res) => {
  const { burnAfterReading, password, expiresAt, downloadLimit } = req.body;
  const shares = loadShares();
  if (!shares[req.params.token]) return res.status(404).json({ error: 'Share not found' });

  if (typeof burnAfterReading === 'boolean') shares[req.params.token].burnAfterReading = burnAfterReading;
  if (password !== undefined) shares[req.params.token].password = password ? String(password).trim() : null;
  if (expiresAt !== undefined) shares[req.params.token].expiresAt = expiresAt;
  if (downloadLimit !== undefined) shares[req.params.token].downloadLimit = downloadLimit ? Number(downloadLimit) : null;
  saveShares(shares);
  res.json({ success: true });
});

// POST /api/s/:token/verify — public password check
app.post('/api/s/:token/verify', (req, res) => {
  const shares = loadShares();
  const share = shares[req.params.token];
  if (!share) return res.status(404).json({ error: 'Share link invalid or expired' });
  if (!share.password) return res.json({ valid: true });
  const { password } = req.body || {};
  if (password && String(password).trim() === share.password) {
    return res.json({ valid: true });
  }
  return res.status(401).json({ error: 'Incorrect password' });
});

// POST /api/update (Update Agent Software via Git)
app.post('/api/update', rateLimitAuth, auth, (req, res) => {
  try {
    const repoDir = '/home/root1/hcdave-cloud';
    let pullOutput = '';
    let pullError = '';

    // Step 1: Fix git ownership + run git pull
    // The service runs as root but the repo may have been cloned as another user
    // (root1), which causes 'cannot open .git/FETCH_HEAD: Permission denied'.
    // Fix: take ownership of the repo dir, mark it safe, then fetch and hard reset.
    try {
      try { execSync(`chown -R $(whoami) "${repoDir}"`, { stdio: 'ignore' }); } catch(e) {}
      try { execSync('git config --global --add safe.directory "*"', { stdio: 'ignore' }); } catch(e) {}
      
      // Forcefully match remote origin to avoid any local divergence or merge conflicts
      const pullCmd = 'git fetch origin main && git reset --hard origin/main && git clean -fd';
      pullOutput = execSync(pullCmd, { cwd: repoDir, encoding: 'utf8' }).trim();
      console.log('📥 Git sync output:', pullOutput);
    } catch (e) {
      pullError = e.stderr?.toString() || e.message;
      console.error('❌ Git sync failed:', pullError);
      return res.status(500).json({ success: false, error: 'Git update failed', detail: pullError });
    }

    // Step 2: Copy agent files — NEVER overwrite .env (has the user's setup password)
    // and NEVER overwrite shares.json (has all share links).
    // Use rsync-style exclusion via find+cp to skip those protected files.
    try {
      const destDir = '/opt/hcdave-agent';
      const srcDir  = `${repoDir}/agent`;
      // Copy everything except .env and shares.json
      execSync(
        `find "${srcDir}" -maxdepth 1 -not -name '.env' -not -name 'shares.json' -not -name '.' | xargs -I{} cp -r {} "${destDir}/"`,
        { stdio: 'ignore' }
      );
      
      // Build and copy frontend
      console.log('🏗️ Building frontend...');
      execSync('npm install', { cwd: repoDir, stdio: 'ignore' });
      execSync('npm run build', { cwd: repoDir, stdio: 'ignore' });
      execSync(`rm -rf /opt/dist && cp -r "${repoDir}/dist" /opt/`, { stdio: 'ignore' });
      console.log('📂 Frontend files copied to /opt/dist');
      console.log('📂 Agent files copied (protected .env and shares.json)');

      // Update system-level scripts
      try {
        console.log('⚙️ Updating system-level automount scripts...');
        execSync(`cp "${repoDir}/scripts/hcdave-automount.sh" /usr/local/bin/hcdave-automount.sh`);
        execSync('chmod +x /usr/local/bin/hcdave-automount.sh');
        execSync(`cp "${repoDir}/scripts/99-hcdave-automount.rules" /etc/udev/rules.d/99-hcdave-automount.rules`);
        execSync(`cp "${repoDir}/scripts/hcdave-automount@.service" /etc/systemd/system/hcdave-automount@.service`);
        execSync('udevadm control --reload-rules');
        execSync('systemctl daemon-reload');
      } catch (sysErr) {
        console.error('⚠️ Warning: failed to update system-level scripts:', sysErr.message);
      }
    } catch (e) {
      console.error('❌ Copy agent files failed:', e.message);
      return res.status(500).json({ success: false, error: 'Failed to copy agent files', detail: e.message });
    }

    // Step 3: Tell the frontend update was pulled successfully before restarting
    const alreadyUpToDate = pullOutput.includes('Already up to date');
    res.json({
      success: true,
      message: alreadyUpToDate
        ? 'Already up to date. Restarting to apply any config changes.'
        : `Updated successfully. Restarting agent…\n${pullOutput}`,
      pullOutput,
    });

    // Step 4: Install deps and restart after response is flushed
    setTimeout(() => {
      try {
        console.log('📦 Installing dependencies...');
        execSync('npm install --omit=dev', { cwd: '/opt/hcdave-agent', stdio: 'ignore' });
        console.log('🔄 Restarting service...');
        execSync('systemctl restart hcdave-agent', { stdio: 'ignore' });
      } catch (e) {
        console.error('❌ Post-update restart failed:', e.message);
      }
    }, 500);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scanner/update', rateLimitAuth, auth, (req, res) => {
  const repoDir = '/opt/hcdave-scanner';
  
  if (!fs.existsSync(repoDir)) {
    return res.status(400).json({ error: 'Scanner repository not found at ' + repoDir });
  }

  if (scannerUpdateState.status !== 'idle' && scannerUpdateState.status !== 'success' && scannerUpdateState.status !== 'error') {
    return res.status(400).json({ error: 'Update already in progress' });
  }

  try {
    // Fix permissions so root can pull the repo cloned by root1 (ignore if fails)
    try { execSync(`chown -R $(whoami) "${repoDir}"`, { stdio: 'ignore' }); } catch(e) {}
    try { execSync('git config --global --add safe.directory "*"', { stdio: 'ignore' }); } catch(e) {}
    
    // Forcefully match remote origin to avoid any local divergence or merge conflicts
    const pullCmd = 'git fetch origin main && git reset --hard origin/main && git clean -fd';
    const pullOutput = execSync(pullCmd, { cwd: repoDir, encoding: 'utf8' }).trim();
    const alreadyUpToDate = pullOutput.includes('HEAD is now at');

    scannerUpdateState = { status: 'installing', logs: '', error: null };
    res.json({ 
      success: true, 
      message: alreadyUpToDate
        ? `Code is up to date. Rebuilding and restarting scanner...\n${pullOutput}`
        : `Pulled new code. Building WASM in background...\n${pullOutput}`,
      pullOutput 
    });

    // Run asynchronously
    (async () => {
      try {

      // 2. Install
      scannerUpdateState.status = 'installing';
      scannerUpdateState.logs += execSync('npm install', { cwd: `${repoDir}/apps/web`, encoding: 'utf8' });

      // 3. Build WASM
      scannerUpdateState.status = 'building';
      scannerUpdateState.logs += execSync('npm run build', { cwd: `${repoDir}/apps/web`, encoding: 'utf8' });

      // 4. Restart
      scannerUpdateState.status = 'restarting';
      execSync('systemctl restart hc-scanner', { encoding: 'utf8' });

      // 5. Verify
      const statusOutput = execSync('systemctl is-active hc-scanner', { encoding: 'utf8' }).trim();
      if (statusOutput !== 'active') throw new Error('Service is not active after restart');

      // 6. Purge Cloudflare cache so updated WASM/JS is served immediately without manual purge
      const CF_ZONE_ID   = '1b4060f027d39bf0e6ed631a1905bd57';
      const CF_API_TOKEN = process.env.CF_API_TOKEN;
      if (CF_ZONE_ID && CF_API_TOKEN) {
        try {
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${CF_API_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ purge_everything: true }),
            }
          );
          const cfData = await cfRes.json();
          if (cfData.success) {
            console.log('☁️ Cloudflare cache purged successfully');
            scannerUpdateState.logs += '\n☁️ Cloudflare cache purged.';
          } else {
            console.warn('⚠️ Cloudflare purge failed:', JSON.stringify(cfData.errors));
          }
        } catch (cfErr) {
          console.warn('⚠️ Cloudflare purge request failed:', cfErr.message);
        }
      } else {
        console.log('ℹ️ CF_ZONE_ID / CF_API_TOKEN not set — skipping Cloudflare cache purge');
      }

      scannerUpdateState.status = 'success';
    } catch (e) {
      scannerUpdateState.status = 'error';
      scannerUpdateState.error = e.stderr?.toString() || e.message;
      console.error('Scanner update failed:', e);
    }
  })();
  } catch (e) {
    const pullError = e.stderr?.toString() || e.message;
    console.error('Git pull failed in update endpoint:', pullError);
    return res.status(500).json({ error: 'Git pull failed: ' + pullError, detail: pullError });
  }
});

app.get('/api/scanner/update-status', rateLimitAuth, auth, (req, res) => {
  res.json(scannerUpdateState);
});


// 🛡️ HC CLOUD ADMIN TERMINAL ────────────────────────────────────────────────
const TERMINAL_SECRET = crypto.randomBytes(32).toString('hex');

function generateTerminalToken() {
  const timestamp = Date.now();
  const signature = crypto.createHmac('sha256', TERMINAL_SECRET).update(timestamp.toString()).digest('hex');
  return Buffer.from(`${timestamp}:${signature}`).toString('base64');
}

function verifyTerminalToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [tsStr, signature] = decoded.split(':');
    const timestamp = parseInt(tsStr, 10);
    if (Date.now() - timestamp > 10 * 60 * 1000) return false; // 10 minutes
    const expected = crypto.createHmac('sha256', TERMINAL_SECRET).update(tsStr).digest('hex');
    return expected === signature;
  } catch(e) {
    return false;
  }
}

function classifyCommand(cmd) {
  if (/\brm\s+-r[fF]?\s+\//.test(cmd)) return 'BLOCKED';
  if (/\bmkfs\b/.test(cmd) || /\bdd\s+if=\/dev\/zero\b/.test(cmd)) return 'BLOCKED';

  const parts = cmd.split(/[;&|><\s$()`]+/);
  const blocked = ['nano', 'vim', 'vi', 'less', 'more', 'top', 'htop', 'ssh'];
  const dangerous = ['rm', 'reboot', 'shutdown', 'systemctl', 'apt', 'apt-get', 'dpkg', 'fdisk', 'parted', 'mkfs', 'dd'];

  let classification = 'SAFE';
  for (const part of parts) {
    const p = part.toLowerCase();
    if (blocked.includes(p)) return 'BLOCKED';
    if (dangerous.includes(p)) classification = 'DANGEROUS';
  }
  return classification;
}

function logTerminalAudit(user, ip, status, classification, command) {
  const time = new Date().toISOString();
  // Strip newlines from command to prevent log injection
  const safeCmd = command.replace(/\r?\n/g, ' \\n ');
  const logLine = `[${time}] [${user}] [${ip}] [${status}] [${classification}] Command: ${safeCmd}\n`;
  try {
    fs.appendFileSync('/var/log/hccloud-terminal.log', logLine);
  } catch (e) {
    try { fs.appendFileSync(path.join(__dirname, 'terminal.log'), logLine); } catch (_) {}
  }
}

app.post('/api/terminal/auth', rateLimitAuth, auth, (req, res) => {
  const { password } = req.body;
  if (password !== AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect Master Password' });
  }
  res.json({ token: generateTerminalToken() });
});

app.post('/api/terminal/exec', rateLimitAuth, auth, async (req, res) => {
  const { command, token, confirmDangerous, isLong } = req.body;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const user = 'Admin'; // Single user system currently

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command required' });
  }

  if (!token || !verifyTerminalToken(token)) {
    logTerminalAudit(user, ip, 'DENIED', 'UNAUTHORIZED', command);
    return res.status(403).json({ error: 'Terminal session expired or invalid. Please re-authenticate.' });
  }

  const classification = classifyCommand(command);

  if (classification === 'BLOCKED') {
    logTerminalAudit(user, ip, 'REJECTED', 'BLOCKED', command);
    return res.status(403).json({ 
      error: 'Command blocked for security reasons. Interactive programs and highly destructive commands are not permitted.' 
    });
  }

  if (classification === 'DANGEROUS' && !confirmDangerous) {
    // Return early requiring confirmation, DO NOT log as REJECTED since it's just a prompt
    return res.json({ requireConfirmation: true, message: 'This command is classified as DANGEROUS. Please confirm to execute.' });
  }

  logTerminalAudit(user, ip, 'EXECUTING', classification, command);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: isLong ? 300_000 : 30_000,
      maxBuffer: 512 * 1024
    });
    logTerminalAudit(user, ip, 'SUCCESS', classification, command);
    return res.json({ stdout: stdout || '', stderr: stderr || '' });
  } catch (e) {
    logTerminalAudit(user, ip, 'FAILED', classification, command);
    return res.json({
      stdout: e.stdout || '',
      stderr: e.stderr || e.message || 'Command failed'
    });
  }
});
// 🛡️ END HC CLOUD ADMIN TERMINAL ─────────────────────────────────────────────

// GET /api/s/:token (Public - Get Share Metadata)
app.get('/api/s/:token', (req, res) => {
  const shares = loadShares();
  const token = req.params.token;
  let share = shares[token];
  
  // If not found in shares, check if it was recently burned and is in temp session
  let isFromTemp = false;
  if (!share) {
    if (tempTokens.has(token)) {
      const temp = tempTokens.get(token);
      if (Date.now() > temp.expires) {
        tempTokens.delete(token);
        return res.status(404).json({ error: 'Share session expired.' });
      }
      share = temp.shareData;
      isFromTemp = true;
    } else {
      return res.status(404).json({ error: 'Share link invalid, expired, or already burned.' });
    }
  }

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === share.driveId);
  if (!drive) return res.status(404).json({ error: 'Drive offline' });

  try {
    const fullPath = safePath(drive.mount, share.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File no longer exists' });
    
    const stat = fs.statSync(fullPath);
    const isDir = stat.isDirectory();
    const type = getFileType(path.basename(fullPath), isDir);

    // Expiry check
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: 'This share link has expired.' });
    }

    // Download limit check
    if (share.downloadLimit && (share.downloadCount || 0) >= share.downloadLimit) {
      return res.status(410).json({ error: 'Download limit for this share link has been reached.' });
    }

    // Password protection check
    const clientPwd = req.query.pwd || req.headers['x-share-password'];
    if (share.password && (!clientPwd || String(clientPwd).trim() !== share.password)) {
      return res.json({
        name: path.basename(fullPath),
        requiresPassword: true,
        isDir,
      });
    }

    let downloadToken = isFromTemp ? tempTokens.get(token).downloadToken : token;
    
    // BURN ON VIEW LOGIC: If it's a one-time link and hasn't been burned yet, burn it NOW.
    if (share.burnAfterReading && !isFromTemp) {
      delete shares[token];
      saveShares(shares);
      downloadToken = crypto.randomBytes(16).toString('hex');
      
      // Store original token for 500 MILLISECONDS ONLY (Fixes React Strict Mode double-fetch but kills refresh)
      tempTokens.set(token, { 
        shareData: share, 
        fullPath, 
        downloadToken,
        expires: Date.now() + 500 
      }); 
      
      // Store actual download token
      tempTokens.set(downloadToken, { 
        fullPath, 
        expires: Date.now() + 1000 * 60 * 60,
        hasDownloaded: false
      }); 
    }

    res.json({
      name: path.basename(fullPath),
      type,
      size: isDir ? 'Folder' : formatSize(stat.size),
      isDir,
      burnAfterReading: share.burnAfterReading,
      expiresAt: share.expiresAt || null,
      downloadLimit: share.downloadLimit || null,
      downloadCount: share.downloadCount || 0,
      downloadToken
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper for sending files
function streamFile(fullPath, req, res) {
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a folder directly' });
  
  const fileSize = stat.size;
  const mime = getMime(fullPath);
  const isHead = req.method === 'HEAD';

  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': mime,
    'Cache-Control': 'no-transform, private',
    'Last-Modified': stat.mtime.toUTCString(),
  };

  const streamErrorHandler = (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stream error' });
    } else {
      res.end();
    }
  };

  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${fileSize}`, 'Content-Length': 0 });
      return res.end();
    }
    
    const start = parseInt(match[1], 10);
    const requestedEnd = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || start > requestedEnd) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${fileSize}`, 'Content-Length': 0 });
      return res.end();
    }
    
    const end = Math.min(requestedEnd, fileSize - 1);
    const length = end - start + 1;

    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': length,
    });
    
    if (isHead) return res.end();
    const stream = fs.createReadStream(fullPath, { start, end });
    stream.on('error', streamErrorHandler);
    res.on('close', () => { if (!stream.destroyed) stream.destroy(); });
    stream.pipe(res);

  } else {
    const disposition = req.query.inline === 'true' || req.query.inline === true ? 'inline' : 'attachment';
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': fileSize,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(path.basename(fullPath))}"`,
    });
    
    if (isHead) return res.end();
    const stream = fs.createReadStream(fullPath);
    stream.on('error', streamErrorHandler);
    res.on('close', () => { if (!stream.destroyed) stream.destroy(); });
    stream.pipe(res);
  }
}

// GET /api/s/:token/download (Public - Download/Stream file)
app.get('/api/s/:token/download', (req, res) => {
  const token = req.params.token;
  
  // Check temp tokens (burned shares)
  if (tempTokens.has(token)) {
    const temp = tempTokens.get(token);
    if (Date.now() > temp.expires) {
      tempTokens.delete(token);
      return res.status(404).json({ error: 'Session expired.' });
    }
    
    // Prevent multiple downloads
    if (!req.query.inline) {
      if (temp.hasDownloaded && !req.headers.range) {
        return res.status(403).json({ error: 'This file has already been downloaded and is now burned.' });
      }
      temp.hasDownloaded = true;
    }

    return streamFile(temp.fullPath, req, res);
  }

  // Check permanent shares
  const shares = loadShares();
  const share = shares[token];
  if (!share) return res.status(404).json({ error: 'Share link invalid or expired.' });

  // Expiry check
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: 'This share link has expired.' });
  }

  // Download limit check
  if (share.downloadLimit && (share.downloadCount || 0) >= share.downloadLimit) {
    return res.status(410).json({ error: 'Download limit for this share link has been reached.' });
  }

  // Password check
  const clientPwd = req.query.pwd || req.headers['x-share-password'];
  if (share.password && (!clientPwd || String(clientPwd).trim() !== share.password)) {
    return res.status(401).json({ error: 'Password required' });
  }

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === share.driveId);
  if (!drive) return res.status(404).json({ error: 'Drive offline' });

  try {
    const fullPath = safePath(drive.mount, share.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File no longer exists' });

    // Track download count if this is a download (not an inline preview or range request)
    if (!req.query.inline && !req.headers.range) {
      share.downloadCount = (share.downloadCount || 0) + 1;
      saveShares(shares);
    }

    streamFile(fullPath, req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/avi',
    '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
    '.pdf': 'application/pdf', '.txt': 'text/plain',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

/* ─────────────────────────────────────────────
   HC SCANNER API
   ───────────────────────────────────────────── */
// 1. Scanner JWT implementation
function signScannerJwt(payload, secret, expiresInSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadWithExp = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const b64Payload = Buffer.from(JSON.stringify(payloadWithExp)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${b64Header}.${b64Payload}`).digest('base64url');
  return `${b64Header}.${b64Payload}.${signature}`;
}

function verifyScannerJwt(token, secret) {
  const [b64Header, b64Payload, signature] = token.split('.');
  if (!b64Header || !b64Payload || !signature) throw new Error('Invalid token');
  const expectedSig = crypto.createHmac('sha256', secret).update(`${b64Header}.${b64Payload}`).digest('base64url');
  if (signature !== expectedSig) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString());
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired');
  return payload;
}

// 2. Scanner token endpoint
app.get('/api/scanner/token', rateLimitAuth, auth, (req, res) => {
  try {
    const token = signScannerJwt({ sub: 'admin', aud: 'hc-scanner' }, SCANNER_JWT_SECRET, 900);
    res.json({ success: true, token });
  } catch (e) {
    console.error('Scanner token error:', e);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 3. Scanner authentication middleware
function authScanner(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  const token = header.slice(7);
  try {
    const payload = verifyScannerJwt(token, SCANNER_JWT_SECRET);
    if (payload.aud !== 'hc-scanner') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    req._scannerAuth = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

// 4. Drives API
app.get('/api/hc/drives', authScanner, (req, res) => {
  try {
    const drives = getMountedDrives().map(d => ({
      id: d.id,
      name: d.name
    }));
    res.json({ drives });
  } catch (e) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 5. Folder API
app.get('/api/hc/drives/:driveId/folders', authScanner, async (req, res) => {
  try {
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === req.params.driveId);
    if (!drive) return res.status(404).json({ error: 'NOT_FOUND' });
    
    const rootPath = safePath(drive.mount, '/');
    if (!fs.existsSync(rootPath)) return res.json({ folders: [] });
    
    const dirents = await fs.promises.readdir(rootPath, { withFileTypes: true });
    const folders = dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const name = dirent.name;
        if (['.fseventsd', '.Spotlight-V100', '.Trashes', 'System Volume Information', '$RECYCLE.BIN', '.hcdave-chunks'].includes(name)) return null;
        return { id: name, name: name };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
      
    res.json({ folders });
  } catch (e) {
    console.error('Scanner Folder API error:', e);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 7. Upload API
const scannerUploadStorage = {
  _handleFile(req, file, cb) {
    try {
      const drives = getMountedDrives();
      const drive = drives.find(d => d.id === req.body.driveId);
      if (!drive) return cb(new Error('NOT_FOUND_DRIVE'));
      
      const folderId = req.body.folderId || '';
      if (folderId.includes('/') || folderId.includes('\\\\') || folderId.includes('..')) {
        return cb(new Error('INVALID_FOLDER'));
      }
      
      let filename = req.body.filename || file.originalname || 'Scanned_Document.pdf';
      filename = path.basename(filename);
      if (!filename || filename.includes('\0')) {
        return cb(new Error('INVALID_FILENAME'));
      }
      
      const destPath = safePath(drive.mount, folderId);
      if (!fs.existsSync(destPath)) {
         fs.mkdirSync(destPath, { recursive: true });
      }
      
      const finalPath = path.join(destPath, filename);
      
      // Use 'wx' flag to atomically ensure the file does not exist.
      // This prevents TOCTOU (Time-of-check to time-of-use) overwrites.
      const outStream = fs.createWriteStream(finalPath, { flags: 'wx' });
      
      outStream.on('error', (err) => {
        if (err.code === 'EEXIST') {
          return cb(new Error('FILE_EXISTS'));
        }
        cb(err);
      });
      
      outStream.on('finish', () => {
        cb(null, {
          destination: destPath,
          filename: filename,
          path: finalPath,
          size: outStream.bytesWritten
        });
      });
      
      file.stream.pipe(outStream);
    } catch (e) {
      cb(e);
    }
  },
  _removeFile(req, file, cb) {
    if (file && file.path) {
      fs.unlink(file.path, cb);
    } else {
      cb(null);
    }
  }
};

const scannerUpload = multer({
  storage: scannerUploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }
});

app.post('/api/hc/upload', authScanner, (req, res) => {
  scannerUpload.single('file')(req, res, function (err) {
    if (err) {
       if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'FILE_TOO_LARGE' });
       if (err.message === 'FILE_EXISTS') return res.status(409).json({ error: 'FILE_EXISTS' });
       if (err.message === 'NOT_FOUND_DRIVE') return res.status(404).json({ error: 'NOT_FOUND' });
       if (err.message === 'INVALID_FOLDER' || err.message === 'INVALID_FILENAME') return res.status(400).json({ error: 'INVALID_PATH' });
       console.error('Scanner upload error:', err);
       return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
    
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'INTERNAL_ERROR' });
    
    console.log(`[Scanner] Uploaded ${file.filename} to drive ${req.body.driveId}, folder ${req.body.folderId || '/'}`);
    res.json({ success: true, name: file.filename });
  });
});

/* ─────────────────────────────────────────────
   START
   ───────────────────────────────────────────── */
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🔒 HC Dave Cloud — Storage Agent`);
    console.log(`   Port:    ${PORT}`);
    console.log(`   Domain:  hcdavecloud.in`);
    console.log(`   CORS:    ${ALLOWED_ORIGIN}`);
    console.log(`   Drives:  scanning /mnt /media /run/media\n`);
  });
}

/* ═══════════════════════════════════════════════════════════════
   VIDEO CACHE ENGINE
   ═══════════════════════════════════════════════════════════════
   - Converts videos to 720p H.264 MP4 at night or on-demand
   - Never upscales: preserves original resolution if ≤ 720p
   - 1 FFmpeg job at a time (Intel Atom safe)
   - Cache index tracks source mtime+size for auto-invalidation
   - /api/download checks cache first, falls back to original
   ═══════════════════════════════════════════════════════════════ */

const { spawn }    = require('child_process');
const CACHE_VERSION = 1;
const VIDEO_EXTS    = new Set(['.mp4','.mkv','.avi','.mov','.wmv','.flv','.ts','.m4v','.3gp','.webm','.hevc','.h265','.mpg','.mpeg']);

// Cache config
function getCacheMount() {
  const cacheDrive = cachedDrives.find(d => d.role && d.role.toLowerCase() === 'cache');
  if (cacheDrive) return cacheDrive.mount;
  return (process.env.CACHE_MOUNT || '/mnt/hcdave-cache').replace(/\/$/, '');
}
function getCacheDir() {
  return path.join(getCacheMount(), 'hcdave-video-cache');
}
function getCacheIndex() {
  return path.join(getCacheDir(), 'cache-index.json');
}
const CACHE_WARN_GB = Number(process.env.CACHE_WARNING_GB || 5);

// Job state
let cacheJob = {
  running:      false,
  paused:       false,
  currentFile:  '',
  filesTotal:   0,
  filesDone:    0,
  ffmpegProc:   null,
  startedAt:    null,
  lastError:    '',
  queue:        [],     // { driveId, sourcePath, destPath, sourceSize, sourceMtime }
};

// Nightly scheduler state (persisted in memory)
let nightlySchedule = {
  enabled:   false,
  startTime: '02:00',   // HH:MM
  lastRun:   null,
};

/* ── Cache Index helpers ─────────────────────────────────────── */
function readCacheIndex() {
  try {
    if (fs.existsSync(getCacheIndex())) return JSON.parse(fs.readFileSync(getCacheIndex(), 'utf8'));
  } catch (_) {}
  return {};
}

function writeCacheIndex(index) {
  try {
    fs.mkdirSync(getCacheDir(), { recursive: true });
    fs.writeFileSync(getCacheIndex(), JSON.stringify(index, null, 2));
  } catch (_) {}
}

/* ── Check if a cache entry is still valid ───────────────────── */
function isCacheValid(entry, sourceStat) {
  if (!entry) return false;
  if (entry.cacheVersion !== CACHE_VERSION) return false;
  if (entry.sourceSize !== sourceStat.size) return false;
  if (Math.abs(entry.sourceMtime - sourceStat.mtimeMs) > 2000) return false;
  if (!fs.existsSync(entry.destPath)) return false;
  return true;
}

/* ── Find cached file for a given source ─────────────────────── */
function getCachedPath(driveId, sourcePath) {
  const index = readCacheIndex();
  const key   = `${driveId}:${sourcePath}`;
  const entry = index[key];
  if (!entry) return null;
  try {
    const stat = fs.statSync(sourcePath);
    if (!isCacheValid(entry, stat)) return null;
    return entry.destPath;
  } catch (_) {
    return null;
  }
}

/* ── Build list of all videos on selected drives ─────────────── */
function collectVideos(driveIds) {
  const drives = getMountedDrives();
  const items  = [];
  for (const d of drives) {
    if (driveIds && driveIds.length > 0 && !driveIds.includes(d.id)) continue;
    walkDir(d.mount, d.id, items);
  }
  return items;
}

function walkDir(dir, driveId, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walkDir(full, driveId, out); }
    else if (e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase())) {
      try {
        const stat = fs.statSync(full);
        out.push({ driveId, sourcePath: full, sourceSize: stat.size, sourceMtime: stat.mtimeMs });
      } catch (_) {}
    }
  }
}

/* ── Build cache dest path for a source file ─────────────────── */
function buildDestPath(driveId, sourcePath) {
  const hash = crypto.createHash('sha1').update(`${driveId}:${sourcePath}`).digest('hex').slice(0, 12);
  const base  = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(getCacheDir(), driveId, `${base}-${hash}.mp4`);
}

/* ── FFmpeg: convert one video ───────────────────────────────── */
function convertVideo(item) {
  return new Promise((resolve) => {
    const destDir = path.dirname(item.destPath);
    try { fs.mkdirSync(destDir, { recursive: true }); } catch (_) {}

    // Probe source height so we never upscale
    let probeArgs = [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', item.sourcePath
    ];

    const probe = spawn('ffprobe', probeArgs);
    let probeOut = '';
    probe.stdout.on('data', d => { probeOut += d; });
    probe.on('close', () => {
      let scaleFilter = 'scale=-2:min(720\\,ih)'; // never upscale
      try {
        const info = JSON.parse(probeOut);
        const vs   = info.streams?.find(s => s.codec_type === 'video');
        if (vs && vs.height && vs.height <= 720) scaleFilter = 'scale=-2:ih'; // preserve original
      } catch (_) {}

      const tmpPath = item.destPath + '.tmp.mp4';
      const args = [
        '-y',
        '-i',   item.sourcePath,
        '-vf',  scaleFilter,
        '-c:v', 'libx264',
        '-preset', 'veryfast',   // veryfast = safe for weak CPU
        '-crf', '26',            // slightly lower quality to reduce file size
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-progress', 'pipe:2',
        tmpPath
      ];

      cacheJob.currentFile = path.basename(item.sourcePath);
      const proc = spawn('ffmpeg', args);
      cacheJob.ffmpegProc = proc;

      proc.stderr.on('data', () => {}); // absorb ffmpeg progress output
      proc.on('close', (code) => {
        cacheJob.ffmpegProc = null;
        if (code === 0 && fs.existsSync(tmpPath)) {
          try {
            fs.renameSync(tmpPath, item.destPath);
            const cachedSize = fs.statSync(item.destPath).size;
            const index = readCacheIndex();
            const key = `${item.driveId}:${item.sourcePath}`;
            index[key] = {
              driveId:      item.driveId,
              sourcePath:   item.sourcePath,
              sourceSize:   item.sourceSize,
              sourceMtime:  item.sourceMtime,
              destPath:     item.destPath,
              cachedSize,
              cachedAt:     Date.now(),
              cacheVersion: CACHE_VERSION,
            };
            writeCacheIndex(index);
          } catch (e) { cacheJob.lastError = e.message; }
        } else {
          // Conversion failed — clean up tmp
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
          if (code !== 0 && !cacheJob.paused) cacheJob.lastError = `FFmpeg exited ${code} for ${path.basename(item.sourcePath)}`;
        }
        resolve();
      });

      proc.on('error', (e) => {
        cacheJob.ffmpegProc = null;
        cacheJob.lastError = `FFmpeg error: ${e.message}. Is ffmpeg installed? Run: sudo apt install ffmpeg`;
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
        resolve();
      });
    });
    probe.on('error', () => {
      // ffprobe unavailable — still try ffmpeg with default scale
      resolve();
    });
  });
}

/* ── Main cache runner ───────────────────────────────────────── */
async function runCacheJob(driveIds, filePaths) {
  if (cacheJob.running) return;

  // Build queue
  let items;
  if (filePaths && filePaths.length > 0) {
    // Single-file or explicit list
    const index = readCacheIndex();
    items = [];
    const drives = getMountedDrives();
    for (const fp of filePaths) {
      const [driveId, sourcePath] = fp.split('::');
      const drive = drives.find(d => d.id === driveId);
      if (!drive) continue;
      try {
        const stat = fs.statSync(sourcePath);
        const key  = `${driveId}:${sourcePath}`;
        if (!isCacheValid(index[key], stat)) {
          items.push({ driveId, sourcePath, sourceSize: stat.size, sourceMtime: stat.mtimeMs, destPath: buildDestPath(driveId, sourcePath) });
        }
      } catch (_) {}
    }
  } else {
    // Scan drives
    const index = readCacheIndex();
    const all   = collectVideos(driveIds);
    items = all.filter(v => {
      try {
        const stat = fs.statSync(v.sourcePath);
        const key  = `${v.driveId}:${v.sourcePath}`;
        return !isCacheValid(index[key], stat);
      } catch (_) { return false; }
    }).map(v => ({ ...v, destPath: buildDestPath(v.driveId, v.sourcePath) }));
  }

  if (items.length === 0) {
    console.log('📦 Cache: all videos already cached.');
    return;
  }

  cacheJob.running    = true;
  cacheJob.paused     = false;
  cacheJob.queue      = items;
  cacheJob.filesTotal = items.length;
  cacheJob.filesDone  = 0;
  cacheJob.lastError  = '';
  cacheJob.startedAt  = Date.now();
  nightlySchedule.lastRun = new Date().toISOString();

  console.log(`📦 Cache: starting job — ${items.length} video(s) to process`);

  for (let i = 0; i < items.length; i++) {
    if (!cacheJob.running) break;
    // Wait if paused
    while (cacheJob.paused && cacheJob.running) {
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!cacheJob.running) break;

    cacheJob.filesDone = i;
    await convertVideo(items[i]);
  }

  cacheJob.running     = false;
  cacheJob.currentFile = '';
  cacheJob.filesDone   = cacheJob.filesTotal;
  console.log('✅ Cache: job complete');
}

/* ── Cache stats helper ──────────────────────────────────────── */
function getCacheStats() {
  const index  = readCacheIndex();
  const drives = getMountedDrives();
  let freeGB   = null;

  try {
    // df -BG to get free space on cache mount
    const dfOut = execSync(`df -BG "${getCacheMount()}" | tail -1`, { encoding: 'utf8' });
    const parts = dfOut.trim().split(/\s+/);
    if (parts[3]) freeGB = parseInt(parts[3], 10);
  } catch (_) {}

  // Build per-drive cache stats
  const driveStats = {};
  for (const d of drives) {
    driveStats[d.id] = { driveId: d.id, name: d.name, role: d.role, total: 0, cached: 0 };
  }

  // Count total videos per drive
  for (const d of drives) {
    const all = [];
    walkDir(d.mount, d.id, all);
    driveStats[d.id].total = all.length;
  }

  // Count cached
  let totalCachedFiles = 0;
  let totalCachedBytes = 0;
  const cachedList = [];

  for (const [key, entry] of Object.entries(index)) {
    // Validate entry is still current
    try {
      const stat = fs.statSync(entry.sourcePath);
      if (!isCacheValid(entry, stat)) continue;
    } catch (_) { continue; }

    if (driveStats[entry.driveId]) driveStats[entry.driveId].cached++;
    totalCachedFiles++;
    totalCachedBytes += entry.cachedSize || 0;
    cachedList.push({
      name:       path.basename(entry.sourcePath),
      driveId:    entry.driveId,
      sourcePath: entry.sourcePath,
      cachedSize: entry.cachedSize,
      cachedAt:   entry.cachedAt,
    });
  }

  const cacheMountExists = fs.existsSync(getCacheMount());
  const warn = freeGB !== null && freeGB < CACHE_WARN_GB;

  return {
    cacheMountExists,
    cacheMount: getCacheMount(),
    freeGB,
    warn,
    warnThresholdGB: CACHE_WARN_GB,
    totalCachedFiles,
    totalCachedGB:   +(totalCachedBytes / 1e9).toFixed(2),
    driveStats:   Object.values(driveStats),
    cachedList,
    job: {
      running:     cacheJob.running,
      paused:      cacheJob.paused,
      currentFile: cacheJob.currentFile,
      filesTotal:  cacheJob.filesTotal,
      filesDone:   cacheJob.filesDone,
      startedAt:   cacheJob.startedAt,
      lastError:   cacheJob.lastError,
    },
    nightlySchedule: {
      enabled:   nightlySchedule.enabled,
      startTime: nightlySchedule.startTime,
      lastRun:   nightlySchedule.lastRun,
    },
  };
}

/* ── Nightly cron (checks every minute) ─────────────────────── */
setInterval(() => {
  if (!nightlySchedule.enabled) return;
  const now  = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (hhmm !== nightlySchedule.startTime) return;
  // Prevent double-firing in same minute
  const lastRun = nightlySchedule.lastRun ? new Date(nightlySchedule.lastRun) : null;
  if (lastRun && (Date.now() - lastRun.getTime()) < 60000) return;
  console.log(`⏰ Nightly cache job triggered at ${hhmm}`);
  runCacheJob([], []).catch(console.error);
}, 60000);

/* ── Cache API endpoints ─────────────────────────────────────── */

// GET /api/cache/status
app.get('/api/cache/status', rateLimitAuth, auth, (req, res) => {
  res.json(getCacheStats());
});

// GET /api/cache/progress
app.get('/api/cache/progress', rateLimitAuth, auth, (req, res) => {
  const pct = cacheJob.filesTotal > 0
    ? Math.round((cacheJob.filesDone / cacheJob.filesTotal) * 100)
    : 0;
  res.json({
    running:     cacheJob.running,
    paused:      cacheJob.paused,
    currentFile: cacheJob.currentFile,
    filesTotal:  cacheJob.filesTotal,
    filesDone:   cacheJob.filesDone,
    percentDone: pct,
    lastError:   cacheJob.lastError,
  });
});

// POST /api/cache/start  body: { driveIds?: string[], filePaths?: string[] }
app.post('/api/cache/start', rateLimitAuth, auth, (req, res) => {
  if (cacheJob.running && !cacheJob.paused) {
    return res.status(409).json({ error: 'Cache job already running' });
  }
  if (cacheJob.paused) {
    cacheJob.paused = false;
    return res.json({ success: true, message: 'Cache job resumed' });
  }
  const { driveIds = [], filePaths = [] } = req.body || {};
  // Run async — don't await
  runCacheJob(driveIds, filePaths).catch(e => {
    cacheJob.lastError = e.message;
    cacheJob.running   = false;
  });
  res.json({ success: true, message: 'Cache job started' });
});

// POST /api/cache/pause
app.post('/api/cache/pause', rateLimitAuth, auth, (req, res) => {
  if (!cacheJob.running) return res.status(409).json({ error: 'No job running' });
  cacheJob.paused = true;
  // Kill current ffmpeg process gracefully (it will be retried next time)
  if (cacheJob.ffmpegProc) {
    try { cacheJob.ffmpegProc.kill('SIGTERM'); } catch (_) {}
  }
  res.json({ success: true, message: 'Cache job paused' });
});

// POST /api/cache/stop
app.post('/api/cache/stop', rateLimitAuth, auth, (req, res) => {
  cacheJob.running = false;
  cacheJob.paused  = false;
  if (cacheJob.ffmpegProc) {
    try { cacheJob.ffmpegProc.kill('SIGTERM'); } catch (_) {}
    cacheJob.ffmpegProc = null;
  }
  res.json({ success: true, message: 'Cache job stopped' });
});

// POST /api/cache/schedule  body: { enabled, startTime }
app.post('/api/cache/schedule', rateLimitAuth, auth, (req, res) => {
  const { enabled, startTime } = req.body || {};
  if (typeof enabled === 'boolean') nightlySchedule.enabled = enabled;
  if (startTime && /^\d{2}:\d{2}$/.test(startTime)) nightlySchedule.startTime = startTime;
  res.json({ success: true, schedule: nightlySchedule });
});

// POST /api/cache/invalidate  body: { driveId, sourcePath }
app.post('/api/cache/invalidate', rateLimitAuth, auth, (req, res) => {
  const { driveId, sourcePath } = req.body || {};
  if (!driveId || !sourcePath) return res.status(400).json({ error: 'driveId and sourcePath required' });
  const index = readCacheIndex();
  const key   = `${driveId}:${sourcePath}`;
  const entry = index[key];
  if (entry) {
    try { if (fs.existsSync(entry.destPath)) fs.unlinkSync(entry.destPath); } catch (_) {}
    delete index[key];
    writeCacheIndex(index);
  }
  res.json({ success: true });
});

// POST /api/cache/set-mount  body: { mountPath: string }
// Permanently sets CACHE_MOUNT in /opt/hcdave-agent/.env so the cache drive
// survives restarts. The calling UI passes the mountpoint of the chosen drive.
app.post('/api/cache/set-mount', rateLimitAuth, auth, (req, res) => {
  const { mountPath } = req.body || {};
  if (!mountPath || typeof mountPath !== 'string') {
    return res.status(400).json({ error: 'mountPath is required' });
  }
  // Validate it actually exists and is a directory
  if (!fs.existsSync(mountPath) || !fs.statSync(mountPath).isDirectory()) {
    return res.status(400).json({ error: `Path does not exist: ${mountPath}` });
  }
  try {
    const envFile = path.join(__dirname, '.env');
    let content   = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    // Remove existing CACHE_MOUNT line(s) then append the new one
    content = content.split('\n').filter(l => !l.startsWith('CACHE_MOUNT=')).join('\n').trimEnd();
    content += `\nCACHE_MOUNT=${mountPath}\n`;
    fs.writeFileSync(envFile, content, { mode: 0o600 });
    // Update in-memory so it takes effect immediately without restart
    process.env.CACHE_MOUNT = mountPath;
    res.json({ success: true, cacheMount: mountPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   AUTOMATED DRIVE BACKUP ENGINE
   ═══════════════════════════════════════════════════════════════
   - Compresses drive files/folders into a .tar.gz archive
   - Compresses 2GB folders/files down significantly
   - Runs on-demand or automatically at scheduled nightly time
   - Instant 1-click restore/decompression back to any drive
   ═══════════════════════════════════════════════════════════════ */

let backupJob = {
  running:        false,
  sourceDriveId:  '',
  destDriveId:    '',
  currentFile:    '',
  total:          0,
  done:           0,
  startedAt:      null,
  lastArchive:    '',
  lastError:      '',
  tarProc:        null,
};

let backupSchedule = {
  enabled:        false,
  startTime:      '02:00',
  sourceDriveId:  '',
  destDriveId:    '',
  lastRun:        null,
};

// Persist backup schedule
const backupScheduleFile = path.join(__dirname, 'backup_schedule.json');
try {
  if (fs.existsSync(backupScheduleFile)) {
    backupSchedule = { ...backupSchedule, ...JSON.parse(fs.readFileSync(backupScheduleFile, 'utf8')) };
  }
} catch (_) {}

function saveBackupSchedule() {
  try {
    fs.writeFileSync(backupScheduleFile, JSON.stringify(backupSchedule, null, 2), 'utf8');
  } catch (_) {}
}

function getBackupDir(destMount) {
  return path.join(destMount, 'hcdave-backups');
}
function getBackupIndex(destMount) {
  return path.join(getBackupDir(destMount), 'backup-index.json');
}
function readBackupIndex(destMount) {
  try {
    const p = getBackupIndex(destMount);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return [];
}
function writeBackupIndex(destMount, items) {
  try {
    const dir = getBackupDir(destMount);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getBackupIndex(destMount), JSON.stringify(items, null, 2));
  } catch (_) {}
}

function getAllBackupArchives() {
  const drives = getMountedDrives();
  const archives = [];
  for (const d of drives) {
    const list = readBackupIndex(d.mount);
    for (const item of list) {
      if (fs.existsSync(item.path)) {
        archives.push(item);
      }
    }
  }
  return archives;
}

async function runBackupJob(sourceDriveId, destDriveId) {
  if (backupJob.running) return;

  const drives = getMountedDrives();
  const srcDrive = drives.find(d => d.id === sourceDriveId);
  const dstDrive = drives.find(d => d.id === destDriveId);

  if (!srcDrive || !dstDrive) {
    backupJob.lastError = 'Source or destination drive not found';
    return;
  }

  const bDir = path.join(dstDrive.mount, 'hcdave-backups', srcDrive.id);
  fs.mkdirSync(bDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `backup-${srcDrive.name.replace(/\s+/g, '_')}-${timestamp}.tar.gz`;
  const archivePath = path.join(bDir, archiveName);

  backupJob.running       = true;
  backupJob.sourceDriveId = sourceDriveId;
  backupJob.destDriveId   = destDriveId;
  backupJob.startedAt     = Date.now();
  backupJob.lastError     = '';
  backupJob.total         = 100;
  backupJob.done          = 10;
  backupJob.currentFile   = `Compressing ${srcDrive.name}...`;

  return new Promise((resolve) => {
    // Exclude caches, temporary files, trash, and chunk directories
    const args = [
      '-czf', archivePath,
      '-C', srcDrive.mount,
      '--exclude=.hcdave-*',
      '--exclude=.Spotlight-*',
      '--exclude=.Trashes',
      '--exclude=$RECYCLE.BIN',
      '--exclude=System Volume Information',
      '.'
    ];

    const proc = spawn('tar', args);
    backupJob.tarProc = proc;

    let timer = setInterval(() => {
      if (backupJob.running && backupJob.done < 90) {
        backupJob.done += 5;
      }
    }, 1000);

    proc.on('close', (code) => {
      clearInterval(timer);
      backupJob.tarProc = null;
      backupJob.running = false;

      if (code === 0 && fs.existsSync(archivePath)) {
        backupJob.done = 100;
        backupJob.lastArchive = archivePath;
        backupJob.currentFile = '';
        const st = fs.statSync(archivePath);

        const index = readBackupIndex(dstDrive.mount);
        index.unshift({
          id: timestamp,
          name: archiveName,
          path: archivePath,
          sourceDriveId: srcDrive.id,
          sourceDriveName: srcDrive.name,
          destDriveId: dstDrive.id,
          createdAt: new Date().toISOString(),
          size: st.size,
          formattedSize: formatSize(st.size)
        });
        writeBackupIndex(dstDrive.mount, index);
        console.log(`✅ Backup complete: ${archivePath} (${formatSize(st.size)})`);
      } else {
        backupJob.lastError = `Backup process exited with code ${code}`;
        console.error('Backup failed:', backupJob.lastError);
      }
      resolve();
    });

    proc.on('error', (err) => {
      clearInterval(timer);
      backupJob.tarProc = null;
      backupJob.running = false;
      backupJob.lastError = err.message;
      resolve();
    });
  });
}

async function restoreBackupJob(archivePath, targetDriveId) {
  const drives = getMountedDrives();
  const tgtDrive = drives.find(d => d.id === targetDriveId);
  if (!tgtDrive) throw new Error('Target restore drive not found');
  if (!fs.existsSync(archivePath)) throw new Error('Backup archive file not found');

  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archivePath, '-C', tgtDrive.mount]);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Restore failed with exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

// Nightly cron for backup (checks every minute)
setInterval(() => {
  if (!backupSchedule.enabled) return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm !== backupSchedule.startTime) return;
  const lastRun = backupSchedule.lastRun ? new Date(backupSchedule.lastRun) : null;
  if (lastRun && (Date.now() - lastRun.getTime()) < 60000) return;

  console.log(`⏰ Nightly backup triggered at ${hhmm}`);
  backupSchedule.lastRun = new Date().toISOString();
  saveBackupSchedule();

  if (backupSchedule.sourceDriveId && backupSchedule.destDriveId) {
    runBackupJob(backupSchedule.sourceDriveId, backupSchedule.destDriveId).catch(console.error);
  } else {
    const drives = getMountedDrives();
    if (drives.length >= 2) {
      const dest = drives.find(d => d.role && d.role.toLowerCase() === 'backup') || drives[1];
      const src = drives.find(d => d.id !== dest.id) || drives[0];
      runBackupJob(src.id, dest.id).catch(console.error);
    }
  }
}, 60000);

// GET /api/backup/status
app.get('/api/backup/status', rateLimitAuth, auth, (_, res) => {
  const archives = getAllBackupArchives();
  res.json({
    job: {
      running:       backupJob.running,
      sourceDriveId: backupJob.sourceDriveId,
      destDriveId:   backupJob.destDriveId,
      currentFile:   backupJob.currentFile,
      total:         backupJob.total,
      done:          backupJob.done,
      startedAt:     backupJob.startedAt,
      lastArchive:   backupJob.lastArchive,
      lastError:     backupJob.lastError,
    },
    schedule: backupSchedule,
    archives,
  });
});

// POST /api/backup/start
app.post('/api/backup/start', rateLimitAuth, auth, (req, res) => {
  const { sourceDriveId, destDriveId } = req.body || {};
  if (!sourceDriveId || !destDriveId) {
    return res.status(400).json({ error: 'sourceDriveId and destDriveId required' });
  }
  if (backupJob.running) {
    return res.status(409).json({ error: 'A backup job is already running' });
  }
  // Start in background
  runBackupJob(sourceDriveId, destDriveId).catch(console.error);
  res.json({ success: true, message: 'Backup job started' });
});

// POST /api/backup/stop
app.post('/api/backup/stop', rateLimitAuth, auth, (_, res) => {
  if (backupJob.tarProc) {
    try { backupJob.tarProc.kill('SIGTERM'); } catch (_) {}
    backupJob.tarProc = null;
  }
  backupJob.running = false;
  res.json({ success: true, message: 'Backup job stopped' });
});

// POST /api/backup/restore
app.post('/api/backup/restore', rateLimitAuth, auth, async (req, res) => {
  const { archivePath, targetDriveId } = req.body || {};
  if (!archivePath || !targetDriveId) {
    return res.status(400).json({ error: 'archivePath and targetDriveId required' });
  }
  try {
    await restoreBackupJob(archivePath, targetDriveId);
    res.json({ success: true, message: 'Backup restored successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup/schedule
app.post('/api/backup/schedule', rateLimitAuth, auth, (req, res) => {
  const { enabled, startTime, sourceDriveId, destDriveId } = req.body || {};
  if (typeof enabled === 'boolean') backupSchedule.enabled = enabled;
  if (startTime && /^\d{2}:\d{2}$/.test(startTime)) backupSchedule.startTime = startTime;
  if (sourceDriveId) backupSchedule.sourceDriveId = sourceDriveId;
  if (destDriveId) backupSchedule.destDriveId = destDriveId;
  saveBackupSchedule();
  res.json({ success: true, schedule: backupSchedule });
});

// DELETE /api/backup/archive
app.delete('/api/backup/archive', rateLimitAuth, auth, (req, res) => {
  const { archivePath } = req.body || {};
  if (!archivePath) return res.status(400).json({ error: 'archivePath required' });
  try {
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    const drives = getMountedDrives();
    for (const d of drives) {
      const index = readBackupIndex(d.mount);
      const filtered = index.filter(i => i.path !== archivePath);
      if (filtered.length !== index.length) {
        writeBackupIndex(d.mount, filtered);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────
   DIRECT-TO-CLOUD REMOTE DOWNLOADER
   ───────────────────────────────────────────── */
const dnsPromises = require('dns').promises;
const remoteDownloadsFile = path.join(__dirname, 'remote_downloads.json');
let remoteDownloads = [];

function loadRemoteDownloads() {
  try {
    if (fs.existsSync(remoteDownloadsFile)) {
      remoteDownloads = JSON.parse(fs.readFileSync(remoteDownloadsFile, 'utf8'));
    }
  } catch (_) {
    remoteDownloads = [];
  }
}

function saveRemoteDownloads() {
  try {
    const data = remoteDownloads.map(d => ({
      id: d.id,
      url: d.url,
      driveId: d.driveId,
      driveName: d.driveName,
      folder: d.folder,
      filename: d.filename,
      status: d.status === 'downloading' ? 'paused' : d.status,
      totalBytes: d.totalBytes,
      downloadedBytes: d.downloadedBytes,
      speed: 0,
      percent: d.percent,
      eta: 0,
      resumable: d.resumable,
      expectedHash: d.expectedHash,
      sha256: d.sha256,
      hashMatched: d.hashMatched,
      error: d.error,
      createdAt: d.createdAt,
      completedAt: d.completedAt
    }));
    fs.writeFileSync(remoteDownloadsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

loadRemoteDownloads();

const activeDownloadReqs = new Map();

function parseIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function matchIpv4Cidr(ipInt, baseInt, prefix) {
  const mask = prefix === 0 ? 0 : ((~0 << (32 - prefix)) >>> 0);
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

const IPV4_BLOCKED_RANGES = [
  { cidr: '0.0.0.0/8',          base: parseIpv4('0.0.0.0'),         prefix: 8 },
  { cidr: '10.0.0.0/8',         base: parseIpv4('10.0.0.0'),        prefix: 8 },
  { cidr: '100.64.0.0/10',      base: parseIpv4('100.64.0.0'),      prefix: 10 },
  { cidr: '127.0.0.0/8',        base: parseIpv4('127.0.0.0'),       prefix: 8 },
  { cidr: '169.254.0.0/16',     base: parseIpv4('169.254.0.0'),     prefix: 16 },
  { cidr: '172.16.0.0/12',      base: parseIpv4('172.16.0.0'),      prefix: 12 },
  { cidr: '192.0.0.0/24',       base: parseIpv4('192.0.0.0'),       prefix: 24 },
  { cidr: '192.0.2.0/24',       base: parseIpv4('192.0.2.0'),       prefix: 24 },
  { cidr: '192.88.99.0/24',     base: parseIpv4('192.88.99.0'),     prefix: 24 },
  { cidr: '192.168.0.0/16',     base: parseIpv4('192.168.0.0'),     prefix: 16 },
  { cidr: '198.18.0.0/15',      base: parseIpv4('198.18.0.0'),      prefix: 15 },
  { cidr: '198.51.100.0/24',    base: parseIpv4('198.51.100.0'),    prefix: 24 },
  { cidr: '203.0.113.0/24',     base: parseIpv4('203.0.113.0'),     prefix: 24 },
  { cidr: '224.0.0.0/4',        base: parseIpv4('224.0.0.0'),       prefix: 4 },
  { cidr: '240.0.0.0/4',        base: parseIpv4('240.0.0.0'),       prefix: 4 },
  { cidr: '255.255.255.255/32', base: parseIpv4('255.255.255.255'), prefix: 32 }
];

function parseIpv6(ip) {
  let cleanIp = ip.toLowerCase();
  const v4match = cleanIp.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match) {
    const v4 = v4match[1].split('.').map(Number);
    if (v4.length === 4 && !v4.some(p => isNaN(p) || p < 0 || p > 255)) {
      const hex = ((v4[0] << 8) | v4[1]).toString(16).padStart(4, '0') + ':' + ((v4[2] << 8) | v4[3]).toString(16).padStart(4, '0');
      cleanIp = cleanIp.substring(0, v4match.index + 1) + hex;
    }
  }
  const parts = cleanIp.split('::');
  if (parts.length > 2) return null;
  let leftParts = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  let rightParts = parts[1] !== undefined ? parts[1].split(':').filter(Boolean) : null;
  let fullParts;
  if (rightParts !== null) {
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 0) return null;
    fullParts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  } else {
    fullParts = leftParts;
  }
  if (fullParts.length !== 8) return null;
  let big = 0n;
  for (const p of fullParts) {
    if (!/^[0-9a-f]{1,4}$/i.test(p)) return null;
    big = (big << 16n) + BigInt(parseInt(p, 16));
  }
  return big;
}

function matchIpv6Cidr(ipBig, baseBig, prefix) {
  const mask = prefix === 0 ? 0n : ((~0n << BigInt(128 - prefix)) & ((1n << 128n) - 1n));
  return (ipBig & mask) === (baseBig & mask);
}

const IPV6_BLOCKED_RANGES = [
  { cidr: '::/128',          base: parseIpv6('::'),          prefix: 128 },
  { cidr: '::1/128',         base: parseIpv6('::1'),         prefix: 128 },
  { cidr: '::/96',           base: parseIpv6('::'),          prefix: 96 },   // IPv4-compatible (RFC 4291)
  { cidr: '::ffff:0:0/96',   base: parseIpv6('::ffff:0:0'),   prefix: 96 },   // IPv4-mapped (RFC 4291)
  { cidr: '64:ff9b::/96',    base: parseIpv6('64:ff9b::'),    prefix: 96 },   // NAT64 Well-Known (RFC 6052)
  { cidr: '100::/64',        base: parseIpv6('100::'),        prefix: 64 },   // Discard prefix (RFC 6666)
  { cidr: '2001::/23',       base: parseIpv6('2001::'),       prefix: 23 },   // IETF protocol assignments (RFC 2928)
  { cidr: '2001:db8::/32',   base: parseIpv6('2001:db8::'),   prefix: 32 },   // Documentation (RFC 3849)
  { cidr: '2002::/16',       base: parseIpv6('2002::'),       prefix: 16 },   // 6to4 (RFC 3056)
  { cidr: 'fc00::/7',        base: parseIpv6('fc00::'),        prefix: 7 },    // Unique Local (RFC 4193)
  { cidr: 'fe80::/10',       base: parseIpv6('fe80::'),       prefix: 10 },   // Link-local (RFC 4291)
  { cidr: 'fec0::/10',       base: parseIpv6('fec0::'),       prefix: 10 },   // Site-local deprecated (RFC 3879)
  { cidr: 'ff00::/8',        base: parseIpv6('ff00::'),        prefix: 8 }     // Multicast (RFC 4291)
];

function isPrivateOrReservedIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const trimmed = ip.trim().replace(/^\[|\]$/g, '');
  if (trimmed === 'localhost') return true;

  const v4Int = parseIpv4(trimmed);
  if (v4Int !== null) {
    for (const r of IPV4_BLOCKED_RANGES) {
      if (matchIpv4Cidr(v4Int, r.base, r.prefix)) return true;
    }
    return false;
  }

  const v6Big = parseIpv6(trimmed);
  if (v6Big !== null) {
    for (const r of IPV6_BLOCKED_RANGES) {
      if (matchIpv6Cidr(v6Big, r.base, r.prefix)) return true;
    }
    // Also inspect any embedded IPv4 addresses (e.g. ::127.0.0.1, ::ffff:192.168.1.1, etc.)
    const v4match = trimmed.match(/:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4match) {
      const embeddedV4Int = parseIpv4(v4match[1]);
      if (embeddedV4Int !== null) {
        for (const r of IPV4_BLOCKED_RANGES) {
          if (matchIpv4Cidr(embeddedV4Int, r.base, r.prefix)) return true;
        }
      }
    }
    return false;
  }

  return true;
}

function parseContentDispositionFilename(header) {
  if (!header || typeof header !== 'string') return null;

  // RFC 6266 / RFC 5987: filename* takes precedence over filename
  // Format: filename*=[charset]'[lang]'encoded-value
  const fnStarMatch = header.match(/filename\*\s*=\s*([^\'\s]+)\'([^\']*)\'([^;\s]+)/i);
  if (fnStarMatch) {
    try {
      const decoded = decodeURIComponent(fnStarMatch[3].trim());
      if (decoded) return decoded;
    } catch (_) {}
  }

  // Quoted filename: filename="..." or filename='...'
  const quotedMatch = header.match(/filename\s*=\s*(['\"])((?:(?!\1)[^\\]|\\.)*)\1/i);
  if (quotedMatch) {
    const unescaped = quotedMatch[2].replace(/\\(.)/g, '$1').trim();
    if (unescaped) return unescaped;
  }

  // Unquoted filename: filename=value
  const unquotedMatch = header.match(/filename\s*=\s*([^;\s]+)/i);
  if (unquotedMatch) {
    return unquotedMatch[1].replace(/^["']|["']$/g, '').trim();
  }

  return null;
}

async function validateUrlForSsrf(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    throw new Error('Invalid URL format');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed');
  }
  const hostname = parsed.hostname;
  if (!hostname) {
    throw new Error('Invalid URL hostname');
  }

  // Strip brackets from IPv6 hostnames
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  if (cleanHost === 'localhost' || cleanHost.endsWith('.localhost') || cleanHost.endsWith('.local') || cleanHost.endsWith('.internal') || cleanHost.endsWith('.lan') || cleanHost.endsWith('.home') || cleanHost.endsWith('.arpa')) {
    throw new Error('Access to local/internal network hostnames is blocked for security');
  }

  const ipVer = net.isIP(cleanHost);
  if (ipVer !== 0) {
    if (isPrivateOrReservedIp(cleanHost)) {
      throw new Error(`Access to private/internal IP address (${cleanHost}) is blocked for security`);
    }
    return {
      parsedUrl: parsed,
      url: parsed.toString(),
      pinnedIp: cleanHost,
      pinnedFamily: ipVer
    };
  }

  let records;
  try {
    records = await dnsPromises.lookup(cleanHost, { all: true });
    if (!records || records.length === 0) {
      throw new Error(`DNS resolution failed for hostname "${cleanHost}": No records found`);
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error(`Access to private/internal IP address (${rec.address}) is blocked for security`);
      }
    }
  } catch (err) {
    if (err.message.includes('blocked for security')) throw err;
    throw new Error(`DNS resolution failed for hostname "${cleanHost}": ${err.message}`);
  }

  const pinnedRecord = records[0];
  return {
    parsedUrl: parsed,
    url: parsed.toString(),
    pinnedIp: pinnedRecord.address,
    pinnedFamily: pinnedRecord.family
  };
}

async function startDownloadTask(task) {
  if (!task.pinnedIp) {
    try {
      const validated = await validateUrlForSsrf(task.url);
      task.pinnedIp = validated.pinnedIp;
      task.pinnedFamily = validated.pinnedFamily;
    } catch (err) {
      task.status = 'failed';
      task.error = 'Security validation failed: ' + err.message;
      saveRemoteDownloads();
      return;
    }
  }

  const parsed = new URL(task.url);
  const client = parsed.protocol === 'https:' ? https : http;

  let existingBytes = 0;
  if (fs.existsSync(task.partFile)) {
    try {
      existingBytes = fs.statSync(task.partFile).size;
    } catch (_) {
      existingBytes = 0;
    }
  }

  task.downloadedBytes = existingBytes;
  task.status = 'downloading';
  task.error = null;

  const headers = {
    'User-Agent': 'HCDaveCloud-Downloader/1.4'
  };

  if (existingBytes > 0) {
    headers['Range'] = `bytes=${existingBytes}-`;
  }

  let lastBytes = existingBytes;
  let lastTime = Date.now();

  const customLookup = (hostname, opts, cb) => {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    if (opts && opts.all) {
      cb(null, [{ address: task.pinnedIp, family: task.pinnedFamily }]);
    } else {
      cb(null, task.pinnedIp, task.pinnedFamily);
    }
  };

  const cleanHostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const isHostIp = net.isIP(cleanHostname) !== 0;

  const reqOptions = {
    headers,
    lookup: customLookup,
    servername: isHostIp ? undefined : cleanHostname
  };

  const req = client.get(task.url, reqOptions, (res) => {
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      try { res.resume(); } catch (_) {}
      task.redirectCount = (task.redirectCount || 0) + 1;
      if (task.redirectCount > 5) {
        task.status = 'failed';
        task.error = 'Redirect blocked: too many redirects';
        saveRemoteDownloads();
        return;
      }
      const redirectUrl = new URL(res.headers.location, task.url).toString();
      validateUrlForSsrf(redirectUrl).then((validated) => {
        if (task.status === 'paused' || task.status === 'canceled') return;
        task.url = redirectUrl;
        task.pinnedIp = validated.pinnedIp;
        task.pinnedFamily = validated.pinnedFamily;
        startDownloadTask(task);
      }).catch(err => {
        task.status = 'failed';
        task.error = 'Redirect blocked: ' + err.message;
        saveRemoteDownloads();
      });
      return;
    }

    if (res.statusCode !== 200 && res.statusCode !== 206) {
      task.status = 'failed';
      task.error = `HTTP Error ${res.statusCode}: ${res.statusMessage || 'Download failed'}`;
      saveRemoteDownloads();
      return;
    }

    const isPartial = res.statusCode === 206;
    task.resumable = isPartial || res.headers['accept-ranges'] === 'bytes';

    if (isPartial) {
      const cr = res.headers['content-range'];
      if (cr) {
        const m = cr.match(/bytes\s+\d+-\d+\/(\d+)/);
        if (m) task.totalBytes = parseInt(m[1], 10);
      }
    } else {
      task.downloadedBytes = 0;
      existingBytes = 0;
      const cl = res.headers['content-length'];
      if (cl) task.totalBytes = parseInt(cl, 10);
    }

    // Response filename handling via Content-Disposition
    const cd = res.headers['content-disposition'];
    if (cd) {
      const rawCdName = parseContentDispositionFilename(cd);
      if (rawCdName) {
        const safeCdName = sanitizeFilename(rawCdName, task.filename || 'download', 250);
        try {
          verifySafeContainment(task.destDir, safeCdName);

          const candidateName = getUniqueFilename(task.destDir, safeCdName, 250);
          verifySafeContainment(task.destDir, candidateName);

          const newTarget = path.join(task.destDir, candidateName);
          const newPart = `${newTarget}.part`;
          verifySafeContainment(task.destDir, newTarget);
          verifySafeContainment(task.destDir, newPart);

          if (task.partFile && task.partFile !== newPart && fs.existsSync(task.partFile)) {
            try {
              fs.renameSync(task.partFile, newPart);
            } catch (_) {}
          }
          task.filename = candidateName;
          task.targetFile = newTarget;
          task.partFile = newPart;
        } catch (containErr) {
          console.warn('[Downloader] Malicious Content-Disposition filename blocked:', rawCdName, containErr.message);
        }
      }
    }

    // Guarantee containment of partFile before creating write stream
    try {
      verifySafeContainment(task.destDir, task.partFile);
    } catch (partErr) {
      task.status = 'failed';
      task.error = 'Destination containment failure: ' + partErr.message;
      saveRemoteDownloads();
      return;
    }

    const writeStream = fs.createWriteStream(task.partFile, { flags: isPartial ? 'a' : 'w' });
    activeDownloadReqs.set(task.id, { req, task, writeStream });

    res.on('data', (chunk) => {
      task.downloadedBytes += chunk.length;
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 1) {
        task.speed = Math.round((task.downloadedBytes - lastBytes) / elapsed);
        lastBytes = task.downloadedBytes;
        lastTime = now;

        if (task.totalBytes > 0) {
          task.percent = Math.min(100, Math.round((task.downloadedBytes / task.totalBytes) * 100));
          const remaining = task.totalBytes - task.downloadedBytes;
          task.eta = task.speed > 0 ? Math.round(remaining / task.speed) : 0;
        } else {
          task.percent = 0;
          task.eta = 0;
        }
      }
    });

    res.pipe(writeStream);

    writeStream.on('finish', () => {
      writeStream.close(async () => {
        if (task.status !== 'downloading') return;

        try {
          verifySafeContainment(task.destDir, task.partFile);

          let finalTarget = task.targetFile;
          if (fs.existsSync(finalTarget)) {
            const candidate = getUniqueFilename(task.destDir, task.filename, 250);
            verifySafeContainment(task.destDir, candidate);
            finalTarget = path.join(task.destDir, candidate);
          }
          verifySafeContainment(task.destDir, finalTarget);
          task.targetFile = finalTarget;
          task.filename = path.basename(finalTarget);

          fs.renameSync(task.partFile, task.targetFile);

          const hash = crypto.createHash('sha256');
          const fileStream = fs.createReadStream(task.targetFile);
          fileStream.on('data', c => hash.update(c));
          fileStream.on('end', () => {
            task.sha256 = hash.digest('hex');
            if (task.expectedHash) {
              task.hashMatched = (task.sha256.toLowerCase() === task.expectedHash.trim().toLowerCase());
            }
            task.status = 'completed';
            task.percent = 100;
            task.speed = 0;
            task.eta = 0;
            task.completedAt = Date.now();
            activeDownloadReqs.delete(task.id);
            saveRemoteDownloads();
          });
        } catch (e) {
          task.status = 'failed';
          task.error = 'Finalizing file failed: ' + e.message;
          activeDownloadReqs.delete(task.id);
          saveRemoteDownloads();
        }
      });
    });

    writeStream.on('error', (err) => {
      task.status = 'failed';
      task.error = 'Write error: ' + err.message;
      activeDownloadReqs.delete(task.id);
      saveRemoteDownloads();
    });
  });

  req.on('error', (err) => {
    if (task.status === 'paused' || task.status === 'canceled') return;
    task.status = 'failed';
    task.error = 'Network error: ' + err.message;
    activeDownloadReqs.delete(task.id);
    saveRemoteDownloads();
  });

  activeDownloadReqs.set(task.id, { req, task });
}

// GET /api/remote-downloads
app.get('/api/remote-downloads', rateLimitAuth, auth, (req, res) => {
  res.json({
    downloads: remoteDownloads.map(d => ({
      id: d.id,
      url: d.url,
      driveId: d.driveId,
      driveName: d.driveName,
      folder: d.folder,
      filename: d.filename,
      status: d.status,
      totalBytes: d.totalBytes,
      downloadedBytes: d.downloadedBytes,
      speed: d.speed || 0,
      percent: d.percent || 0,
      eta: d.eta || 0,
      resumable: d.resumable,
      expectedHash: d.expectedHash,
      sha256: d.sha256,
      hashMatched: d.hashMatched,
      error: d.error,
      createdAt: d.createdAt,
      completedAt: d.completedAt
    }))
  });
});

// POST /api/remote-downloads
app.post('/api/remote-downloads', rateLimitAuth, auth, async (req, res) => {
  try {
    const { url, driveId, folder = '/', filename, expectedHash } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    // Validate SSRF first
    const validated = await validateUrlForSsrf(url);
    const parsedUrl = validated.parsedUrl;

    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Target drive not found' });

    // Validate safe path
    let destDir;
    try {
      destDir = safePath(drive.mount, folder);
      verifySafeContainment(drive.mount, destDir, true);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid destination directory: ' + e.message });
    }
    fs.mkdirSync(destDir, { recursive: true });

    // Determine filename
    let finalName = (filename || '').trim();
    if (!finalName) {
      const urlPath = parsedUrl.pathname.replace(/\/+$/, '');
      finalName = path.basename(urlPath) || 'download';
      if (!path.extname(finalName) && urlPath.includes('.')) {
        finalName = 'download';
      }
    }
    // Sanitize filename and enforce destination containment (max 250 bytes to leave 5 bytes for .part)
    finalName = sanitizeFilename(finalName, 'download', 250);
    verifySafeContainment(destDir, finalName);

    const targetFile = path.join(destDir, finalName);
    const partFile = `${targetFile}.part`;
    verifySafeContainment(destDir, path.basename(partFile));

    const taskId = `dl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const task = {
      id: taskId,
      url: parsedUrl.toString(),
      pinnedIp: validated.pinnedIp,
      pinnedFamily: validated.pinnedFamily,
      driveId: drive.id,
      driveName: drive.name,
      folder: folder,
      filename: finalName,
      destDir: destDir,
      targetFile: targetFile,
      partFile: partFile,
      status: 'pending',
      totalBytes: 0,
      downloadedBytes: 0,
      speed: 0,
      percent: 0,
      eta: 0,
      resumable: false,
      expectedHash: (expectedHash || '').trim() || null,
      sha256: null,
      hashMatched: null,
      error: null,
      createdAt: Date.now()
    };

    remoteDownloads.unshift(task);
    saveRemoteDownloads();

    startDownloadTask(task);

    res.json({ success: true, download: task });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/remote-downloads/:id/pause
app.post('/api/remote-downloads/:id/pause', rateLimitAuth, auth, (req, res) => {
  const task = remoteDownloads.find(d => d.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Download task not found' });

  const active = activeDownloadReqs.get(task.id);
  if (active) {
    if (active.req) { try { active.req.destroy(); } catch (_) {} }
    if (active.writeStream) { try { active.writeStream.close(); } catch (_) {} }
    activeDownloadReqs.delete(task.id);
  }

  task.status = 'paused';
  task.speed = 0;
  task.eta = 0;
  saveRemoteDownloads();

  res.json({ success: true, status: 'paused' });
});

// POST /api/remote-downloads/:id/resume
app.post('/api/remote-downloads/:id/resume', rateLimitAuth, auth, (req, res) => {
  const task = remoteDownloads.find(d => d.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Download task not found' });

  if (task.status === 'downloading') {
    return res.json({ success: true, status: 'already downloading' });
  }

  startDownloadTask(task);
  saveRemoteDownloads();

  res.json({ success: true, status: 'resumed' });
});

// DELETE /api/remote-downloads/:id
app.delete('/api/remote-downloads/:id', rateLimitAuth, auth, (req, res) => {
  const idx = remoteDownloads.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Download task not found' });

  const task = remoteDownloads[idx];
  const active = activeDownloadReqs.get(task.id);
  if (active) {
    if (active.req) { try { active.req.destroy(); } catch (_) {} }
    if (active.writeStream) { try { active.writeStream.close(); } catch (_) {} }
    activeDownloadReqs.delete(task.id);
  }

  if (req.query.deleteFile === 'true') {
    try { if (fs.existsSync(task.partFile)) fs.unlinkSync(task.partFile); } catch (_) {}
    try { if (fs.existsSync(task.targetFile)) fs.unlinkSync(task.targetFile); } catch (_) {}
  }

  remoteDownloads.splice(idx, 1);
  saveRemoteDownloads();

  res.json({ success: true });
});

/* ─────────────────────────────────────────────
   QUICKDROP — PHONE-TO-CLOUD TRANSFER
   ───────────────────────────────────────────── */
const quickDropsFile = path.join(__dirname, 'quickdrops.json');
let quickDropSessions = new Map();

// Abuse protection: IP & session upload rate limiters
const quickDropIpLimits = new Map(); // ip -> [timestamps]
const quickDropSessionLimits = new Map(); // token -> [timestamps]

function checkRateLimit(map, key, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  const timestamps = (map.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    map.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  map.set(key, timestamps);
  return true;
}

function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
}

function getFreeDiskSpace(targetPath) {
  try {
    const stats = fs.statfsSync(targetPath);
    return stats.bavail * stats.bsize;
  } catch (_) {
    return null;
  }
}

function loadQuickDrops() {
  try {
    if (fs.existsSync(quickDropsFile)) {
      const arr = JSON.parse(fs.readFileSync(quickDropsFile, 'utf8'));
      const now = Date.now();
      for (const item of arr) {
        if (item.expiresAt > now) {
          quickDropSessions.set(item.token, item);
        }
      }
    }
  } catch (_) {}
}

function saveQuickDrops() {
  try {
    const arr = Array.from(quickDropSessions.values());
    fs.writeFileSync(quickDropsFile, JSON.stringify(arr, null, 2), 'utf8');
  } catch (_) {}
}

loadQuickDrops();

// POST /api/quickdrop/create (authenticated)
app.post('/api/quickdrop/create', rateLimitAuth, auth, (req, res) => {
  try {
    const {
      driveId,
      folder = '/',
      expiryMinutes = 60,
      maxFiles = 50,
      maxFileBytes = 20 * 1024 * 1024 * 1024, // 20 GB default per-file
      maxTotalBytes = 50 * 1024 * 1024 * 1024  // 50 GB default aggregate
    } = req.body || {};
    const drives = getMountedDrives();
    const drive = drives.find(d => d.id === driveId) || drives[0];
    if (!drive) return res.status(404).json({ error: 'Drive not found' });

    const dest = safePath(drive.mount, folder);
    verifySafeContainment(drive.mount, dest, true);
    fs.mkdirSync(dest, { recursive: true });

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + (parseInt(expiryMinutes, 10) || 60) * 60 * 1000;

    const session = {
      token,
      driveId: drive.id,
      driveName: drive.name,
      folder: folder || '/',
      createdAt: Date.now(),
      expiresAt,
      maxFiles: maxFiles ? parseInt(maxFiles, 10) : null,
      maxFileBytes: maxFileBytes ? parseInt(maxFileBytes, 10) : (20 * 1024 * 1024 * 1024),
      maxTotalBytes: maxTotalBytes ? parseInt(maxTotalBytes, 10) : (50 * 1024 * 1024 * 1024),
      uploadedCount: 0,
      uploadedBytes: 0,
      uploadedFiles: []
    };

    quickDropSessions.set(token, session);
    saveQuickDrops();

    res.json({
      success: true,
      token,
      expiresAt,
      driveName: drive.name,
      folder: folder || '/',
      maxFiles: session.maxFiles,
      maxFileBytes: session.maxFileBytes,
      maxTotalBytes: session.maxTotalBytes
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/quickdrop/:token (public session lookup)
app.get('/api/quickdrop/:token', (req, res) => {
  const session = quickDropSessions.get(req.params.token);
  if (!session) {
    return res.status(404).json({ error: 'QuickDrop link not found or expired' });
  }
  if (Date.now() > session.expiresAt) {
    quickDropSessions.delete(req.params.token);
    saveQuickDrops();
    return res.status(410).json({ error: 'QuickDrop link has expired' });
  }
  if (session.maxFiles && session.uploadedCount >= session.maxFiles) {
    return res.status(403).json({ error: 'QuickDrop upload limit reached' });
  }
  if (session.maxTotalBytes && (session.uploadedBytes || 0) >= session.maxTotalBytes) {
    return res.status(403).json({ error: 'QuickDrop session quota reached' });
  }

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === session.driveId);
  let freeBytes = null;
  if (drive) {
    try {
      const dest = safePath(drive.mount, session.folder);
      freeBytes = getFreeDiskSpace(dest);
    } catch (_) {}
  }

  res.json({
    valid: true,
    driveName: session.driveName,
    folder: session.folder,
    expiresAt: session.expiresAt,
    uploadedCount: session.uploadedCount,
    uploadedBytes: session.uploadedBytes || 0,
    maxFiles: session.maxFiles,
    maxFileBytes: session.maxFileBytes,
    maxTotalBytes: session.maxTotalBytes,
    freeDiskSpace: freeBytes
  });
});

// GET /api/quickdrop/:token/status (authenticated host listener)
app.get('/api/quickdrop/:token/status', rateLimitAuth, auth, (req, res) => {
  const session = quickDropSessions.get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    active: Date.now() <= session.expiresAt,
    uploadedCount: session.uploadedCount,
    uploadedBytes: session.uploadedBytes || 0,
    uploadedFiles: session.uploadedFiles,
    expiresAt: session.expiresAt,
    maxFiles: session.maxFiles,
    maxFileBytes: session.maxFileBytes,
    maxTotalBytes: session.maxTotalBytes
  });
});

// POST /api/quickdrop/:token/upload (public upload handler)
app.post('/api/quickdrop/:token/upload', (req, res) => {
  const session = quickDropSessions.get(req.params.token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) {
      quickDropSessions.delete(req.params.token);
      saveQuickDrops();
    }
    return res.status(410).json({ error: 'QuickDrop session expired' });
  }

  // 1. IP & Session Rate Limiting
  const clientIp = getClientIp(req);
  if (!checkRateLimit(quickDropIpLimits, clientIp, 30, 60000)) {
    return res.status(429).json({ error: 'Too many upload attempts from your IP. Please try again in a minute.' });
  }
  if (!checkRateLimit(quickDropSessionLimits, session.token, 30, 60000)) {
    return res.status(429).json({ error: 'Upload rate limit reached for this session. Please try again in a minute.' });
  }

  // 2. Session Quota Pre-checks
  if (session.maxFiles && session.uploadedCount >= session.maxFiles) {
    return res.status(403).json({ error: 'Upload limit reached for this session' });
  }
  if (session.maxTotalBytes && (session.uploadedBytes || 0) >= session.maxTotalBytes) {
    return res.status(403).json({ error: 'Session storage quota reached' });
  }

  // 3. Destination containment & Drive check
  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === session.driveId);
  if (!drive) return res.status(404).json({ error: 'Destination drive is disconnected' });

  let destDir;
  try {
    destDir = safePath(drive.mount, session.folder);
    verifySafeContainment(drive.mount, destDir, true);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid destination folder' });
  }
  fs.mkdirSync(destDir, { recursive: true });

  // 4. Content-Length quota & free disk space pre-check
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const currentUsed = (session.uploadedBytes || 0) + (session.inFlightBytes || 0);
  const remainingQuota = session.maxTotalBytes ? Math.max(0, session.maxTotalBytes - currentUsed) : null;

  if (remainingQuota !== null && remainingQuota <= 0) {
    return res.status(413).json({ error: 'Session storage quota reached' });
  }

  const freeBytes = getFreeDiskSpace(destDir);
  const SAFETY_BUFFER = 50 * 1024 * 1024; // 50 MB safety margin
  if (freeBytes !== null) {
    if (freeBytes < SAFETY_BUFFER || (contentLength > 0 && contentLength + SAFETY_BUFFER > freeBytes)) {
      return res.status(507).json({
        error: `Insufficient disk space. Needed: ${formatSize(contentLength)}, Available: ${formatSize(freeBytes)}`
      });
    }
  }

  if (contentLength > 0) {
    if (remainingQuota !== null && contentLength > remainingQuota) {
      return res.status(413).json({
        error: `Upload size (${formatSize(contentLength)}) exceeds remaining session quota of ${formatSize(remainingQuota)}`
      });
    }

    session.inFlightBytes = (session.inFlightBytes || 0) + contentLength;
  }

  let inFlightReleased = false;
  const releaseInFlight = () => {
    if (!inFlightReleased) {
      inFlightReleased = true;
      if (contentLength > 0) {
        session.inFlightBytes = Math.max(0, (session.inFlightBytes || 0) - contentLength);
      }
    }
  };

  let uploadFinished = false;
  res.on('finish', () => {
    uploadFinished = true;
    releaseInFlight();
  });
  res.on('close', () => {
    releaseInFlight();
    if (!uploadFinished) {
      for (const f of req._activeFilePaths || []) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
      }
    }
  });
  req.on('error', releaseInFlight);

  // Stream quota monitor for chunked uploads without Content-Length
  let streamBytes = 0;
  let streamAborted = false;
  req.on('data', chunk => {
    streamBytes += chunk.length;
    if (remainingQuota !== null && streamBytes > remainingQuota + 2 * 1024 * 1024 && !streamAborted) {
      streamAborted = true;
      req.destroy(new Error('LIMIT_QUOTA_EXCEEDED'));
    }
  });

  // 5. Dynamic Multer instance configured for this session's limits
  const maxSingleFile = session.maxFileBytes || (20 * 1024 * 1024 * 1024);
  const effectiveMaxFile = remainingQuota !== null ? Math.min(maxSingleFile, remainingQuota) : maxSingleFile;
  const allowedRemainingFiles = session.maxFiles ? Math.max(1, Math.min(50, session.maxFiles - session.uploadedCount)) : 50;

  const storage = multer.diskStorage({
    destination: (r, file, cb) => {
      try {
        const dest = safePath(drive.mount, session.folder);
        verifySafeContainment(drive.mount, dest, true);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
      } catch (err) {
        cb(err);
      }
    },
    filename: (r, file, cb) => {
      try {
        const dest = safePath(drive.mount, session.folder);
        // Sanitize both / and \, null bytes, control chars, reduce to safe basename
        const safeName = sanitizeFilename(file.originalname, 'upload', 255);
        // Verify output path remains strictly inside destination directory
        verifySafeContainment(dest, safeName);

        const finalName = getUniqueFilename(dest, safeName, 255);
        verifySafeContainment(dest, finalName);

        const fullPath = path.join(dest, finalName);
        r._activeFilePaths = r._activeFilePaths || new Set();
        r._activeFilePaths.add(fullPath);

        cb(null, finalName);
      } catch (err) {
        cb(err);
      }
    }
  });

  const uploadHandler = multer({
    storage,
    limits: {
      fileSize: effectiveMaxFile,
      files: allowedRemainingFiles
    }
  }).array('files', allowedRemainingFiles);

  uploadHandler(req, res, (err) => {
    if (err) {
      for (const f of req._activeFilePaths || []) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
      }
      if (err.message === 'LIMIT_QUOTA_EXCEEDED') {
        return res.status(413).json({ error: `Upload exceeds session storage quota of ${formatSize(session.maxTotalBytes)}` });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File exceeds maximum allowed size of ${formatSize(effectiveMaxFile)}` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(403).json({ error: `Too many files. Session limit is ${session.maxFiles}` });
      }
      return res.status(400).json({ error: err.message });
    }

    const uploadedFiles = req.files || [];
    const batchBytes = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    // Post-write aggregate quota check
    if (session.maxTotalBytes && ((session.uploadedBytes || 0) + batchBytes > session.maxTotalBytes)) {
      for (const f of uploadedFiles) {
        try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
      }
      return res.status(413).json({
        error: `Upload batch (${formatSize(batchBytes)}) exceeds session storage quota of ${formatSize(session.maxTotalBytes)}`
      });
    }

    // Verify written files are strictly inside destDir
    for (const f of uploadedFiles) {
      try {
        verifySafeContainment(destDir, f.path);
      } catch (cErr) {
        try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
        return res.status(400).json({ error: 'File containment violation blocked: ' + cErr.message });
      }
    }

    const uploadedList = uploadedFiles.map(f => ({
      name: path.basename(f.path),
      size: formatSize(f.size),
      time: new Date().toLocaleTimeString()
    }));

    session.uploadedCount = (session.uploadedCount || 0) + uploadedList.length;
    session.uploadedBytes = (session.uploadedBytes || 0) + batchBytes;
    session.uploadedFiles.push(...uploadedList);
    saveQuickDrops();

    res.json({
      success: true,
      count: uploadedList.length,
      files: uploadedList,
      uploadedCount: session.uploadedCount,
      uploadedBytes: session.uploadedBytes
    });
  });
});

module.exports = {
  app,
  server,
  safePath,
  verifySafeContainment,
  sanitizeFilename,
  getUniqueFilename,
  parseContentDispositionFilename,
  isPrivateOrReservedIp,
  validateUrlForSsrf,
  startDownloadTask,
  quickDropSessions,
  remoteDownloads,
  saveQuickDrops,
  saveRemoteDownloads,
  getFreeDiskSpace,
  checkRateLimit,
  cachedDrives,
  getMountedDrives
};



