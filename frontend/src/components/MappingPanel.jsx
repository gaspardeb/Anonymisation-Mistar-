import React from 'react';

const TYPE_LABEL = {
  persons:       'Personnes',
  numbers:       'Numéros',
  addresses:     'Adresses',
  gps:           'GPS',
  emails:        'Emails',
  sensitive:     'Sensible',
  organizations: 'Organisations',
};

export default function MappingPanel({ mapping, onClose }) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-cream-300 flex flex-col z-50">
      <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200">
        <div>
          <h2 className="text-sm font-semibold text-ink">Table de correspondance</h2>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {mapping.length} entité{mapping.length !== 1 ? 's' : ''} anonymisée{mapping.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-ink-400 hover:text-ink p-1.5 rounded-lg hover:bg-cream-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-1.5">
        {mapping.length === 0 ? (
          <p className="text-center text-ink-300 text-sm mt-12">Aucune correspondance</p>
        ) : (
          mapping.map((item, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-cream-50 border border-cream-200 text-xs">
              <span className="flex-1 font-mono text-ink-700 truncate" title={item.original}>
                {item.original}
              </span>
              <svg className="w-3 h-3 text-ink-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="shrink-0 font-mono font-semibold text-red-600">
                {item.anonymized}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-cream-200">
        <p className="text-[11px] text-ink-400">
          {Object.keys(TYPE_LABEL).filter(k => mapping.some(m => m.type === k)).map(k => TYPE_LABEL[k]).join(' · ')}
        </p>
      </div>
    </div>
  );
}
