import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Camera, X, Check, Image as ImageIcon, FileText, ChevronDown, Plus } from 'lucide-react';
import { loadOpenCV, detectDocument, applyPerspectiveTransform, applyFilter, generatePDF } from '../services/scannerUtils';
import { StorageService } from '../services/api';

const CropAdjuster = ({ imageCanvas, corners, onChange }) => {
  const containerRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const [activeCorner, setActiveCorner] = useState(null);

  useEffect(() => {
    const updateLayout = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const imgWidth = imageCanvas.width;
      const imgHeight = imageCanvas.height;
      
      const scale = Math.min(clientWidth / imgWidth, clientHeight / imgHeight);
      setLayout({
        scale,
        renderedWidth: imgWidth * scale,
        renderedHeight: imgHeight * scale,
        offsetX: (clientWidth - imgWidth * scale) / 2,
        offsetY: (clientHeight - imgHeight * scale) / 2
      });
    };
    
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [imageCanvas]);

  const getEventPos = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (idx, e) => {
    e.preventDefault();
    setActiveCorner(idx);
  };

  const handlePointerMove = (e) => {
    if (activeCorner === null || !layout) return;
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    const pos = getEventPos(e);
    
    // Map screen coordinate to image coordinate
    let imgX = (pos.x - rect.left - layout.offsetX) / layout.scale;
    let imgY = (pos.y - rect.top - layout.offsetY) / layout.scale;
    
    // Clamp to image bounds
    imgX = Math.max(0, Math.min(imgX, imageCanvas.width));
    imgY = Math.max(0, Math.min(imgY, imageCanvas.height));
    
    const newCorners = [...corners];
    newCorners[activeCorner] = { x: imgX, y: imgY };
    onChange(newCorners);
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
  };

  // Convert image coordinates to screen coordinates for SVG
  const screenCorners = useMemo(() => {
    if (!layout || !corners) return [];
    return corners.map(c => ({
      x: layout.offsetX + c.x * layout.scale,
      y: layout.offsetY + c.y * layout.scale
    }));
  }, [corners, layout]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative select-none touch-none"
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onTouchCancel={handlePointerUp}
    >
      {layout && (
        <>
          <img 
            src={imageCanvas.toDataURL('image/jpeg', 0.5)}
            alt="Crop Adjust"
            style={{
              position: 'absolute',
              width: layout.renderedWidth,
              height: layout.renderedHeight,
              left: layout.offsetX,
              top: layout.offsetY,
              pointerEvents: 'none'
            }}
          />
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            {screenCorners.length === 4 && (
              <polygon
                points={screenCorners.map(c => `${c.x},${c.y}`).join(' ')}
                fill="rgba(59, 130, 246, 0.2)"
                stroke="#3b82f6"
                strokeWidth="2"
              />
            )}
            {screenCorners.map((c, idx) => (
              <circle
                key={idx}
                cx={c.x}
                cy={c.y}
                r={16}
                fill="white"
                stroke="#3b82f6"
                strokeWidth="4"
                className="pointer-events-auto cursor-grab touch-none"
                onMouseDown={(e) => handlePointerDown(idx, e)}
                onTouchStart={(e) => handlePointerDown(idx, e)}
              />
            ))}
          </svg>
        </>
      )}
    </div>
  );
};

