import React, { useState, useEffect, useRef } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import { ZoomIn, ZoomOut, Maximize, Maximize2, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// LazyThumbnail wraps a Page component and only renders it when visible
function LazyThumbnail({ pageNum, isActive, onClick }) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: '200px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={`pdf-thumbnail-wrap ${isActive ? 'active' : ''}`}
      onClick={() => onClick(pageNum)}
    >
      <div className="pdf-thumbnail-number">Page {pageNum}</div>
      {isVisible ? (
        <Page
          pageNumber={pageNum}
          width={window.innerWidth <= 768 ? 80 : 160} // smaller on mobile
          renderTextLayer={false}
          renderAnnotationLayer={false}
          className="pdf-thumbnail-page"
        />
      ) : (
        <div className="pdf-thumbnail-placeholder"></div>
      )}
    </div>
  );
}

export function PDFViewer({ url, fileName, onClose, onDownload }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [fitMode, setFitMode] = useState(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const sidebarRef = useRef(null);
  
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth - 48,
          height: containerRef.current.clientHeight - 48,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const changePage = (offset) => {
    const next = Math.min(Math.max(1, pageNumber + offset), numPages || 1);
    setPageNumber(next);
  };

  const handlePageInput = (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 1 && val <= (numPages || 1)) {
        setPageNumber(val);
      } else {
        e.target.value = pageNumber;
      }
      e.target.blur();
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 5.0));
    setFitMode(null);
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.2));
    setFitMode(null);
  };

  // Auto-scroll sidebar to keep active thumbnail in view
  useEffect(() => {
    if (sidebarRef.current) {
      const activeThumb = sidebarRef.current.querySelector('.pdf-thumbnail-wrap.active');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [pageNumber]);

  return (
    <div className="pdf-viewer-overlay">
      {/* 1. PDF Toolbar */}
      <div className="pdf-viewer-toolbar">
        <div className="pdf-toolbar-group">
          <button className="btn btn-ghost icon-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
          <span className="pdf-filename" title={fileName}>{fileName}</span>
        </div>
        
        <div className="pdf-toolbar-group pdf-toolbar-pagination">
          <button className="btn btn-ghost icon-btn" onClick={() => changePage(-1)} disabled={pageNumber <= 1}>
            <ChevronLeft size={20} />
          </button>
          <div className="pdf-page-indicator">
            <input 
              ref={inputRef}
              type="text" 
              className="pdf-page-input"
              defaultValue={pageNumber}
              key={pageNumber} 
              onKeyDown={handlePageInput}
              onBlur={(e) => { e.target.value = pageNumber; }}
            />
            <span className="pdf-page-total">/ {numPages || '--'}</span>
          </div>
          <button className="btn btn-ghost icon-btn" onClick={() => changePage(1)} disabled={pageNumber >= (numPages || 1)}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="pdf-toolbar-group pdf-toolbar-zoom">
          <button className="btn btn-ghost icon-btn" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut size={20} />
          </button>
          <span className="pdf-zoom-level">{Math.round(scale * 100)}%</span>
          <button className="btn btn-ghost icon-btn" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn size={20} />
          </button>
          <div className="pdf-toolbar-divider"></div>
          <button 
            className={`btn btn-ghost icon-btn ${fitMode === 'width' ? 'active' : ''}`} 
            onClick={() => setFitMode(fitMode === 'width' ? null : 'width')} 
            title="Fit Width"
          >
            <Maximize size={18} />
          </button>
          <button 
            className={`btn btn-ghost icon-btn ${fitMode === 'page' ? 'active' : ''}`} 
            onClick={() => setFitMode(fitMode === 'page' ? null : 'page')} 
            title="Fit Page"
          >
            <Maximize2 size={18} />
          </button>
          <div className="pdf-toolbar-divider"></div>
          <button className="btn btn-ghost icon-btn" onClick={onDownload} title="Download">
            <Download size={20} />
          </button>
        </div>
      </div>

      <div className="pdf-viewer-body">
        {url && (
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="pdf-loading"><span className="loader"></span> Loading PDF...</div>}
            error={<div className="pdf-error">Failed to load PDF. Please try downloading it.</div>}
            className="pdf-document-wrapper"
          >
            {/* 2. PDF Thumbnail Sidebar */}
            {numPages && (
              <div className="pdf-thumbnail-sidebar" ref={sidebarRef}>
                {Array.from(new Array(numPages), (el, index) => (
                  <LazyThumbnail 
                    key={`thumb_${index + 1}`}
                    pageNum={index + 1}
                    isActive={pageNumber === index + 1}
                    onClick={setPageNumber}
                  />
                ))}
              </div>
            )}

            {/* 3. PDF Canvas Area */}
            <div className="pdf-viewer-content" ref={containerRef}>
              <Page
                pageNumber={pageNumber}
                scale={fitMode ? undefined : scale}
                width={fitMode === 'width' ? containerDimensions.width : undefined}
                height={fitMode === 'page' ? containerDimensions.height : undefined}
                loading={<div className="pdf-page-loading">Rendering page...</div>}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="pdf-page-container"
              />
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
