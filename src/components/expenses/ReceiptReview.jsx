import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Crop, RotateCcw, Camera, ImagePlus, Wand2, Loader2, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { loadOpenCV, fileToCanvas, detectCorners, fullImageCorners, extractDocument, canvasToBlob } from '@/lib/docScanner';

const LOUPE_SIZE = 120; // px on screen
const MODE_KEY = 'trippy.receiptMode';

function readPreferredMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'original' ? 'original' : 'scan';
  } catch {
    return 'scan';
  }
}

function savePreferredMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not saved; it just won't be remembered next time
  }
}

// Full-screen review for every receipt photo (camera or gallery). The original shows right away
// while the scanner finds the receipt, crops/straightens and cleans it up. The user picks Scan or
// Original, can fix the crop with Edit, and confirms with Use.
export default function ReceiptReview({
  file,
  index = 0,
  total = 1,
  source,
  onUse,
  onUseAllOriginal,
  onSkip,
  onRetake,
  onCancel,
}) {
  const [photoUrl, setPhotoUrl] = React.useState(null);
  const [readError, setReadError] = React.useState(false);
  const [scanStatus, setScanStatus] = React.useState('loading'); // loading | ready | failed
  const [mode, setMode] = React.useState(readPreferredMode); // scan | original
  const [found, setFound] = React.useState(true);
  const [corners, setCorners] = React.useState(null);
  const [enhance, setEnhance] = React.useState(true);
  const [result, setResult] = React.useState(null); // { blob, url }
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState(null); // corners being edited; null when not editing
  const [dragging, setDragging] = React.useState(null); // index of the corner being dragged

  const cvRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const detectedRef = React.useRef(null);
  const svgRef = React.useRef(null);

  const process = React.useCallback(async (nextCorners, nextEnhance) => {
    setBusy(true);
    // Let the spinner paint before OpenCV blocks the main thread
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const output = extractDocument(cvRef.current, canvasRef.current, nextCorners, { enhance: nextEnhance });
      const blob = await canvasToBlob(output);
      setResult({ blob, url: URL.createObjectURL(blob) });
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let url;

    (async () => {
      let canvas;
      try {
        canvas = await fileToCanvas(file);
        if (cancelled) return;
        canvasRef.current = canvas;
        url = URL.createObjectURL(await canvasToBlob(canvas, 0.85));
        if (cancelled) return URL.revokeObjectURL(url);
        setPhotoUrl(url);
      } catch (err) {
        console.error('Could not read photo', err);
        if (!cancelled) setReadError(true);
        return;
      }

      try {
        const cv = await loadOpenCV();
        if (cancelled) return;
        cvRef.current = cv;
        const detection = detectCorners(cv, canvas);
        detectedRef.current = detection;
        setFound(detection.found);
        setCorners(detection.corners);
        // Nothing to crop: default to the original rather than a pointless "scan"
        if (!detection.found) setMode('original');
        await process(detection.corners, true);
        if (!cancelled) setScanStatus('ready');
      } catch (err) {
        console.error('Scanner failed', err);
        if (!cancelled) {
          setScanStatus('failed');
          setMode('original');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, process]);

  React.useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  const startEdit = () => {
    if (found) {
      setDraft(corners);
    } else {
      // Nothing detected means the corners sit on the photo edges; start them a bit inside
      // so all four handles are easy to see and grab
      const { width, height } = canvasRef.current;
      const mx = width * 0.1;
      const my = height * 0.1;
      setDraft([
        { x: mx, y: my },
        { x: width - mx, y: my },
        { x: width - mx, y: height - my },
        { x: mx, y: height - my },
      ]);
    }
  };

  const changeMode = (next) => {
    savePreferredMode(next);
    setMode(next);
    // Switching to Scan when no receipt was found: let the user mark the corners right away
    if (next === 'scan' && !found && scanStatus === 'ready') startEdit();
  };

  const handleEnhanceChange = (value) => {
    setEnhance(value);
    process(corners, value);
  };

  const applyEdit = () => {
    const next = draft;
    setDraft(null);
    setCorners(next);
    setFound(true);
    process(next, enhance);
  };

  // Converts a pointer position into image pixel coordinates
  const toImagePoint = (e) => {
    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const { x, y } = point.matrixTransform(svg.getScreenCTM().inverse());
    const { width, height } = canvasRef.current;
    return { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)) };
  };

  const handlePointerDown = (i) => (e) => {
    e.preventDefault();
    setDragging(i);
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragging === null) return;
    const point = toImagePoint(e);
    setDraft((prev) => prev.map((c, i) => (i === dragging ? point : c)));
  };

  const handlePointerUp = () => setDragging(null);

  const handleUse = () => {
    if (mode === 'scan') {
      onUse(new File([result.blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } else {
      onUse(file);
    }
  };

  const editing = draft !== null;
  const canvas = canvasRef.current;
  const imageSize = canvas ? Math.max(canvas.width, canvas.height) : 0;
  const handleRadius = imageSize * 0.022;
  // Room around the photo so handles on its edges are fully visible
  const viewPadding = handleRadius * 1.4;
  const polygonPoints = draft?.map((c) => `${c.x},${c.y}`).join(' ');
  const dragPoint = dragging !== null && draft ? draft[dragging] : null;
  const loupeSpan = imageSize * 0.08; // image pixels shown across the magnifier
  // Keep the magnifier on the opposite side from the finger
  const loupeOnRight = dragPoint && canvas && dragPoint.x < canvas.width / 2;

  const scanPending = mode === 'scan' && (scanStatus === 'loading' || !result);
  const isLast = index >= total - 1;
  const useLabel = `${mode === 'scan' ? 'Use scan' : 'Use photo'}${isLast ? '' : ' & next'}`;
  const RetakeIcon = source === 'camera' ? Camera : ImagePlus;
  const retakeLabel = source === 'camera' ? 'Retake' : 'Choose another';

  let headerText = total > 1 ? `Receipt ${index + 1} of ${total}` : 'Review receipt';
  if (editing) headerText = 'Drag the corners to the receipt edges';

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-950 text-white flex flex-col select-none">
      <div className="flex items-center justify-between gap-2 p-3">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white">
          <X className="w-5 h-5" />
        </Button>
        <span className="text-sm font-medium text-center">{headerText}</span>
        {total > 1 && !editing ? (
          <button type="button" onClick={onSkip} className="shrink-0 px-2 text-sm text-slate-400 hover:text-white">
            Skip
          </button>
        ) : (
          <div className="w-10 shrink-0" />
        )}
      </div>

      {!editing && !readError && (
        <div className="flex justify-center pb-2">
          <div className="flex rounded-full bg-white/10 p-1 text-sm font-medium">
            {[['scan', 'Scan'], ['original', 'Original']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeMode(value)}
                disabled={busy || (value === 'scan' && scanStatus === 'failed')}
                className={`rounded-full px-5 py-1.5 transition-colors disabled:opacity-40 ${
                  mode === value ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
        {readError && (
          <div className="text-center space-y-4 max-w-xs">
            <p className="text-sm text-slate-300">Can't preview this photo, but it can still be uploaded.</p>
            <Button type="button" onClick={() => onUse(file)} className="bg-indigo-600 hover:bg-indigo-700">
              Upload as is
            </Button>
          </div>
        )}

        {!readError && !photoUrl && <Loader2 className="w-8 h-8 animate-spin text-slate-300" />}

        {!editing && photoUrl && (mode === 'original' || scanPending) && (
          <img
            src={photoUrl}
            alt="Receipt photo"
            className={`max-w-full max-h-full object-contain rounded-md transition-opacity ${scanPending ? 'opacity-40' : ''}`}
          />
        )}

        {!editing && mode === 'scan' && !scanPending && (
          <img src={result.url} alt="Scanned receipt" className="max-w-full max-h-full object-contain rounded-md bg-white shadow-2xl" />
        )}

        {!editing && photoUrl && scanPending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-200">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Scanning…</p>
            <p className="text-xs text-slate-400">First scan can take a few seconds</p>
          </div>
        )}

        {!editing && mode === 'original' && (scanStatus === 'failed' || (scanStatus === 'ready' && !found)) && (
          <div className="absolute top-2 inset-x-4 mx-auto max-w-sm rounded-lg bg-slate-800/95 px-3 py-2 text-center text-xs text-slate-200 shadow-lg">
            {scanStatus === 'failed'
              ? "The scanner couldn't load. Check your connection; you can still use the photo."
              : 'No receipt edges found. Switch to Scan to crop it yourself.'}
          </div>
        )}

        {editing && photoUrl && canvas && (
          <>
            <svg
              ref={svgRef}
              viewBox={`${-viewPadding} ${-viewPadding} ${canvas.width + viewPadding * 2} ${canvas.height + viewPadding * 2}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full touch-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <defs>
                <mask id="scan-crop-mask">
                  <rect width={canvas.width} height={canvas.height} fill="white" />
                  <polygon points={polygonPoints} fill="black" />
                </mask>
              </defs>
              <image href={photoUrl} width={canvas.width} height={canvas.height} />
              {/* Dim everything outside the crop */}
              <rect width={canvas.width} height={canvas.height} fill="rgba(2,6,23,0.55)" mask="url(#scan-crop-mask)" />
              <polygon
                points={polygonPoints}
                fill="none"
                stroke="#818cf8"
                strokeWidth={handleRadius * 0.22}
                strokeLinejoin="round"
              />
              {draft.map((c, i) => (
                <g key={i} onPointerDown={handlePointerDown(i)} className="cursor-grab">
                  {/* Larger invisible circle = easier to grab with a finger */}
                  <circle cx={c.x} cy={c.y} r={handleRadius * 2.4} fill="transparent" />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={handleRadius}
                    fill={dragging === i ? 'rgba(129,140,248,0.35)' : 'rgba(255,255,255,0.25)'}
                    stroke="white"
                    strokeWidth={handleRadius * 0.25}
                  />
                </g>
              ))}
            </svg>

            {dragPoint && (
              <div
                className={`pointer-events-none absolute top-4 ${loupeOnRight ? 'right-4' : 'left-4'} overflow-hidden rounded-full border-2 border-white shadow-2xl bg-slate-900`}
                style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
              >
                <svg
                  viewBox={`${dragPoint.x - loupeSpan / 2} ${dragPoint.y - loupeSpan / 2} ${loupeSpan} ${loupeSpan}`}
                  width={LOUPE_SIZE}
                  height={LOUPE_SIZE}
                >
                  <image href={photoUrl} width={canvas.width} height={canvas.height} />
                  <polygon points={polygonPoints} fill="none" stroke="#818cf8" strokeWidth={loupeSpan * 0.012} />
                  <line x1={dragPoint.x - loupeSpan * 0.1} y1={dragPoint.y} x2={dragPoint.x + loupeSpan * 0.1} y2={dragPoint.y} stroke="white" strokeWidth={loupeSpan * 0.01} />
                  <line x1={dragPoint.x} y1={dragPoint.y - loupeSpan * 0.1} x2={dragPoint.x} y2={dragPoint.y + loupeSpan * 0.1} stroke="white" strokeWidth={loupeSpan * 0.01} />
                </svg>
              </div>
            )}
          </>
        )}

        {busy && !scanPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
      </div>

      {!editing && !readError && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="flex items-center justify-around min-h-[52px]">
            {mode === 'scan' && <ToolButton icon={Crop} label="Edit" onClick={startEdit} disabled={busy || scanPending} />}
            {onRetake && <ToolButton icon={RetakeIcon} label={retakeLabel} onClick={onRetake} />}
            {mode === 'scan' && (
              <label className="flex flex-col items-center gap-1.5 text-xs text-slate-300">
                <Switch
                  checked={enhance}
                  onCheckedChange={handleEnhanceChange}
                  disabled={busy || scanPending}
                  className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-slate-600"
                />
                Enhance
              </label>
            )}
          </div>
          <Button
            type="button"
            onClick={handleUse}
            disabled={busy || scanPending}
            className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            <Check className="w-5 h-5" /> {useLabel}
          </Button>
          {!isLast && onUseAllOriginal && (
            <button type="button" onClick={onUseAllOriginal} className="w-full py-1 text-sm text-slate-400 hover:text-white">
              Use all {total - index} as original
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
          <div className="flex items-center justify-around">
            <ToolButton icon={Wand2} label="Auto" onClick={() => setDraft(detectedRef.current.corners)} />
            <ToolButton icon={Maximize} label="Full photo" onClick={() => setDraft(fullImageCorners(canvas.width, canvas.height))} />
            <ToolButton icon={RotateCcw} label="Undo" onClick={() => setDraft(corners)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)} className="h-12 text-white hover:bg-white/10 hover:text-white">
              Cancel
            </Button>
            <Button type="button" onClick={applyEdit} disabled={busy} className="h-12 bg-indigo-600 hover:bg-indigo-700 gap-2">
              <Check className="w-5 h-5" /> Apply
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-1 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-40"
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}
