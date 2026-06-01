import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

const TABS = [
  { id: 'users',  label: 'Utilisateurs'    },
  { id: 'stats',  label: 'Statistiques'    },
  { id: 'config', label: 'Configuration'   },
  { id: 'audit',  label: 'Journaux d\'audit' },
];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink p-1 rounded-lg hover:bg-cream-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResetModal({ userId, onClose, onSuccess }) {
  const [pwd, setPwd]     = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (pwd.length < 8) { setError('Min. 8 caractères'); return; }
    setError('');
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { newPassword: pwd });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Réinitialiser le mot de passe" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          value={pwd}
          onChange={e => setPwd(e.target.value)}
          placeholder="Nouveau mot de passe (min. 8 car.)"
          className="input-base"
          autoFocus
        />
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 btn-ghost text-sm py-2">
            Annuler
          </button>
          <button type="submit" className="flex-1 btn-primary text-sm py-2">
            Confirmer
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewUserModal({ onClose, onSuccess }) {
  const [form, setForm]   = useState({ email: '', password: '', role: 'user' });
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/users', form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Créer un utilisateur" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          className="input-base"
          required autoFocus
        />
        <input
          type="password"
          placeholder="Mot de passe (min. 8 car.)"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          className="input-base"
          required
        />
        <select
          value={form.role}
          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          className="input-base"
        >
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </select>
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 btn-ghost text-sm py-2">
            Annuler
          </button>
          <button type="submit" className="flex-1 btn-primary text-sm py-2">
            Créer
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Admin() {
  const [tab, setTab]               = useState('users');
  const [users, setUsers]           = useState([]);
  const [stats, setStats]           = useState(null);
  const [hasApiKey, setHasApiKey]   = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [auditLogs, setAuditLogs]   = useState([]);
  const [resetModal, setResetModal] = useState(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [toast, setToast]           = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => { loadUsers(); loadStats(); loadConfig(); }, []);
  useEffect(() => { if (tab === 'audit') loadAuditLogs(); }, [tab]);

  async function loadUsers()     { setUsers(await api.get('/admin/users')); }
  async function loadStats()     { setStats(await api.get('/admin/stats')); }
  async function loadConfig()    { const d = await api.get('/admin/config'); setHasApiKey(d.hasApiKey); }
  async function loadAuditLogs() { const d = await api.get('/admin/audit-logs'); setAuditLogs(d.data); }

  async function toggleUser(id, isActive) {
    await api.patch(`/admin/users/${id}`, { is_active: !isActive });
    loadUsers();
    showToast(isActive ? 'Compte désactivé' : 'Compte réactivé');
  }

  async function saveApiKey() {
    try {
      await api.post('/admin/config/api-key', { apiKey: apiKeyInput });
      setHasApiKey(true);
      setApiKeyInput('');
      showToast('Clé API mise à jour');
    } catch (err) {
      showToast('Erreur : ' + err.message);
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
      <div className="mb-8">
        <h1 className="font-display text-3xl text-ink">Administration</h1>
        <p className="text-sm text-ink-500 mt-1">Gestion des utilisateurs et de la configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-cream-100 border border-cream-200 rounded-xl p-1 w-fit mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === t.id
                ? 'bg-white text-ink shadow-sm border border-cream-200'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-ink-500">{users.length} compte{users.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowNewUser(true)}
              className="btn-primary flex items-center gap-2 text-sm py-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nouvel utilisateur
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  {['Email', 'Rôle', 'Statut', 'Créé le', ''].map((h, i) => (
                    <th key={i} className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-cream-50 transition-colors">
                    <td className="px-5 py-3.5 text-sm text-ink font-medium">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        u.role === 'admin'
                          ? 'bg-ink text-white'
                          : 'bg-cream-200 text-ink-700'
                      }`}>
                        {u.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        u.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {u.is_active ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-ink-400">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setResetModal(u.id)}
                          className="text-xs text-ink-500 hover:text-ink px-2 py-1 rounded hover:bg-cream-100 transition-colors"
                        >
                          Réinit. MDP
                        </button>
                        <button
                          onClick={() => toggleUser(u.id, u.is_active)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            u.is_active
                              ? 'text-red-500 hover:text-red-700 hover:bg-red-50'
                              : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                        >
                          {u.is_active ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stats tab */}
      {tab === 'stats' && stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Documents traités', value: stats.totalDocs },
              { label: 'Utilisateurs',      value: stats.totalUsers },
            ].map(({ label, value }) => (
              <div key={label} className="card p-5">
                <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
                <p className="text-4xl font-display text-ink mt-2">{value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-200">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-widest">Par utilisateur</p>
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-cream-100">
                {stats.byUser.length === 0 ? (
                  <tr><td colSpan={2} className="text-center py-10 text-ink-300 text-sm">Aucune donnée</td></tr>
                ) : (
                  stats.byUser.map((row, i) => (
                    <tr key={i} className="hover:bg-cream-50">
                      <td className="px-5 py-3 text-sm text-ink-700">{row.email}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-ink text-right">{row.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {stats.byDay.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-cream-200">
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-widest">30 derniers jours</p>
              </div>
              <div className="px-5 pb-5 pt-4 flex items-end gap-1 h-36">
                {stats.byDay.map((row, i) => {
                  const max = Math.max(...stats.byDay.map(r => r.count));
                  const h   = max > 0 ? Math.max(4, Math.round((row.count / max) * 100)) : 4;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center" title={`${row.day} : ${row.count}`}>
                      <div className="w-full bg-ink rounded-t" style={{ height: `${h}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Config tab */}
      {tab === 'config' && (
        <div className="card p-6 max-w-lg">
          <h2 className="text-sm font-semibold text-ink mb-1">Clé API Mistral</h2>
          <p className="text-xs text-ink-500 mb-4">
            Statut :{' '}
            <span className={`font-medium ${hasApiKey ? 'text-emerald-600' : 'text-red-500'}`}>
              {hasApiKey ? 'Configurée' : 'Non configurée'}
            </span>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="sk-…"
              className="input-base flex-1"
            />
            <button
              onClick={saveApiKey}
              disabled={!apiKeyInput.trim()}
              className="btn-primary text-sm"
            >
              Sauvegarder
            </button>
          </div>
          <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
            La clé est stockée uniquement dans le fichier .env côté serveur — jamais exposée au navigateur.
          </p>
        </div>
      )}

      {/* Audit tab */}
      {tab === 'audit' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-cream-50 border-b border-cream-200">
                {['Date', 'Utilisateur', 'Action', 'Détails'].map(h => (
                  <th key={h} className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {auditLogs.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-ink-300 text-sm">Aucun journal</td></tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-cream-50">
                    <td className="px-5 py-3 text-[11px] text-ink-400 whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="px-5 py-3 text-xs text-ink-600">{log.email || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-mono bg-cream-100 text-ink-700 px-2 py-0.5 rounded">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-500 truncate max-w-xs">{log.details || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {resetModal && (
        <ResetModal
          userId={resetModal}
          onClose={() => setResetModal(null)}
          onSuccess={() => showToast('Mot de passe réinitialisé')}
        />
      )}
      {showNewUser && (
        <NewUserModal
          onClose={() => setShowNewUser(false)}
          onSuccess={() => { loadUsers(); showToast('Utilisateur créé'); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-ink text-white text-xs px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
