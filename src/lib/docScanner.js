// Document scanning (edge detection, perspective crop, shadow removal) on top of OpenCV.js.
// OpenCV is ~10 MB, so it is only fetched the first time someone opens the scanner.
// The versioned jsDelivr URL is served with a 1-year immutable cache header, so later
// scans load it from the browser cache.
const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';

let cvPromise = null;

async function waitForRuntime() {
  let cv = window.cv;
  // Newer builds expose a promise for the module instead of the module itself
  if (cv instanceof Promise) cv = await cv;
  if (!cv.Mat) await new Promise((resolve) => { cv.onRuntimeInitialized = resolve; });
  // The Emscripten module has its own `then` that resolves to itself, so returning it from
  // an async function (or passing it to resolve) loops forever. Drop it once we're ready.
  delete cv.then;
  window.cv = cv;
  return cv;
}

export function loadOpenCV() {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    if (window.cv) return resolve(waitForRuntime());

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => waitForRuntime().then(resolve, reject);
    script.onerror = () => reject(new Error('Could not load the scanner. Check your connection.'));
    document.head.appendChild(script);
  }).catch((err) => {
    cvPromise = null; // let the next attempt retry
    throw err;
  });

  return cvPromise;
}

// Puts the image on a canvas, scaled down so OpenCV stays fast on phones
export async function fileToCanvas(file, maxDimension = 2000) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

// Orders 4 points as top-left, top-right, bottom-right, bottom-left
function orderCorners(points) {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

export function fullImageCorners(width, height) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

// Simplifies a (convex hull) contour to 4 corners, loosening the tolerance until it fits.
// Falls back to the tightest rotated rectangle when the outline is too ragged.
function contourToQuad(cv, hull) {
  const perimeter = cv.arcLength(hull, true);
  for (let tolerance = 0.01; tolerance <= 0.1; tolerance += 0.01) {
    const approx = new cv.Mat();
    cv.approxPolyDP(hull, approx, tolerance * perimeter, true);
    const count = approx.rows;
    const points = count === 4
      ? Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] }))
      : null;
    approx.delete();
    if (points) return points;
    if (count < 4) break;
  }
  return cv.RotatedRect.points(cv.minAreaRect(hull)).map(({ x, y }) => ({ x, y }));
}

function polygonArea(points) {
  let area = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  });
  return Math.abs(area) / 2;
}

// Turns a binary image into candidate receipt outlines, scored by size and how well
// 4 corners describe the shape
// Moves corners towards the middle of the shape by `amount` pixels
function insetQuad(quad, amount) {
  const cx = quad.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = quad.reduce((sum, p) => sum + p.y, 0) / 4;
  return quad.map(({ x, y }) => {
    const length = Math.hypot(cx - x, cy - y) || 1;
    return { x: x + ((cx - x) / length) * amount, y: y + ((cy - y) / length) * amount };
  });
}

