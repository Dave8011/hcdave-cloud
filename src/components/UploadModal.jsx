import React, { useState, useRef } from 'react';
import { X, UploadCloud, CheckCircle2, File as FileIcon, Folder } from 'lucide-react';
import { StorageService } from '../services/api';

// Recursively collect all File objects from a DataTransferItem entry (folder or file)
async function collectFilesFromEntry(entry, pathPrefix = '') {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        Object.defineProperty(file, '_relativePath', { value: pathPrefix + file.name, writable: false, configurable: true });
        resolve([file]);
      }, () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const allEntries = [];
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (!batch.length) {
            const nested = await Promise.all(
              allEntries.map(e => collectFilesFromEntry(e, pathPrefix + entry.name + '/'))
            );
            resolve(nested.flat());
          } else {
            allEntries.push(...batch);
            readBatch();
          }
        }, () => resolve([]));
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

// Get the upload sub-path from a file's relative path (strip filename, keep dirs)
function getSubPath(file, basePath) {
  const rel = file._relativePath || file.webkitRelativePath || '';
  if (!rel || !rel.includes('/')) return basePath || '/';
  const dirPart = rel.substring(0, rel.lastIndexOf('/'));
  const base = (basePath || '/').replace(/\/$/, '');
  return `${base}/${dirPart}`;
}

export function UploadModal({ activeDrive, currentPath, onClose, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [currentFileName, setCurrentFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef();
  const folderInputRef = useRef();

  const addFlatFiles = (incoming) => {
    setFiles(prev => [...prev, ...Array.from(incoming)]);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      const entries = Array.from(items)
        .map(item => item.webkitGetAsEntry?.() || null)
        .filter(Boolean);
      if (entries.length > 0) {
        const allFiles = (await Promise.all(entries.map(e => collectFilesFromEntry(e, '')))).flat();
        setFiles(prev => [...prev, ...allFiles]);
        return;
      }
    }
    addFlatFiles(e.dataTransfer.files);
  };

  const handleFolderInput = (e) => {
    setFiles(prev => [...prev, ...Array.from(e.target.files)]);
  };

  const handleUpload = async () => {
    if (!files.length || !activeDrive) return;
    setUploading(true);
    setProgress(0);
    setUploadError('');

    try {
      // The backend (server.js /api/upload-complete) automatically creates 
      // parent directories recursively using fs.mkdirSync(..., { recursive: true }).
      // There is no need to make hundreds of sequential HTTP requests to pre-create folders!

      // Upload all files to their correct paths
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFileName(file.name);
        const destPath = getSubPath(file, currentPath || '/');
        await StorageService.uploadFile(
          activeDrive.id,
          file,
          destPath,
          (p) => {
            const overall = Math.round(((i + p / 100) / files.length) * 100);
            setProgress(overall);
          }
        );
      }
    } catch (e) {
      setUploadError(e.message || 'Upload failed');
      setUploading(false);
      return;
    }

    setUploading(false);
    setDone(true);
    setTimeout(() => { onUploadComplete(); onClose(); }, 1400);
  };

  const folderFileCount = files.filter(f => (f._relativePath || f.webkitRelativePath || '').includes('/')).length;
  const uniqueFolders = new Set(files.map(f => {
    const rel = f._relativePath || f.webkitRelativePath || '';
    return rel.includes('/') ? rel.split('/')[0] : '';
  }).filter(Boolean)).size;

  const selectionLabel = files.length === 0
    ? 'Click or drag & drop files or folders here'
    : folderFileCount > 0
    ? `${files.length} file(s) in ${uniqueFolders || 1} folder(s) selected`
    : `${files.length} file(s) selected`;

  return (
    <div className="modal-overlay" onClick={!uploading ? onClose : undefined}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div className="modal-title">Upload to {activeDrive?.name || 'Drive'}</div>
          {!uploading && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}>
              <X size={20} />
            </button>
          )}
        </div>

        {done ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <CheckCircle2 size={56} color="var(--emerald)" style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {files.length} file{files.length > 1 ? 's' : ''} uploaded!
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', marginTop: 4 }}>Saved to {activeDrive?.name}</div>
          </div>
        ) : (
          <>
            <div
              className={`drop-zone ${dragging ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => addFlatFiles(e.target.files)} />
              <input ref={folderInputRef} type="file" webkitdirectory="true" multiple style={{ display: 'none' }} onChange={handleFolderInput} />
              <UploadCloud size={40} color="var(--indigo)" style={{ marginBottom: 10 }} />
              <div className="drop-title">{selectionLabel}</div>
              <div className="drop-sub" style={{ marginBottom: 14 }}>Drag & drop files or entire folders — structure is preserved</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={() => fileInputRef.current?.click()} type="button">
                  <FileIcon size={14} /><span>Select Files</span>
                </button>
                <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={() => folderInputRef.current?.click()} type="button">
                  <Folder size={14} /><span>Select Folder</span>
                </button>
              </div>
            </div>

            {files.length > 0 && !uploading && (
              <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {files.map((f, i) => {
                  const rel = f._relativePath || f.webkitRelativePath || f.name;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 'var(--r-xs)' }}>
                      <FileIcon size={14} color="var(--text-3)" />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rel}</span>
                      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                  );
                })}
              </div>
            )}

            {uploading && (
              <div className="upload-progress">
                <div className="upload-progress-label">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{currentFileName || 'Uploading…'}</span>
                  <span>{progress}%</span>
                </div>
                <div className="prog-bg"><div className="prog-fill" style={{ width: `${progress}%` }} /></div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 6 }}>Uploading in 50 MB chunks — folder structure is preserved.</div>
              </div>
            )}

            {uploadError && (
              <div style={{ fontSize: '0.82rem', color: 'var(--rose)', marginBottom: 12 }}>⚠ {uploadError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setFiles([])} disabled={!files.length || uploading}>Clear</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={onClose} disabled={uploading}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpload} disabled={!files.length || uploading}>
                  {uploading ? <div className="spinner" /> : <UploadCloud size={16} />}
                  <span>{uploading ? 'Uploading…' : `Upload${files.length ? ` (${files.length})` : ''}`}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
