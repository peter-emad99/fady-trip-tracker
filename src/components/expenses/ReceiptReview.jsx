import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Crop, RotateCcw, Camera, Wand2, Loader2, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { loadOpenCV, fileToCanvas, detectCorners, fullImageCorners, extractDocument, canvasToBlob } from '@/lib/docScanner';

const LOUPE_SIZE = 120; // px on screen

// Full-screen scanner: finds the receipt edges, crops/straightens (and optionally cleans up)
// the photo and shows the result. If the crop is off, Edit lets the user drag the corners.
export default function ReceiptScanner({ file, onDone, onRetake, onCancel }) {
  const [stage, setStage] = React.useState('loading'); // loading | preview | edit | error
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [found, setFound] = React.useState(true);
  const [corners, setCorners] = React.useState(null);
  const [draft, setDraft] = React.useState(null); // corners being edited
  const [dragging, setDragging] = React.useState(null); // index of the corner being dragged
  const [enhance, setEnhance] = React.useState(true);
  const [photoUrl, setPhotoUrl] = React.useState(null);
  const [result, setResult] = React.useState(null); // { blob, url }

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
      setStage('preview');
    } catch (err) {
      console.error('Scan processing failed', err);
      setError(err.message || 'Could not process the image');
      setStage('error');
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let url;
    setStage('loading');
    setResult(null);

    (async () => {
      try {
        const [cv, canvas] = await Promise.all([loadOpenCV(), fileToCanvas(file)]);
        if (cancelled) return;
        cvRef.current = cv;
        canvasRef.current = canvas;
        url = URL.createObjectURL(await canvasToBlob(canvas, 0.85));
        if (cancelled) return URL.revokeObjectURL(url);
        setPhotoUrl(url);

        const detection = detectCorners(cv, canvas);
        detectedRef.current = detection;
        setFound(detection.found);
        setCorners(detection.corners);
        await process(detection.corners, true);
      } catch (err) {
        console.error('Scanner failed', err);
        if (!cancelled) {
          setError(err.message || 'Could not open the scanner');
          setStage('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, process]);

  React.useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

  const handleEnhanceChange = (value) => {
    setEnhance(value);
    process(corners, value);
  };

  const startEdit = () => {
    // Nothing detected means the corners sit on the photo edges; start them a bit inside
    // so all four handles are easy to see and grab
    if (found) {
      setDraft(corners);
    } else {
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
    setStage('edit');
  };

  const applyEdit = () => {
    setCorners(draft);
    setFound(true);
    process(draft, enhance);
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

  const handlePointerDown = (index) => (e) => {
    e.preventDefault();
    setDragging(index);
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragging === null) return;
    const point = toImagePoint(e);
    setDraft((prev) => prev.map((c, i) => (i === dragging ? point : c)));
  };

  const handlePointerUp = () => setDragging(null);

  const handleUse = () => {
    onDone(new File([result.blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

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

  const headerText = {
    loading: 'Scanning…',
    preview: 'Your scan',
    edit: 'Drag the corners to the receipt edges',
    error: 'Scan',
  }[stage];

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-950 text-white flex flex-col select-none">
      <div className="flex items-center justify-between p-3">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="rounded-full text-white hover:bg-white/10 hover:text-white">
          <X className="w-5 h-5" />
        </Button>
        <span className="text-sm font-medium">{headerText}</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
        {stage === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Finding the receipt…</p>
            <p className="text-xs text-slate-500">First scan can take a few seconds</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center space-y-4 max-w-xs">
            <p className="text-sm text-red-300">{error}</p>
            <Button type="button" variant="secondary" onClick={onCancel}>Close</Button>
          </div>
        )}

        {stage === 'preview' && result && (
          <>
            <img src={result.url} alt="Scanned receipt" className="max-w-full max-h-full object-contain rounded-md bg-white shadow-2xl" />
            {!found && !busy && (
              <div className="absolute top-2 inset-x-4 mx-auto max-w-sm rounded-lg bg-amber-500/95 px-3 py-2 text-center text-xs font-medium text-slate-950 shadow-lg">
                Couldn't find the receipt edges. Tap Edit to crop it.
              </div>
            )}
          </>
        )}

        {stage === 'edit' && photoUrl && canvas && draft && (
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

        {busy && stage !== 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
      </div>

      {stage === 'preview' && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
          <div className="flex items-center justify-around">
            <ToolButton icon={Crop} label="Edit" onClick={startEdit} disabled={busy} />
            {onRetake && <ToolButton icon={Camera} label="Retake" onClick={onRetake} disabled={busy} />}
            <label className="flex flex-col items-center gap-1.5 text-xs text-slate-300">
              <Switch
                checked={enhance}
                onCheckedChange={handleEnhanceChange}
                disabled={busy}
                className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-slate-600"
              />
              Enhance
            </label>
          </div>
          <Button type="button" onClick={handleUse} disabled={busy} className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700 gap-2">
            <Check className="w-5 h-5" /> Use scan
          </Button>
        </div>
      )}

      {stage === 'edit' && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
          <div className="flex items-center justify-around">
            <ToolButton icon={Wand2} label="Auto" onClick={() => setDraft(detectedRef.current.corners)} />
            <ToolButton icon={Maximize} label="Full photo" onClick={() => setDraft(fullImageCorners(canvas.width, canvas.height))} />
            <ToolButton icon={RotateCcw} label="Undo" onClick={() => setDraft(corners)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="ghost" onClick={() => setStage('preview')} className="h-12 text-white hover:bg-white/10 hover:text-white">
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
