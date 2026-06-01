import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api/client';
import FileImport from '../components/FileImport';
import MappingPanel from '../components/MappingPanel';

const CATEGORIES = [
  { id: 'persons',       label: 'Noms / prénoms'     },
  { id: 'numbers',       label: 'Numéros structurés'  },
  { id: 'addresses',     label: 'Adresses postales'   },
  { id: 'gps',           label: 'Coordonnées GPS'     },
  { id: 'emails',        label: 'Emails'              },
  { id: 'sensitive',     label: 'Données sensibles'   },
  { id: 'organizations', label: 'Organisations'       },
];

function RedText({ text, mapping }) {
  if (!text) return null;

  const tokenMap = {};
  for (const item of mapping) {
    if (item.anonymized) tokenMap[item.anonymized] = true;
  }
  const tokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length);

  if (tokens.length === 0) {
    return (
      <pre className="whitespace-pre-wrap text-sm text-ink-700 font-sans leading-relaxed">
        {text}
      </pre>
    );
  }

  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts   = text.split(new RegExp(`(${escaped.join('|')})`, 'g'));

  return (
    <pre className="whitespace-pre-wrap text-sm text-ink-700 font-sans leading-relaxed">
      {parts.map((part, i) =>
        tokenMap[part] ? (
          <mark key={i} className="bg-transparent text-red-600 font-semibold not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </pre>
  );
}

const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export default function Anonymizer() {
  const [text, setText]               = useState('');
  const [filename, setFilename]       = useState('document.txt');
  const [categories, setCategories]   = useState(['persons', 'numbers', 'addresses', 'emails']);
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [showMapping, setShowMapping] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [showExport, setShowExport]   = useState(false);
  const exportRef                     = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExport(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleCategory(id) {
    setCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  async function handleAnonymize() {
    if (!text.trim()) { setError('Veuillez saisir ou importer un texte'); return; }
    if (categories.length === 0) { setError('Sélectionnez au moins une catégorie'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/anonymize', { text, filename, categories });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function exportTxt() {
    if (!result) return;
    const blob = new Blob([result.anonymized], { type: 'text/plain;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), filename.replace(/\.[^.]+$/, '_anonymise.txt'));
  }

  async function exportDocx() {
    if (!result) return;
    const { Document, Paragraph, TextRun, Packer } = await import('docx');
    const doc = new Document({
      sections: [{
        children: result.anonymized.split('\n').map(line =>
          new Paragraph({ children: [new TextRun(line || ' ')] })
        )
      }]
    });
    const blob = await Packer.toBlob(doc);
    triggerDownload(URL.createObjectURL(blob), filename.replace(/\.[^.]+$/, '_anonymise.docx'));
  }

  async function exportPdf() {
    if (!result) return;
    const { jsPDF } = await import('jspdf');
    const doc    = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 20;
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const textW  = pageW - 2 * margin;
    const lineH  = 6.5;
    let y = margin;

    // Header — document name + date
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(filename.replace(/\.[^.]+$/, ''), margin, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(130, 120, 110);
    const dateStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    doc.text(`Document anonymise  ·  ${dateStr}`, margin, y);
    y += 4;
    doc.setDrawColor(220, 215, 205);
    doc.line(margin, y, pageW - margin, y);
    y += 9;

    // Body — split by newline first so empty lines create paragraph gaps
    doc.setTextColor(13, 12, 11);
    doc.setFontSize(11);

    for (const para of result.anonymized.split('\n')) {
      if (para.trim() === '') {
        y += 3.5;
        continue;
      }
      for (const line of doc.splitTextToSize(para, textW)) {
        if (y + lineH > pageH - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineH;
      }
    }

    doc.save(filename.replace(/\.[^.]+$/, '_anonymise.pdf'));
  }

  function triggerDownload(url, name) {
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-cream-300 px-6 py-3.5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-ink">Anonymiser un document</h1>
          <p className="text-[11px] text-ink-500 mt-0.5 tracking-wide">PDF · DOCX · TXT · CSV · et tous formats</p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <>
              <button
                onClick={() => setShowMapping(!showMapping)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs btn-ghost"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Correspondances ({result.mapping.length})
              </button>

              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setShowExport(v => !v)}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Exporter
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
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

          <button
            onClick={handleAnonymize}
            disabled={loading || !text.trim()}
            className="btn-primary flex items-center gap-2 px-4 py-1.5 text-sm"
          >
            {loading ? (
              <>
                <Spinner />
                Traitement…
              </>
            ) : 'Anonymiser'}
          </button>
        </div>
      </div>

      {/* Category filters */}
      <div className="bg-white border-b border-cream-300 px-6 py-2.5 flex flex-wrap gap-1.5 shrink-0">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => toggleCategory(cat.id)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              categories.includes(cat.id)
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-ink-500 border-ink-100 hover:border-ink-300 hover:text-ink-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs shrink-0">
          {error}
        </div>
      )}

      {/* Two-panel editor */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left – original */}
        <div className="flex-1 flex flex-col border-r border-cream-300 min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-cream-200 bg-cream-50 shrink-0">
            <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">
              Texte original
            </span>
            <div className="flex items-center gap-3">
              {filename !== 'document.txt' && (
                <span className="text-[11px] text-ink-400 truncate max-w-36">{filename}</span>
              )}
              <button
                onClick={() => setShowImport(!showImport)}
                className="flex items-center gap-1 text-xs text-ink-700 hover:text-ink transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importer
              </button>
            </div>
          </div>

          {showImport && (
            <div className="p-4 border-b border-cream-200 shrink-0 bg-white">
              <FileImport
                onFileLoad={t => { setText(t); setShowImport(false); setResult(null); }}
                onFilenameChange={setFilename}
              />
            </div>
          )}

          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setResult(null); }}
            className="flex-1 p-5 resize-none outline-none text-sm text-ink-700 leading-relaxed bg-white font-sans placeholder-ink-300"
            placeholder="Collez votre texte ici ou cliquez sur « Importer » pour charger un fichier…"
          />
        </div>

        {/* Right – anonymized */}
        <div className="flex-1 flex flex-col min-w-0 bg-cream-50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-cream-200 shrink-0">
            <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-widest">
              Texte anonymisé
            </span>
            {result && (
              <span className="text-[11px] text-red-500 font-medium">
                {result.mapping.length} entité{result.mapping.length !== 1 ? 's' : ''} masquée{result.mapping.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto p-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-ink-300">
                <Spinner className="w-7 h-7 mb-3" />
                <p className="text-sm">Anonymisation en cours…</p>
              </div>
            ) : result ? (
              <RedText text={result.anonymized} mapping={result.mapping} />
            ) : (
              <p className="text-sm text-ink-300 mt-2 leading-relaxed">
                Le résultat anonymisé apparaîtra ici après traitement.
              </p>
            )}
          </div>
        </div>
      </div>

      {showMapping && result && (
        <MappingPanel mapping={result.mapping} onClose={() => setShowMapping(false)} />
      )}
    </div>
  );
}
