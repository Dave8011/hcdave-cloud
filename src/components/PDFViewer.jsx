import React, { useState, useEffect, useRef } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import { ZoomIn, ZoomOut, Maximize, Maximize2, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export function PDFViewer({ url, fileName, onClose, onDownload }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [fitMode, setFitMode] = useState(null); // 'width' | 'page' | null
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth - 48, // 24px padding on each side
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
    setPageNumber(prev => Math.min(Math.max(1, prev + offset), numPages || 1));
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

  return (
    <div className="pdf-viewer-overlay">
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
              key={pageNumber} // force re-render on change
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

      <div className="pdf-viewer-content" ref={containerRef}>
        {url ? (
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="pdf-loading">
                <span className="loader"></span> Loading PDF...
              </div>
            }
            error={
              <div className="pdf-error">
                Failed to load PDF. Please try downloading it.
              </div>
            }
          >
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
          </Document>
        ) : null}
      </div>
    </div>
  );
}
