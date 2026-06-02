import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../App';
import { ENTITY_COLORS } from '../utils/entityColors';

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function EntityTypeBadges({ entityTypesJson }) {
  try {
    const types = JSON.parse(entityTypesJson || '{}');
    const entries = Object.entries(types).filter(([, v]) => v > 0);
    if (!entries.length) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map(([type, count]) => {
          const c = ENTITY_COLORS[type];
          return (
            <span key={type} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c?.light || 'bg-cream-200 text-ink-600'}`}>
              {c?.label || type} {count}
            </span>
          );
        })}
      </div>
    );
  } catch {
    return null;
  }
}

export default function History() {
  const { user } = useAuth();
  const [data, setData]             = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [users, setUsers]           = useState([]);
  const [filterUser, setFilterUser] = useState('');
  const [search, setSearch]         = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading]       = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/admin/users').then(setUsers).catch(() => {});
    }
  }, [user]);

  const loadHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filterUser) params.set('userId', filterUser);
      if (search)     params.set('search', search);
      const res = await api.get(`/history?${params}`);
      setData(res.data);
      setPagination(res.pagination);
      setCurrentPage(page);
    } catch {}
    finally { setLoading(false); }
  }, [filterUser, search]);

  useEffect(() => { loadHistory(1); }, [loadHistory]);

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const colCount = user?.role === 'admin' ? 7 : 6;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink">Historique</h1>
          <p className="text-sm text-ink-500 mt-1">
            {pagination.total} document{pagination.total !== 1 ? 's' : ''} traité{pagination.total !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-ink-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Rechercher un fichier…"
                className="input-base pl-9 py-2 text-xs w-52"
              />
            </div>
            <button type="submit" className="btn-primary text-xs py-2 px-3">Rechercher</button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} className="text-xs text-ink-400 hover:text-ink">
                Effacer
              </button>
            )}
          </form>

          {user?.role === 'admin' && (
            <select
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="input-base py-2 text-xs w-auto"
            >
              <option value="">Tous les utilisateurs</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Fichier</th>
              {user?.role === 'admin' && (
                <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Utilisateur</th>
              )}
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Entités</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Types</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Durée</th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {loading ? (
              <tr><td colSpan={colCount} className="text-center py-16 text-ink-300 text-sm">Chargement…</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={colCount} className="text-center py-16 text-ink-300 text-sm">
                {search ? `Aucun résultat pour « ${search} »` : 'Aucun historique pour l\'instant'}
              </td></tr>
            ) : (
              data.map(item => (
                <tr key={item.id} className="hover:bg-cream-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-ink">{item.filename}</p>
                  </td>
                  {user?.role === 'admin' && (
                    <td className="px-5 py-3.5 text-xs text-ink-500">{item.email}</td>
                  )}
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink text-white">
                      {item.entity_count}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 max-w-xs">
                    <EntityTypeBadges entityTypesJson={item.entity_types} />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-ink-400 font-mono">{formatDuration(item.duration_ms)}</td>
                  <td className="px-5 py-3.5 text-xs text-ink-400">{formatDate(item.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-1.5 mt-6">
          <button
            onClick={() => loadHistory(currentPage - 1)}
            disabled={currentPage === 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-cream-100 disabled:opacity-30 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => loadHistory(p)}
              className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                p === currentPage ? 'bg-ink text-white' : 'border border-ink-100 text-ink-500 hover:bg-cream-100'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => loadHistory(currentPage + 1)}
            disabled={currentPage === pagination.pages}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-cream-100 disabled:opacity-30 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
