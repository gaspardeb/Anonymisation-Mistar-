import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

const TABS = [
  { id: 'users',   label: 'Utilisateurs'   },
  { id: 'models',  label: 'Modèles métier' },
  { id: 'config',  label: 'Configuration'  },
];

const BUSINESS_MODELS = [
  {
    id: 'rh', label: 'Ressources Humaines',
    categories: ['persons', 'emails', 'numbers', 'addresses'],
    description: 'Contrats, fiches de paie, dossiers RH',
  },
  {
    id: 'juridique', label: 'Juridique',
    categories: ['persons', 'organizations', 'addresses', 'numbers'],
    description: 'Actes, contrats, jugements',
  },
  {
    id: 'sante', label: 'Santé',
    categories: ['persons', 'sensitive', 'numbers', 'addresses'],
    description: 'Dossiers patients, ordonnances, rapports médicaux',
  },
  {
    id: 'finance', label: 'Finance',
    categories: ['persons', 'numbers', 'organizations', 'emails'],
    description: 'Relevés, factures, virements',
  },
];

const ALL_CATEGORIES = [
  { id: 'persons',       label: 'Noms / prénoms'    },
  { id: 'emails',        label: 'Emails'            },
  { id: 'numbers',       label: 'Numéros structurés'},
  { id: 'addresses',     label: 'Adresses postales' },
  { id: 'gps',           label: 'Coordonnées GPS'   },
  { id: 'sensitive',     label: 'Données sensibles' },
  { id: 'organizations', label: 'Organisations'     },
];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink p-1 rounded-lg hover:bg-cream-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
  async function submit(e) {
    e.preventDefault();
    if (pwd.length < 8) { setError('Min. 8 caractères'); return; }
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { newPassword: pwd });
      onSuccess(); onClose();
    } catch (err) { setError(err.message); }
  }
  return (
    <Modal title="Réinitialiser le mot de passe" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Nouveau mot de passe (min. 8 car.)" className="input-base" autoFocus />
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 btn-ghost text-sm py-2">Annuler</button>
          <button type="submit" className="flex-1 btn-primary text-sm py-2">Confirmer</button>
        </div>
      </form>
    </Modal>
  );
}

function NewUserModal({ onClose, onSuccess }) {
  const [form, setForm]   = useState({ email: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try { await api.post('/admin/users', form); onSuccess(); onClose(); }
    catch (err) { setError(err.message); }
  }
  return (
    <Modal title="Créer un utilisateur" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-base" required autoFocus />
        <input type="password" placeholder="Mot de passe (min. 8 car.)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input-base" required />
        <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input-base">
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </select>
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 btn-ghost text-sm py-2">Annuler</button>
          <button type="submit" className="flex-1 btn-primary text-sm py-2">Créer</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Admin() {
  const [tab, setTab]               = useState('users');
  const [users, setUsers]           = useState([]);
  const [hasApiKey, setHasApiKey]   = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [resetModal, setResetModal] = useState(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [toast, setToast]           = useState('');
  const [selectedModel, setSelectedModel] = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => { loadUsers(); loadConfig(); }, []);

  async function loadUsers()  { setUsers(await api.get('/admin/users')); }
  async function loadConfig() { const d = await api.get('/admin/config'); setHasApiKey(d.hasApiKey); }

  async function toggleUser(id, isActive) {
    await api.patch(`/admin/users/${id}`, { is_active: !isActive });
    loadUsers();
    showToast(isActive ? 'Compte désactivé' : 'Compte réactivé');
  }

  async function saveApiKey() {
    try {
      await api.post('/admin/config/api-key', { apiKey: apiKeyInput });
      setHasApiKey(true); setApiKeyInput('');
      showToast('Clé API mise à jour');
    } catch (err) { showToast('Erreur : ' + err.message); }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink">Administration</h1>
        <p className="text-sm text-ink-500 mt-1">Gestion des utilisateurs et de la configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-cream-100 border border-cream-200 rounded-xl p-1 w-fit mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === t.id ? 'bg-white text-ink shadow-sm border border-cream-200' : 'text-ink-500 hover:text-ink-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── USERS ── */}
      {tab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-ink-500">{users.length} compte{users.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowNewUser(true)} className="btn-primary flex items-center gap-2 text-sm py-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Nouvel utilisateur
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  {['Email', 'Rôle', 'Statut', 'Créé le', ''].map((h, i) => (
                    <th key={i} className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-cream-50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-ink">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-ink text-white' : 'bg-cream-200 text-ink-700'}`}>
                        {u.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {u.is_active ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-ink-400">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setResetModal(u.id)} className="text-xs text-ink-500 hover:text-ink px-2 py-1 rounded hover:bg-cream-100 transition-colors">Réinit. MDP</button>
                        <button onClick={() => toggleUser(u.id, u.is_active)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${u.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
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

      {/* ── MODELS ── */}
      {tab === 'models' && (
        <div>
          <p className="text-sm text-ink-500 mb-5">Profils prédéfinis de catégories par secteur métier. Sélectionnez un modèle pour voir les catégories incluses.</p>
          <div className="grid grid-cols-2 gap-4">
            {BUSINESS_MODELS.map(model => (
              <div
                key={model.id}
                onClick={() => setSelectedModel(selectedModel?.id === model.id ? null : model)}
                className={`card p-5 cursor-pointer transition-all duration-150 ${
                  selectedModel?.id === model.id ? 'ring-2 ring-ink' : 'hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{model.label}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{model.description}</p>
                  </div>
                  {selectedModel?.id === model.id && (
                    <svg className="w-4 h-4 text-ink shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {model.categories.map(cat => {
                    const c = ALL_CATEGORIES.find(a => a.id === cat);
                    return (
                      <span key={cat} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink text-white">
                        {c?.label || cat}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {selectedModel && (
            <div className="mt-4 p-4 bg-cream-50 border border-cream-200 rounded-xl">
              <p className="text-xs text-ink-500 mb-2">
                Modèle <strong className="text-ink">{selectedModel.label}</strong> sélectionné.
                Ces catégories seront pré-cochées lors de la prochaine anonymisation.
              </p>
              <p className="text-[11px] text-ink-400">
                Catégories : {selectedModel.categories.map(c => ALL_CATEGORIES.find(a => a.id === c)?.label || c).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG ── */}
      {tab === 'config' && (
        <div className="space-y-5">
          <div className="card p-6 max-w-lg">
            <h2 className="text-sm font-semibold text-ink mb-1">Clé API Mistral</h2>
            <p className="text-xs text-ink-500 mb-4">
              Statut :{' '}
              <span className={`font-medium ${hasApiKey ? 'text-emerald-600' : 'text-red-500'}`}>
                {hasApiKey ? 'Configurée' : 'Non configurée'}
              </span>
            </p>
            <div className="flex gap-2">
              <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="sk-…" className="input-base flex-1" />
              <button onClick={saveApiKey} disabled={!apiKeyInput.trim()} className="btn-primary text-sm">Sauvegarder</button>
            </div>
            <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
              La clé est stockée uniquement dans le fichier .env côté serveur — jamais exposée au navigateur.
            </p>
          </div>
        </div>
      )}

      {resetModal && <ResetModal userId={resetModal} onClose={() => setResetModal(null)} onSuccess={() => showToast('Mot de passe réinitialisé')} />}
      {showNewUser && <NewUserModal onClose={() => setShowNewUser(false)} onSuccess={() => { loadUsers(); showToast('Utilisateur créé'); }} />}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-ink text-white text-xs px-4 py-2.5 rounded-xl shadow-lg z-50 transition-all">
          {toast}
        </div>
      )}
    </div>
  );
}