const ScannerMode = ({ onClose }) => {
  const [view, setView] = useState('capture'); // capture, crop, list
  const [pages, setPages] = useState([]); // [{ originalUrl, processedCanvas, corners }]
  const [currentCapture, setCurrentCapture] = useState(null); // { originalCanvas, corners }
  
  const [isPreparing, setIsPreparing] = useState(true);
  const [filterMode, setFilterMode] = useState('document'); // original, document, bw
  
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const canvasRef = useRef(null);

  // Settings for save
  const [docName, setDocName] = useState(`Scan_${new Date().toISOString().split('T')[0]}`);
  const [saveLocation, setSaveLocation] = useState('Documents/Scans');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        // Start camera immediately
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!mounted) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }

        // Lazy load OpenCV
        await loadOpenCV();
        if (mounted) setIsPreparing(false);
      } catch (err) {
        console.error("Scanner init error:", err);
        if (mounted) setIsPreparing(false); // Let it fail gracefully and still capture
      }
    };

    if (view === 'capture') {
      initScanner();
    }

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [view]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop camera stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }

    setIsPreparing(true); // show loader during processing
    
    setTimeout(() => {
      try {
        // Attempt auto detection
        let detectedCorners = detectDocument(canvas);
        
        // Default corners if detection fails
        if (!detectedCorners) {
          const w = canvas.width;
          const h = canvas.height;
          const margin = Math.min(w, h) * 0.1;
          detectedCorners = [
            { x: margin, y: margin },
            { x: w - margin, y: margin },
            { x: w - margin, y: h - margin },
            { x: margin, y: h - margin }
          ];
        }

        setCurrentCapture({ originalCanvas: canvas, corners: detectedCorners });
        setView('crop');
      } catch (err) {
        console.error("Detection error:", err);
        // Fallback to manual
        const w = canvas.width;
        const h = canvas.height;
        const margin = Math.min(w, h) * 0.1;
        setCurrentCapture({
          originalCanvas: canvas,
          corners: [
            { x: margin, y: margin },
            { x: w - margin, y: margin },
            { x: w - margin, y: h - margin },
            { x: margin, y: h - margin }
          ]
        });
        setView('crop');
      } finally {
        setIsPreparing(false);
      }
    }, 50); // small delay to allow UI to show loader
  };

  const handleConfirmCrop = () => {
    if (!currentCapture) return;
    
    const { originalCanvas, corners } = currentCapture;
    
    // Create processed preview
    // We estimate output size based on max width/height of the polygon
    const width = Math.max(
      Math.hypot(corners[0].x - corners[1].x, corners[0].y - corners[1].y),
      Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)
    );
    const height = Math.max(
      Math.hypot(corners[0].x - corners[3].x, corners[0].y - corners[3].y),
      Math.hypot(corners[1].x - corners[2].x, corners[1].y - corners[2].y)
    );

    let transformedCanvas;
    try {
      transformedCanvas = applyPerspectiveTransform(originalCanvas, corners, width, height);
    } catch (e) {
      console.warn("Perspective transform failed, using original", e);
      transformedCanvas = originalCanvas;
    }
    
    const originalUrl = originalCanvas.toDataURL('image/jpeg', 0.5); // save low res original for re-cropping if needed later
    
    setPages([...pages, { originalUrl, processedCanvas: transformedCanvas, corners }]);
    setCurrentCapture(null);
    setView('list');
  };

  const handleSavePdf = async () => {
    if (pages.length === 0) return;
    setIsSaving(true);
    try {
      // Apply filters to all pages right before generating PDF
      const filteredCanvases = pages.map(p => {
        try {
          return applyFilter(p.processedCanvas, filterMode);
        } catch (e) {
          console.warn("Filter failed", e);
          return p.processedCanvas; // fallback
        }
      });

      const pdfBlob = await generatePDF(filteredCanvases);
      
      if (!pdfBlob) throw new Error("PDF Generation failed");

      const file = new File([pdfBlob], `${docName}.pdf`, { type: 'application/pdf' });
      
      const formData = new FormData();
      formData.append('file', file);
      // In a real implementation, you'd send `saveLocation` to the backend as well
      // formData.append('path', saveLocation); 

      // Using the existing API upload mechanism or the new /api/scanner/upload
      const token = StorageService.getToken();
      const agentUrl = StorageService.getAgentUrl();
      
      const res = await fetch(`${agentUrl}/api/scanner/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      onClose();
    } catch (err) {
      console.error("Save error", err);
      alert("Failed to save PDF: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Renders ---

  if (view === 'capture') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex justify-between items-center p-4 bg-black/50 absolute top-0 w-full z-10 text-white">
          <button onClick={onClose} className="p-2"><X size={24} /></button>
          <span className="font-medium">Scan Document</span>
          <div className="w-8"></div>
        </div>
        
        <div className="flex-1 relative flex items-center justify-center bg-black">
          {isPreparing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 text-white flex-col gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p>Preparing scanner...</p>
            </div>
          )}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="h-32 bg-black flex items-center justify-center pb-8 pt-4">
          <button 
            onClick={handleCapture}
            className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <Camera size={28} className="text-black" />
          </button>
        </div>
      </div>
    );
  }

  if (view === 'crop') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex justify-between items-center p-4 bg-black text-white">
          <button onClick={() => setView('capture')} className="p-2 text-red-500">Retake</button>
          <span className="font-medium">Adjust Corners</span>
          <button onClick={handleConfirmCrop} className="p-2 text-blue-500">Done</button>
        </div>
        
        <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-zinc-900">
            {currentCapture && (
              <CropAdjuster 
                imageCanvas={currentCapture.originalCanvas}
                corners={currentCapture.corners}
                onChange={(newCorners) => setCurrentCapture({ ...currentCapture, corners: newCorners })}
              />
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col text-slate-800">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
        <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800"><X size={24} /></button>
        <span className="font-medium text-lg">Save Document</span>
        <button onClick={handleSavePdf} disabled={isSaving || pages.length === 0} className="p-2 text-blue-600 font-medium disabled:opacity-50">
          {isSaving ? 'Saving...' : 'Save PDF'}
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50">
        
        {/* Document Info */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1">Document Name</label>
            <input 
              type="text" 
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full text-lg font-medium p-2 border-b-2 border-slate-200 focus:border-blue-500 outline-none bg-transparent"
            />
          </div>
          
          <div className="flex gap-4">
             <div className="flex-1">
               <label className="block text-sm font-medium text-slate-500 mb-1">Save Location</label>
               <button className="w-full flex items-center justify-between p-2 bg-slate-100 rounded-lg text-left text-sm font-medium text-slate-700">
                 <span className="truncate">{saveLocation}</span>
                 <ChevronDown size={16} />
               </button>
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-500 mb-1">Stats</label>
               <div className="text-sm font-medium text-slate-700 p-2">
                 {pages.length} Pages • ~{(pages.length * 0.8).toFixed(1)} MB
               </div>
             </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <label className="block text-sm font-medium text-slate-500 mb-3">Processing Mode</label>
          <div className="flex gap-2">
            {['original', 'document', 'bw'].map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filterMode === mode 
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' 
                    : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                }`}
              >
                {mode === 'bw' ? 'B&W' : mode}
              </button>
            ))}
          </div>
        </div>

        {/* Pages Gallery */}
        <div>
          <div className="flex justify-between items-center mb-3">
             <h3 className="font-medium text-slate-700">Pages</h3>
             <button 
                onClick={() => setView('capture')}
                className="flex items-center gap-1 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full"
              >
                <Plus size={16} /> Add Page
             </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {pages.map((p, idx) => (
              <div key={idx} className="relative aspect-[3/4] bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
                <img 
                  src={p.processedCanvas.toDataURL()} 
                  alt={`Page ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full font-medium">
                  {idx + 1}
                </div>
              </div>
            ))}
            
            <button 
              onClick={() => setView('capture')}
              className="aspect-[3/4] bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            >
              <Camera size={32} className="mb-2" />
              <span className="text-sm font-medium">Add Page</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ScannerMode;
