import React, { useRef, useState } from 'react';

async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n\n');
  }

  if (ext === 'docx' || ext === 'doc') {
    const mammoth     = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result      = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  return await file.text();
}

export default function FileImport({ onFileLoad, onFilenameChange }) {
  const inputRef             = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const text = await extractText(file);
      onFilenameChange(file.name);
      onFileLoad(text);
    } catch (err) {
      setError(`Impossible de lire ce fichier : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-ink bg-cream-100'
            : 'border-ink-100 hover:border-ink-300 hover:bg-cream-50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-7 h-7 text-ink-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-xs text-ink-500">Extraction du texte…</p>
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 text-ink-300 mx-auto mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-ink-500">
              Glissez un fichier ou{' '}
              <span className="text-ink font-medium underline underline-offset-2">parcourir</span>
            </p>
            <p className="text-xs text-ink-400 mt-1.5 tracking-wide">
              PDF · DOCX · TXT · CSV · MD · HTML · XML · et plus encore
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
