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

function defaultCorners(width, height) {
  const mx = width * 0.08;
  const my = height * 0.08;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

// Finds the biggest 4-sided shape in the photo (the receipt).
// Falls back to a slightly inset rectangle so the user can drag the corners themselves.
export function detectCorners(cv, canvas) {
  const { width, height } = canvas;
  // Detect on a small copy: faster, and less noise from text inside the receipt
  const detectScale = Math.min(1, 500 / Math.max(width, height));

  const src = cv.imread(canvas);
  const small = new cv.Mat();
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);

  try {
    cv.resize(src, small, new cv.Size(0, 0), detectScale, detectScale, cv.INTER_AREA);
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 50, 150);
    cv.dilate(edges, edges, kernel); // close small gaps in the receipt outline
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const minArea = small.cols * small.rows * 0.15;
    let best = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      const area = cv.contourArea(approx);

      if (approx.rows === 4 && area > minArea && area > bestArea && cv.isContourConvex(approx)) {
        bestArea = area;
        best = [];
        for (let j = 0; j < 4; j++) {
          best.push({ x: approx.data32S[j * 2] / detectScale, y: approx.data32S[j * 2 + 1] / detectScale });
        }
      }
      approx.delete();
      contour.delete();
    }

    return best ? orderCorners(best) : defaultCorners(width, height);
  } finally {
    [src, small, gray, edges, contours, hierarchy, kernel].forEach((m) => m.delete());
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
