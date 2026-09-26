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
      return data.drives || [];
    } catch {
      return [];
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

  // POST /api/upload — upload a file with real progress
  static uploadFile(driveId, file, uploadPath = '/', onProgress) {
    const CHUNK_SIZE   = 50 * 1024 * 1024; // 50 MB per chunk
    const totalChunks  = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const uploadId     = Math.random().toString(36).slice(2) + Date.now().toString(36);

    return new Promise(async (resolve, reject) => {
      try {
        for (let i = 0; i < totalChunks; i++) {
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
                // Combine completed chunks + progress within current chunk
                const overall = Math.round(((i + e.loaded / e.total) / totalChunks) * 100);
                onProgress(overall);
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

  // POST /api/delete — delete single or multiple files/folders
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

  // POST /api/share
  static async createShareLink(driveId, filePathOrPaths, burnAfterReading) {
    const payload = { driveId, burnAfterReading };
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

  // PUT /api/share/:token
  static async updateShareLink(token, burnAfterReading) {
    const r = await fetch(`${this.getAgentUrl()}/api/share/${token}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ burnAfterReading })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to update share link');
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

  // GET /api/s/:token
  static async getShareMetadata(token) {
    const r = await fetch(`${this.getAgentUrl()}/api/s/${token}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Share link invalid');
    return data;
  }

  // Build a secure download URL
  static getDownloadUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/download?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
  }

  // Build a stream URL with the token embedded for <img> and <video> tags
  static getStreamUrl(driveId, filePath) {
    return `${this.getDownloadUrl(driveId, filePath)}&inline=true&token=${encodeURIComponent(this.getToken())}`;
  }

  // Trigger browser download directly without fetch to avoid CORS and RAM limits
  static downloadFile(driveId, filePath, fileName) {
    const url = `${this.getDownloadUrl(driveId, filePath)}&token=${encodeURIComponent(this.getToken())}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  static getThumbnailUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/thumbnail?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(this.getToken())}`;
  }

  static getPreviewUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/thumbnail?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}&size=preview&token=${encodeURIComponent(this.getToken())}`;
  }

  static downloadZip(driveId, paths) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${this.getAgentUrl()}/api/download-zip?token=${encodeURIComponent(this.getToken())}`;
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
}
