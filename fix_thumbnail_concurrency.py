import re

with open('agent/server.js', 'r') as f:
    code = f.read()

queue_code = """
// --- Thumbnail Concurrency Queue ---
const THUMB_CONCURRENCY = 2;
let activeThumbs = 0;
const thumbQueue = [];

function processNextThumb() {
  if (activeThumbs >= THUMB_CONCURRENCY || thumbQueue.length === 0) return;
  const { req, res, filePath } = thumbQueue.shift();
  activeThumbs++;

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  
  const readStream = fs.createReadStream(filePath);
  const transform = sharp().resize(300, 300, { fit: 'cover' }).jpeg({ quality: 70 });
  
  transform.on('end', () => { activeThumbs--; processNextThumb(); });
  transform.on('error', (e) => { 
    activeThumbs--; 
    processNextThumb();
    if (!res.headersSent) res.status(500).end();
  });
  
  readStream.pipe(transform).pipe(res);
}
"""

# Insert queue code before GET /api/thumbnail
code = code.replace("// GET /api/thumbnail", queue_code + "\n// GET /api/thumbnail")

# Replace thumbnail implementation
old_thumb = """  try {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const readStream = fs.createReadStream(filePath);
    const transform = sharp().resize(300, 300, { fit: 'cover' }).jpeg({ quality: 70 });
    readStream.pipe(transform).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }"""
new_thumb = """  thumbQueue.push({ req, res, filePath });
  processNextThumb();"""
code = code.replace(old_thumb, new_thumb)

# Bump version
code = code.replace("const VERSION       = `1.2.0${GIT_HASH ? '-' + GIT_HASH : ''}`;", "const VERSION       = `1.2.1${GIT_HASH ? '-' + GIT_HASH : ''}`;")

with open('agent/server.js', 'w') as f:
    f.write(code)

print("Done")
