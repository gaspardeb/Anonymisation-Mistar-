import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../App';

export default function History() {
  const { user } = useAuth();
  const [data, setData]             = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [users, setUsers]           = useState([]);
  const [filterUser, setFilterUser] = useState('');
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/admin/users').then(setUsers).catch(() => {});
    }
  }, [user]);

  useEffect(() => { loadHistory(1); }, [filterUser]);

  async function loadHistory(page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filterUser) params.set('userId', filterUser);
      const res = await api.get(`/history?${params}`);
      setData(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-ink">Historique</h1>
          <p className="text-sm text-ink-500 mt-1">
            {pagination.total} document{pagination.total !== 1 ? 's' : ''} traité{pagination.total !== 1 ? 's' : ''}
          </p>
        </div>
        {user?.role === 'admin' && (
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="input-base w-auto text-xs py-2"
          >
            <option value="">Tous les utilisateurs</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">
                Fichier
              </th>
              {user?.role === 'admin' && (
                <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">
                  Utilisateur
                </th>
              )}
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">
                Entités
              </th>
              <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {loading ? (
              <tr>
                <td colSpan={user?.role === 'admin' ? 4 : 3} className="text-center py-16 text-ink-300 text-sm">
                  Chargement…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={user?.role === 'admin' ? 4 : 3} className="text-center py-16 text-ink-300 text-sm">
                  Aucun historique pour l'instant
                </td>
              </tr>
            ) : (
              data.map(item => (
                <tr key={item.id} className="hover:bg-cream-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm text-ink font-medium">{item.filename}</td>
                  {user?.role === 'admin' && (
                    <td className="px-5 py-3.5 text-sm text-ink-500">{item.email}</td>
                  )}
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-ink text-white">
                      {item.entity_count}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-ink-400">{formatDate(item.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-1.5 mt-6">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => loadHistory(p)}
              className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                p === pagination.page
                  ? 'bg-ink text-white'
                  : 'border border-ink-100 text-ink-500 hover:bg-cream-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
