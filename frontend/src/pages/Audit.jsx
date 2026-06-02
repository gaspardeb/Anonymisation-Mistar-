import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const ACTION_STYLES = {
  ANONYMIZE:       'bg-blue-100 text-blue-700',
  LOGIN:           'bg-emerald-100 text-emerald-700',
  LOGOUT:          'bg-cream-200 text-ink-600',
  CHANGE_PASSWORD: 'bg-amber-100 text-amber-700',
  CREATE_USER:     'bg-violet-100 text-violet-700',
  TOGGLE_USER:     'bg-orange-100 text-orange-700',
  RESET_PASSWORD:  'bg-pink-100 text-pink-700',
};

export default function Audit() {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const LIMIT = 50;

  useEffect(() => {
    loadLogs();
  }, [page, filterAction]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (filterAction) params.set('action', filterAction);
      const data = await api.get(`/admin/audit-logs?${params}`);
      setLogs(data.data);
      setTotal(data.total ?? data.data.length);
    } catch {}
    finally { setLoading(false); }
  }

  const actions = [
    'ANONYMIZE', 'LOGIN', 'LOGOUT', 'CHANGE_PASSWORD',
    'CREATE_USER', 'TOGGLE_USER', 'RESET_PASSWORD',
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink">Journal d'audit RGPD</h1>
          <p className="text-sm text-ink-500 mt-1">Traçabilité complète des actions — conformité RGPD</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(1); }}
            className="input-base py-2 text-xs w-auto"
          >
            <option value="">Toutes les actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* RGPD info banner */}
      <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
        <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-700 leading-relaxed">
          Ce journal enregistre toutes les opérations effectuées sur la plateforme. Conformément au RGPD, ces données sont conservées à des fins de traçabilité et d'audit interne. Aucun contenu de document n'est stocké.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Date</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Utilisateur</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Action</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Détails</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-16 text-ink-300 text-sm">Chargement…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-16 text-ink-300 text-sm">Aucun journal</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="hover:bg-cream-50 transition-colors">
                  <td className="px-5 py-3 text-[11px] text-ink-400 whitespace-nowrap font-mono">{formatDate(log.created_at)}</td>
                  <td className="px-5 py-3 text-xs text-ink-700">{log.email || <span className="text-ink-300">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${ACTION_STYLES[log.action] || 'bg-cream-200 text-ink-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-500 max-w-sm truncate" title={log.details}>{log.details || '—'}</td>
                  <td className="px-5 py-3 text-[11px] text-ink-300 font-mono">{log.ip_address || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > LIMIT && (
        <div className="flex justify-center gap-1.5 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-cream-100 disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="flex items-center px-3 text-xs text-ink-500">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={logs.length < LIMIT}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-cream-100 disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
