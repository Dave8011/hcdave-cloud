// Real Storage Agent API Client (Domain: hcdavecloud.in)

export class StorageService {
  static getAgentUrl() {
    return localStorage.getItem('AGENT_URL') || 'https://api.hcdavecloud.in';
  }

  static setAgentUrl(url) {
    localStorage.setItem('AGENT_URL', url);
  }

  // Fetch all dynamically connected plug & play drives from hardware
  static async getDrives() {
    try {
      const res = await fetch(`${this.getAgentUrl()}/api/drives`);
      if (!res.ok) throw new Error('Agent offline');
      const data = await res.json();
      return data.drives || [];
    } catch (err) {
      console.warn('Backend agent offline or connecting locally:', err);
      // Try local fallback if custom tunnel URL is not reachable yet
      try {
        const localRes = await fetch('http://localhost:3001/api/drives');
        if (localRes.ok) {
          const localData = await localRes.json();
          return localData.drives || [];
        }
      } catch (e) {}
      return [];
    }
  }

  // List files for a specific dynamic drive ID and directory path
  static async listFiles(driveId, currentPath = '/') {
    if (!driveId) return [];
    try {
      const url = `${this.getAgentUrl()}/api/files?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(currentPath)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch files');
      return await res.json();
    } catch (err) {
      console.error('Error fetching files:', err);
      return [];
    }
  }

  // Upload file directly to target dynamic drive
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
          reject(new Error('Upload failed'));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', `${this.getAgentUrl()}/api/upload`);
      xhr.send(formData);
    });
  }
}
