import React, { useState, useEffect } from 'react';
import { X, Download, Film, Image as Img, FileText, Archive, Folder, Loader, AlertCircle, Database, CheckCircle2, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { StorageService } from '../services/api';
import { PDFViewer } from './PDFViewer';

const ICON_MAP = {
  image:    { Icon: Img,      color: 'var(--cyan)' },
  video:    { Icon: Film,     color: 'var(--rose)' },
  archive:  { Icon: Archive,  color: 'var(--emerald)' },
  folder:   { Icon: Folder,   color: 'var(--amber)' },
  document: { Icon: FileText, color: 'var(--indigo)' },
};

function ImagePreview({ src, alt }) {
  const [status, setStatus] = useState('loading'); // loading | loaded | error | toolarge

  // Use fetch to detect the HTTP status code before rendering the image,
  // so we can distinguish "file too large" (413) from a real error
  React.useEffect(() => {
    setStatus('loading');
    fetch(src)
      .then(r => {
        if (r.status === 413) { setStatus('toolarge'); }
        else if (r.status === 504) { setStatus('toolarge'); } // timeout treated same
        else if (!r.ok) { setStatus('error'); }
        else { setStatus('loaded'); }
      })
      .catch(() => setStatus('error'));
  }, [src]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-3)' }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite' }} color="var(--cyan)" />
          <span style={{ fontSize: '0.8rem' }}>Processing image…</span>
        </div>
      )}
      {status === 'toolarge' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: 24 }}>
          <AlertCircle size={36} color="var(--amber)" />
          <span style={{ fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-1)' }}>Image too large to preview</strong><br />
            DSLR photos and RAW files over 120 MB cannot be previewed<br />
            to protect server memory. You can still download the file.
          </span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-3)', padding: 24 }}>
          <AlertCircle size={36} color="var(--rose)" />
          <span style={{ fontSize: '0.85rem', textAlign: 'center' }}>
            Preview unavailable. Try downloading the file instead.
          </span>
        </div>
      )}
      {status === 'loaded' && (
        <img
          src={src}
          alt={alt}
          className="preview-img"
        />
      )}
    </div>
  );
}

