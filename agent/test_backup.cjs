'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BACKUP_CHUNK_BYTES,
  backupVersionKey,
  makeBackupVersion,
  safeChunkPath,
  chunkIsValid,
  versionIsComplete,
  versionCompletedBytes,
  shouldExcludeBackupEntry,
} = require('./server');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hcdave-backup-test-'));

function writeChunk(root, chunk, contents = 'compressed-test-data') {
  const filePath = safeChunkPath(root, chunk);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  chunk.compressedBytes = fs.statSync(filePath).size;
}

try {
  const largeFile = {
    relativePath: 'folder/sample.bin',
    size: BACKUP_CHUNK_BYTES + 3,
    mtimeMs: 1700000000000,
  };
  const version = makeBackupVersion(tempRoot, largeFile, backupVersionKey(largeFile));

  assert.equal(version.chunks.length, 2, 'large file should split into two chunks');
  assert.equal(version.chunks[0].sourceBytes, BACKUP_CHUNK_BYTES);
  assert.equal(version.chunks[1].sourceBytes, 3);
  assert.equal(versionIsComplete(tempRoot, version, largeFile), false, 'missing chunks must never be marked complete');

  writeChunk(tempRoot, version.chunks[0]);
  assert.equal(chunkIsValid(tempRoot, version.chunks[0]), true);
  assert.equal(versionIsComplete(tempRoot, version, largeFile), false, 'one completed chunk is not a complete file');
  assert.equal(versionCompletedBytes(tempRoot, version, largeFile), BACKUP_CHUNK_BYTES);

  writeChunk(tempRoot, version.chunks[1]);
  assert.equal(versionIsComplete(tempRoot, version, largeFile), true, 'all valid chunks should complete the version');
  assert.equal(versionCompletedBytes(tempRoot, version, largeFile), largeFile.size);

  const unsafeChunk = { file: '../outside.gz' };
  assert.throws(() => safeChunkPath(tempRoot, unsafeChunk), /outside its destination/);

  const emptyFile = { relativePath: 'empty.txt', size: 0, mtimeMs: 1700000000001 };
  const emptyVersion = makeBackupVersion(tempRoot, emptyFile, backupVersionKey(emptyFile));
  assert.equal(emptyVersion.chunks.length, 1, 'zero-byte file still needs a completion marker chunk');
  assert.equal(emptyVersion.chunks[0].sourceBytes, 0);
  assert.equal(versionIsComplete(tempRoot, emptyVersion, emptyFile), false);
  writeChunk(tempRoot, emptyVersion.chunks[0]);
  assert.equal(versionIsComplete(tempRoot, emptyVersion, emptyFile), true);

  assert.equal(shouldExcludeBackupEntry('hcdave-backups', true), true, 'backup output must not be backed up recursively');
  assert.equal(shouldExcludeBackupEntry('movie.mp4', false), false, 'normal source files must be included');

  console.log('PASS: backup chunks, progress accounting, zero-byte files, exclusions, and traversal safety');
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(0);
} catch (e) {
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
  console.error(e.stack || e);
  process.exit(1);
}
