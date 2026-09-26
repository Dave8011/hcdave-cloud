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
  static uploadFile(driveId, file, path = '/', onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('driveId', driveId);
      form.append('path', path);
      form.append('file', file); // file must be last for multer diskStorage

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error('Upload failed'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));

      xhr.open('POST', `${this.getAgentUrl()}/api/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.getToken()}`);
      xhr.send(form);
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

  // POST /api/share
  static async createShareLink(driveId, filePath, burnAfterReading) {
    const r = await fetch(`${this.getAgentUrl()}/api/share`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, filePath, burnAfterReading })
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

  // Trigger browser download securely via fetch + blob URL
  static async downloadFile(driveId, filePath, fileName) {
    const url = this.getDownloadUrl(driveId, filePath);
    const r = await fetch(url, { headers: this.headers() });
    if (!r.ok) throw new Error('Download failed');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  static getThumbnailUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/thumbnail?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(this.getToken())}`;
  }

  static async downloadZip(driveId, paths) {
    const r = await fetch(`${this.getAgentUrl()}/api/download-zip`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ driveId, paths })
    });
    if (!r.ok) throw new Error('Zip download failed');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "hcdave_cloud_download.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
}
