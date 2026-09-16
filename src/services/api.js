// Real Storage Agent API Client with Security Password Auth

export class StorageService {
  static getAgentUrl() {
    return localStorage.getItem('AGENT_URL') || 'https://api.hcdavecloud.in';
  }

  static setAgentUrl(url) {
    localStorage.setItem('AGENT_URL', url);
  }

  static getAuthToken() {
    return localStorage.getItem('HCDAVE_AUTH_TOKEN') || '';
  }

  static setAuthToken(token) {
    localStorage.setItem('HCDAVE_AUTH_TOKEN', token);
  }

  static isAuthenticated() {
    return !!this.getAuthToken();
  }

  static logout() {
    localStorage.removeItem('HCDAVE_AUTH_TOKEN');
  }

  static getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Fetch dynamic drives with Auth header
  static async getDrives() {
    try {
      const res = await fetch(`${this.getAgentUrl()}/api/drives`, {
        headers: this.getHeaders()
      });
      if (!res.ok) throw new Error('Unauthorized or Agent offline');
      const data = await res.json();
      return data.drives || [];
    } catch (err) {
      console.warn('Backend agent request failed:', err);
      return [];
    }
  }

  // List files with Auth header
  static async listFiles(driveId, currentPath = '/') {
    if (!driveId) return [];
    try {
      const url = `${this.getAgentUrl()}/api/files?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(currentPath)}`;
      const res = await fetch(url, {
        headers: this.getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch files');
      return await res.json();
    } catch (err) {
      console.error('Error fetching files:', err);
      return [];
    }
  }

  // Upload file with Auth header
  static async uploadFile(driveId, file, targetPath = '/', onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('driveId', driveId);
      formData.append('path', targetPath);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error('Upload failed or unauthorized'));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', `${this.getAgentUrl()}/api/upload`);
      
      const token = this.getAuthToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  }
}
