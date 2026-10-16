// HC Dave Cloud — Production API Client
// Domain: hcdavecloud.in

export class StorageService {
  static getAgentUrl() {
    return localStorage.getItem('AGENT_URL') || 'https://api.hcdavecloud.in';
  }

  static setAgentUrl(url) {
    localStorage.setItem('AGENT_URL', url.replace(/\/$/, ''));
  }

  static getToken() {
    return localStorage.getItem('HCDAVE_AUTH_TOKEN') || '';
  }

  static setToken(t) {
    localStorage.setItem('HCDAVE_AUTH_TOKEN', t);
  }

  static isLoggedIn() {
    return !!this.getToken();
  }

  static logout() {
    localStorage.removeItem('HCDAVE_AUTH_TOKEN');
  }

  static headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getToken()}`
    };
  }

  static async getHealth() {
    try {
      const r = await fetch(`${this.getAgentUrl()}/health`);
      return await r.json();
    } catch {
      return { status: 'offline', version: 'unknown', localIp: 'Unknown' };
    }
  }

  // GET /api/drives — list all detected plug & play drives
  static async getDrives() {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/drives`, {
        headers: this.headers()
      });
      if (r.status === 401 || r.status === 403) {
        this.logout();
        window.location.reload();
        return [];
      }
      if (!r.ok) throw new Error('Agent offline');
      const data = await r.json();
      if (data.publicToken) {
        localStorage.setItem('HCDAVE_PUBLIC_TOKEN', data.publicToken);
      }
      return data.drives || [];
    } catch {
      return [];
    }
  }

  static async getDriveRoles() {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/drive-roles`, {
        headers: this.headers()
      });
      if (r.ok) return await r.json();
      return {};
    } catch {
      return {};
    }
  }

  static async updateDriveRoles(roles) {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/drive-roles`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(roles)
      });
      if (r.ok) return await r.json();
      return { error: 'Failed' };
    } catch (e) {
      return { error: e.message };
    }
  }

  static async renameDrive(oldName, newName) {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/drives/rename`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ oldMount: oldName, newName })
      });
      const data = await r.json();
      if (r.ok) return data;
      return { error: data.error || 'Failed' };
    } catch (e) {
      return { error: e.message };
    }
  }

  // GET /api/files — list files in a drive path
  static async listFiles(driveId, path = '/') {
    if (!driveId) return [];
    try {
      const r = await fetch(
        `${this.getAgentUrl()}/api/files?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(path)}`,
        { headers: this.headers() }
      );
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      return [];
    }
  }

  // GET /api/search — global multi-drive search with GPS and location filters
  static async searchAllDrives(params = {}) {
    try {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.driveId) query.set('driveId', params.driveId);
      if (params.type && params.type !== 'all') query.set('type', params.type);
      if (params.folder) query.set('folder', params.folder);
      if (params.sort) query.set('sort', params.sort);
      if (params.minSize) query.set('minSize', params.minSize);
      if (params.maxSize) query.set('maxSize', params.maxSize);
      if (params.modifiedAfter) query.set('modifiedAfter', params.modifiedAfter);
      if (params.modifiedBefore) query.set('modifiedBefore', params.modifiedBefore);
      if (params.limit) query.set('limit', params.limit);

      const res = await fetch(`${this.getAgentUrl()}/api/search?${query.toString()}`, {
        headers: this.headers()
      });
      if (res.status === 401 || res.status === 403) {
        this.logout();
        window.location.reload();
        return { results: [], total: 0 };
      }
      if (!res.ok) throw new Error('Search failed');
      return await res.json();
    } catch (e) {
      console.error('searchAllDrives error:', e);
      return { results: [], total: 0, error: e.message };
    }
  }

  // POST /api/check-files — check if files already exist on the drive
  static async checkExistingFiles(driveId, files) {
    if (!driveId || !files || !files.length) return [];
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/check-files`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ driveId, files })
      });
      if (!r.ok) return [];
      const data = await r.json();
      return data.existing || [];
    } catch {
      return [];
    }
  }


  // GET /api/system-health — live detailed server health
  static async getSystemHealth() {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/system-health`, { headers: this.headers() });
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      return null;
    }
  }

  // GET /api/upload-status — check existing chunks for resumable uploads
  static async getUploadStatus(uploadId, driveId, totalChunks) {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/upload-status?uploadId=${encodeURIComponent(uploadId)}&driveId=${encodeURIComponent(driveId)}&totalChunks=${totalChunks}`, {
        headers: this.headers()
      });
      if (r.ok) return await r.json();
    } catch (_) {}
    return { existingChunks: [] };
  }

  // POST /api/upload — upload a file with real progress & resume support
  static uploadFile(driveId, file, uploadPath = '/', onProgress) {
    const CHUNK_SIZE   = 50 * 1024 * 1024; // 50 MB per chunk
    const totalChunks  = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    // Consistent deterministic uploadId for resuming interrupted uploads
    const rawId = `${file.name}-${file.size}-${uploadPath}`;
    let hash = 0;
    for (let c = 0; c < rawId.length; c++) hash = ((hash << 5) - hash) + rawId.charCodeAt(c) | 0;
    const uploadId = 'up-' + Math.abs(hash).toString(36) + '-' + file.size.toString(36);

    return new Promise(async (resolve, reject) => {
      try {
        const status = await this.getUploadStatus(uploadId, driveId, totalChunks);
        const existingChunks = new Set(status.existingChunks || []);

        for (let i = 0; i < totalChunks; i++) {
          if (existingChunks.has(i)) {
            if (onProgress) {
              const loadedBytes = Math.min((i + 1) * CHUNK_SIZE, file.size);
              const overall = Math.round(((i + 1) / totalChunks) * 100);
              onProgress(overall, loadedBytes);
            }
            continue;
          }

          const start  = i * CHUNK_SIZE;
          const end    = Math.min(start + CHUNK_SIZE, file.size);
          const chunk  = file.slice(start, end);

          const form = new FormData();
          form.append('uploadId',    uploadId);
          form.append('driveId',     driveId);
          form.append('path',        uploadPath);
          form.append('filename',    file.name);
          form.append('chunkIndex',  i);
          form.append('totalChunks', totalChunks);
          form.append('chunk',       chunk, file.name);

          await new Promise((res2, rej2) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable && onProgress) {
                const overall = Math.round(((i + e.loaded / e.total) / totalChunks) * 100);
                const loadedBytes = (i * CHUNK_SIZE) + e.loaded;
                onProgress(overall, loadedBytes);
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) res2();
              else rej2(new Error(`Chunk ${i} failed: ${xhr.status}`));
            };
            xhr.onerror  = () => rej2(new Error('Network error on chunk ' + i));
            xhr.open('POST', `${this.getAgentUrl()}/api/upload-chunk`);
            xhr.setRequestHeader('Authorization', `Bearer ${this.getToken()}`);
            xhr.send(form);
          });
        }

        // All chunks sent — tell the server to merge them
        const r = await fetch(`${this.getAgentUrl()}/api/upload-complete`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ uploadId, driveId, path: uploadPath, filename: file.name, totalChunks }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'Upload assembly failed');
        }
        if (onProgress) onProgress(100);
        resolve(await r.json());
      } catch (e) {
        reject(e);
      }
    });
  }

  // POST /api/rename
  static async renameItem(driveId, path, newName) {
    if (!driveId || !path || !newName) throw new Error('Missing parameters');
    const r = await fetch(`${this.getAgentUrl()}/api/rename`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, path, newName })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to rename');
    return data;
  }

  // POST /api/move
  static async moveFiles(driveId, paths, destPath, targetDriveId) {
    if (!driveId || !paths || !paths.length || !destPath) throw new Error('Missing parameters');
    const r = await fetch(`${this.getAgentUrl()}/api/move`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, paths, destPath, targetDriveId: targetDriveId || driveId })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to move');
    return data;
  }

  // POST /api/copy — fast same-drive or cross-drive copy
  static async copyFiles(sourceDriveId, targetDriveId, paths, destPath) {
    if (!sourceDriveId || !paths || !paths.length || !destPath) throw new Error('Missing parameters');
    const r = await fetch(`${this.getAgentUrl()}/api/copy`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ sourceDriveId, targetDriveId: targetDriveId || sourceDriveId, paths, destPath })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to copy');
    return data;
  }

  // POST /api/mkdir
  static async createFolder(driveId, path, folderName) {
    const r = await fetch(`${this.getAgentUrl()}/api/mkdir`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, path, folderName })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to create folder');
    return data;
  }

  // POST /api/delete — delete single or multiple files/folders permanently
  static async deleteFiles(driveId, paths) {
    const pathList = Array.isArray(paths) ? paths : [paths];
    const r = await fetch(`${this.getAgentUrl()}/api/delete`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, paths: pathList })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to delete file(s)');
    return data;
  }

  // ── Recycle Bin (Trash) ──────────────────────────────────────
  static async sendToTrash(driveId, paths) {
    const pathList = Array.isArray(paths) ? paths : [paths];
    const r = await fetch(`${this.getAgentUrl()}/api/trash/send`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, paths: pathList })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to move to recycle bin');
    return data;
  }

  static async listTrash(driveId) {
    if (!driveId) return [];
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/trash?driveId=${encodeURIComponent(driveId)}`, {
        headers: this.headers()
      });
      if (!r.ok) return [];
      return await r.json();
    } catch {
      return [];
    }
  }

  static async restoreTrash(driveId, trashPaths) {
    const r = await fetch(`${this.getAgentUrl()}/api/trash/restore`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, trashPaths: Array.isArray(trashPaths) ? trashPaths : [trashPaths] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to restore file(s)');
    return data;
  }

  static async deleteTrash(driveId, trashPaths) {
    const r = await fetch(`${this.getAgentUrl()}/api/trash/delete`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, trashPaths: Array.isArray(trashPaths) ? trashPaths : [trashPaths] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to permanently delete');
    return data;
  }

  static async emptyTrash(driveId) {
    const r = await fetch(`${this.getAgentUrl()}/api/trash/empty`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to empty recycle bin');
    return data;
  }

  // ── File Version History ────────────────────────────────────
  static async listVersions(driveId, path) {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/versions?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(path)}`, {
        headers: this.headers()
      });
      if (!r.ok) return [];
      return await r.json();
    } catch {
      return [];
    }
  }

  static async restoreVersion(driveId, path, versionId) {
    const r = await fetch(`${this.getAgentUrl()}/api/versions/restore`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, path, versionId })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to restore version');
    return data;
  }

  // ── Secure File Sharing ─────────────────────────────────────
  static async createShareLink(driveId, filePathOrPaths, burnAfterReading, options = {}) {
    const payload = { driveId, burnAfterReading, ...options };
    if (Array.isArray(filePathOrPaths)) {
      payload.filePaths = filePathOrPaths;
    } else {
      payload.filePath = filePathOrPaths;
    }
    const r = await fetch(`${this.getAgentUrl()}/api/share`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to create share link');
    return data;
  }

  static async updateShareLink(token, updates = {}) {
    const r = await fetch(`${this.getAgentUrl()}/api/share/${token}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(updates)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update share link');
    return data;
  }

  static async listShares() {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/shares`, { headers: this.headers() });
      if (!r.ok) return [];
      return await r.json();
    } catch {
      return [];
    }
  }

  static async revokeShare(token) {
    const r = await fetch(`${this.getAgentUrl()}/api/share/${token}`, {
      method: 'DELETE',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to revoke link');
    return data;
  }

  static async verifySharePassword(token, password) {
    const r = await fetch(`${this.getAgentUrl()}/api/s/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Incorrect password');
    return data;
  }

  // ── Backup System ───────────────────────────────────────────
  static async getBackupStatus() {
    const r = await fetch(`${this.getAgentUrl()}/api/backup/status`, { headers: this.headers() });
    if (!r.ok) throw new Error('Backup status unavailable');
    return r.json();
  }

  static async startBackup(sourceDriveId, destDriveId, schedTime) {
    const r = await fetch(`${this.getAgentUrl()}/api/backup/start`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ sourceDriveId, destDriveId, schedTime })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to start backup');
    return data;
  }

  static async stopBackup() {
    const r = await fetch(`${this.getAgentUrl()}/api/backup/stop`, {
      method: 'POST',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to stop backup');
    return data;
  }

  static async restoreBackup(archivePath, targetDriveId) {
    const r = await fetch(`${this.getAgentUrl()}/api/backup/restore`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ archivePath, targetDriveId })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to restore backup');
    return data;
  }

  static async setBackupSchedule(enabled, startTime, sourceDriveId, destDriveId) {
    const r = await fetch(`${this.getAgentUrl()}/api/backup/schedule`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ enabled, startTime, sourceDriveId, destDriveId })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update schedule');
    return data;
  }


  // POST /api/update
  static async updateAgent() {
    const r = await fetch(`${this.getAgentUrl()}/api/update`, {
      method: 'POST',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update agent');
    return data;
  }

  // POST /api/scanner/update
  static async updateScanner() {
    const r = await fetch(`${this.getAgentUrl()}/api/scanner/update`, {
      method: 'POST',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update scanner');
    return data;
  }

  // GET /api/scanner/update-status
  static async getScannerUpdateStatus() {
    const r = await fetch(`${this.getAgentUrl()}/api/scanner/update-status`, {
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to get scanner status');
    return data;
  }

  // GET /api/scanner/token
  static async getScannerToken() {
    const r = await fetch(`${this.getAgentUrl()}/api/scanner/token`, {
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to get scanner token');
    return data;
  }

  // GET /api/s/:token
  static async getShareMetadata(token) {
    const r = await fetch(`${this.getAgentUrl()}/api/s/${token}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Share link invalid');
    return data;
  }

  static getPublicToken() {
    return localStorage.getItem('HCDAVE_PUBLIC_TOKEN') || this.getToken();
  }

  // Build a secure download URL
  static getDownloadUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/download?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
  }

  // Build a stream URL with the token embedded for <img> and <video> tags
  static getStreamUrl(driveId, filePath) {
    return `${this.getDownloadUrl(driveId, filePath)}&inline=true&token=${encodeURIComponent(this.getPublicToken())}`;
  }

  // Trigger browser download using fetch so the Authorization header is sent.
  // For large files, stream the response body into a Blob and create a transient
  // object URL — this bypasses Cloudflare's no-download policy on plain links
  // and gives proper progress feedback through the browser's native download manager.
  static async downloadFile(driveId, filePath, fileName) {
    const url = `${this.getDownloadUrl(driveId, filePath)}&token=${encodeURIComponent(this.getPublicToken())}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (err) {
      // Fallback to plain link if fetch fails (e.g. CORS, network error)
      const a = document.createElement('a');
      a.href = `${this.getDownloadUrl(driveId, filePath)}&token=${encodeURIComponent(this.getPublicToken())}`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  static getThumbnailUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/thumbnail?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(this.getPublicToken())}`;
  }

  static getPreviewUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/thumbnail?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}&size=preview&token=${encodeURIComponent(this.getPublicToken())}`;
  }

  static downloadZip(driveId, paths) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${this.getAgentUrl()}/api/download-zip?token=${encodeURIComponent(this.getPublicToken())}`;
    form.style.display = 'none';

    const driveInput = document.createElement('input');
    driveInput.name = 'driveId';
    driveInput.value = driveId;
    form.appendChild(driveInput);

    paths.forEach(p => {
      const pInput = document.createElement('input');
      pInput.name = 'paths[]';
      pInput.value = p;
      form.appendChild(pInput);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }

  // ── Cache API ────────────────────────────────────────────────

  static async getCacheStatus() {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/status`, { headers: this.headers() });
    if (!r.ok) throw new Error('Cache status unavailable');
    return r.json();
  }

  static async getCacheProgress() {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/progress`, { headers: this.headers() });
    if (!r.ok) throw new Error('Cache progress unavailable');
    return r.json();
  }

  static async startCache(driveIds = [], filePaths = []) {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/start`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ driveIds, filePaths }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to start cache');
    return data;
  }

  static async pauseCache() {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/pause`, { method: 'POST', headers: this.headers() });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to pause');
    return data;
  }

  static async stopCache() {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/stop`, { method: 'POST', headers: this.headers() });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to stop');
    return data;
  }

  static async setCacheSchedule(enabled, startTime) {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/schedule`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ enabled, startTime }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update schedule');
    return data;
  }

  static async cacheVideo(driveId, sourcePath) {
    return this.startCache([], [`${driveId}::${sourcePath}`]);
  }

  static async setCacheMount(mountPath) {
    const r = await fetch(`${this.getAgentUrl()}/api/cache/set-mount`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ mountPath }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to set cache drive');
    return data;
  }

  // 🛡️ HC CLOUD ADMIN TERMINAL ────────────────────────────────────────────────
  static async authenticateTerminal(password) {
    const r = await fetch(`${this.getAgentUrl()}/api/terminal/auth`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Authentication failed');
    return data.token;
  }

  static async execCommand(command, token, confirmDangerous = false, isLong = false) {
    const r = await fetch(`${this.getAgentUrl()}/api/terminal/exec`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ command, token, confirmDangerous, isLong }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Command failed');
    return data; // { stdout, stderr, requireConfirmation, message }
  }
  // 🛡️ END HC CLOUD ADMIN TERMINAL ───────────────────────────────────────────

  // ── DIRECT-TO-CLOUD REMOTE DOWNLOADER ──────────────────────────────────────
  static async getRemoteDownloads() {
    try {
      const r = await fetch(`${this.getAgentUrl()}/api/remote-downloads`, {
        headers: this.headers()
      });
      if (!r.ok) throw new Error('Failed to fetch remote downloads');
      const data = await r.json();
      return data.downloads || [];
    } catch (e) {
      console.error('getRemoteDownloads error:', e);
      return [];
    }
  }

  static async startRemoteDownload(params) {
    const r = await fetch(`${this.getAgentUrl()}/api/remote-downloads`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to start download');
    return data;
  }

  static async pauseRemoteDownload(id) {
    const r = await fetch(`${this.getAgentUrl()}/api/remote-downloads/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to pause download');
    return data;
  }

  static async resumeRemoteDownload(id) {
    const r = await fetch(`${this.getAgentUrl()}/api/remote-downloads/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to resume download');
    return data;
  }

  static async deleteRemoteDownload(id, deleteFile = false) {
    const r = await fetch(`${this.getAgentUrl()}/api/remote-downloads/${encodeURIComponent(id)}?deleteFile=${deleteFile}`, {
      method: 'DELETE',
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to delete download');
    return data;
  }

  // ── QUICKDROP PHONE-TO-CLOUD ───────────────────────────────────────────────
  static async createQuickDrop(params) {
    const r = await fetch(`${this.getAgentUrl()}/api/quickdrop/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to create QuickDrop session');
    return data;
  }

  static async getQuickDrop(token) {
    const r = await fetch(`${this.getAgentUrl()}/api/quickdrop/${encodeURIComponent(token)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'QuickDrop session invalid or expired');
    return data;
  }

  static async getQuickDropStatus(token) {
    const r = await fetch(`${this.getAgentUrl()}/api/quickdrop/${encodeURIComponent(token)}/status`, {
      headers: this.headers()
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to fetch QuickDrop status');
    return data;
  }

  static uploadQuickDropFiles(token, files, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.getAgentUrl()}/api/quickdrop/${encodeURIComponent(token)}/upload`);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress({ loaded: e.loaded, total: e.total, percent });
          }
        };
      }

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(res);
          } else {
            reject(new Error(res.error || 'Upload failed'));
          }
        } catch (e) {
          reject(new Error('Server responded with invalid format'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));

      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      xhr.send(formData);
    });
  }
}
