import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { api } from '../api/client';

const IconGrid    = () => <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
const IconDoc     = () => <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const IconClock   = () => <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconShield  = () => <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
const IconSettings= () => <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const IconUser    = () => <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
          isActive ? 'bg-ink text-white font-medium' : 'text-ink-600 hover:bg-cream-200 hover:text-ink font-normal'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function NavSection({ label, children }) {
  return (
    <div className="space-y-0.5">
      {label && <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-3 pt-3 pb-1">{label}</p>}
      {children}
    </div>
  );
}

export default function Layout() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-cream-100">
      <aside className="w-64 bg-white border-r border-cream-300 flex flex-col shrink-0">

        {/* Brand */}
        <div className="px-5 py-5 border-b border-cream-200">
          <p className="font-display text-xl text-ink tracking-tight">MistarAnonyme</p>
          <p className="text-[10px] text-ink-400 mt-0.5 uppercase tracking-widest">Plateforme RGPD</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
          <NavSection>
            <NavItem to="/dashboard"  label="Dashboard"     icon={<IconGrid />} />
            <NavItem to="/anonymizer"      label="Anonymisation"      icon={<IconDoc />} />
            <NavItem to="/history"         label="Historique"         icon={<IconClock />} />
          </NavSection>

          {user?.role === 'admin' && (
            <NavSection label="Administration">
              <NavItem to="/audit" label="Audit RGPD"    icon={<IconShield />} />
              <NavItem to="/admin" label="Administration" icon={<IconSettings />} />
            </NavSection>
          )}

          <NavSection label="Compte">
            <NavItem to="/settings" label="Paramètres" icon={<IconUser />} />
          </NavSection>
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-cream-200">
          <div className="flex items-center gap-2.5 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-ink flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink truncate">{user?.email}</p>
              <p className="text-[10px] text-ink-400 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs text-ink-400 hover:text-red-600 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
