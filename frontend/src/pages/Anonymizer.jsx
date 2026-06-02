import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api/client';
import { ENTITY_COLORS, buildHighlights, computeStats } from '../utils/entityColors';

const CATEGORIES = [
  { id: 'persons',       label: 'Noms / prénoms'    },
  { id: 'numbers',       label: 'Numéros'           },
  { id: 'addresses',     label: 'Adresses'          },
  { id: 'emails',        label: 'Emails'            },
  { id: 'gps',           label: 'GPS'               },
  { id: 'sensitive',     label: 'Données sensibles' },
  { id: 'organizations', label: 'Organisations'     },
];

// ── Sub-components ────────────────────────────────────────────

function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ProgressBar({ progress }) {
  return (
    <div className="w-full bg-cream-200 rounded-full h-1">
      <div
        className="bg-ink h-1 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, progress)}%` }}
      />
    </div>
  );
}

function HighlightedText({ text, mapping, excluded = new Set() }) {
  const highlights = useMemo(() => {
    const filtered = excluded.size
      ? mapping.filter(m => !excluded.has(m.original))
      : mapping;
    return buildHighlights(text, filtered);
  }, [text, mapping, excluded]);

  const parts = useMemo(() => {
    const result = [];
    let last = 0;
    for (const h of highlights) {
      if (h.start > last) result.push({ text: text.slice(last, h.start), h: null });
      result.push({ text: text.slice(h.start, h.end), h });
      last = h.end;
    }
    if (last < text.length) result.push({ text: text.slice(last), h: null });
    return result;
  }, [text, highlights]);

  return (
    <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-ink-700">
      {parts.map((p, i) => {
        if (!p.h) return <span key={i}>{p.text}</span>;
        const c = ENTITY_COLORS[p.h.type];
        return (
          <mark
            key={i}
            title={`→ ${p.h.anonymizedTo}`}
            className={`${c?.light || 'bg-cream-200 text-ink'} rounded px-0.5 cursor-help not-italic`}
          >
            {p.text}
          </mark>
        );
      })}
    </pre>
  );
}

