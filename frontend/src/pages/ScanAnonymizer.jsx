import React, { useState, useRef, useEffect, useMemo, Component } from 'react';
import { api } from '../api/client';

// ── Error Boundary — catches render crashes and shows them instead of blank page ──
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#991b1b' }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Erreur dans le composant :</p>
          <pre style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', background: '#991b1b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Entity config ─────────────────────────────────────────────────
const ENTITY_CFG = {
  PERSON:    { label: 'Personne',        color: '#3B82F6', dot: 'bg-blue-400',    light: 'bg-blue-50 text-blue-700'     },
  EMAIL:     { label: 'Email',           color: '#8B5CF6', dot: 'bg-violet-400',  light: 'bg-violet-50 text-violet-700' },
  PHONE:     { label: 'Téléphone',       color: '#10B981', dot: 'bg-emerald-400', light: 'bg-emerald-50 text-emerald-700'},
  ADDRESS:   { label: 'Adresse',         color: '#F59E0B', dot: 'bg-amber-400',   light: 'bg-amber-50 text-amber-700'   },
  DOB:       { label: 'Date naissance',  color: '#EF4444', dot: 'bg-red-400',     light: 'bg-red-50 text-red-700'       },
  IBAN:      { label: 'IBAN / RIB',      color: '#6366F1', dot: 'bg-indigo-400',  light: 'bg-indigo-50 text-indigo-700' },
  SSN:       { label: 'N° séc. sociale', color: '#EC4899', dot: 'bg-pink-400',    light: 'bg-pink-50 text-pink-700'     },
  ID_NUMBER: { label: 'Réf / Dossier',   color: '#14B8A6', dot: 'bg-teal-400',    light: 'bg-teal-50 text-teal-700'     },
  MEDICAL:   { label: 'Info médicale',   color: '#F97316', dot: 'bg-orange-400',  light: 'bg-orange-50 text-orange-700' },
  ORG:       { label: 'Organisation',    color: '#6B7280', dot: 'bg-gray-400',    light: 'bg-gray-50 text-gray-700'     },
};

const REDACT_MODES = [
  { id: 'pseudo', label: 'Pseudo',      desc: 'PERSONNE_001…' },
  { id: 'tag',    label: '[ANONYMISÉ]', desc: 'Uniforme'      },
  { id: 'mask',   label: 'Masquage',    desc: '[PERSONNE]…'   },
];

// ── Spinner — uses Tailwind animate-spin, NO <style> inside SVG ──
function Spinner({ className = 'w-5 h-5', color = 'currentColor' }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="4" className="opacity-25" />
      <path fill={color} className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Image loading ─────────────────────────────────────────────────

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Impossible de lire le fichier'));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => rej(new Error('Image non décodable'));
    img.src = src;
  });
}

async function buildCanvas(dataUrl, maxPx = 2000) {
  const img    = await loadImage(dataUrl);
  const scale  = Math.max(img.naturalWidth, img.naturalHeight) > maxPx
    ? maxPx / Math.max(img.naturalWidth, img.naturalHeight) : 1;
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(img.naturalWidth  * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function preprocessCanvas(canvas) {
  const dst = document.createElement('canvas');
  dst.width  = canvas.width;
  dst.height = canvas.height;
  const ctx  = dst.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, dst.width, dst.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i+1] + 0.114 * d.data[i+2];
    const v = Math.min(255, Math.max(0, (g - 120) * 1.5 + 145));
    d.data[i] = d.data[i+1] = d.data[i+2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return dst;
}

async function runOcr(canvas) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['fra', 'eng'], 1, { logger: () => {} });
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  const words = (data.words || []).filter(w => w.text.trim()).map(w => ({
    text: w.text, confidence: w.confidence,
    bbox: [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1],
  }));
  return { text: data.text || '', confidence: Math.round(data.confidence || 0), words };
}

// ── Redaction ─────────────────────────────────────────────────────

