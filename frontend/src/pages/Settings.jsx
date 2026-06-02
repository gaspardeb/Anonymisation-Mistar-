import React, { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../App';

export default function Settings() {
  const { user } = useAuth();
  const [form, setForm]     = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (form.newPassword.length < 8) { setError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (form.newPassword !== form.confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess('Mot de passe mis à jour.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setError(err.message || 'Erreur lors du changement de mot de passe.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-ink">Paramètres</h1>
        <p className="text-sm text-ink-500 mt-1">Gérez votre compte</p>
      </div>

      {/* Account info */}
      <div className="card p-6 mb-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Informations du compte</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-cream-100">
            <span className="text-xs text-ink-500">Email</span>
            <span className="text-sm font-medium text-ink">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-ink-500">Rôle</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${user?.role === 'admin' ? 'bg-ink text-white' : 'bg-cream-200 text-ink-700'}`}>
              {user?.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
            </span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink mb-4">Changer le mot de passe</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs text-ink-500 mb-1">Mot de passe actuel</label>
            <input
              type="password"
              value={form.currentPassword}
              onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
              className="input-base"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
              placeholder="Min. 8 caractères"
              className="input-base"
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Confirmer le mot de passe</label>
            <input
              type="password"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="input-base"
              required
              autoComplete="new-password"
            />
          </div>
          {error   && <p className="text-red-600 text-xs">{error}</p>}
          {success && <p className="text-emerald-600 text-xs">{success}</p>}
          <div className="pt-1">
            <button type="submit" disabled={loading} className="btn-primary text-sm py-2 px-5 disabled:opacity-50">
              {loading ? 'Mise à jour…' : 'Mettre à jour'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
