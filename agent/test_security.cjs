#!/usr/bin/env node
/**
 * Comprehensive Automated Security & Integration Test Suite
 * Hardened Features:
 * 1. QuickDrop Hostile Filename Protection & Directory Containment
 * 2. Downloader Content-Disposition Response-Filename Protection
 * 3. DNS Rebinding & Comprehensive SSRF Protection (IPv4/IPv6 CIDR + IP Pinning + Redirects)
 * 4. QuickDrop Storage Abuse Protection (IP Rate Limiting, Session Quotas, Free Space)
 * 5. Real Lifecycle Transfers (Normal, Resumed Download, Expired Links, Hostile Inputs)
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  app,
  safePath,
  verifySafeContainment,
  sanitizeFilename,
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
  cachedDrives
} = require('./server.js');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passedTests++;
        console.log(`  ✅ PASS: ${name}`);
      }).catch(err => {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        process.exitCode = 1;
      });
    } else {
      passedTests++;
      console.log(`  ✅ PASS: ${name}`);
    }
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Helper to make local HTTP requests
function httpRequest({ port, path: reqPath, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(resData); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: resData,
          json
        });
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

// Multipart body builder
function buildMultipartBody(fields = {}, files = []) {
  const boundary = '----SecurityTestBoundary' + crypto.randomBytes(8).toString('hex');
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
    ));
  }

  for (const file of files) {
    const filename = file.filename;
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || '');
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname || 'files'}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ));
    chunks.push(content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const fullBody = Buffer.concat(chunks);
  return {
    boundary,
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: fullBody,
    contentLength: fullBody.length
  };
}

async function main() {
  console.log('\n🔒 Starting HC Dave Cloud Security & Integration Test Suite...\n');

  // Create isolated scratch directories
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hcdave-sec-test-'));
  const testDriveDir = path.join(testRoot, 'drive_main');
  const targetFolder = path.join(testDriveDir, 'Uploads');
  fs.mkdirSync(targetFolder, { recursive: true });

  cachedDrives.push({ id: 'test_drive_id', name: 'TestDrive', mount: testDriveDir });
  cachedDrives.push({ id: 'mock_main_drive', name: 'MainTestDrive', mount: testDriveDir });

  // Start express server on dynamic ephemeral port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const serverPort = server.address().port;
  console.log(`Test App Server listening on 127.0.0.1:${serverPort}\n`);

  try {
    // ═══════════════════════════════════════════════════════════════════
    // SECTION 1: QUICKDROP HOSTILE FILENAME PROTECTION & CONTAINMENT
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SECTION 1: QuickDrop Hostile Filename Protection & Directory Containment ---');

    runTest('Sanitizes ../../../etc/passwd to safe basename within directory', () => {
      const sanitized = sanitizeFilename('../../../etc/passwd', 'upload');
      assert.strictEqual(sanitized, 'passwd');
      const contained = verifySafeContainment(targetFolder, sanitized);
      assert.strictEqual(contained, path.join(targetFolder, 'passwd'));
    });

    runTest('Sanitizes ..\\\\..\\\\windows\\\\system32\\\\calc.exe to safe basename', () => {
      const sanitized = sanitizeFilename('..\\..\\windows\\system32\\calc.exe', 'upload');
      assert.strictEqual(sanitized, 'calc.exe');
      const contained = verifySafeContainment(targetFolder, sanitized);
      assert.strictEqual(contained, path.join(targetFolder, 'calc.exe'));
    });

    runTest('Sanitizes null bytes and control characters', () => {
      const sanitized = sanitizeFilename('malicious\x00\x07\x1b.php', 'upload');
      assert.strictEqual(sanitized, 'malicious.php');
      const contained = verifySafeContainment(targetFolder, sanitized);
      assert.strictEqual(contained, path.join(targetFolder, 'malicious.php'));
    });

    runTest('Sanitizes absolute POSIX path /var/log/messages', () => {
      const sanitized = sanitizeFilename('/var/log/messages', 'upload');
      assert.strictEqual(sanitized, 'messages');
      const contained = verifySafeContainment(targetFolder, sanitized);
      assert.strictEqual(contained, path.join(targetFolder, 'messages'));
    });

    runTest('Sanitizes absolute Windows path C:\\boot.ini', () => {
      const sanitized = sanitizeFilename('C:\\boot.ini', 'upload');
      assert.strictEqual(sanitized, 'boot.ini');
      const contained = verifySafeContainment(targetFolder, sanitized);
      assert.strictEqual(contained, path.join(targetFolder, 'boot.ini'));
    });

    runTest('Sanitizes all-traversal strings ../../../ and .. to fallback', () => {
      assert.strictEqual(sanitizeFilename('../../../', 'fallback_drop'), 'fallback_drop');
      assert.strictEqual(sanitizeFilename('..', 'fallback_drop'), 'fallback_drop');
      assert.strictEqual(sanitizeFilename('.', 'fallback_drop'), 'fallback_drop');
      assert.strictEqual(sanitizeFilename('', 'fallback_drop'), 'fallback_drop');
    });

    runTest('verifySafeContainment blocks any path escaping base directory', () => {
      assert.throws(() => {
        verifySafeContainment(targetFolder, '../evil.txt');
      }, /Path traversal attempt blocked/);

      assert.throws(() => {
        verifySafeContainment(targetFolder, '/etc/passwd');
      }, /Path traversal attempt blocked/);

      assert.throws(() => {
        verifySafeContainment(targetFolder, '');
      }, /Path traversal attempt blocked/);
    });

    runTest('safePath blocks directory escape attempts', () => {
      assert.throws(() => {
        safePath(testDriveDir, '../../etc');
      }, /Path traversal attempt blocked/);
    });

    runTest('safePath strips null bytes and control chars preventing poisoning', () => {
      const sanitized = safePath(testDriveDir, 'folder/\x00sub/file.txt');
      assert.strictEqual(sanitized, path.join(testDriveDir, 'folder/sub/file.txt'));
      assert.strictEqual(sanitized.includes('\x00'), false);
    });

    runTest('Sanitizes multi-byte UTF-8 filenames to max 255 bytes avoiding ENAMETOOLONG', () => {
      const longEmojiName = '🔥'.repeat(70) + '.txt'; // 280 bytes UTF-8
      const sanitized = sanitizeFilename(longEmojiName, 'upload');
      assert.ok(Buffer.byteLength(sanitized, 'utf8') <= 255, 'Filename bytes must be <= 255');
      assert.ok(sanitized.endsWith('.txt'), 'File extension must be preserved');
      // Verify filesystem write succeeds without throwing ENAMETOOLONG
      const testFilePath = path.join(targetFolder, sanitized);
      fs.writeFileSync(testFilePath, 'valid_utf8_payload');
      assert.strictEqual(fs.existsSync(testFilePath), true);
      fs.unlinkSync(testFilePath);
    });

    runTest('Sanitizes Windows reserved device names (CON, AUX, NUL, COM1)', () => {
      assert.strictEqual(sanitizeFilename('CON.txt', 'upload'), '_CON.txt');
      assert.strictEqual(sanitizeFilename('aux.png', 'upload'), '_aux.png');
      assert.strictEqual(sanitizeFilename('NUL', 'upload'), '_NUL');
      assert.strictEqual(sanitizeFilename('com1.dat', 'upload'), '_com1.dat');
    });

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 2: DOWNLOADER CONTENT-DISPOSITION RESPONSE-FILENAME PROTECTION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n--- SECTION 2: Downloader Content-Disposition Protection ---');

    // Create a mock download server that serves hostile Content-Disposition headers
    let mockCdHeader = '';
    const mockFileServer = http.createServer((req, res) => {
      if (req.url === '/download-test') {
        const payload = Buffer.from('TEST_DOWNLOAD_CONTENT_12345');
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': payload.length,
          'Content-Disposition': mockCdHeader,
          'Accept-Ranges': 'bytes'
        });
        res.end(payload);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise(res => mockFileServer.listen(0, '127.0.0.1', res));
    const mockPort = mockFileServer.address().port;

    await runTest('Downloader neutralizes hostile Content-Disposition ../../../etc/cron.d/hack', async () => {
      mockCdHeader = 'attachment; filename="../../../etc/cron.d/hack"';
      const dlDest = path.join(testRoot, 'dl_dest');
      fs.mkdirSync(dlDest, { recursive: true });

      const task = {
        id: 'test_dl_hostile_1',
        url: `http://127.0.0.1:${mockPort}/download-test`,
        pinnedIp: '127.0.0.1',
        pinnedFamily: 4,
        filename: 'download',
        destDir: dlDest,
        targetFile: path.join(dlDest, 'download'),
        partFile: path.join(dlDest, 'download.part'),
        status: 'pending',
        downloadedBytes: 0,
        totalBytes: 0
      };

      await startDownloadTask(task);

      // Wait for download to finish
      await new Promise(r => setTimeout(r, 600));

      assert.strictEqual(task.status, 'completed');
      // The filename must be sanitized to safe basename 'hack'
      assert.strictEqual(task.filename, 'hack');
      // Must reside strictly inside dlDest
      assert.strictEqual(path.resolve(task.targetFile), path.resolve(dlDest, 'hack'));
      assert.strictEqual(fs.existsSync(task.targetFile), true);
      // Verify nothing written outside dlDest
      assert.strictEqual(fs.existsSync(path.join(dlDest, '..', 'etc')), false);
      assert.strictEqual(fs.existsSync(path.join(dlDest, '..', 'hack')), false);
    });

    await runTest('Downloader neutralizes hostile Windows Content-Disposition ..\\..\\calc.exe', async () => {
      mockCdHeader = 'attachment; filename="..\\..\\calc.exe"';
      const dlDest = path.join(testRoot, 'dl_dest_win');
      fs.mkdirSync(dlDest, { recursive: true });

      const task = {
        id: 'test_dl_hostile_2',
        url: `http://127.0.0.1:${mockPort}/download-test`,
        pinnedIp: '127.0.0.1',
        pinnedFamily: 4,
        filename: 'download',
        destDir: dlDest,
        targetFile: path.join(dlDest, 'download'),
        partFile: path.join(dlDest, 'download.part'),
        status: 'pending',
        downloadedBytes: 0,
        totalBytes: 0
      };

      await startDownloadTask(task);
      await new Promise(r => setTimeout(r, 600));

      assert.strictEqual(task.status, 'completed');
      assert.strictEqual(task.filename, 'calc.exe');
      assert.strictEqual(path.resolve(task.targetFile), path.resolve(dlDest, 'calc.exe'));
      assert.strictEqual(fs.existsSync(task.targetFile), true);
    });

    runTest('parseContentDispositionFilename adheres to RFC 6266 & RFC 5987 priorities and encodings', () => {
      // 1. Both filename and filename* present: filename* must take precedence
      const h1 = 'attachment; filename="legacy.txt"; filename*=UTF-8\'\'%E2%82%AC%20rates.pdf';
      assert.strictEqual(parseContentDispositionFilename(h1), '€ rates.pdf');

      // 2. filename* with language tag
      const h2 = 'attachment; filename*=UTF-8\'en\'%E2%82%AC%20rates.pdf';
      assert.strictEqual(parseContentDispositionFilename(h2), '€ rates.pdf');

      // 3. Quoted filename containing semicolon
      const h3 = 'attachment; filename="report; 2024.pdf"';
      assert.strictEqual(parseContentDispositionFilename(h3), 'report; 2024.pdf');

      // 4. Quoted filename with escaped quotes
      const h4 = 'attachment; filename="my \\"document\\".pdf"';
      assert.strictEqual(parseContentDispositionFilename(h4), 'my "document".pdf');

      // 5. Hostile traversal in Content-Disposition
      const h5 = 'attachment; filename="../../../etc/passwd"';
      assert.strictEqual(parseContentDispositionFilename(h5), '../../../etc/passwd');
      assert.strictEqual(sanitizeFilename(parseContentDispositionFilename(h5)), 'passwd');
    });

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 3: STRENGTHEN SSRF PROTECTION & IP PINNING
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n--- SECTION 3: Comprehensive SSRF Protection & IP Pinning ---');

    const blockedIpv4List = [
      '0.0.0.0', '0.255.255.255',
      '10.0.0.1', '10.254.1.1',
      '100.64.0.1', '100.127.255.255',
      '127.0.0.1', '127.255.255.255',
      '169.254.0.1', '169.254.169.254',
      '172.16.0.1', '172.31.255.255',
      '192.0.0.1', '192.0.2.1',
      '192.88.99.1', '192.168.1.1',
      '198.18.0.1', '198.19.255.255',
      '198.51.100.1', '203.0.113.1',
      '224.0.0.1', '239.255.255.255',
      '240.0.0.1', '255.255.255.255'
    ];

    for (const ip of blockedIpv4List) {
      runTest(`Blocks IPv4 reserved/private range: ${ip}`, () => {
        assert.strictEqual(isPrivateOrReservedIp(ip), true);
      });
    }

    const blockedIpv6List = [
      '::', '::1',
      '::127.0.0.1', '::169.254.169.254', '::10.0.0.1', '::0.0.0.0', // IPv4-compatible IPv6 (RFC 4291)
      '::ffff:127.0.0.1', '::ffff:192.168.1.1',
      '64:ff9b::1', '100::1',
      '2001:db8::1', '2002:c0a8:101::',
      'fc00::1', 'fd12:3456::1',
      'fe80::1', 'ff02::1'
    ];

    for (const ip of blockedIpv6List) {
      runTest(`Blocks IPv6 reserved/private range: ${ip}`, () => {
        assert.strictEqual(isPrivateOrReservedIp(ip), true);
      });
    }

    const allowedPublicIps = [
      '8.8.8.8',
      '1.1.1.1',
      '93.184.216.34',
      '142.250.190.46',
      '2607:f8b0:4005:805::200e'
    ];

    for (const ip of allowedPublicIps) {
      runTest(`Allows public IP: ${ip}`, () => {
        assert.strictEqual(isPrivateOrReservedIp(ip), false);
      });
    }

    await runTest('validateUrlForSsrf blocks private IP literal directly in URL', async () => {
      await assert.rejects(
        () => validateUrlForSsrf('http://127.0.0.1/admin'),
        /Access to private\/internal IP address/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://169.254.169.254/latest/meta-data'),
        /Access to private\/internal IP address/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://10.0.0.5:8080/'),
        /Access to private\/internal IP address/
      );
      // Bracketed IPv6 private literals
      await assert.rejects(
        () => validateUrlForSsrf('http://[::1]/admin'),
        /Access to private\/internal IP address/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://[::127.0.0.1]/latest/meta-data'),
        /Access to private\/internal IP address/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://[::169.254.169.254]/'),
        /Access to private\/internal IP address/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://[fc00::1]/service'),
        /Access to private\/internal IP address/
      );
    });

    await runTest('validateUrlForSsrf correctly permits and pins public IP literals without DNS lookup failures', async () => {
      // Public IPv4 literal
      const v4 = await validateUrlForSsrf('http://8.8.8.8/file.iso');
      assert.strictEqual(v4.pinnedIp, '8.8.8.8');
      assert.strictEqual(v4.pinnedFamily, 4);

      // Public IPv6 bracketed literal
      const v6 = await validateUrlForSsrf('http://[2607:f8b0:4005:805::200e]/file.iso');
      assert.strictEqual(v6.pinnedIp, '2607:f8b0:4005:805::200e');
      assert.strictEqual(v6.pinnedFamily, 6);
    });

    await runTest('validateUrlForSsrf blocks localhost and internal hostnames', async () => {
      await assert.rejects(
        () => validateUrlForSsrf('http://localhost:3000/'),
        /blocked for security/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://my-service.local/'),
        /blocked for security/
      );
      await assert.rejects(
        () => validateUrlForSsrf('http://database.internal/'),
        /blocked for security/
      );
    });

    await runTest('validateUrlForSsrf returns validated URL and pinned IP for public domain', async () => {
      const res = await validateUrlForSsrf('https://cloudflare.com/');
      assert.ok(res.pinnedIp, 'Should have pinned IP');
      assert.ok(res.pinnedFamily === 4 || res.pinnedFamily === 6, 'Should have IP family');
      assert.strictEqual(isPrivateOrReservedIp(res.pinnedIp), false);
    });

    // Test DNS Rebinding prevention & Redirect SSRF blocking
    let redirectCount = 0;
    const redirectServer = http.createServer((req, res) => {
      if (req.url === '/start-redirect') {
        // Malicious redirect to internal AWS/GCP metadata service
        res.writeHead(302, { 'Location': 'http://169.254.169.254/latest/meta-data' });
        res.end();
      } else if (req.url === '/infinite-loop') {
        redirectCount++;
        res.writeHead(302, { 'Location': `http://127.0.0.1:${redirectServer.address().port}/infinite-loop` });
        res.end();
      }
    });

    await new Promise(res => redirectServer.listen(0, '127.0.0.1', res));
    const redirPort = redirectServer.address().port;

    await runTest('Redirects to internal/private targets are blocked by SSRF validator', async () => {
      const dlDest = path.join(testRoot, 'dl_redir');
      fs.mkdirSync(dlDest, { recursive: true });

      const task = {
        id: 'test_dl_redir_ssrf',
        url: `http://127.0.0.1:${redirPort}/start-redirect`,
        pinnedIp: '127.0.0.1',
        pinnedFamily: 4,
        filename: 'download',
        destDir: dlDest,
        targetFile: path.join(dlDest, 'download'),
        partFile: path.join(dlDest, 'download.part'),
        status: 'pending',
        downloadedBytes: 0,
        totalBytes: 0
      };

      await startDownloadTask(task);
      await new Promise(r => setTimeout(r, 600));

      assert.strictEqual(task.status, 'failed');
      assert.ok(task.error.includes('Redirect blocked'), 'Error should indicate redirect blocked');
      assert.ok(task.error.includes('169.254.169.254'), 'Error should reference blocked IP');
    });

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 4: QUICKDROP UPLOAD ABUSE PROTECTION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n--- SECTION 4: QuickDrop Upload Abuse Protection ---');

    runTest('Rate limiter enforces max requests within sliding window', () => {
      const testMap = new Map();
      const ip = '192.0.2.42';
      for (let i = 0; i < 30; i++) {
        const allowed = checkRateLimit(testMap, ip, 30, 60000);
        assert.strictEqual(allowed, true, `Request ${i} should be allowed`);
      }
      const blocked = checkRateLimit(testMap, ip, 30, 60000);
      assert.strictEqual(blocked, false, '31st request should be rate limited');
    });

    runTest('getFreeDiskSpace returns valid numeric byte count', () => {
      const free = getFreeDiskSpace(testRoot);
      assert.strictEqual(typeof free, 'number');
      assert.ok(free > 0, 'Free disk space should be greater than 0');
    });

    // Setup an active mock QuickDrop session directly in quickDropSessions
    const testToken = 'sec_test_token_' + crypto.randomBytes(8).toString('hex');
    const sessionDir = path.join(testRoot, 'qd_session_files');
    fs.mkdirSync(sessionDir, { recursive: true });

    quickDropSessions.set(testToken, {
      token: testToken,
      driveId: 'test_drive_id',
      driveName: 'TestDrive',
      folder: '/qd_session_files',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      maxFiles: 5,
      maxFileBytes: 5000, // 5 KB per-file limit
      maxTotalBytes: 10000, // 10 KB aggregate limit
      uploadedCount: 0,
      uploadedBytes: 0,
      uploadedFiles: []
    });

    await runTest('QuickDrop public lookup returns quota and limit metadata', async () => {
      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${testToken}`
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.valid, true);
      assert.strictEqual(res.json.maxFiles, 5);
      assert.strictEqual(res.json.maxFileBytes, 5000);
      assert.strictEqual(res.json.maxTotalBytes, 10000);
    });

    await runTest('QuickDrop blocks file exceeding maxFileBytes (413)', async () => {
      const oversizedContent = Buffer.alloc(7000, 'A'); // 7 KB > 5 KB limit
      const multipart = buildMultipartBody({}, [
        { fieldname: 'files', filename: 'too_large.dat', content: oversizedContent }
      ]);

      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${testToken}/upload`,
        method: 'POST',
        headers: {
          'Content-Type': multipart.contentType,
          'Content-Length': multipart.contentLength
        },
        body: multipart.body
      });

      assert.strictEqual(res.statusCode, 413);
      assert.ok(res.json.error.includes('maximum allowed size'));
    });

    await runTest('QuickDrop blocks upload when Content-Length exceeds remaining session quota (413)', async () => {
      // 12 KB payload exceeds remaining quota (10 KB)
      const oversizedPayload = Buffer.alloc(12000, 'B');
      const multipart = buildMultipartBody({}, [
        { fieldname: 'files', filename: 'exceeds_quota.dat', content: oversizedPayload }
      ]);

      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${testToken}/upload`,
        method: 'POST',
        headers: {
          'Content-Type': multipart.contentType,
          'Content-Length': multipart.contentLength
        },
        body: multipart.body
      });

      assert.strictEqual(res.statusCode, 413);
      assert.ok(res.json.error.includes('exceeds remaining session quota'));
    });

    await runTest('In-flight bytes reservation prevents concurrent uploads from exceeding quota', async () => {
      const concurToken = 'concur_' + crypto.randomBytes(8).toString('hex');
      quickDropSessions.set(concurToken, {
        token: concurToken,
        driveId: 'test_drive_id',
        driveName: 'TestDrive',
        folder: '/qd_session_files',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
        maxFiles: 5,
        maxFileBytes: 10000,
        maxTotalBytes: 6000, // 6 KB total quota
        inFlightBytes: 4500, // 4.5 KB currently in-flight
        uploadedCount: 0,
        uploadedBytes: 0,
        uploadedFiles: []
      });

      // An incoming 2.5 KB upload would exceed remaining quota (6000 - 4500 = 1500 remaining)
      const payload = Buffer.alloc(2500, 'C');
      const multipart = buildMultipartBody({}, [
        { fieldname: 'files', filename: 'concur_file.dat', content: payload }
      ]);

      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${concurToken}/upload`,
        method: 'POST',
        headers: {
          'Content-Type': multipart.contentType,
          'Content-Length': multipart.contentLength
        },
        body: multipart.body
      });

      assert.strictEqual(res.statusCode, 413);
      assert.ok(res.json.error.includes('exceeds remaining session quota'));
    });

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 5: REAL LIFECYCLE TRANSFERS & HOSTILE HTTP INPUTS
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n--- SECTION 5: Real Lifecycle Transfers & Edge Cases ---');

    // Test expired token rejection (410)
    const expiredToken = 'expired_' + crypto.randomBytes(8).toString('hex');
    quickDropSessions.set(expiredToken, {
      token: expiredToken,
      driveId: 'mock_main_drive',
      driveName: 'ExpiredDrive',
      folder: '/',
      createdAt: Date.now() - 100000,
      expiresAt: Date.now() - 1000, // expired 1s ago
      maxFiles: 5,
      uploadedCount: 0,
      uploadedBytes: 0,
      uploadedFiles: []
    });

    await runTest('Expired QuickDrop link returns 410 on lookup', async () => {
      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${expiredToken}`
      });
      assert.strictEqual(res.statusCode, 410);
      assert.ok(res.json.error.includes('expired'));
    });

    await runTest('Expired QuickDrop link returns 410 on upload attempt', async () => {
      const multipart = buildMultipartBody({}, [
        { fieldname: 'files', filename: 'photo.jpg', content: 'JPEG_CONTENT' }
      ]);
      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${expiredToken}/upload`,
        method: 'POST',
        headers: {
          'Content-Type': multipart.contentType,
          'Content-Length': multipart.contentLength
        },
        body: multipart.body
      });
      assert.strictEqual(res.statusCode, 410);
      assert.ok(res.json.error.includes('expired'));
    });

    const liveToken = 'live_token_' + crypto.randomBytes(8).toString('hex');
    const liveUploadDir = path.join(testDriveDir, 'live_uploads');
    fs.mkdirSync(liveUploadDir, { recursive: true });

    quickDropSessions.set(liveToken, {
      token: liveToken,
      driveId: 'mock_main_drive',
      driveName: 'MainTestDrive',
      folder: '/live_uploads',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      maxFiles: 10,
      maxFileBytes: 10 * 1024 * 1024,
      maxTotalBytes: 50 * 1024 * 1024,
      uploadedCount: 0,
      uploadedBytes: 0,
      uploadedFiles: []
    });

    await runTest('Hostile HTTP multipart upload (../../../etc/shadow) is sanitized and safely contained', async () => {
      const hostileContent = Buffer.from('ROOT_PASSWORD_HASH_ATTEMPT');
      const multipart = buildMultipartBody({}, [
        { fieldname: 'files', filename: '../../../etc/shadow', content: hostileContent },
        { fieldname: 'files', filename: '..\\..\\windows\\system32\\hosts', content: 'HOSTS_CONTENT' }
      ]);

      const res = await httpRequest({
        port: serverPort,
        path: `/api/quickdrop/${liveToken}/upload`,
        method: 'POST',
        headers: {
          'Content-Type': multipart.contentType,
          'Content-Length': multipart.contentLength
        },
        body: multipart.body
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.success, true);
      assert.strictEqual(res.json.count, 2);

      // Verify files landed safely inside liveUploadDir
      const shadowPath = path.join(liveUploadDir, 'shadow');
      const hostsPath = path.join(liveUploadDir, 'hosts');
      assert.strictEqual(fs.existsSync(shadowPath), true);
      assert.strictEqual(fs.existsSync(hostsPath), true);
      assert.strictEqual(fs.readFileSync(shadowPath, 'utf8'), 'ROOT_PASSWORD_HASH_ATTEMPT');

      // Verify no files escaped to parent dirs
      assert.strictEqual(fs.existsSync(path.join(testRoot, 'etc')), false);
      assert.strictEqual(fs.existsSync(path.join(testRoot, 'shadow')), false);
      assert.strictEqual(fs.existsSync(path.join(testRoot, 'windows')), false);
    });

    // Resumable download test with HTTP Range headers
    const fullPayload = crypto.randomBytes(100 * 1024); // 100 KB
    const expectedSha256 = crypto.createHash('sha256').update(fullPayload).digest('hex');

    const rangeServer = http.createServer((req, res) => {
      const range = req.headers.range;
      if (range) {
        const m = range.match(/bytes=(\d+)-/);
        if (m) {
          const start = parseInt(m[1], 10);
          const chunk = fullPayload.slice(start);
          res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${fullPayload.length - 1}/${fullPayload.length}`,
            'Content-Length': chunk.length,
            'Accept-Ranges': 'bytes'
          });
          res.end(chunk);
          return;
        }
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fullPayload.length,
        'Accept-Ranges': 'bytes'
      });
      res.end(fullPayload);
    });

    await new Promise(r => rangeServer.listen(0, '127.0.0.1', r));
    const rangePort = rangeServer.address().port;

    await runTest('Interrupted and resumed download completes with SHA-256 integrity verification', async () => {
      const dlDest = path.join(testRoot, 'resumable_dl');
      fs.mkdirSync(dlDest, { recursive: true });

      const targetFile = path.join(dlDest, 'test_resumed.bin');
      const partFile = `${targetFile}.part`;

      // Pre-seed partFile with 40 KB to simulate an interrupted download
      const partialBytes = 40 * 1024;
      fs.writeFileSync(partFile, fullPayload.slice(0, partialBytes));

      const task = {
        id: 'test_resume_task',
        url: `http://127.0.0.1:${rangePort}/file.bin`,
        pinnedIp: '127.0.0.1',
        pinnedFamily: 4,
        filename: 'test_resumed.bin',
        destDir: dlDest,
        targetFile: targetFile,
        partFile: partFile,
        status: 'pending',
        downloadedBytes: partialBytes,
        totalBytes: fullPayload.length,
        expectedHash: expectedSha256
      };

      await startDownloadTask(task);
      await new Promise(r => setTimeout(r, 800));

      assert.strictEqual(task.status, 'completed');
      assert.strictEqual(task.percent, 100);
      assert.strictEqual(task.sha256, expectedSha256);
      assert.strictEqual(task.hashMatched, true);
      assert.strictEqual(fs.existsSync(targetFile), true);
      assert.strictEqual(fs.statSync(targetFile).size, fullPayload.length);
      assert.strictEqual(fs.existsSync(partFile), false, 'Partfile should be cleaned up on completion');
    });

    rangeServer.close();
    mockFileServer.close();
    redirectServer.close();
  } finally {
    server.close();
    // Clean up temporary test files
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\n==================================================`);
  console.log(`🎉 TEST SUMMARY: ${passedTests}/${totalTests} tests passed cleanly.`);
  console.log(`==================================================\n`);

  if (passedTests !== totalTests || process.exitCode === 1) {
    console.error('❌ Some tests failed.');
    process.exit(1);
  } else {
    console.log('✅ ALL SECURITY HARDENING TESTS PASSED WITH 100% SUCCESS.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unhandled fatal error in test suite:', err);
  process.exit(1);
});