function sampleBg(ctx, x1, y1, x2, y2) {
  const W = ctx.canvas.width, H = ctx.canvas.height, m = 8;
  let r = 0, g = 0, b = 0;
  [[Math.max(0,x1-m),Math.max(0,y1-m)],[Math.min(W-1,x2+m),Math.max(0,y1-m)],
   [Math.max(0,x1-m),Math.min(H-1,y2+m)],[Math.min(W-1,x2+m),Math.min(H-1,y2+m)]].forEach(([px,py]) => {
    const d = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data;
    r += d[0]; g += d[1]; b += d[2];
  });
  return `rgb(${Math.round(r/4)},${Math.round(g/4)},${Math.round(b/4)})`;
}

function applyRedaction(srcCanvas, entities, excluded, mode) {
  const dst = document.createElement('canvas');
  dst.width  = srcCanvas.width; dst.height = srcCanvas.height;
  const ctx  = dst.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  const cnt = {};
  for (const e of entities) {
    if (excluded.has(e.id) || !e.bbox) continue;
    const [x1,y1,x2,y2] = e.bbox;
    const bw = x2-x1, bh = y2-y1;
    if (bw <= 0 || bh <= 0) continue;
    ctx.fillStyle = sampleBg(ctx, x1, y1, x2, y2);
    ctx.fillRect(x1-2, y1-2, bw+4, bh+4);
    const pfx = {PERSON:'PERSONNE',EMAIL:'EMAIL',PHONE:'TEL',ADDRESS:'ADRESSE',DOB:'DATE_NAISS',
                 IBAN:'IBAN',SSN:'SS',ID_NUMBER:'REF',MEDICAL:'MEDICAL',ORG:'ORG'}[e.type]||'DONNEE';
    const label = mode==='tag' ? '[ANONYMISÉ]' : mode==='mask' ? `[${pfx}]`
      : (cnt[pfx]=(cnt[pfx]||0)+1, `${pfx}_${String(cnt[pfx]).padStart(3,'0')}`);
    let fs = Math.min(bh*0.72, 14);
    ctx.font = `bold ${fs}px monospace`;
    while (fs > 5 && ctx.measureText(label).width > bw-2) { fs -= 0.4; ctx.font = `bold ${fs}px monospace`; }
    ctx.fillStyle = '#CC0000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x1+bw/2, y1+bh/2); ctx.textAlign = 'left';
  }
  return dst;
}

// ── Export ────────────────────────────────────────────────────────

async function exportPdf(canvases, filename) {
  const { jsPDF } = await import('jspdf');
  const [f] = canvases;
  const pdf = new jsPDF({ unit:'px', format:[f.width,f.height],
    orientation: f.width>f.height?'landscape':'portrait', compress:true });
  canvases.forEach((c, i) => {
    if (i > 0) pdf.addPage([c.width, c.height]);
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, c.width, c.height);
  });
  pdf.save(filename.replace(/\.[^.]+$/, '_anonymise.pdf'));
}

// ── Main component ────────────────────────────────────────────────

