const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const multer = require('multer');

// Load environment variables from agent/.env if available
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'Syro@43210'; // Security Password

app.use(cors());
app.use(express.json());

// Auth Middleware to protect API endpoints
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || req.query.token;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Security token required' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  if (token !== AUTH_PASSWORD) {
    return res.status(403).json({ error: 'Forbidden: Invalid security password' });
  }

  next();
}

// Helper function to scan mounted drives dynamically on Linux/Unix
function getMountedDrives() {
  const drives = [];
  const searchDirs = ['/mnt', '/media', '/run/media'];

  try {
    let driveIndex = 1;
    for (const baseDir of searchDirs) {
      if (fs.existsSync(baseDir)) {
        const subDirs = fs.readdirSync(baseDir);
        for (const sub of subDirs) {
          const fullPath = path.join(baseDir, sub);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              let totalGB = 500;
              let freeGB = 250;
              let usedGB = 250;

              try {
                const dfOutput = execSync(`df -B1G "${fullPath}" | tail -n 1`, { encoding: 'utf8' }).trim().split(/\s+/);
                if (dfOutput.length >= 4) {
                  totalGB = parseInt(dfOutput[1]) || 500;
                  usedGB = parseInt(dfOutput[2]) || 250;
                  freeGB = parseInt(dfOutput[3]) || 250;
                }
              } catch (e) {}

              drives.push({
                id: `drive-${driveIndex++}`,
                name: sub.replace(/_/g, ' ').toUpperCase(),
                mount: fullPath,
                totalGB,
                usedGB,
                freeGB,
                type: sub.toLowerCase().includes('ssd') ? 'SSD' : 'HDD'
              });
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.error('Error scanning drives:', err);
  }

  if (drives.length === 0) {
    drives.push(
      { id: 'drive-1', name: 'Primary Storage (HDD)', mount: '/mnt/storage1', totalGB: 2000, usedGB: 850, freeGB: 1150, type: 'HDD' },
      { id: 'drive-2', name: 'Fast Storage (SSD)', mount: '/mnt/storage2', totalGB: 512, usedGB: 120, freeGB: 392, type: 'SSD' }
    );
  }

  return drives;
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const drives = getMountedDrives();
    const targetDrive = drives.find(d => d.id === req.body.driveId) || drives[0];
    const targetDir = path.join(targetDrive.mount, req.body.path || '');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// Protected API Routes
app.get('/api/drives', authMiddleware, (req, res) => {
  const drives = getMountedDrives();
  res.json({
    status: 'online',
    domain: 'hcdavecloud.in',
    drivesCount: drives.length,
    drives
  });
});

app.get('/api/files', authMiddleware, (req, res) => {
  const drives = getMountedDrives();
  const driveId = req.query.driveId;
  const targetDrive = drives.find(d => d.id === driveId) || drives[0];
  const reqPath = req.query.path || '/';
  const targetDir = path.join(targetDrive.mount, path.normalize(reqPath));

  if (!fs.existsSync(targetDir)) {
    return res.json([]);
  }

  try {
    const items = fs.readdirSync(targetDir);
    const result = items.map((itemName, index) => {
      const fullPath = path.join(targetDir, itemName);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        return null;
      }
      
      const isDir = stat.isDirectory();
      const ext = path.extname(itemName).toLowerCase();
      let type = isDir ? 'folder' : 'document';
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) type = 'image';
      if (['.mp4', '.mkv', '.avi', '.mov'].includes(ext)) type = 'video';
      if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) type = 'archive';

      return {
        id: `${index}-${itemName}`,
        name: itemName,
        type,
        size: isDir ? 'Folder' : `${(stat.size / (1024 * 1024)).toFixed(1)} MB`,
        modified: stat.mtime.toISOString().split('T')[0],
        url: `/api/download?driveId=${targetDrive.id}&path=${encodeURIComponent(path.join(reqPath, itemName))}&token=${AUTH_PASSWORD}`
      };
    }).filter(Boolean);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download', authMiddleware, (req, res) => {
  const drives = getMountedDrives();
  const targetDrive = drives.find(d => d.id === req.query.driveId) || drives[0];
  const filePath = path.join(targetDrive.mount, path.normalize(req.query.path || ''));

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  res.json({ success: true, message: 'File uploaded successfully', file: req.file });
});

app.listen(PORT, () => {
  console.log(`🔒 Secure Home Storage Agent running on port ${PORT}`);
  console.log(`🌐 Domain: hcdavecloud.in`);
});
