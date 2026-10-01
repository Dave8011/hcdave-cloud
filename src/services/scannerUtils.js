import { jsPDF } from 'jspdf';

let cvPromise = null;

export const loadOpenCV = () => {
  if (cvPromise) return cvPromise;
  
  if (window.cv && window.cv.Mat) {
    cvPromise = Promise.resolve(window.cv);
    return cvPromise;
  }

  cvPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;
    script.onload = () => {
      // OpenCV.js is somewhat peculiar, cv might be a promise itself
      if (window.cv instanceof Promise) {
        window.cv.then(target => {
          window.cv = target;
          resolve(window.cv);
        }).catch(reject);
      } else {
        // Wait for it to be ready
        const checkReady = setInterval(() => {
          if (window.cv && window.cv.Mat) {
            clearInterval(checkReady);
            resolve(window.cv);
          }
        }, 100);
      }
    };
    script.onerror = () => {
      cvPromise = null;
      reject(new Error('Failed to load OpenCV'));
    };
    document.body.appendChild(script);
  });

  return cvPromise;
};

export const detectDocument = (imageCanvas) => {
  if (!window.cv || !window.cv.Mat) return null;
  const cv = window.cv;

  let src = cv.imread(imageCanvas);
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();

  // Convert to grayscale
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  // Blur to reduce noise
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
  // Edge detection
  cv.Canny(blur, edges, 75, 200);

  // Find contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let docContour = null;
  let maxArea = 0;

  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > 5000) {
      let peri = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      
      if (approx.rows === 4 && area > maxArea) {
        docContour = approx;
        maxArea = area;
      } else {
        approx.delete();
      }
    }
    cnt.delete();
  }

  let corners = null;
  if (docContour) {
    // Extract the 4 points
    corners = [];
    for (let i = 0; i < 4; i++) {
      corners.push({
        x: docContour.data32S[i * 2],
        y: docContour.data32S[i * 2 + 1]
      });
    }
    
    // Sort corners: top-left, top-right, bottom-right, bottom-left
    corners.sort((a, b) => a.y - b.y);
    const top = corners.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = corners.slice(2, 4).sort((a, b) => b.x - a.x);
    corners = [...top, ...bottom];
    
    docContour.delete();
  }

  src.delete();
  gray.delete();
  blur.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();

  return corners;
};

export const applyPerspectiveTransform = (sourceCanvas, corners, outputWidth, outputHeight) => {
  if (!window.cv || !window.cv.Mat || !corners) return sourceCanvas;
  const cv = window.cv;

  let src = cv.imread(sourceCanvas);
  let dst = new cv.Mat();
  let dsize = new cv.Size(outputWidth, outputHeight);

  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners[0].x, corners[0].y,
    corners[1].x, corners[1].y,
    corners[2].x, corners[2].y,
    corners[3].x, corners[3].y
  ]);
  
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outputWidth, 0,
    outputWidth, outputHeight,
    0, outputHeight
  ]);

  let M = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  cv.imshow(outCanvas, dst);

  src.delete();
  dst.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();

  return outCanvas;
};

export const applyFilter = (sourceCanvas, mode) => {
  if (!window.cv || !window.cv.Mat || mode === 'original') return sourceCanvas;
  const cv = window.cv;

  let src = cv.imread(sourceCanvas);
  let dst = new cv.Mat();

  if (mode === 'bw') {
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY, 0);
    cv.adaptiveThreshold(dst, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  } else if (mode === 'document') {
    // Enhance contrast without going full B&W
    let hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    let channels = new cv.MatVector();
    cv.split(hsv, channels);
    
    // Equalize histogram of the V channel
    let v = channels.get(2);
    cv.equalizeHist(v, v);
    
    cv.merge(channels, hsv);
    cv.cvtColor(hsv, dst, cv.COLOR_HSV2RGB);
    cv.cvtColor(dst, dst, cv.COLOR_RGB2RGBA);
    
    hsv.delete();
    channels.delete();
    v.delete();
  } else {
    src.copyTo(dst);
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sourceCanvas.width;
  outCanvas.height = sourceCanvas.height;
  cv.imshow(outCanvas, dst);

  src.delete();
  dst.delete();

  return outCanvas;
};

export const generatePDF = async (imageCanvases) => {
  if (imageCanvases.length === 0) return null;
  
  // Create a new PDF document. Assuming A4 size for documents generally.
  // We'll calculate aspect ratio to fit the page.
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < imageCanvases.length; i++) {
    if (i > 0) pdf.addPage();
    
    const canvas = imageCanvases[i];
    const imgData = canvas.toDataURL('image/jpeg', 0.8);
    
    const imgRatio = canvas.width / canvas.height;
    const pageRatio = pageWidth / pageHeight;
    
    let renderWidth, renderHeight;
    
    if (imgRatio > pageRatio) {
      renderWidth = pageWidth;
      renderHeight = pageWidth / imgRatio;
    } else {
      renderHeight = pageHeight;
      renderWidth = pageHeight * imgRatio;
    }
    
    // Center it
    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;
    
    pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight);
  }

  return pdf.output('blob');
};
