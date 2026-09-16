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
      form.append('file', file);
      form.append('driveId', driveId);
      form.append('path', path);

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

  // Build a secure download URL (token in Authorization header via fetch + blob)
  static getDownloadUrl(driveId, filePath) {
    return `${this.getAgentUrl()}/api/download?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
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
}
