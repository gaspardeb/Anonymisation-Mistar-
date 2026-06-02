import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../App';
import { ENTITY_COLORS } from '../utils/entityColors';

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-ink-500 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-display text-ink mt-1">{value ?? '—'}</p>
          {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
        </div>
        {icon && <div className="text-ink-200">{icon}</div>}
      </div>
    </div>
  );
}

function ActivityChart({ byDay }) {
  if (!byDay?.length) return <div className="h-16 flex items-center justify-center text-xs text-ink-300">Aucune activité sur 30 jours</div>;
  const max = Math.max(...byDay.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-px h-16">
      {byDay.map((d, i) => (
        <div
          key={i}
          className="flex-1 bg-ink rounded-sm hover:bg-ink-700 transition-colors cursor-default"
          style={{ height: d.count > 0 ? `${Math.max(4, (d.count / max) * 100)}%` : '2px', opacity: d.count > 0 ? 1 : 0.15 }}
          title={`${d.day} : ${d.count} document${d.count > 1 ? 's' : ''}`}
        />
      ))}
    </div>
  );
}

function EntityBar({ label, count, max, color }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-600 w-32 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-cream-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-ink w-14 text-right">{count.toLocaleString('fr-FR')}</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const entryList = stats
    ? Object.entries(stats.entitiesByType).sort((a, b) => b[1] - a[1])
    : [];
  const maxEntities = entryList[0]?.[1] ?? 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ink-300 text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-ink">Dashboard</h1>
        <p className="text-sm text-ink-500 mt-1">Vue d'ensemble de l'activité</p>
      </div>

      {/* Top stats */}
      <div className={`grid gap-4 mb-6 ${user?.role === 'admin' ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <StatCard
          label="Documents traités"
          value={(stats?.totalDocs ?? 0).toLocaleString('fr-FR')}
          sub={`${(stats?.docsThisMonth ?? 0)} ce mois-ci`}
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <StatCard
          label="Données anonymisées"
          value={(stats?.totalEntities ?? 0).toLocaleString('fr-FR')}
          sub="entités détectées au total"
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
        />
        <StatCard
          label="Types détectés"
          value={entryList.length}
          sub="catégories différentes"
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
        />
        {user?.role === 'admin' && (
          <StatCard
            label="Utilisateurs actifs"
            value={stats?.totalUsers ?? 0}
            icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          />
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Activity chart */}
        <div className="card p-5 col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-ink">Activité</p>
              <p className="text-xs text-ink-400 mt-0.5">30 derniers jours</p>
            </div>
            <span className="text-xs text-ink-400">{stats?.totalDocs ?? 0} documents</span>
          </div>
          <ActivityChart byDay={stats?.byDay} />
          {stats?.byDay?.length > 0 && (
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-ink-300">{stats.byDay[0]?.day}</span>
              <span className="text-[10px] text-ink-300">{stats.byDay[stats.byDay.length - 1]?.day}</span>
            </div>
          )}
        </div>

        {/* Entity breakdown */}
        <div className="card p-5 col-span-2">
          <p className="text-sm font-semibold text-ink mb-4">Répartition par type</p>
          {entryList.length === 0 ? (
            <p className="text-xs text-ink-300 text-center py-6">Aucune donnée</p>
          ) : (
            <div className="space-y-3">
              {entryList.map(([type, count]) => {
                const c = ENTITY_COLORS[type];
                return (
                  <EntityBar
                    key={type}
                    label={c?.label || type}
                    count={count}
                    max={maxEntities}
                    color={c?.dot || 'bg-ink'}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top users (admin only) */}
      {user?.role === 'admin' && stats?.topUsers?.length > 0 && (
        <div className="card overflow-hidden mt-4">
          <div className="px-5 py-4 border-b border-cream-200">
            <p className="text-sm font-semibold text-ink">Top utilisateurs</p>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-cream-100">
              {stats.topUsers.map((row, i) => (
                <tr key={i} className="hover:bg-cream-50">
                  <td className="px-5 py-3 text-sm text-ink-700">{row.email}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-bold text-ink">{row.count}</span>
                    <span className="text-xs text-ink-400 ml-1">doc{row.count > 1 ? 's' : ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
