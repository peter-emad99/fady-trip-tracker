import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ArrowLeft, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { loadOpenCV, fileToCanvas, detectCorners, extractDocument, canvasToBlob } from '@/lib/docScanner';

// Full-screen scanner: finds the receipt edges, lets the user drag the corners,
// then crops/straightens (and optionally cleans up) the image.
export default function ReceiptScanner({ file, onDone, onCancel }) {
  const [stage, setStage] = React.useState('loading'); // loading | adjust | processing | preview | error
  const [error, setError] = React.useState('');
  const [corners, setCorners] = React.useState(null);
  const [enhance, setEnhance] = React.useState(true);
  const [photoUrl, setPhotoUrl] = React.useState(null);
  const [result, setResult] = React.useState(null); // { blob, url }

  const cvRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const svgRef = React.useRef(null);
  const dragIndex = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    let url;

    (async () => {
      try {
        const [cv, canvas] = await Promise.all([loadOpenCV(), fileToCanvas(file)]);
        if (cancelled) return;
        cvRef.current = cv;
        canvasRef.current = canvas;
        url = URL.createObjectURL(await canvasToBlob(canvas, 0.85));
        if (cancelled) return URL.revokeObjectURL(url);
        setPhotoUrl(url);
        setCorners(detectCorners(cv, canvas));
        setStage('adjust');
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
  }, [file]);

  React.useEffect(() => () => result && URL.revokeObjectURL(result.url), [result]);

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
    dragIndex.current = index;
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragIndex.current === null) return;
    const point = toImagePoint(e);
    setCorners((prev) => prev.map((c, i) => (i === dragIndex.current ? point : c)));
  };

  const handlePointerUp = () => { dragIndex.current = null; };

  const handleAutoDetect = () => setCorners(detectCorners(cvRef.current, canvasRef.current));

  const handleCrop = async () => {
    setStage('processing');
    // Let the spinner paint before OpenCV blocks the main thread
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const output = extractDocument(cvRef.current, canvasRef.current, corners, { enhance });
      const blob = await canvasToBlob(output);
      setResult({ blob, url: URL.createObjectURL(blob) });
      setStage('preview');
    } catch (err) {
      console.error('Crop failed', err);
      setError(err.message || 'Could not process the image');
      setStage('error');
    }
  };

  const handleUse = () => {
    onDone(new File([result.blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

  const canvas = canvasRef.current;
  const handleRadius = canvas ? Math.max(canvas.width, canvas.height) * 0.025 : 0;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-950 text-white flex flex-col select-none">
      <div className="flex items-center justify-between p-3">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="rounded-full text-white hover:bg-white/10 hover:text-white">
          <X className="w-5 h-5" />
        </Button>
        <span className="text-sm font-medium">
          {stage === 'preview' ? 'Check the scan' : 'Drag the corners to the receipt edges'}
        </span>
        <div className="w-10" />
      </div>

      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
        {stage === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading scanner…</p>
            <p className="text-xs text-slate-500">First time can take a few seconds</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center space-y-4 max-w-xs">
            <p className="text-sm text-red-300">{error}</p>
            <Button type="button" variant="secondary" onClick={onCancel}>Close</Button>
          </div>
        )}

        {(stage === 'adjust' || stage === 'processing') && photoUrl && canvas && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <image href={photoUrl} width={canvas.width} height={canvas.height} />
            <polygon
              points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
              fill="rgba(99,102,241,0.18)"
              stroke="#818cf8"
              strokeWidth={handleRadius * 0.25}
              strokeLinejoin="round"
            />
            {corners.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={handleRadius}
                fill="rgba(255,255,255,0.9)"
                stroke="#6366f1"
                strokeWidth={handleRadius * 0.3}
                className="cursor-grab"
                onPointerDown={handlePointerDown(i)}
              />
            ))}
          </svg>
        )}

        {stage === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}

        {stage === 'preview' && result && (
          <img src={result.url} alt="Scanned receipt" className="max-w-full max-h-full object-contain rounded-md bg-white" />
        )}
      </div>

      {(stage === 'adjust' || stage === 'processing') && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={handleAutoDetect} className="text-white hover:bg-white/10 hover:text-white gap-1.5">
            <Wand2 className="w-4 h-4" /> Auto
          </Button>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Switch checked={enhance} onCheckedChange={setEnhance} className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-slate-600" />
            Enhance
          </label>
          <Button type="button" onClick={handleCrop} disabled={stage === 'processing'} className="ml-auto bg-indigo-600 hover:bg-indigo-700">
            Crop
          </Button>
        </div>
      )}

      {stage === 'preview' && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => setStage('adjust')} className="text-white hover:bg-white/10 hover:text-white gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Adjust
          </Button>
          <Button type="button" onClick={handleUse} className="ml-auto bg-indigo-600 hover:bg-indigo-700 gap-1.5">
            <Check className="w-4 h-4" /> Use scan
          </Button>
        </div>
      )}
    </div>,
    document.body
  );
}