export function FilePreviewModal({ initialFile, files = [], selectedPaths = new Set(), driveId, onClose }) {
  // Build the playlist for the slider. Only include images.
  const [playlistState, setPlaylistState] = useState(() => {
    const isSelectionActive = selectedPaths.size > 0;
    const playlist = isSelectionActive 
      ? files.filter(f => selectedPaths.has(f.path) && f.type === 'image') 
      : files.filter(f => f.type === 'image');
    
    const idx = playlist.findIndex(f => f.path === initialFile.path);
    return { list: playlist, index: idx };
  });

  const { list, index } = playlistState;
  
  // If the initial file is an image, it might be in the playlist. 
  // If it's a video/document, it's just the initial file and the slider won't show.
  const currentFile = (index >= 0 && index < list.length) ? list[index] : initialFile;
  const isSliderActive = index >= 0 && list.length > 1;

  const [isSlideshow, setIsSlideshow] = useState(false);
  const [intervalSec, setIntervalSec] = useState(3);
  const [cacheStatus, setCacheStatus] = useState('idle'); // idle | caching | done | error

  // Preload next image for smoother transitions
  useEffect(() => {
    if (isSliderActive && list.length > 1) {
      const nextIndex = (index + 1) % list.length;
      const nextFile = list[nextIndex];
      if (nextFile.type === 'image') {
        const nextUrl = StorageService.getPreviewUrl(driveId, nextFile.path || nextFile.name);
        const img = new Image();
        img.src = nextUrl;
      }
    }
  }, [index, isSliderActive, list, driveId]);

  useEffect(() => {
    let timer;
    if (isSlideshow && isSliderActive) {
      timer = setInterval(() => {
        setPlaylistState(prev => ({
          ...prev,
          index: (prev.index + 1) % prev.list.length
        }));
      }, intervalSec * 1000);
    }
    return () => clearInterval(timer);
  }, [isSlideshow, intervalSec, isSliderActive]);

  const handleNext = (e) => {
    if (e) e.stopPropagation();
    if (isSliderActive) setPlaylistState(prev => ({ ...prev, index: (prev.index + 1) % prev.list.length }));
  };

  const handlePrev = (e) => {
    if (e) e.stopPropagation();
    if (isSliderActive) setPlaylistState(prev => ({ ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length }));
  };

  if (!currentFile) return null;

  const { Icon, color } = ICON_MAP[currentFile.type] || ICON_MAP.document;

  const handleDownload = () => {
    StorageService.downloadFile(driveId, currentFile.path || currentFile.name, currentFile.name);
  };

  const handleCache = async () => {
    setCacheStatus('caching');
    try {
      await StorageService.cacheVideo(driveId, currentFile.path || currentFile.name);
      setCacheStatus('done');
    } catch (e) {
      setCacheStatus('error');
    }
  };

  const streamUrl  = currentFile.type === 'video'
    ? StorageService.getStreamUrl(driveId, currentFile.path || currentFile.name)
    : null;
  const previewUrl = currentFile.type === 'image'
    ? StorageService.getPreviewUrl(driveId, currentFile.path || currentFile.name)
    : null;

  const isPdf = currentFile.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const pdfUrl = StorageService.getStreamUrl(driveId, currentFile.path || currentFile.name);
    return (
      <PDFViewer 
        url={pdfUrl} 
        fileName={currentFile.name} 
        onClose={onClose} 
        onDownload={handleDownload} 
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 720, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-title-row" style={{ padding: '24px 24px 16px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Icon size={20} color={color} style={{ flexShrink: 0 }} />
            <span
              className="modal-title"
              style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={currentFile.name}
            >
              {currentFile.name}
              {isSliderActive && <span style={{ color: 'var(--text-4)', marginLeft: 8, fontWeight: 400, fontSize: '0.85rem' }}>({index + 1} of {list.length})</span>}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Preview Body */}
        <div className="preview-media-wrap" style={{ position: 'relative', padding: 0, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
          
          {/* Left Arrow */}
          {isSliderActive && (
            <div 
              onClick={handlePrev}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '20%', display: 'flex', alignItems: 'center', cursor: 'pointer', zIndex: 10, paddingLeft: 12, backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.3), transparent)' }}
            >
              <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: 8, display: 'flex', color: 'white', backdropFilter: 'blur(4px)' }}>
                <ChevronLeft size={24} />
              </div>
            </div>
          )}

          <div style={{ padding: '24px', width: '100%', display: 'flex', justifyContent: 'center' }}>
            {currentFile.type === 'image' && previewUrl && (
              <ImagePreview src={previewUrl} alt={currentFile.name} />
            )}

            {currentFile.type === 'video' && streamUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
                <video controls autoPlay className="preview-video" style={{ maxHeight: '60vh' }}>
                  <source src={streamUrl} />
                </video>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>
                  Tip: If video stutters, the codec may be incompatible with your browser.
                </div>
              </div>
            )}

            {(currentFile.type !== 'image' && currentFile.type !== 'video') && (
              <div className="preview-fallback">
                <Icon size={56} color={color} style={{ opacity: 0.5, marginBottom: 12 }} />
                <div style={{ fontWeight: 600 }}>{currentFile.name}</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4, color: 'var(--text-3)' }}>
                  {currentFile.size} · Modified {currentFile.modified}
                </div>
              </div>
            )}
          </div>

          {/* Right Arrow */}
          {isSliderActive && (
            <div 
              onClick={handleNext}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '20%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', cursor: 'pointer', zIndex: 10, paddingRight: 12, backgroundImage: 'linear-gradient(to left, rgba(0,0,0,0.3), transparent)' }}
            >
              <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', padding: 8, display: 'flex', color: 'white', backdropFilter: 'blur(4px)' }}>
                <ChevronRight size={24} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isSliderActive && (
              <>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => setIsSlideshow(!isSlideshow)}
                  style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, color: isSlideshow ? 'var(--cyan)' : 'var(--text-2)' }}
                >
                  {isSlideshow ? <Pause size={16} /> : <Play size={16} />}
                  <span>{isSlideshow ? 'Pause' : 'Slideshow'}</span>
                </button>
                <select 
                  className="custom-select"
                  value={intervalSec} 
                  onChange={e => setIntervalSec(Number(e.target.value))}
                >
                  <option value={3}>3s</option>
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                  <option value={15}>15s</option>
                </select>
              </>
            )}
            {!isSliderActive && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{currentFile.size}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            {currentFile.type === 'video' && (
              <button
                className="btn btn-ghost"
                onClick={handleCache}
                disabled={cacheStatus === 'caching'}
                title="Convert and store this video in the fast cache for instant playback"
                style={{
                  color: cacheStatus === 'done' ? 'var(--emerald)' : cacheStatus === 'error' ? 'var(--rose)' : 'var(--indigo)',
                  borderColor: cacheStatus === 'done' ? 'var(--emerald)' : cacheStatus === 'error' ? 'var(--rose)' : undefined,
                }}
              >
                {cacheStatus === 'done' ? <CheckCircle2 size={14} /> : <Database size={14} />}
                <span>
                  {cacheStatus === 'caching' ? 'Queued…' : cacheStatus === 'done' ? 'Cached!' : cacheStatus === 'error' ? 'Error' : 'Cache Video'}
                </span>
              </button>
            )}
            <button className="btn btn-primary" onClick={handleDownload}>
              <Download size={16} />
              <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
