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
  origin: [ALLOWED_ORIGIN, 'https://drive.hcdavecloud.in', 'http://localhost:3000', 'http://localhost:3002', 'http://localhost:5173'],
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

        // Must be a real mount point — different device ID from its parent directory
        const parentStat = fs.statSync(base);
        if (stat.dev === parentStat.dev) continue;

        // Skip the OS/internal drive — any filesystem that shares the same
        // device as root ('/') is the system disk (e.g. Dell Wyse 8 GB eMMC)
        const rootStat = fs.statSync('/');
        if (stat.dev === rootStat.dev) continue;

        let totalGB = 0, usedGB = 0, freeGB = 0, sourceDev = '';
        try {
          // 2 s timeout — stale/removed drives hang df indefinitely
          const { stdout } = await execAsync(`df -B1G "${fullPath}" --output=size,used,avail,source 2>/dev/null | tail -n 1`, { timeout: 2000 });
          const df = stdout.trim().split(/\s+/);
          totalGB = parseInt(df[0]) || 0;
          usedGB  = parseInt(df[1]) || 0;
          freeGB  = parseInt(df[2]) || 0;
          sourceDev = df[3] || '';
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

        drives.push({
          id:      `drive-${encodeURIComponent(sub)}`,
          name:    sub.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          mount:   fullPath,
          type:    isSSD ? 'SSD' : 'HDD',
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
  const publicToken = crypto.createHash('md5').update(AUTH_PASSWORD).digest('hex');
  res.json({ status: 'online', domain: 'hcdavecloud.in', drivesCount: drives.length, drives, publicToken });
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

// POST /api/delete
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

// POST /api/share
app.post('/api/share', rateLimitAuth, auth, (req, res) => {
  const { driveId, filePath, filePaths, burnAfterReading } = req.body;
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
    const repoDir = '/home/root1/hcdave-cloud';
    let pullOutput = '';
    let pullError = '';

    // Step 1: Fix git ownership + run git pull
    // The service runs as root but the repo may have been cloned as another user
    // (root1), which causes 'cannot open .git/FETCH_HEAD: Permission denied'.
    // Fix: take ownership of the repo dir, mark it safe, then pull.
    try {
      execSync(`chown -R root:root "${repoDir}"`, { stdio: 'ignore' });
      execSync('git config --global --add safe.directory "*"', { stdio: 'ignore' });
      pullOutput = execSync('git reset --hard HEAD && git pull --rebase=false', { cwd: repoDir, encoding: 'utf8' }).trim();
      console.log('📥 Git pull output:', pullOutput);
    } catch (e) {
      pullError = e.stderr?.toString() || e.message;
      console.error('❌ Git pull failed:', pullError);
      return res.status(500).json({ success: false, error: 'Git pull failed', detail: pullError });
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
      console.log('📂 Agent files copied (protected .env and shares.json)');
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

// Cache config — CACHE_MOUNT comes from .env; defaults to /mnt/hcdave-cache
const CACHE_MOUNT   = (process.env.CACHE_MOUNT || '/mnt/hcdave-cache').replace(/\/$/, '');
const CACHE_DIR     = path.join(CACHE_MOUNT, 'hcdave-video-cache');
const CACHE_INDEX   = path.join(CACHE_DIR, 'cache-index.json');
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
    if (fs.existsSync(CACHE_INDEX)) return JSON.parse(fs.readFileSync(CACHE_INDEX, 'utf8'));
  } catch (_) {}
  return {};
}

function writeCacheIndex(index) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_INDEX, JSON.stringify(index, null, 2));
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
  return path.join(CACHE_DIR, driveId, `${base}-${hash}.mp4`);
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
    const dfOut = execSync(`df -BG "${CACHE_MOUNT}" | tail -1`, { encoding: 'utf8' });
    const parts = dfOut.trim().split(/\s+/);
    if (parts[3]) freeGB = parseInt(parts[3], 10);
  } catch (_) {}

  // Build per-drive cache stats
  const driveStats = {};
  for (const d of drives) {
    driveStats[d.id] = { driveId: d.id, name: d.name, total: 0, cached: 0 };
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

  const cacheMountExists = fs.existsSync(CACHE_MOUNT);
  const warn = freeGB !== null && freeGB < CACHE_WARN_GB;

  return {
    cacheMountExists,
    cacheMount:   CACHE_MOUNT,
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

