const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const { execSync, exec } = require('child_process');
const util     = require('util');
const execAsync = util.promisify(exec);
const crypto   = require('crypto');
const multer   = require('multer');
const os       = require('os');

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
try {
  GIT_HASH = execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: 'pipe' }).toString().trim();
} catch (e) {}

const VERSION       = `1.1.4${GIT_HASH ? '-' + GIT_HASH : ''}`;
const app           = express();
const PORT          = Number(process.env.PORT) || 3001;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'ChangeMe@2024';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://drive.hcdavecloud.in';

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
  origin: [ALLOWED_ORIGIN, 'http://localhost:3000', 'http://localhost:3002', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));

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

  if (token !== AUTH_PASSWORD) {
    recordFailure(req._ip || 'unknown', req._entry || { count: 0, blockUntil: 0 });
    return res.status(403).json({ error: 'Invalid password' });
  }
  // Reset failures on success
  failMap.delete(req._ip);
  next();
}

/* ─────────────────────────────────────────────
   PATH TRAVERSAL GUARD
   ───────────────────────────────────────────── */
function safePath(baseDir, userPath) {
  // Remove leading slashes so path.join doesn't treat it as absolute root
  const cleanPath = (userPath || '/').replace(/^(\/|\\)+/, '').replace(/(\.\.\/|\.\.\\)/g, '');
  const resolved = path.normalize(path.join(baseDir, cleanPath));
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
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

        let totalGB = 0, usedGB = 0, freeGB = 0;
        try {
          const { stdout } = await execAsync(`df -B1G "${fullPath}" --output=size,used,avail 2>/dev/null | tail -n 1`, { timeout: 3000 });
          const df = stdout.trim().split(/\s+/);
          totalGB = parseInt(df[0]) || 0;
          usedGB  = parseInt(df[1]) || 0;
          freeGB  = parseInt(df[2]) || 0;
        } catch (_) {}

        if (totalGB === 0) continue; // skip empty/unresolved mounts

        drives.push({
          id:      `drive-${encodeURIComponent(sub)}`,
          name:    sub.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          mount:   fullPath,
          type:    sub.toLowerCase().includes('ssd') || sub.toLowerCase().includes('nvme') ? 'SSD' : 'HDD',
          totalGB,
          usedGB,
          freeGB,
          percent: totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 0,
        });
      } catch (_) {}
    }
  }

  cachedDrives = drives;
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
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: multerStorage, limits: { fileSize: 50 * 1024 * 1024 * 1024 } }); // 50 GB max

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
  let lastUpdated = 'Unknown';
  try {
    lastUpdated = execSync('git log -1 --format="%cd" --date=short', { cwd: '/home/root1/hcdave-cloud', encoding: 'utf8' }).trim();
  } catch (_) {}

  res.json({ 
    status: 'ok', 
    version: VERSION, 
    localIp: getLocalIp(), 
    lastUpdated,
    stats: { memUsage, uptimeHours, load },
    time: new Date().toISOString() 
  });
});

// GET /api/drives
app.get('/api/drives', rateLimitAuth, auth, (_, res) => {
  const drives = getMountedDrives();
  res.json({ status: 'online', domain: 'hcdavecloud.in', drivesCount: drives.length, drives });
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
          const isDir = dirent.isDirectory();
          const type  = getFileType(name, isDir);
          const relPath = path.join(req.query.path || '/', name);
          
          let size = isDir ? 'Folder' : 'Unknown';
          let modified = '';

          if (!isDir && !skipStat) {
             const full = path.join(targetDir, name);
             const st = await fs.promises.stat(full);
             size = formatSize(st.size);
             modified = st.mtime.toISOString().split('T')[0];
          }

          return {
            id:       `${i + index}-${name}`,
            name,
            type,
            size,
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

// GET /api/download — streaming with Range header support
app.get('/api/download', rateLimitAuth, auth, (req, res) => {
  const drives  = getMountedDrives();
  const driveId = req.query.driveId;
  const drive   = drives.find(d => d.id === driveId) || drives[0];
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  let filePath;
  try { filePath = safePath(drive.mount, req.query.path || ''); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a directory' });

  const fileSize = stat.size;
  const range    = req.headers.range;
  const mime     = getMime(filePath);

  if (range) {
    // Partial content (video streaming)
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : fileSize - 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
    res.writeHead(200, {
      'Content-Length':      fileSize,
      'Content-Type':        mime,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(path.basename(filePath))}"`,
      'Accept-Ranges':       'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// POST /api/upload
app.post('/api/upload', rateLimitAuth, auth, upload.array('file', 50), (req, res) => {
  res.json({ success: true, uploaded: req.files?.length || 0 });
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

// POST /api/share
app.post('/api/share', rateLimitAuth, auth, (req, res) => {
  const { driveId, filePath, burnAfterReading } = req.body;
  if (!driveId || !filePath) return res.status(400).json({ error: 'Missing driveId or filePath' });

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === driveId);
  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  try {
    const fullPath = safePath(drive.mount, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    
    const token = crypto.randomBytes(16).toString('hex');
    const shares = loadShares();
    shares[token] = {
      driveId,
      filePath,
      burnAfterReading: !!burnAfterReading,
      createdAt: new Date().toISOString()
    };
    saveShares(shares);
    
    res.json({ token, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/share/:token
app.put('/api/share/:token', rateLimitAuth, auth, (req, res) => {
  const { burnAfterReading } = req.body;
  const shares = loadShares();
  if (!shares[req.params.token]) return res.status(404).json({ error: 'Share not found' });
  
  shares[req.params.token].burnAfterReading = !!burnAfterReading;
  saveShares(shares);
  res.json({ success: true });
});

// POST /api/update (Update Agent Software via Git)
app.post('/api/update', rateLimitAuth, auth, (req, res) => {
  try {
    // 1. Send success response first so the frontend knows it started
    res.json({ success: true, message: 'Update started. Agent will restart in a few seconds.' });
    
    // 2. Perform the git pull and restart after a small delay
    setTimeout(() => {
      try {
        console.log('🔄 Executing update...');
        const repoDir = '/home/root1/hcdave-cloud';
        execSync('git config --global --add safe.directory "*"', { stdio: 'ignore' });
        execSync('git reset --hard HEAD && git pull', { cwd: repoDir, stdio: 'ignore' });
        execSync('cp -r agent/* /opt/hcdave-agent/', { cwd: repoDir, stdio: 'ignore' });
        
        console.log('🔄 Restarting service...');
        execSync('systemctl restart hcdave-agent', { stdio: 'ignore' });
      } catch (e) {
        console.error('Update failed:', e);
      }
    }, 2000);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
  const range = req.headers.range;
  const mime = getMime(fullPath);

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(fullPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Content-Disposition': req.query.inline ? 'inline' : `attachment; filename="${encodeURIComponent(path.basename(fullPath))}"`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(fullPath).pipe(res);
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

  const drives = getMountedDrives();
  const drive = drives.find(d => d.id === share.driveId);
  if (!drive) return res.status(404).json({ error: 'Drive offline' });

  try {
    const fullPath = safePath(drive.mount, share.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File no longer exists' });
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
   START
   ───────────────────────────────────────────── */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔒 HC Dave Cloud — Storage Agent`);
  console.log(`   Port:    ${PORT}`);
  console.log(`   Domain:  hcdavecloud.in`);
  console.log(`   CORS:    ${ALLOWED_ORIGIN}`);
  console.log(`   Drives:  scanning /mnt /media /run/media\n`);
});
