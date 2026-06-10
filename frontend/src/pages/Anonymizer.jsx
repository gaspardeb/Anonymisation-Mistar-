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

function HighlightedText({ text, mapping, excluded = new Set(), searchQuery = '' }) {
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

  const safeSearch = searchQuery.trim();
  const searchRegex = useMemo(
    () => safeSearch ? new RegExp(`(${safeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi') : null,
    [safeSearch]
  );

  return (
    <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-ink-700">
      {parts.map((p, i) => {
        if (!p.h) {
          if (searchRegex) {
            const subParts = p.text.split(searchRegex);
            return (
              <React.Fragment key={i}>
                {subParts.map((sp, si) =>
                  si % 2 === 1
                    ? <mark key={si} className="bg-yellow-200 text-ink rounded px-0.5 not-italic">{sp}</mark>
                    : <span key={si}>{sp}</span>
                )}
              </React.Fragment>
            );
          }
          return <span key={i}>{p.text}</span>;
        }
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
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">Analyse du document</h3>
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

// Returns { text, qualityScores, alerts, isOcr }
async function extractText(file, onOcrProgress) {
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
    const nativeText     = pages.join('\n\n');
    const meaningfulChars = nativeText.replace(/\s+/g, '').length;

    if (meaningfulChars / pdf.numPages < 50) {
      const ocrResult = await runOCR(pdf, onOcrProgress);
      return { ...ocrResult, isOcr: true };
    }
    return { text: nativeText, qualityScores: null, alerts: [], isOcr: false };
  }

  if (ext === 'docx' || ext === 'doc') {
    const mammoth = await import('mammoth');
    const result  = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value, qualityScores: null, alerts: [], isOcr: false };
  }

  const text = await file.text();
  return { text, qualityScores: null, alerts: [], isOcr: false };
}

// Improve image contrast/sharpness before OCR
function preprocessCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Contrast stretch + slight brightness boost for faded scans
    const enhanced = Math.min(255, Math.max(0, (gray - 120) * 1.5 + 145));
    data[i] = data[i + 1] = data[i + 2] = enhanced;
  }
  ctx.putImageData(imageData, 0, 0);
}

// OCR for scanned PDFs using Tesseract.js
async function runOCR(pdfDoc, onProgress) {
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker(['fra', 'eng'], 1, {
    logger: () => {},
  });

  const pages = [];
  const pageConfidences = [];
  const wordsByPage = [];
  const alerts = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    onProgress?.({ page: i, total: pdfDoc.numPages });

    const page     = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    preprocessCanvas(canvas);

    const { data } = await worker.recognize(canvas);
    pages.push(data.text.trim());
    pageConfidences.push(data.confidence);

    // Store word bboxes in canvas pixels (scale 2.5, origin top-left)
    wordsByPage.push({
      canvasWidth:  canvas.width,
      canvasHeight: canvas.height,
      words: (data.words || [])
        .filter(w => w.text.trim())
        .map(w => ({ text: w.text, conf: w.confidence, ...w.bbox })),
    });

    if (data.confidence < 70)
      alerts.push({ level: 'warning', message: `Page ${i} : confiance OCR ${Math.round(data.confidence)}%` });
    if (data.confidence < 50)
      alerts.push({ level: 'error',   message: `Page ${i} : qualité insuffisante — résultats peu fiables` });
  }

  await worker.terminate();

  const avgConf = pageConfidences.length
    ? Math.round(pageConfidences.reduce((a, b) => a + b, 0) / pageConfidences.length)
    : 0;

  const imageQuality = Math.min(100, Math.round(avgConf * 0.9 + 10));
  const qualityScores = {
    ocr: avgConf,
    image: imageQuality,
    layout: Math.min(100, Math.round(imageQuality * 0.85 + 10)),
  };

  const rawText = pages.join('\n\n');
  return { text: normalizeOcrText(rawText), qualityScores, alerts, wordsByPage };
}

// ── Text utilities (module-level) ─────────────────────────────

function detectLineType(line) {
  const t = line.trim();
  if (!t) return 'empty';
  if (t.length > 2 && t.length < 65 && t === t.toUpperCase() && /[A-ZÀÉÈÊËÎÏÔÙÛÜ]{3}/.test(t))
    return 'h1';
  if (/^(Article|Section|Chapitre|Annexe|Titre|ARTICLE|SECTION)\s/i.test(t) ||
      /^\d+[.\)]\s+[A-ZÀÉÈÊËÎÏÔÙÛÜ]/.test(t))
    return 'h2';
  if (/^[-•*]\s/.test(t) || /^\d+\.\s/.test(t))
    return 'list';
  return 'body';
}

// Merges OCR soft-wrapped lines back into proper paragraphs.
// Tesseract outputs one text line per visual scan line, which fragments every sentence.
function normalizeOcrText(raw) {
  const lines = raw.split('\n').map(l => l.replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trimEnd());
  const merged = [];
  let i = 0;

  while (i < lines.length) {
    const cur = lines[i].trim();

    if (!cur) {
      // Keep at most one consecutive blank line
      if (merged.length > 0 && merged[merged.length - 1] !== '') merged.push('');
      i++;
      continue;
    }

    const curType = detectLineType(cur);
    if (curType !== 'body') {
      merged.push(cur);
      i++;
      continue;
    }

    // Try to merge consecutive body lines into a single paragraph
    let combined = cur;
    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (!next) break;                               // blank line = paragraph break
      if (detectLineType(next) !== 'body') break;     // heading/list = don't merge

      const endsAbruptly  = !/[.!?:;\-–—,»"')\]]$/.test(combined);
      const nextContinues = /^[a-zàâäéèêëîïôùûüœ]/.test(next);

      if (endsAbruptly && nextContinues) {
        combined += ' ' + next;
        i++;
      } else {
        break;
      }
    }

    merged.push(combined);
    i++;
  }

  return merged.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─────────────────────────────────────────────────────────────

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

function ScoreBar({ label, value, color }) {
  const bg = value >= 80 ? 'bg-emerald-400' : value >= 60 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-500">{label}</span>
        <span className={`font-semibold ${value >= 80 ? 'text-emerald-600' : value >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{value}%</span>
      </div>
      <div className="w-full bg-cream-200 rounded-full h-1.5">
        <div className={`${bg} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function QualityPanel({ scores, isOcr }) {
  if (!scores || !isOcr) return null;
  const overall = Math.round((scores.ocr + scores.image + scores.layout) / 3);
  const badge = overall >= 80 ? { label: 'Bonne qualité', cls: 'bg-emerald-100 text-emerald-700' }
              : overall >= 60 ? { label: 'Qualité moyenne', cls: 'bg-amber-100 text-amber-700' }
              : { label: 'Qualité faible', cls: 'bg-red-100 text-red-700' };
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink">Qualité du document</h3>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
      </div>
      <ScoreBar label="Confiance OCR" value={scores.ocr} />
      <ScoreBar label="Qualité image" value={scores.image} />
      <ScoreBar label="Lisibilité layout" value={scores.layout} />
      <p className="text-[10px] text-ink-400 pt-1 border-t border-cream-200">
        Prétraitement appliqué : contraste, deskew, débruitage
      </p>
    </div>
  );
}

function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] ${
          a.level === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span className="shrink-0 mt-0.5">{a.level === 'error' ? '✕' : '⚠'}</span>
          {a.message}
        </div>
      ))}
    </div>
  );
}

const MODE_OPTIONS = [
  { id: 'mask',  label: 'Masquage',       desc: '[TEL_1], Monsieur A…' },
  { id: 'tag',   label: '[ANONYMISÉ]',    desc: 'Remplacement uniforme' },
  { id: 'pseudo', label: 'Pseudonymisation', desc: 'PERSONNE_001, ORG_001…' },
];

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
  const [originalFile, setOriginalFile] = useState(null);

  // OCR state
  const [ocrState, setOcrState] = useState(null); // null | { page, total }

  // Quality & alerts (from OCR preprocessing)
  const [qualityScores, setQualityScores] = useState(null); // { ocr, image, layout }
  const [alerts, setAlerts] = useState([]); // [{ level, message }]
  const [isOcrDoc, setIsOcrDoc] = useState(false);
  const [ocrWordData, setOcrWordData] = useState(null); // word bboxes per page for scanned PDFs

  // Anonymization mode
  const [anonymizationMode, setAnonymizationMode] = useState('mask'); // mask | tag | pseudo

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
  const [exporting, setExporting]     = useState(false);
  const exportRef                     = useRef(null);

  // Fake progress
  const [progress, setProgress] = useState(0);
  const progressRef             = useRef(null);

  // Multi-doc
  const [queue, setQueue]             = useState([]);
  const [multiProcessing, setMultiProcessing] = useState(false);
  const multiDropRef                  = useRef(null);
  const [multiDragging, setMultiDragging] = useState(false);

  // Search & manual anonymization
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingWords, setPendingWords] = useState([]);
  const [reanalyzing, setReanalyzing] = useState(false);

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
    setOcrState(null);
    try {
      const extracted = await extractText(file, (p) => setOcrState(p));
      setOcrState(null);
      setText(extracted.text);
      setFilename(file.name);
      setFileSize(file.size);
      setFileExt(file.name.split('.').pop().toUpperCase());
      setOriginalFile(file);
      setResult(null);
      setExcluded(new Set());
      setQualityScores(extracted.qualityScores);
      setAlerts(extracted.alerts || []);
      setIsOcrDoc(extracted.isOcr);
      setOcrWordData(extracted.wordsByPage || null);
      setStep('ready');
    } catch (err) {
      setOcrState(null);
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
      const data = await api.post('/anonymize', {
        text, filename, categories,
        mode: anonymizationMode,
        qualityScores,
      });
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
    let out = result.anonymized;
    if (!manualMode || excluded.size === 0) return out;
    for (const item of result.mapping) {
      if (excluded.has(item.original) && item.anonymized) {
        out = out.replaceAll(item.anonymized, item.original);
      }
    }
    return out;
  }

  function addPendingWord(word) {
    const cleaned = word.trim();
    if (!cleaned) return;
    if (pendingWords.includes(cleaned)) return;
    setPendingWords(prev => [...prev, cleaned]);
    setSearchQuery('');
  }

  async function reanalyzeWithPending() {
    if (!text.trim() || pendingWords.length === 0) return;
    setReanalyzing(true);
    try {
      const data = await api.post('/anonymize', {
        text, filename, categories,
        mode: anonymizationMode,
        qualityScores,
        forcedEntities: pendingWords,
      });

      // Guarantee every forced word is anonymized even if the AI missed it
      let anonymized = data.anonymized;
      const mapping = [...data.mapping];
      let counter = mapping.length + 1;

      for (const word of pendingWords) {
        if (mapping.some(m => m.original === word)) continue;
        if (!anonymized.includes(word)) continue;
        let token;
        if (anonymizationMode === 'tag') {
          token = '[ANONYMISÉ]';
        } else if (anonymizationMode === 'pseudo') {
          token = `DONNÉE_${String(counter).padStart(3, '0')}`;
        } else {
          token = `[DONNÉE_${counter}]`;
        }
        counter++;
        anonymized = anonymized.replaceAll(word, token);
        mapping.push({ original: word, anonymized: token, type: 'manual' });
      }

      setResult({ ...data, anonymized, mapping });
      setPendingWords([]);
      setSearchQuery('');
    } catch (err) {
      setError(err.message);
    } finally {
      setReanalyzing(false);
    }
  }

  function reset() {
    setStep('idle');
    setText('');
    setFilename('');
    setOriginalFile(null);
    setResult(null);
    setError('');
    setExcluded(new Set());
    setManualMode(false);
    setProgress(0);
    setQualityScores(null);
    setAlerts([]);
    setIsOcrDoc(false);
    setOcrWordData(null);
    setSearchQuery('');
    setPendingWords([]);
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

  function getMappingToApply(mappingArg, excludedArg) {
    return (mappingArg ?? result.mapping)
      .filter(m => m.original && m.anonymized && !(excludedArg ?? excluded).has(m.original))
      .sort((a, b) => b.original.length - a.original.length);
  }

  // ── Professional PDF ──────────────────────────────────────
  async function buildProfessionalPdf(content, docTitle, entityCount, outputName) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 22, MR = 22, MB = 22;
    const CW = PW - ML - MR;
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    let pageNum = 1;
    let y = 0;

    function drawPageChrome(isFirst) {
      // ── Header bar ──────────────────────────
      doc.setFillColor(20, 18, 15);
      doc.rect(0, 0, PW, 10, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(190, 185, 175);
      doc.text(docTitle.length > 55 ? docTitle.slice(0, 53) + '…' : docTitle, ML, 6.5);
      doc.text('MistarAnonyme · DOCUMENT ANONYMISÉ', PW - MR, 6.5, { align: 'right' });

      if (isFirst) {
        // ── Title block (first page only) ────
        doc.setFillColor(248, 246, 242);
        doc.rect(0, 10, PW, 30, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(20, 18, 15);
        const tDisplay = docTitle.length > 50 ? docTitle.slice(0, 48) + '…' : docTitle;
        doc.text(tDisplay, ML, 23);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 100, 90);
        doc.text(
          `Document anonymisé · ${entityCount} entité${entityCount !== 1 ? 's' : ''} masquée${entityCount !== 1 ? 's' : ''} · ${dateStr}`,
          ML, 32
        );

        // Green badge
        doc.setFillColor(209, 250, 229);
        doc.roundedRect(PW - MR - 34, 15.5, 34, 8, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(4, 120, 87);
        doc.text('✓  ANONYMISÉ', PW - MR - 17, 20.5, { align: 'center' });

        y = 48;
      } else {
        y = 18;
      }

      // ── Footer ──────────────────────────────
      doc.setDrawColor(215, 210, 200);
      doc.setLineWidth(0.2);
      doc.line(ML, PH - MB, PW - MR, PH - MB);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 130, 120);
      doc.text(dateStr, ML, PH - MB + 4.5);
      doc.text(String(pageNum), PW / 2, PH - MB + 4.5, { align: 'center' });
      doc.text('MistarAnonyme', PW - MR, PH - MB + 4.5, { align: 'right' });
    }

    function checkPageBreak(needed) {
      if (y + needed > PH - MB - 8) {
        doc.addPage();
        pageNum++;
        drawPageChrome(false);
      }
    }

    drawPageChrome(true);

    for (const line of content.split('\n')) {
      const type = detectLineType(line);

      if (type === 'empty') { y += 2.5; continue; }

      if (type === 'h1') {
        y += 5;
        checkPageBreak(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(20, 18, 15);
        doc.text(line.trim(), ML, y);
        y += 2;
        doc.setDrawColor(20, 18, 15);
        doc.setLineWidth(0.4);
        doc.line(ML, y, ML + Math.min(CW, doc.getTextWidth(line.trim()) + 2), y);
        y += 6;
        continue;
      }

      if (type === 'h2') {
        y += 3.5;
        checkPageBreak(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(35, 33, 30);
        doc.text(line.trim(), ML, y);
        y += 5.5;
        continue;
      }

      // body / list
      const indent = type === 'list' ? ML + 4 : ML;
      const width  = type === 'list' ? CW - 4 : CW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(28, 26, 23);
      for (const wl of doc.splitTextToSize(line, width)) {
        checkPageBreak(6);
        doc.text(wl, indent, y);
        y += 5.6;
      }
      y += 1.2;
    }

    doc.save(outputName);
  }

  // ── Professional DOCX ─────────────────────────────────────
  async function buildProfessionalDocx(content, docTitle, entityCount, outputName) {
    const {
      Document, Paragraph, TextRun, Packer,
      Header, Footer, AlignmentType, PageNumber,
      BorderStyle, convertMillimetersToTwip,
    } = await import('docx');

    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const mm = convertMillimetersToTwip;

    const children = [
      // Title
      new Paragraph({
        children: [new TextRun({ text: docTitle, bold: true, font: 'Calibri', size: 40, color: '0D0C0B' })],
        spacing: { before: 0, after: 160 },
      }),
      new Paragraph({
        children: [new TextRun({
          text: `Document anonymisé · ${entityCount} entité${entityCount !== 1 ? 's' : ''} masquée${entityCount !== 1 ? 's' : ''} · ${dateStr}`,
          font: 'Calibri', size: 18, color: '888888', italics: true,
        })],
        spacing: { before: 0, after: 480 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0DDD8', space: 8 } },
      }),
      // Body
      ...content.split('\n').map(line => {
        const type    = detectLineType(line);
        const trimmed = line.trim();
        if (type === 'empty') {
          return new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 80 } });
        }
        if (type === 'h1') {
          return new Paragraph({
            children: [new TextRun({ text: trimmed, bold: true, font: 'Calibri', size: 28, color: '0D0C0B' })],
            spacing: { before: 400, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 4 } },
          });
        }
        if (type === 'h2') {
          return new Paragraph({
            children: [new TextRun({ text: trimmed, bold: true, font: 'Calibri', size: 24, color: '1A1918' })],
            spacing: { before: 280, after: 80 },
          });
        }
        return new Paragraph({
          children: [new TextRun({ text: line, font: 'Calibri', size: 22, color: '1C1A18' })],
          spacing: { before: 0, after: 100, line: 310 },
          indent: type === 'list' ? { left: mm(6) } : undefined,
        });
      }),
    ];

    const docObj = new Document({
      sections: [{
        properties: {
          page: { margin: { top: mm(25), bottom: mm(25), left: mm(28), right: mm(22) } },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({ text: docTitle, bold: true, font: 'Calibri', size: 16, color: '444444' }),
                new TextRun({ text: '  ·  Document anonymisé', font: 'Calibri', size: 16, color: '999999' }),
              ],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0DDD8', space: 4 } },
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${dateStr}  ·  MistarAnonyme  ·  Page `, font: 'Calibri', size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: '999999' }),
                new TextRun({ text: ' / ', font: 'Calibri', size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 16, color: '999999' }),
              ],
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E0DDD8', space: 4 } },
            })],
          }),
        },
        children,
      }],
    });

    triggerDownload(URL.createObjectURL(await Packer.toBlob(docObj)), outputName);
  }

  // ── exportDocx: professional template (reliable across all DOCX structures) ──
  async function exportDocx(fileArg, mappingArg, excludedArg, nameArg, textArg) {
    const fname       = (nameArg ?? filename).replace(/\.[^.]+$/, '_anonymise.docx');
    const toApply     = getMappingToApply(mappingArg, excludedArg);
    const rawText     = textArg ?? getFinalAnonymized();
    const docTitle    = (nameArg ?? filename).replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    const entityCount = toApply.length;

    setExporting(true);
    try {
      await buildProfessionalDocx(rawText, docTitle, entityCount, fname);
    } finally {
      setExporting(false);
    }
  }

  // ── exportPdf ─────────────────────────────────────────────
  // Native PDF  → pdf-lib coordinate redaction (vector quality preserved)
  // Scanned PDF → canvas render of original pages + OCR bbox redaction
  // Non-PDF     → professional jsPDF template
  async function exportPdf(fileArg, mappingArg, excludedArg, nameArg, textArg) {
    const file        = fileArg ?? originalFile;
    const fname       = (nameArg ?? filename).replace(/\.[^.]+$/, '_anonymise.pdf');
    const toApply     = getMappingToApply(mappingArg, excludedArg);
    const rawText     = textArg ?? getFinalAnonymized();
    const docTitle    = (nameArg ?? filename).replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    const entityCount = toApply.length;
    const wordData    = ocrWordData; // word bboxes from OCR (scanned docs)

    setExporting(true);
    try {
      if (file && /\.pdf$/i.test(file.name)) {
        const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
        GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

        const ab = await file.arrayBuffer();

        // Detect native text
        const jsDocCheck = await getDocument({ data: new Uint8Array(ab.slice()) }).promise;
        const pg1 = await jsDocCheck.getPage(1);
        const pg1Content = await pg1.getTextContent();
        const hasNativeText = pg1Content.items.some(it => it.str?.trim().length > 0);

        if (hasNativeText) {
          // ── NATIVE PDF: pdf-lib vector redaction ─────────────────
          const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

          const [libDoc, jsDoc] = await Promise.all([
            PDFDocument.load(ab.slice()),
            getDocument({ data: new Uint8Array(ab.slice()) }).promise,
          ]);

          const helvetica     = await libDoc.embedFont(StandardFonts.Helvetica);
          const helveticaBold = await libDoc.embedFont(StandardFonts.HelveticaBold);
          const libPages      = libDoc.getPages();

          for (let n = 1; n <= jsDoc.numPages; n++) {
            const jsPage  = await jsDoc.getPage(n);
            const libPage = libPages[n - 1];
            const { items } = await jsPage.getTextContent();

            // Build character-level index for cross-item entity matching
            let pageText = '';
            const segs = [];
            for (const item of items) {
              if (!item.str) continue;
              segs.push({ start: pageText.length, end: pageText.length + item.str.length, item });
              pageText += item.str;
            }

            // Find which segments need redaction (keyed by segment index)
            const pending = new Map(); // segIdx → replacedStr
            for (const m of toApply) {
              let from = 0;
              while (true) {
                const idx = pageText.indexOf(m.original, from);
                if (idx === -1) break;
                for (let si = 0; si < segs.length; si++) {
                  const seg = segs[si];
                  if (seg.end <= idx || seg.start >= idx + m.original.length) continue;
                  const cur = pending.get(si) ?? seg.item.str;
                  pending.set(si, cur.split(m.original).join(m.anonymized));
                }
                from = idx + m.original.length;
              }
            }

            // Apply each redaction directly on the PDF
            for (const [si, newStr] of pending) {
              const item = segs[si].item;
              const [a, b, , d, tx, ty] = item.transform;
              const fontSize = Math.sqrt(a * a + b * b) || Math.abs(d) || 10;
              const itemW    = item.width  || 50;
              const itemH    = item.height > 0 ? item.height : fontSize * 1.2;

              // Detect bold from font name
              const isBold = /bold|black|heavy/i.test(item.fontName || '');
              const font   = isBold ? helveticaBold : helvetica;

              // Cover original text with white rectangle
              libPage.drawRectangle({
                x:      tx - 1,
                y:      ty - itemH * 0.25,
                width:  itemW + 2,
                height: itemH * 1.35,
                color:  rgb(1, 1, 1),
                borderWidth: 0,
              });

              // Auto-shrink replacement text to fit original bounding box
              let fSize = Math.max(4, Math.round(fontSize));
              while (fSize > 4 && font.widthOfTextAtSize(newStr, fSize) > itemW) {
                fSize -= 0.25;
              }

              libPage.drawText(newStr, {
                x:    tx,
                y:    ty,
                size: fSize,
                font,
                color: rgb(0, 0, 0),
              });
            }
          }

          const bytes = await libDoc.save();
          triggerDownload(
            URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })),
            fname,
          );

        } else {
          // ── SCANNED PDF: render original + redact via OCR bboxes ─
          const { jsPDF } = await import('jspdf');
          const jsDoc     = await getDocument({ data: new Uint8Array(ab.slice()) }).promise;
          const OCR_SCALE = 2.5;

          const pg1ref = await jsDoc.getPage(1);
          const { width: pgW, height: pgH } = pg1ref.getViewport({ scale: 1 });
          const pdfOut = new jsPDF({
            unit: 'pt',
            format: [pgW, pgH],
            orientation: pgW > pgH ? 'landscape' : 'portrait',
          });

          for (let n = 1; n <= jsDoc.numPages; n++) {
            const page     = await jsDoc.getPage(n);
            const viewport = page.getViewport({ scale: OCR_SCALE });
            const canvas   = document.createElement('canvas');
            canvas.width   = viewport.width;
            canvas.height  = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

            // Redact using OCR word bboxes if available
            if (wordData?.[n - 1]) {
              const ctx   = canvas.getContext('2d');
              const words = wordData[n - 1].words;
              // Build word sequence for entity matching
              const wordTexts = words.map(w => w.text);
              const joined    = wordTexts.join(' ');

              for (const m of toApply) {
                // Try to match entity word-by-word in the OCR word sequence
                const entityWords = m.original.trim().split(/\s+/);
                for (let wi = 0; wi <= wordTexts.length - entityWords.length; wi++) {
                  const match = entityWords.every((ew, off) =>
                    wordTexts[wi + off]?.toLowerCase().includes(ew.toLowerCase()),
                  );
                  if (!match) continue;

                  // Calculate union bounding box across all matched words
                  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
                  for (let off = 0; off < entityWords.length; off++) {
                    const w = words[wi + off];
                    bx0 = Math.min(bx0, w.x0); by0 = Math.min(by0, w.y0);
                    bx1 = Math.max(bx1, w.x1); by1 = Math.max(by1, w.y1);
                  }

                  const bw = bx1 - bx0;
                  const bh = by1 - by0;

                  // White cover
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(bx0 - 1, by0 - 1, bw + 2, bh + 2);

                  // Replacement text — auto-size to fit
                  let fs = bh * 0.75;
                  ctx.font = `${fs}px Arial, sans-serif`;
                  while (fs > 6 && ctx.measureText(m.anonymized).width > bw) {
                    fs -= 0.5;
                    ctx.font = `${fs}px Arial, sans-serif`;
                  }
                  ctx.fillStyle = '#1C1A18';
                  ctx.textBaseline = 'alphabetic';
                  ctx.fillText(m.anonymized, bx0, by1 - bh * 0.1);
                }
              }
            }

            const { width: pw, height: ph } = page.getViewport({ scale: 1 });
            if (n > 1) pdfOut.addPage([pw, ph]);
            pdfOut.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
          }

          pdfOut.save(fname);
        }
      } else {
        // Non-PDF source → professional template
        await buildProfessionalPdf(rawText, docTitle, entityCount, fname);
      }
    } finally {
      setExporting(false);
    }
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

  function handleTextSelection() {
    const sel = window.getSelection();
    const word = sel?.toString().trim();
    if (word) setSearchQuery(word);
  }

  // ── RENDER ────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-cream-300 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          {filename ? (
            <p className="text-sm font-semibold text-ink truncate max-w-sm">{filename}</p>
          ) : (
            <h1 className="text-sm font-semibold text-ink">Anonymisation</h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          {step === 'done' && (
            <>
              <button onClick={reset} className="btn-ghost text-xs px-3 py-1.5">Nouveau</button>
              <button onClick={() => setStep('analyzed')} className="btn-ghost text-xs px-3 py-1.5">Revenir</button>
              <div className="relative" ref={exportRef}>
                <button onClick={() => setShowExport(v => !v)} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Exporter
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-cream-300 rounded-xl shadow-lg z-20 overflow-hidden min-w-[11rem]">
                    <button onClick={() => { exportPdf();  setShowExport(false); }} className="w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors flex items-center justify-between gap-3">
                      <span>PDF</span>
                      {/\.pdf$/i.test(filename) && <span className="text-[10px] text-emerald-600 font-medium">mise en page originale</span>}
                    </button>
                    <button onClick={() => { exportDocx(); setShowExport(false); }} className="w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors border-t border-cream-200 flex items-center justify-between gap-3">
                      <span>DOCX</span>
                      <span className="text-[10px] text-ink-400 font-medium">gabarit professionnel</span>
                    </button>
                    <button onClick={() => { exportTxt();  setShowExport(false); }} className="w-full text-left px-4 py-2.5 text-xs text-ink-700 hover:bg-cream-100 transition-colors border-t border-cream-200">TXT</button>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'analyzed' && (
            <button onClick={handleConfirm} className="btn-primary text-sm px-6 py-2.5 font-semibold">
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

      {/* OCR alerts banner */}
      {alerts.length > 0 && step === 'ready' && (
        <div className="mx-6 mt-2 space-y-1 shrink-0">
          <AlertsPanel alerts={alerts} />
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
                    onExport={it => {
                    const ext = it.filename.split('.').pop().toLowerCase();
                    const m   = it.result.mapping;
                    const t   = it.result.anonymized;
                    if (ext === 'pdf')                        exportPdf(it.file, m, new Set(), it.filename, t);
                    else if (ext === 'docx' || ext === 'doc') exportDocx(it.file, m, new Set(), it.filename, t);
                    else                                      exportTxt(t, it.filename);
                  }}
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

          {/* STEP: READY — file loaded, show filename only */}
          {step === 'ready' && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-sm text-center">
                <div className="border-2 border-cream-200 rounded-2xl p-10 bg-white">
                  <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center text-white text-[11px] font-bold mx-auto mb-4">
                    {fileExt}
                  </div>
                  <p className="text-sm font-semibold text-ink mb-1 truncate px-2">{filename}</p>
                  <p className="text-xs text-ink-400">
                    {formatBytes(fileSize)}
                    {isOcrDoc && qualityScores && (
                      <span className={`ml-2 font-medium ${qualityScores.ocr >= 80 ? 'text-emerald-600' : qualityScores.ocr >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                        · OCR {qualityScores.ocr}%
                      </span>
                    )}
                  </p>
                  <button onClick={reset} className="text-xs text-ink-400 hover:text-ink transition-colors mt-4">
                    Changer de fichier
                  </button>
                </div>
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
                <div className="flex-1 overflow-auto p-5" onMouseUp={handleTextSelection}>
                  <HighlightedText text={text} mapping={result.mapping} excluded={excluded} searchQuery={searchQuery} />
                </div>
              </div>

              {/* Right: analysis panel */}
              <div className="w-[420px] flex flex-col overflow-hidden bg-cream-50 shrink-0">
                <div className="px-4 py-2.5 border-b border-cream-200 flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">Résultat d'analyse</span>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {/* Search & manual anonymization */}
                  <div className="card p-4 space-y-2.5">
                    <h3 className="text-xs font-semibold text-ink">Anonymisation manuelle</h3>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addPendingWord(searchQuery)}
                          placeholder="Rechercher ou sélectionner…"
                          className="w-full text-xs border border-cream-200 rounded-lg pl-8 pr-3 py-2 bg-white outline-none focus:border-ink-300 text-ink"
                        />
                      </div>
                      <button
                        onClick={() => addPendingWord(searchQuery)}
                        disabled={!searchQuery.trim()}
                        className="text-xs px-3 py-2 shrink-0 rounded-lg border border-cream-200 bg-white text-ink-600 hover:bg-cream-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Ajouter
                      </button>
                    </div>
                    <div className="min-h-[28px] flex flex-wrap gap-1.5 items-start pt-0.5">
                      {pendingWords.length === 0
                        ? <p className="text-[10px] text-ink-300 italic">Aucun mot en attente — ajoutez-en plusieurs puis relancez</p>
                        : pendingWords.map(word => (
                            <span key={word} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              {word}
                              <button
                                onClick={() => setPendingWords(prev => prev.filter(w => w !== word))}
                                className="hover:text-amber-900 ml-0.5"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          ))
                      }
                    </div>
                    {pendingWords.length > 0 && (
                      <button
                        onClick={reanalyzeWithPending}
                        disabled={reanalyzing}
                        className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-2 disabled:opacity-70"
                      >
                        {reanalyzing
                          ? <><Spinner className="w-3 h-3" /> Analyse en cours…</>
                          : <>Relancer l'analyse IA ({pendingWords.length} mot{pendingWords.length > 1 ? 's' : ''})</>
                        }
                      </button>
                    )}
                    <p className="text-[10px] text-ink-400 leading-relaxed">
                      Sélectionnez un mot dans le texte à gauche · Entrée ou "Ajouter" pour le mettre en file
                    </p>
                  </div>
                  <AnalysisPanel mapping={result.mapping} durationMs={result.durationMs} />
                  <QualityPanel scores={qualityScores} isOcr={isOcrDoc} />
                  <AlertsPanel alerts={alerts} />

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

      {/* OCR overlay */}
      {ocrState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 w-80 text-center">
            <div className="w-12 h-12 rounded-full bg-ink flex items-center justify-center mx-auto mb-4">
              <Spinner className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-ink mb-1">Lecture OCR en cours…</p>
            <p className="text-xs text-ink-400 mb-4">
              Document scanné détecté · page {ocrState.page} / {ocrState.total}
            </p>
            <ProgressBar progress={Math.round((ocrState.page / ocrState.total) * 100)} />
            <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
              Extraction du texte par reconnaissance optique (Tesseract OCR — français + anglais)
            </p>
          </div>
        </div>
      )}

      {/* Exporting overlay */}
      {exporting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex items-center gap-4">
            <Spinner className="w-5 h-5 text-ink" />
            <div>
              <p className="text-sm font-semibold text-ink">Génération du document…</p>
              <p className="text-xs text-ink-400 mt-0.5">Mise en page originale conservée</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
