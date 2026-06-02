import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../App';

export default function Login() {
  const [mode, setMode]               = useState('login'); // 'login' | 'register'
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mustChange, setMustChange]   = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [loading, setLoading]         = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  function switchMode(m) {
    setMode(m);
    setError('');
    setSuccess('');
    setEmail('');
    setPassword('');
    setConfirm('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password });
      if (data.user.mustChangePassword) {
        setMustChange(true);
      } else {
        setUser(data.user);
        navigate('/anonymizer');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Mot de passe trop court (min. 8 caractères)'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', { email, password });
      setSuccess('Compte créé ! Vous pouvez maintenant vous connecter.');
      switchMode('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Minimum 8 caractères'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { newPassword });
      const me = await api.get('/auth/me');
      setUser(me.user);
      navigate('/anonymizer');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-10">
          <p className="font-display text-4xl text-ink">MistarAnonyme</p>
          <p className="text-sm text-ink-500 mt-1 tracking-wide">
            {mustChange ? 'Sécurisez votre compte' : 'Plateforme d\'anonymisation RGPD'}
          </p>
        </div>

        {/* Tab switcher */}
        {!mustChange && (
          <div className="flex gap-0.5 bg-cream-200 border border-cream-300 rounded-xl p-1 mb-5">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${mode === 'login' ? 'bg-white text-ink shadow-sm border border-cream-200' : 'text-ink-500 hover:text-ink'}`}
            >
              Se connecter
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${mode === 'register' ? 'bg-white text-ink shadow-sm border border-cream-200' : 'text-ink-500 hover:text-ink'}`}
            >
              Créer un compte
            </button>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl border border-cream-300 p-8 shadow-sm">

          {/* Force password change */}
          {mustChange && (
            <form onSubmit={handleChangePassword} className="space-y-5">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
                Définissez un nouveau mot de passe personnel avant de continuer.
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5 uppercase tracking-wide">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="input-base"
                  placeholder="Minimum 8 caractères"
                  required autoFocus
                />
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? 'Enregistrement…' : 'Confirmer le mot de passe'}
              </button>
            </form>
          )}

          {/* Login */}
          {!mustChange && mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                  {success}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5 uppercase tracking-wide">
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-base"
                  placeholder="votre@entreprise.fr"
                  required autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5 uppercase tracking-wide">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-base"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>
          )}

          {/* Register */}
          {!mustChange && mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5 uppercase tracking-wide">
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-base"
                  placeholder="votre@entreprise.fr"
                  required autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5 uppercase tracking-wide">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-base"
                  placeholder="Minimum 8 caractères"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5 uppercase tracking-wide">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="input-base"
                  required
                />
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? 'Création…' : 'Créer mon compte'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-ink-400 mt-6">
          Données traitées localement · Conformité RGPD
        </p>
      </div>
    </div>
  );
}