// `inset` undoes the thickening applied to edge lines, which pushes outlines outwards
function collectCandidates(cv, binary, candidates, inset = 0) {
  const { cols: width, rows: height } = binary;
  const imageArea = width * height;
  const margin = Math.max(width, height) * 0.01;
  const onBorder = ({ x, y }) => x < margin || y < margin || x > width - margin || y > height - margin;

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // Ignore small blobs and outlines that are basically the photo border
      if (area > imageArea * 0.08 && area < imageArea * 0.95) {
        const hull = new cv.Mat();
        cv.convexHull(contour, hull);
        const quad = contourToQuad(cv, hull);
        hull.delete();
        // Compare with the real outline, not its hull: a receipt merged with a stray line
        // (table edge, shadow) has a much bigger hull than area, so it scores badly
        const quadArea = polygonArea(quad);
        const fit = Math.min(quadArea, area) / Math.max(quadArea, area);
        // Receipts are usually fully in frame; shapes running off the photo are often background
        // (and one touching the edge on 3+ corners crops almost nothing anyway)
        const borderCorners = quad.filter(onBorder).length;
        if (fit > 0.8 && borderCorners < 3) {
          // Outer outlines sit outside the thickened line, holes sit inside it
          const isHole = hierarchy.data32S[i * 4 + 3] !== -1;
          candidates.push({ quad: insetQuad(quad, isHole ? -inset : inset), score: area * fit ** 3 * 0.6 ** borderCorners });
        }
      }
      contour.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

// Finds the receipt in the photo. Tries edge-based and brightness-based outlines (receipts
// are usually lighter than what they're lying on) and keeps the best 4-cornered one.
// Returns { corners, found }; when nothing convincing is found the corners cover the whole photo.
export function detectCorners(cv, canvas) {
  const { width, height } = canvas;
  // Detect on a small copy: faster, and less noise from text inside the receipt
  const detectScale = Math.min(1, 600 / Math.max(width, height));

  const src = cv.imread(canvas);
  const small = new cv.Mat();
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const fillKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
  const candidates = [];

  try {
    cv.resize(src, small, new cv.Size(0, 0), detectScale, detectScale, cv.INTER_AREA);
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);

    // 1. Edges at a few sensitivities, thickened so small gaps in the outline close up
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    for (const [low, high] of [[20, 60], [40, 120], [75, 200]]) {
      cv.Canny(blurred, binary, low, high);
      cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, closeKernel);
      cv.dilate(binary, binary, closeKernel);
      collectCandidates(cv, binary, candidates, 3 * Math.SQRT2);
    }

    // 2. Bright paper vs darker background (Otsu picks the cut-off), with the text filled in
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, fillKernel);
    cv.morphologyEx(binary, binary, cv.MORPH_OPEN, fillKernel);
    collectCandidates(cv, binary, candidates);
    blurred.delete();

    if (!candidates.length) return { corners: fullImageCorners(width, height), found: false };

    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
    const corners = best.quad.map(({ x, y }) => ({
      x: Math.min(width, Math.max(0, x / detectScale)),
      y: Math.min(height, Math.max(0, y / detectScale)),
    }));
    // A "receipt" covering nearly the whole photo means nothing useful was found
    const found = polygonArea(corners) < width * height * 0.9;
    return { corners: found ? orderCorners(corners) : fullImageCorners(width, height), found };
  } finally {
    [src, small, gray, binary, closeKernel, fillKernel].forEach((m) => m.delete());
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Crops the receipt out of the photo and straightens it.
// With enhance, also evens out shadows and whitens the paper so text stands out.
export function extractDocument(cv, canvas, corners, { enhance = true } = {}) {
  const [tl, tr, br, bl] = corners;
  const outWidth = Math.round(Math.max(distance(tl, tr), distance(bl, br)));
  const outHeight = Math.round(Math.max(distance(tl, bl), distance(tr, br)));

  const src = cv.imread(canvas);
  const warped = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outWidth, 0, outWidth, outHeight, 0, outHeight]);
  const transform = cv.getPerspectiveTransform(from, to);
  const cleanup = [src, warped, from, to, transform];

  try {
    cv.warpPerspective(src, warped, transform, new cv.Size(outWidth, outHeight), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    let output = warped;
    if (enhance) {
      const gray = new cv.Mat();
      const background = new cv.Mat();
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
      cleanup.push(gray, background, kernel);

      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
      // Estimate the paper (text removed), then divide it out to cancel shadows and uneven light
      cv.dilate(gray, background, kernel);
      cv.medianBlur(background, background, 21);
      cv.divide(gray, background, gray, 255);
      cv.normalize(gray, gray, 0, 255, cv.NORM_MINMAX);
      output = gray;
    }

    const result = document.createElement('canvas');
    cv.imshow(result, output);
    return result;
  } finally {
    cleanup.forEach((m) => m.delete());
  }
}

export function canvasToBlob(canvas, quality = 0.9) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