function AnonymizedText({ text, mapping }) {
  const tokenMap = useMemo(() => {
    const m = {};
    for (const item of mapping) {
      if (item.anonymized) m[item.anonymized] = true;
    }
    return m;
  }, [mapping]);

  const tokens  = Object.keys(tokenMap).sort((a, b) => b.length - a.length);

  if (!tokens.length) {
    return <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-ink-700">{text}</pre>;
  }

  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts   = text.split(new RegExp(`(${escaped.join('|')})`, 'g'));

  return (
    <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-ink-700">
      {parts.map((p, i) =>
        tokenMap[p]
          ? <mark key={i} className="bg-transparent text-red-600 font-semibold not-italic">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </pre>
  );
}

function AnalysisPanel({ mapping, durationMs }) {
  const stats = useMemo(() => computeStats(mapping), [mapping]);
  const total = mapping.length;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Analyse du document</h3>
        <div className="flex items-center gap-3 text-[11px] text-ink-400">
          {durationMs && <span>{(durationMs / 1000).toFixed(1)}s</span>}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Confiance ~97%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(stats).map(([type, count]) => {
          const c = ENTITY_COLORS[type];
          return (
            <div key={type} className="flex items-center gap-2 p-2.5 rounded-lg bg-cream-50 border border-cream-200">
              <span className={`w-2 h-2 rounded-full ${c?.dot || 'bg-ink'} shrink-0`} />
              <span className="text-xs text-ink-600 flex-1 truncate">{c?.label || type}</span>
              <span className="text-sm font-bold text-ink">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-cream-200 flex items-center justify-between">
        <span className="text-xs text-ink-500">Total données personnelles détectées</span>
        <span className="text-sm font-bold text-ink">{total}</span>
      </div>
    </div>
  );
}

function ColorLegend({ types }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map(type => {
        const c = ENTITY_COLORS[type];
        if (!c) return null;
        return (
          <span key={type} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${c.light}`}>
            {c.label}
          </span>
        );
      })}
    </div>
  );
}

async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(it => it.str).join(' '));
    }
    return pages.join('\n\n');
  }
  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth');
    const result  = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  return await file.text();
}

function formatBytes(b) {
  if (b < 1024) return `${b} o`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / 1048576).toFixed(1)} Mo`;
}

// ── Multi-doc queue item ──────────────────────────────────────

function QueueItem({ item, onRemove, onExport }) {
  const statusConfig = {
    pending:   { label: 'En attente',  cls: 'bg-cream-200 text-ink-600' },
    analyzing: { label: 'En cours…',   cls: 'bg-blue-100 text-blue-700' },
    done:      { label: 'Terminé',     cls: 'bg-emerald-100 text-emerald-700' },
    error:     { label: 'Erreur',      cls: 'bg-red-100 text-red-700' },
  };
  const s = statusConfig[item.status];
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-cream-200">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{item.filename}</p>
        {item.result && (
          <p className="text-[11px] text-ink-400 mt-0.5">{item.result.mapping.length} entités · {(item.result.durationMs / 1000).toFixed(1)}s</p>
        )}
        {item.error && <p className="text-[11px] text-red-500 mt-0.5">{item.error}</p>}
      </div>
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
      {item.status === 'done' && (
        <button onClick={() => onExport(item)} className="text-xs btn-ghost px-2 py-1">Exporter</button>
      )}
      {item.status === 'pending' && (
        <button onClick={() => onRemove(item.id)} className="text-ink-300 hover:text-ink transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function Anonymizer() {
  // Workflow state
  const [step, setStep]         = useState('idle'); // idle | ready | analyzing | analyzed | done
  const [mode, setMode]         = useState('single'); // single | multi

  // Document
  const [text, setText]         = useState('');
  const [filename, setFilename] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [fileExt, setFileExt]   = useState('');

  // Categories
  const [categories, setCategories] = useState(['persons', 'numbers', 'addresses', 'emails']);

  // Result
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  // Manual validation
  const [manualMode, setManualMode]   = useState(false);
  const [excluded, setExcluded]       = useState(new Set());

  // View
  const [viewMode, setViewMode]       = useState('sidebyside'); // sidebyside | diff
  const [showExport, setShowExport]   = useState(false);
  const exportRef                     = useRef(null);

  // Fake progress
  const [progress, setProgress] = useState(0);
  const progressRef             = useRef(null);

  // Multi-doc
  const [queue, setQueue]             = useState([]);
  const [multiProcessing, setMultiProcessing] = useState(false);
  const multiDropRef                  = useRef(null);
  const [multiDragging, setMultiDragging] = useState(false);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function startProgress() {
    setProgress(0);
    progressRef.current = setInterval(() => {
      setProgress(p => p >= 88 ? 88 : p + Math.random() * 6 + 2);
    }, 250);
  }

  function stopProgress() {
    clearInterval(progressRef.current);
    setProgress(100);
  }

  // ── Single doc handlers ───────────────────────────────────

  const dropRef   = useRef(null);
  const inputRef  = useRef(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setError('');
    try {
      const extracted = await extractText(file);
      setText(extracted);
      setFilename(file.name);
      setFileSize(file.size);
      setFileExt(file.name.split('.').pop().toUpperCase());
      setResult(null);
      setExcluded(new Set());
      setStep('ready');
    } catch (err) {
      setError(`Impossible de lire ce fichier : ${err.message}`);
    }
  }

  function toggleCategory(id) {
    setCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  async function handleAnalyze() {
    if (!text.trim()) return;
    if (categories.length === 0) { setError('Sélectionnez au moins une catégorie'); return; }
    setError('');
    setStep('analyzing');
    startProgress();
    try {
      const data = await api.post('/anonymize', { text, filename, categories });
      stopProgress();
      setResult(data);
      setStep('analyzed');
    } catch (err) {
      stopProgress();
      setError(err.message);
      setStep('ready');
    }
  }

  function handleConfirm() {
    setStep('done');
  }

  function getFinalAnonymized() {
    if (!result) return '';
    if (!manualMode || excluded.size === 0) return result.anonymized;
    let out = result.anonymized;
    for (const item of result.mapping) {
      if (excluded.has(item.original) && item.anonymized) {
        out = out.replaceAll(item.anonymized, item.original);
      }
    }
    return out;
  }

  function reset() {
    setStep('idle');
    setText('');
    setFilename('');
    setResult(null);
    setError('');
    setExcluded(new Set());
    setManualMode(false);
    setProgress(0);
  }

  // ── Export ────────────────────────────────────────────────

  function triggerDownload(url, name) {
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTxt(textContent = null, name = null) {
    const content = textContent ?? getFinalAnonymized();
    const fname   = (name ?? filename).replace(/\.[^.]+$/, '_anonymise.txt');
    triggerDownload(URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })), fname);
  }

  async function exportDocx(textContent = null, name = null) {
    const content = textContent ?? getFinalAnonymized();
    const fname   = (name ?? filename).replace(/\.[^.]+$/, '_anonymise.docx');
    const { Document, Paragraph, TextRun, Packer } = await import('docx');
    const doc = new Document({
      sections: [{ children: content.split('\n').map(l => new Paragraph({ children: [new TextRun(l || ' ')] })) }],
    });
    triggerDownload(URL.createObjectURL(await Packer.toBlob(doc)), fname);
  }

  async function exportPdf(textContent = null, name = null) {
    const content = textContent ?? getFinalAnonymized();
    const fname   = (name ?? filename).replace(/\.[^.]+$/, '_anonymise.pdf');
    const { jsPDF } = await import('jspdf');
    const doc    = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 20;
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const textW  = pageW - 2 * margin;
    const lineH  = 6.5;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text((name ?? filename).replace(/\.[^.]+$/, ''), margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(130, 120, 110);
    doc.text(`Document anonymise  ·  ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, y);
    y += 4;
    doc.setDrawColor(220, 215, 205);
    doc.line(margin, y, pageW - margin, y);
    y += 9;
    doc.setTextColor(13, 12, 11);
    doc.setFontSize(11);

    for (const para of content.split('\n')) {
      if (para.trim() === '') { y += 3.5; continue; }
      for (const line of doc.splitTextToSize(para, textW)) {
        if (y + lineH > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += lineH;
      }
    }
    doc.save(fname);
  }

  // ── Multi-doc handlers ────────────────────────────────────

  async function handleMultiFiles(files) {
    const items = Array.from(files).map(file => ({
      id:       Math.random().toString(36).slice(2),
      file,
      filename: file.name,
      text:     null,
      status:   'pending',
      result:   null,
      error:    null,
    }));

    // Extract text for each
    const withText = await Promise.all(items.map(async item => {
      try {
        const t = await extractText(item.file);
        return { ...item, text: t };
      } catch (err) {
        return { ...item, status: 'error', error: err.message };
      }
    }));

    setQueue(prev => [...prev, ...withText]);
  }

  async function processQueue(currentQueue) {
    setMultiProcessing(true);
    let q = [...currentQueue];

    for (let i = 0; i < q.length; i++) {
      if (q[i].status !== 'pending') continue;
      q[i] = { ...q[i], status: 'analyzing' };
      setQueue([...q]);

      try {
        const data = await api.post('/anonymize', {
          text: q[i].text,
          filename: q[i].filename,
          categories,
        });
        q[i] = { ...q[i], status: 'done', result: data };
      } catch (err) {
        q[i] = { ...q[i], status: 'error', error: err.message };
      }
      setQueue([...q]);
    }
    setMultiProcessing(false);
  }

  // ── Render helpers ────────────────────────────────────────

  const detectedTypes = useMemo(
    () => result ? [...new Set(result.mapping.map(m => m.type))] : [],
    [result]
  );

  const finalAnonymized = step === 'done' ? getFinalAnonymized() : '';

  // ── RENDER ────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-cream-300 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-semibold text-ink">Anonymisation</h1>
            <p className="text-[11px] text-ink-400 mt-0.5">PDF · DOCX · TXT · CSV · et tous formats</p>
          </div>
          {/* Mode switch */}
          <div className="flex items-center gap-1 bg-cream-100 border border-cream-200 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => { setMode('single'); reset(); }}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${mode === 'single' ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink'}`}
            >
              Document unique
            </button>
            <button
              onClick={() => setMode('multi')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${mode === 'multi' ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink'}`}
            >
              Multi-documents
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Category pills */}
          {step !== 'idle' && mode === 'single' && (
            <div className="flex flex-wrap gap-1 mr-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                    categories.includes(cat.id)
                      ? 'bg-ink text-white border-ink'
                      : 'bg-white text-ink-400 border-ink-100 hover:border-ink-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {step === 'done' && (
            <>
              <button
                onClick={reset}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Nouveau
              </button>
              <div className="relative" ref={exportRef}>
                <button onClick={() => setShowExport(v => !v)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Exporter
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-cream-300 rounded-xl shadow-lg z-20 overflow-hidden min-w-[9rem]">
                    <button onClick={() => { exportPdf();  setShowExport(false); }} className="w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors">PDF</button>
                    <button onClick={() => { exportDocx(); setShowExport(false); }} className="w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors border-t border-cream-200">DOCX</button>
                    <button onClick={() => { exportTxt();  setShowExport(false); }} className="w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors border-t border-cream-200">TXT</button>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'analyzed' && (
            <button onClick={handleConfirm} className="btn-primary text-sm px-4 py-1.5">
              Anonymiser →
            </button>
          )}

          {step === 'ready' && (
            <button onClick={handleAnalyze} disabled={!text.trim() || categories.length === 0} className="btn-primary flex items-center gap-2 text-sm px-4 py-1.5">
              Analyser le document
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs shrink-0 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── MULTI MODE ──────────────────────────────────────── */}
      {mode === 'multi' && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                multiDragging ? 'border-ink bg-cream-100' : 'border-ink-100 hover:border-ink-300 hover:bg-cream-50'
              }`}
              onClick={() => multiDropRef.current?.click()}
              onDrop={e => { e.preventDefault(); setMultiDragging(false); handleMultiFiles(e.dataTransfer.files); }}
              onDragOver={e => { e.preventDefault(); setMultiDragging(true); }}
              onDragLeave={() => setMultiDragging(false)}
            >
              <svg className="w-8 h-8 text-ink-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-ink-500">Déposez plusieurs fichiers ou <span className="text-ink font-medium underline underline-offset-2">parcourir</span></p>
              <p className="text-xs text-ink-400 mt-1">PDF · DOCX · TXT · CSV</p>
              <input ref={multiDropRef} type="file" multiple className="hidden" onChange={e => handleMultiFiles(e.target.files)} />
            </div>

            {/* Category selection */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => toggleCategory(cat.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    categories.includes(cat.id) ? 'bg-ink text-white border-ink' : 'bg-white text-ink-400 border-ink-100 hover:border-ink-300'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Queue */}
            {queue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{queue.length} fichier{queue.length > 1 ? 's' : ''}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setQueue([])} className="text-xs text-ink-400 hover:text-red-500">Tout effacer</button>
                    <button
                      onClick={() => processQueue(queue)}
                      disabled={multiProcessing || queue.every(i => i.status !== 'pending')}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {multiProcessing ? <span className="flex items-center gap-1.5"><Spinner className="w-3 h-3" /> Traitement…</span> : 'Anonymiser tout'}
                    </button>
                  </div>
                </div>
                {queue.map(item => (
                  <QueueItem
                    key={item.id}
                    item={item}
                    onRemove={id => setQueue(q => q.filter(i => i.id !== id))}
                    onExport={it => exportPdf(it.result.anonymized, it.filename)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SINGLE MODE ─────────────────────────────────────── */}
      {mode === 'single' && (
        <>
          {/* STEP: IDLE — big import zone */}
          {step === 'idle' && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-lg">
                <div
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    dragging ? 'border-ink bg-cream-100 scale-[1.01]' : 'border-ink-100 hover:border-ink-300 hover:bg-cream-50'
                  }`}
                  onClick={() => inputRef.current?.click()}
                  onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                >
                  <div className="w-14 h-14 rounded-2xl bg-cream-100 border border-cream-200 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-7 h-7 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="font-display text-2xl text-ink mb-2">Déposez votre document</p>
                  <p className="text-sm text-ink-500 mb-5">ou</p>
                  <span className="btn-primary text-sm px-5 py-2">Choisir un fichier</span>
                  <p className="text-xs text-ink-400 mt-5">PDF · DOCX · TXT · CSV · MD · HTML · XML et plus</p>
                  <input ref={inputRef} type="file" className="hidden" onChange={e => handleFile(e.target.files[0])} />
                </div>
                {/* Category selection below import */}
                <div className="mt-5">
                  <p className="text-[11px] text-ink-500 uppercase tracking-wide mb-2">Catégories à anonymiser</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(cat => (
                      <button key={cat.id} onClick={() => toggleCategory(cat.id)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                          categories.includes(cat.id) ? 'bg-ink text-white border-ink' : 'bg-white text-ink-400 border-ink-100 hover:border-ink-300'
                        }`}>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP: READY — file loaded, show preview */}
          {step === 'ready' && (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* File info bar */}
                <div className="bg-cream-50 border-b border-cream-200 px-5 py-3 flex items-center gap-3 shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center text-white text-[10px] font-bold shrink-0">{fileExt}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{filename}</p>
                    <p className="text-[11px] text-ink-400">{formatBytes(fileSize)} · {text.length.toLocaleString('fr-FR')} caractères</p>
                  </div>
                  <button onClick={reset} className="text-xs text-ink-400 hover:text-ink transition-colors">Changer</button>
                </div>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  className="flex-1 p-5 resize-none outline-none text-sm text-ink-700 leading-relaxed bg-white font-sans placeholder-ink-300"
                  placeholder="Vous pouvez modifier le texte avant l'analyse…"
                />
              </div>
            </div>
          )}

          {/* STEP: ANALYZING — progress */}
          {step === 'analyzing' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center w-72">
                <div className="w-12 h-12 rounded-full bg-ink flex items-center justify-center mx-auto mb-5">
                  <Spinner className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm font-semibold text-ink mb-1">Analyse en cours…</p>
                <p className="text-xs text-ink-400 mb-6">{filename}</p>
                <ProgressBar progress={progress} />
                <p className="text-[11px] text-ink-400 mt-2">Détection des données personnelles via Mistral AI</p>
              </div>
            </div>
          )}

          {/* STEP: ANALYZED — show stats + highlighted original */}
          {step === 'analyzed' && result && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left: original with highlights */}
              <div className="flex-1 flex flex-col overflow-hidden border-r border-cream-300">
                <div className="px-4 py-2.5 border-b border-cream-200 bg-cream-50 flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Document original</span>
                  {detectedTypes.length > 0 && <ColorLegend types={detectedTypes} />}
                </div>
                <div className="flex-1 overflow-auto p-5">
                  <HighlightedText text={text} mapping={result.mapping} excluded={excluded} />
                </div>
              </div>

              {/* Right: analysis panel */}
              <div className="w-80 flex flex-col overflow-hidden bg-cream-50 shrink-0">
                <div className="px-4 py-2.5 border-b border-cream-200 flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Résultat d'analyse</span>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  <AnalysisPanel mapping={result.mapping} durationMs={result.durationMs} />

                  {/* Validation mode */}
                  <div className="card p-4">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div
                        onClick={() => { setManualMode(!manualMode); setExcluded(new Set()); }}
                        className={`w-8 h-4.5 rounded-full relative transition-colors ${manualMode ? 'bg-ink' : 'bg-cream-300'}`}
                        style={{ height: '18px', width: '32px' }}
                      >
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${manualMode ? 'left-[14px]' : 'left-0.5'}`} />
                      </div>
                      <span className="text-xs font-medium text-ink">Vérification manuelle</span>
                    </label>
                    {manualMode && (
                      <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                        {result.mapping.map((item, i) => {
                          const c = ENTITY_COLORS[item.type];
                          const isExcluded = excluded.has(item.original);
                          return (
                            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${isExcluded ? 'bg-cream-50 border-cream-200 opacity-50' : 'bg-white border-cream-200'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c?.dot || 'bg-ink'} shrink-0`} />
                              <span className="flex-1 font-mono text-ink truncate" title={item.original}>{item.original}</span>
                              <button
                                onClick={() => setExcluded(prev => {
                                  const next = new Set(prev);
                                  isExcluded ? next.delete(item.original) : next.add(item.original);
                                  return next;
                                })}
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                                  isExcluded
                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                    : 'text-red-500 hover:bg-red-50'
                                }`}
                              >
                                {isExcluded ? 'Inclure' : 'Ignorer'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP: DONE — comparison view */}
          {step === 'done' && result && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* View toggle + stats */}
              <div className="bg-cream-50 border-b border-cream-200 px-5 py-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-cream-100 border border-cream-200 rounded-lg p-0.5 text-xs">
                    <button onClick={() => setViewMode('sidebyside')}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'sidebyside' ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink'}`}>
                      Côte à côte
                    </button>
                    <button onClick={() => setViewMode('diff')}
                      className={`px-3 py-1.5 rounded-md font-medium transition-colors ${viewMode === 'diff' ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink'}`}>
                      Vue diff
                    </button>
                  </div>
                  {detectedTypes.length > 0 && <ColorLegend types={detectedTypes} />}
                </div>
                <span className="text-[11px] text-emerald-600 font-medium">
                  ✓ {result.mapping.length - excluded.size} entité{result.mapping.length - excluded.size !== 1 ? 's' : ''} anonymisée{result.mapping.length - excluded.size !== 1 ? 's' : ''}
                </span>
              </div>

              {viewMode === 'sidebyside' ? (
                <div className="flex-1 flex overflow-hidden">
                  <div className="flex-1 flex flex-col overflow-hidden border-r border-cream-300">
                    <div className="px-4 py-2 border-b border-cream-200 bg-cream-50 shrink-0">
                      <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Original</span>
                    </div>
                    <div className="flex-1 overflow-auto p-5">
                      <HighlightedText text={text} mapping={result.mapping} excluded={excluded} />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col overflow-hidden bg-cream-50">
                    <div className="px-4 py-2 border-b border-cream-200 shrink-0">
                      <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Anonymisé</span>
                    </div>
                    <div className="flex-1 overflow-auto p-5">
                      <AnonymizedText text={finalAnonymized} mapping={result.mapping} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-6">
                  <div className="max-w-3xl mx-auto card overflow-hidden">
                    <div className="px-5 py-3 border-b border-cream-200 bg-cream-50">
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-widest">Table de correspondance</p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-cream-100">
                          <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-wide px-5 py-2.5">Original</th>
                          <th className="px-3 py-2.5" />
                          <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-wide px-5 py-2.5">Anonymisé</th>
                          <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-wide px-5 py-2.5">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream-100">
                        {result.mapping
                          .filter(m => !excluded.has(m.original))
                          .map((item, i) => {
                            const c = ENTITY_COLORS[item.type];
                            return (
                              <tr key={i} className="hover:bg-cream-50 transition-colors">
                                <td className="px-5 py-2.5 text-xs font-mono text-ink-700">{item.original}</td>
                                <td className="px-3 py-2.5 text-ink-300">→</td>
                                <td className="px-5 py-2.5 text-xs font-mono font-semibold text-red-600">{item.anonymized}</td>
                                <td className="px-5 py-2.5">
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c?.light || 'bg-cream-200 text-ink-600'}`}>
                                    {c?.label || item.type}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