function ScanAnonymizerInner() {
  // step: idle → showing → review → redacting → done
  const [step,       setStep]       = useState('idle');
  const [pages,      setPages]      = useState([]);
  // page = { id, dataUrl, ocrW, ocrH, confidence, quality, words, ocrText, entities, redactedDataUrl }
  const [curPage,    setCurPage]    = useState(0);
  const [filename,   setFilename]   = useState('');
  const [redactMode, setRedactMode] = useState('pseudo');
  const [excluded,   setExcluded]   = useState(new Set());
  const [selEnt,     setSelEnt]     = useState(null);
  const [err,        setErr]        = useState('');
  const [procMsg,    setProcMsg]    = useState('');
  const [zoom,       setZoom]       = useState(100);
  const [showExp,    setShowExp]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [dragging,   setDragging]   = useState(false);

  const canvasRef  = useRef([]);   // origCanvases per page
  const inputRef   = useRef(null);
  const exportRef  = useRef(null);

  useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExp(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const cur         = pages[curPage] ?? null;
  const allEnts     = useMemo(() => pages.flatMap(p => p.entities || []), [pages]);
  const activeCount = useMemo(() => allEnts.filter(e => !excluded.has(e.id) && e.bbox).length, [allEnts, excluded]);
  const avgQ        = useMemo(() => {
    const qs = pages.map(p => p.quality?.global).filter(v => v != null);
    return qs.length ? Math.round(qs.reduce((a,b)=>a+b,0)/qs.length) : null;
  }, [pages]);

  function reset() {
    canvasRef.current = [];
    setStep('idle'); setPages([]); setCurPage(0);
    setFilename(''); setExcluded(new Set()); setSelEnt(null); setErr(''); setProcMsg('');
  }

  // ── Pipeline ──────────────────────────────────────────────────

  async function handleFile(file) {
    if (!file) return;
    setErr('');
    const ext = file.name.split('.').pop().toLowerCase();
    const ok  = ['pdf','jpg','jpeg','png','bmp','tif','tiff','webp'];
    if (!ok.includes(ext)) { setErr(`Format non supporté : .${ext}`); return; }

    canvasRef.current = [];
    setFilename(file.name); setExcluded(new Set()); setSelEnt(null); setCurPage(0); setPages([]);
    setProcMsg(''); setErr('');

    try {
      if (ext === 'pdf') {
        // ── PDF: render pages, show each as it loads ─────────────
        setProcMsg('Chargement du PDF…');
        const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
        GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
        const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
          setProcMsg(`Rendu page ${i}/${pdf.numPages}…`);
          const page = await pdf.getPage(i);
          const vp   = page.getViewport({ scale: 2.0 });
          const cv   = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          const dataUrl = cv.toDataURL('image/jpeg', 0.88);
          canvasRef.current.push(cv);
          const idx = i - 1;
          setPages(prev => [...prev, { id: idx, dataUrl, ocrW: cv.width, ocrH: cv.height, confidence: 0, quality: null, words: [], ocrText: '', entities: [], redactedDataUrl: null }]);
          if (i === 1) setStep('showing');
        }

        // OCR + detect per page
        for (let i = 0; i < canvasRef.current.length; i++) {
          setProcMsg(`OCR page ${i+1}/${canvasRef.current.length}…`);
          try {
            const pre = await preprocessCanvas(canvasRef.current[i]);
            const ocr = await runOcr(pre);
            const res = Math.min(100, Math.round(Math.min(pre.width, pre.height) / 10));
            const q   = { ocr: ocr.confidence, resolution: res, global: Math.round(ocr.confidence*0.75+res*0.25) };
            setPages(prev => prev.map((p, idx) => idx===i ? {...p, confidence:ocr.confidence, quality:q, words:ocr.words, ocrText:ocr.text} : p));

            if (ocr.text.trim()) {
              setProcMsg(`Détection page ${i+1}…`);
              const res2 = await api.post('/scan/detect', { ocrText: ocr.text, words: ocr.words, filename: file.name, pageIndex: i });
              let eid = Date.now() + i * 10000;
              const entities = (res2.entities||[]).map(e => ({...e, id:`e_${eid++}`, pageId:i}));
              setPages(prev => prev.map((p, idx) => idx===i ? {...p, entities} : p));
            }
          } catch (ocrErr) {
            // OCR failed for this page — keep showing image without entities
          }
        }

      } else {
        // ── Image: show IMMEDIATELY using data URL ────────────────
        setProcMsg('Lecture du fichier…');
        const dataUrl = await fileToDataUrl(file);
        setPages([{ id:0, dataUrl, ocrW:0, ocrH:0, confidence:0, quality:null, words:[], ocrText:'', entities:[], redactedDataUrl:null }]);
        setStep('showing');

        // Build canvas for OCR
        setProcMsg('Prétraitement…');
        const canvas = await buildCanvas(dataUrl);
        canvasRef.current = [canvas];
        setPages(prev => prev.map((p, i) => i===0 ? {...p, ocrW:canvas.width, ocrH:canvas.height} : p));

        // OCR
        setProcMsg('OCR en cours… (peut prendre 30-60s)');
        const pre = await preprocessCanvas(canvas);
        const ocr = await runOcr(pre);
        const res = Math.min(100, Math.round(Math.min(canvas.width, canvas.height) / 10));
        const q   = { ocr: ocr.confidence, resolution: res, global: Math.round(ocr.confidence*0.75+res*0.25) };
        setPages(prev => prev.map((p, i) => i===0 ? {...p, confidence:ocr.confidence, quality:q, words:ocr.words, ocrText:ocr.text} : p));

        // Detection
        if (ocr.text.trim()) {
          setProcMsg('Détection des données sensibles…');
          try {
            const r = await api.post('/scan/detect', { ocrText:ocr.text, words:ocr.words, filename:file.name, pageIndex:0 });
            let eid = Date.now();
            const entities = (r.entities||[]).map(e => ({...e, id:`e_${eid++}`, pageId:0}));
            setPages(prev => prev.map((p, i) => i===0 ? {...p, entities} : p));
          } catch (apiErr) {
            setErr(`Détection : ${apiErr.message}`);
          }
        }
      }

      setProcMsg('');
      setStep('review');

    } catch (e) {
      setErr(`Erreur : ${e.message}`);
      setProcMsg('');
      if (pages.length > 0) setStep('review'); // keep showing image even on error
      else setStep('idle');
    }
  }

  async function handleRedact() {
    setStep('redacting');
    for (let i = 0; i < pages.length; i++) {
      try {
        const src = canvasRef.current[i];
        const dst = applyRedaction(src, pages[i].entities||[], excluded, redactMode);
        const redactedDataUrl = dst.toDataURL('image/jpeg', 0.92);
        canvasRef.current[i] = dst;
        setPages(prev => prev.map((p, idx) => idx===i ? {...p, redactedDataUrl} : p));
      } catch {
        setPages(prev => prev.map((p, idx) => idx===i ? {...p, redactedDataUrl: pages[i].dataUrl} : p));
      }
    }
    setStep('done');
  }

  async function handleExport(fmt) {
    setExporting(true); setShowExp(false);
    try {
      if (fmt === 'pdf') {
        await exportPdf(canvasRef.current, filename);
      } else {
        const c = canvasRef.current[curPage];
        if (c) {
          const a = document.createElement('a');
          a.href = fmt==='png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg',0.93);
          a.download = filename.replace(/\.[^.]+$/, `_anonymise.${fmt}`);
          a.click();
        }
      }
    } catch (e) { setErr(`Export : ${e.message}`); }
    finally { setExporting(false); }
  }

  const pageEnts = cur?.entities || [];

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-cream-300 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-semibold text-ink">Anonymisation scan</h1>
            <p className="text-[11px] text-ink-500 mt-0.5">PDF scanné · JPG · PNG · TIFF · BMP</p>
          </div>
          {step === 'review' && (
            <div className="flex gap-0.5 bg-cream-100 border border-cream-200 rounded-lg p-0.5">
              {REDACT_MODES.map(m => (
                <button key={m.id} onClick={() => setRedactMode(m.id)} title={m.desc}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${redactMode===m.id ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(step==='showing'||step==='review') && (
            <button onClick={reset} className="btn-ghost text-xs px-3 py-1.5">Changer</button>
          )}
          {step==='review' && (
            <button onClick={handleRedact} disabled={activeCount===0}
              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50">
              Anonymiser → ({activeCount})
            </button>
          )}
          {step==='done' && (
            <>
              <button onClick={reset} className="btn-ghost text-xs px-3 py-1.5">Nouveau</button>
              <div className="relative" ref={exportRef}>
                <button onClick={() => setShowExp(v=>!v)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Exporter
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {showExp && (
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-cream-300 rounded-xl shadow-lg z-20 overflow-hidden min-w-[11rem]">
                    {[['pdf','PDF','toutes pages'],['jpg','JPG',`page ${curPage+1}`],['png','PNG',`page ${curPage+1}`]].map(([f,l,s]) => (
                      <button key={f} onClick={() => handleExport(f)}
                        className={`w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors flex justify-between ${f!=='pdf'?'border-t border-cream-200':''}`}>
                        <span>{l}</span><span className="text-ink-400">{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {err && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center justify-between shrink-0">
          <span>{err}</span>
          <button onClick={() => setErr('')} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── IDLE ──────────────────────────────────────────────── */}
      {step === 'idle' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            <div
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${dragging ? 'border-ink bg-cream-100' : 'border-cream-300 hover:border-ink-500 hover:bg-cream-50'}`}
              onClick={() => inputRef.current?.click()}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
            >
              <div className="w-14 h-14 rounded-2xl bg-cream-100 border border-cream-200 flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <p className="font-display text-2xl text-ink mb-2">Déposez votre scan</p>
              <p className="text-sm text-ink-500 mb-5">ou</p>
              <span className="btn-primary text-sm px-5 py-2">Choisir un fichier</span>
              <p className="text-xs text-ink-500 mt-5">PDF scanné · JPG · PNG · TIFF · BMP</p>
              <input ref={inputRef} type="file" className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.bmp,.tif,.tiff,.webp"
                onChange={e => handleFile(e.target.files[0])} />
            </div>
            <div className="mt-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
              <p className="font-semibold">Pour les documents scannés uniquement</p>
              <p className="text-blue-600 mt-0.5">Pour les PDF natifs (texte sélectionnable), utilisez la feature Anonymisation.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── SHOWING / REVIEW ──────────────────────────────────── */}
      {(step==='showing' || step==='review') && cur && (
        <div className="flex-1 flex overflow-hidden">

          {/* Left: image + overlay */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-cream-300" style={{ minWidth: 0 }}>
            {/* Info bar */}
            <div className="bg-cream-50 border-b border-cream-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink truncate">{filename}</p>
                <div className="flex items-center gap-2 text-[11px] text-ink-500 mt-0.5">
                  {pages.length > 1 && <span>{pages.length} pages</span>}
                  {cur.confidence > 0 && <span>OCR {cur.confidence}%</span>}
                  {cur.quality && (
                    <span className={`font-medium ${cur.quality.global>=85?'text-emerald-600':cur.quality.global>=70?'text-blue-600':cur.quality.global>=50?'text-amber-600':'text-red-600'}`}>
                      Qualité {cur.quality.global}%
                    </span>
                  )}
                  {procMsg && (
                    <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                      <Spinner className="w-3 h-3" />
                      {procMsg}
                    </span>
                  )}
                </div>
              </div>
              {/* Page nav */}
              {pages.length > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setCurPage(p => Math.max(0,p-1))} disabled={curPage===0}
                    className="w-6 h-6 rounded flex items-center justify-center text-ink-400 hover:text-ink disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <span className="text-xs text-ink-500 w-12 text-center">{curPage+1}/{pages.length}</span>
                  <button onClick={() => setCurPage(p => Math.min(pages.length-1,p+1))} disabled={curPage===pages.length-1}
                    className="w-6 h-6 rounded flex items-center justify-center text-ink-400 hover:text-ink disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
              )}
            </div>

            {/* Image */}
            <div className="flex-1 overflow-auto bg-neutral-300 p-4">
              <div className="relative mx-auto shadow-xl" style={{ width: `${zoom}%`, minWidth: 200 }}>
                <img
                  key={cur.id}
                  src={cur.dataUrl}
                  alt={`Page ${curPage+1}`}
                  className="block w-full h-auto"
                />
                {/* Entity overlay — only in review when OCR canvas size is known */}
                {step==='review' && cur.ocrW > 0 && pageEnts.length > 0 && (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox={`0 0 ${cur.ocrW} ${cur.ocrH}`}
                    preserveAspectRatio="none"
                  >
                    {pageEnts.map(e => {
                      if (!e.bbox) return null;
                      const [x1,y1,x2,y2] = e.bbox;
                      const cfg = ENTITY_CFG[e.type] || { color:'#6B7280', label: String(e.type||'') };
                      const isX = excluded.has(e.id);
                      return (
                        <g key={e.id} onClick={() => { setExcluded(prev=>{const n=new Set(prev);n.has(e.id)?n.delete(e.id):n.add(e.id);return n;}); setSelEnt(e.id); }} style={{ cursor:'pointer' }}>
                          <rect x={x1-2} y={y1-2} width={x2-x1+4} height={y2-y1+4}
                            fill={isX?'transparent':cfg.color+'30'} stroke={cfg.color}
                            strokeWidth={selEnt===e.id?4:isX?1.5:2.5}
                            strokeDasharray={isX?'6 3':undefined} rx="2" opacity={isX?.4:1}/>
                          {!isX && <>
                            <rect x={x1-2} y={y1-16} width={cfg.label.length*6.5+8} height={15} fill={cfg.color} rx="2"/>
                            <text x={x1+2} y={y1-5} fill="white" fontSize="9" fontWeight="700" fontFamily="system-ui">{cfg.label}</text>
                          </>}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>

            {/* Zoom */}
            <div className="bg-white border-t border-cream-200 px-4 py-2 flex items-center gap-3 shrink-0">
              <span className="text-[11px] text-ink-500">Zoom</span>
              <input type="range" min="30" max="250" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-ink" style={{ height: 4 }} />
              <span className="text-[11px] text-ink-500 w-9 text-right">{zoom}%</span>
            </div>
          </div>

          {/* Right: panel */}
          <div className="w-72 bg-cream-50 flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-2.5 border-b border-cream-200 shrink-0">
              <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">
                {step==='showing' ? 'Analyse en cours' : 'Résultats'}
              </span>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">

              {step==='showing' && (
                <div className="card p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Spinner className="w-4 h-4 text-ink" />
                    <span className="text-xs font-semibold text-ink">Analyse en cours…</span>
                  </div>
                  <p className="text-[11px] text-ink-500">{procMsg || 'Traitement…'}</p>
                  <p className="text-[11px] text-ink-400">Votre scan est visible. L'OCR peut prendre 30-60 secondes.</p>
                </div>
              )}

              {cur.quality && (
                <div className="card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Qualité</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cur.quality.global>=85?'bg-emerald-100 text-emerald-700':cur.quality.global>=70?'bg-blue-100 text-blue-700':cur.quality.global>=50?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>
                      {cur.quality.global>=85?'Excellent':cur.quality.global>=70?'Bon':cur.quality.global>=50?'Moyen':'Faible'} ({cur.quality.global}%)
                    </span>
                  </div>
                  {[['OCR', cur.quality.ocr],['Résolution', cur.quality.resolution]].map(([l,v]) => (
                    <div key={l}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-ink-500">{l}</span>
                        <span className={`font-semibold ${v>=80?'text-emerald-600':v>=60?'text-amber-600':'text-red-600'}`}>{v}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-cream-200">
                        <div className={`h-1.5 rounded-full ${v>=80?'bg-emerald-400':v>=60?'bg-amber-400':'bg-red-400'}`} style={{ width:`${v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pageEnts.length > 0 && (
                <div className="card p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-ink">Données détectées</span>
                    <span className="text-xs font-bold text-ink">{pageEnts.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(pageEnts.reduce((a,e)=>{a[e.type]=(a[e.type]||0)+1;return a;},{})).map(([t,c]) => {
                      const cfg = ENTITY_CFG[t] || { label:t, dot:'bg-gray-400' };
                      return (
                        <div key={t} className="flex items-center gap-1.5 p-2 rounded-lg bg-cream-50 border border-cream-200">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`}/>
                          <span className="text-[11px] text-ink-600 flex-1 truncate">{cfg.label}</span>
                          <span className="text-xs font-bold text-ink">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {step==='review' && pageEnts.length > 0 && (
                <div className="card p-4 space-y-2">
                  <p className="text-xs font-semibold text-ink mb-1">Validation manuelle</p>
                  <div className="max-h-52 overflow-y-auto space-y-1.5">
                    {pageEnts.map(e => {
                      const cfg = ENTITY_CFG[e.type] || { label:String(e.type||''), light:'bg-gray-50 text-gray-700', dot:'bg-gray-400' };
                      const isX = excluded.has(e.id);
                      return (
                        <div key={e.id} onClick={() => { setExcluded(prev=>{const n=new Set(prev);n.has(e.id)?n.delete(e.id):n.add(e.id);return n;}); setSelEnt(e.id); }}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${isX?'opacity-50 bg-cream-50':'bg-white hover:border-ink-200'} ${selEnt===e.id?'ring-1 ring-ink':''}`}
                          style={{ borderColor: isX ? '#EDE7DC' : '#EDE7DC' }}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}/>
                          <span className="flex-1 font-mono text-[11px] text-ink truncate">{e.text}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.light}`}>{cfg.label}</span>
                          <span className={`text-[10px] font-semibold shrink-0 ${isX?'text-emerald-600':'text-red-500'}`}>{isX?'Inclure':'Ignorer'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {step==='review' && pageEnts.length === 0 && !procMsg && (
                <div className="card p-4">
                  <p className="text-xs text-ink-500">Aucune donnée sensible détectée.</p>
                  {cur.confidence < 60 && (
                    <p className="text-[11px] text-red-600 mt-2">OCR {cur.confidence}% — qualité trop faible pour détecter des entités. Essayez un scan de meilleure qualité.</p>
                  )}
                </div>
              )}

              {step==='review' && (
                <div className="card p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-500">À anonymiser</span>
                    <span className="font-bold text-ink">{activeCount}</span>
                  </div>
                  <button onClick={handleRedact} disabled={activeCount===0}
                    className="w-full btn-primary text-xs py-2 disabled:opacity-50">
                    Anonymiser ({activeCount}) →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REDACTING ─────────────────────────────────────────── */}
      {step === 'redacting' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center w-64">
            <div className="w-12 h-12 rounded-full bg-ink flex items-center justify-center mx-auto mb-5">
              <Spinner className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-ink">Anonymisation visuelle…</p>
          </div>
        </div>
      )}

      {/* ── DONE ──────────────────────────────────────────────── */}
      {step === 'done' && cur && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-cream-50 border-b border-cream-200 px-4 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              {pages.length > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurPage(p => Math.max(0,p-1))} disabled={curPage===0}
                    className="w-6 h-6 rounded flex items-center justify-center text-ink-400 hover:text-ink disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <span className="text-xs text-ink-500 w-12 text-center">{curPage+1}/{pages.length}</span>
                  <button onClick={() => setCurPage(p => Math.min(pages.length-1,p+1))} disabled={curPage===pages.length-1}
                    className="w-6 h-6 rounded flex items-center justify-center text-ink-400 hover:text-ink disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>
              )}
              <span className="text-[11px] font-medium text-emerald-600">✓ {activeCount} entité{activeCount!==1?'s':''} anonymisée{activeCount!==1?'s':''}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-500">Zoom</span>
              <input type="range" min="30" max="250" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-24 accent-ink" style={{ height: 4 }} />
              <span className="text-[11px] text-ink-500 w-8 text-right">{zoom}%</span>
            </div>
          </div>
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden border-r border-cream-300" style={{ minWidth: 0 }}>
              <div className="px-4 py-2 bg-cream-50 border-b border-cream-200 shrink-0">
                <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Original</span>
              </div>
              <div className="flex-1 overflow-auto bg-neutral-300 p-4">
                <div className="mx-auto shadow-xl" style={{ width:`${zoom}%`, minWidth:200 }}>
                  <img src={cur.dataUrl} alt="Original" className="block w-full h-auto" />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
              <div className="px-4 py-2 bg-cream-50 border-b border-cream-200 shrink-0">
                <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Anonymisé</span>
              </div>
              <div className="flex-1 overflow-auto bg-neutral-300 p-4">
                <div className="mx-auto shadow-xl" style={{ width:`${zoom}%`, minWidth:200 }}>
                  <img src={cur.redactedDataUrl || cur.dataUrl} alt="Anonymisé" className="block w-full h-auto" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {exporting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex items-center gap-4">
            <Spinner className="w-5 h-5 text-ink" />
            <p className="text-sm font-semibold text-ink">Génération du fichier…</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScanAnonymizer() {
  return (
    <ErrorBoundary>
      <ScanAnonymizerInner />
    </ErrorBoundary>
  );
}
