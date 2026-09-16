const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
const { execSync } = require('child_process');
const multer   = require('multer');

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
  origin: [ALLOWED_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));

/* ─────────────────────────────────────────────
   AUTH MIDDLEWARE
   ───────────────────────────────────────────── */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = header.slice(7);
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
  const normalized = path.normalize(userPath || '/').replace(/^(\.\.\/|\/\/)+/, '');
  const resolved = path.resolve(baseDir, normalized);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}

/* ─────────────────────────────────────────────
   DYNAMIC DRIVE DISCOVERY
   ───────────────────────────────────────────── */
function getMountedDrives() {
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

  let idx = 1;
  for (const base of searchDirs) {
    if (!fs.existsSync(base)) continue;
    let subs;
    try { subs = fs.readdirSync(base); } catch (_) { continue; }

    for (const sub of subs) {
      const fullPath = path.join(base, sub);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) continue;

        let totalGB = 0, usedGB = 0, freeGB = 0;
        try {
          const df = execSync(`df -B1G "${fullPath}" --output=size,used,avail 2>/dev/null | tail -n 1`, { encoding: 'utf8', timeout: 3000 }).trim().split(/\s+/);
          totalGB = parseInt(df[0]) || 0;
          usedGB  = parseInt(df[1]) || 0;
          freeGB  = parseInt(df[2]) || 0;
        } catch (_) {}

        if (totalGB === 0) continue; // skip empty/unresolved mounts

        drives.push({
          id:      `drive-${idx++}`,
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

  return drives;
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
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// GET /api/drives
app.get('/api/drives', rateLimitAuth, auth, (_, res) => {
  const drives = getMountedDrives();
  res.json({ status: 'online', domain: 'hcdavecloud.in', drivesCount: drives.length, drives });
});

// GET /api/files
app.get('/api/files', rateLimitAuth, auth, (req, res) => {
  const drives     = getMountedDrives();
  const driveId    = req.query.driveId;
  const drive      = drives.find(d => d.id === driveId) || drives[0];

  if (!drive) return res.status(404).json({ error: 'Drive not found' });

  let targetDir;
  try { targetDir = safePath(drive.mount, req.query.path || '/'); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  if (!fs.existsSync(targetDir)) return res.json([]);

  try {
    const items = fs.readdirSync(targetDir);
    const result = items
      .map((name, i) => {
        try {
          const full = path.join(targetDir, name);
          const st   = fs.statSync(full);
          const isDir = st.isDirectory();
          const type  = getFileType(name, isDir);
          const relPath = path.join(req.query.path || '/', name);

          return {
            id:       `${i}-${name}`,
            name,
            type,
            size:     isDir ? 'Folder' : formatSize(st.size),
            modified: st.mtime.toISOString().split('T')[0],
            path:     relPath,
            // streamUrl included for media – auth via header required
            streamUrl: (type === 'image' || type === 'video')
              ? null // client fetches with auth header
              : null,
          };
        } catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => {
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
    const end   = endStr ? parseInt(endStr, 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length':      fileSize,
      'Content-Type':        mime,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`,
      'Accept-Ranges':       'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// POST /api/upload
app.post('/api/upload', rateLimitAuth, auth, upload.array('file', 50), (req, res) => {
  res.json({ success: true, uploaded: req.files?.length || 0 });
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
