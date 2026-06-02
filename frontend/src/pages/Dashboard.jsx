import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../App';
import { ENTITY_COLORS } from '../utils/entityColors';

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function Trend({ current, previous }) {
  if (!previous || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs text-ink-400">stable</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
      {Math.abs(pct)}% vs mois dernier
    </span>
  );
}

function StatCard({ label, value, sub, trend, icon, accent }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent || 'bg-cream-100'}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-display text-ink">{value ?? '—'}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
      {(sub || trend) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {sub  && <span className="text-xs text-ink-400">{sub}</span>}
          {trend}
        </div>
      )}
    </div>
  );
}

function ActivityChart({ byDay }) {
  const [hovered, setHovered] = useState(null);

  if (!byDay?.length) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-ink-300">
        Aucune activité sur 30 jours
      </div>
    );
  }

  const max = Math.max(...byDay.map(d => d.count), 1);
  const total = byDay.reduce((s, d) => s + d.count, 0);
  const activeDays = byDay.filter(d => d.count > 0).length;

  return (
    <div>
      <div className="flex items-end gap-px h-20 relative">
        {byDay.map((d, i) => (
          <div
            key={i}
            className="flex-1 relative group cursor-default"
            style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className={`w-full rounded-sm transition-all duration-150 ${d.count > 0 ? 'bg-ink' : 'bg-cream-200'} ${hovered === i && d.count > 0 ? 'opacity-70' : ''}`}
              style={{ height: d.count > 0 ? `${Math.max(6, (d.count / max) * 100)}%` : '3px' }}
            />
            {hovered === i && d.count > 0 && (
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-ink text-white text-[10px] rounded-lg px-2 py-1 whitespace-nowrap z-10 shadow-lg pointer-events-none">
                {d.count} doc{d.count > 1 ? 's' : ''}
                <div className="text-ink-300">{formatChartDate(d.day)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center mt-2">
        <span className="text-[10px] text-ink-300">{formatChartDate(byDay[0]?.day)}</span>
        <span className="text-[10px] text-ink-400">{total} doc{total > 1 ? 's' : ''} · {activeDays} jour{activeDays > 1 ? 's' : ''} actif{activeDays > 1 ? 's' : ''}</span>
        <span className="text-[10px] text-ink-300">{formatChartDate(byDay[byDay.length - 1]?.day)}</span>
      </div>
    </div>
  );
}

function formatChartDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function EntityBar({ label, count, max, colorClass }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-600 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-cream-200 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-ink w-10 text-right tabular-nums">
        {count.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-cream-100 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink-600">Aucune donnée pour l'instant</p>
      <p className="text-xs text-ink-400 mt-1">Anonymisez votre premier document pour voir les statistiques</p>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ink-300 text-sm">
        Chargement…
      </div>
    );
  }

  if (!stats || stats.totalDocs === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-ink">Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">Vue d'ensemble de l'activité</p>
        </div>
        <div className="card">
          <EmptyState />
        </div>
      </div>
    );
  }

  const entryList = Object.entries(stats.entitiesByType)
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 0);
  const maxEntities = entryList[0]?.[1] ?? 1;

  const gridCols = user?.role === 'admin' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3';

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-ink">Dashboard</h1>
        <p className="text-sm text-ink-500 mt-1">Vue d'ensemble de l'activité</p>
      </div>

      {/* KPI cards */}
      <div className={`grid gap-4 mb-5 ${gridCols}`}>
        <StatCard
          label="Documents traités"
          value={(stats.totalDocs).toLocaleString('fr-FR')}
          sub={`${stats.docsThisMonth} ce mois-ci`}
          trend={<Trend current={stats.docsThisMonth} previous={stats.docsLastMonth} />}
          accent="bg-ink/5"
          icon={
            <svg className="w-4.5 h-4.5 text-ink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          label="Données anonymisées"
          value={(stats.totalEntities).toLocaleString('fr-FR')}
          sub="entités détectées au total"
          accent="bg-blue-50"
          icon={
            <svg className="w-4.5 h-4.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />
        <StatCard
          label="Durée moyenne"
          value={formatDuration(stats.avgDuration)}
          sub="par anonymisation"
          accent="bg-emerald-50"
          icon={
            <svg className="w-4.5 h-4.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        {user?.role === 'admin' && (
          <StatCard
            label="Utilisateurs actifs"
            value={stats.totalUsers ?? 0}
            sub="comptes activés"
            accent="bg-violet-50"
            icon={
              <svg className="w-4.5 h-4.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
        )}
      </div>

      <div className="grid grid-cols-5 gap-4 mb-4">
        {/* Activity chart */}
        <div className="card p-5 col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-ink">Activité</p>
              <p className="text-xs text-ink-400 mt-0.5">30 derniers jours</p>
            </div>
          </div>
          <ActivityChart byDay={stats.byDay} />
        </div>

        {/* Entity breakdown */}
        <div className="card p-5 col-span-2">
          <p className="text-sm font-semibold text-ink mb-4">
            Répartition des entités
          </p>
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
                    colorClass={c?.dot || 'bg-ink'}
                  />
                );
              })}
            </div>
          )}
          {entryList.length > 0 && (
            <div className="mt-4 pt-3 border-t border-cream-100">
              <div className="flex flex-wrap gap-1.5">
                {entryList.map(([type]) => {
                  const c = ENTITY_COLORS[type];
                  return (
                    <span key={type} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c?.light || 'bg-cream-200 text-ink-600'}`}>
                      {c?.label || type}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top users (admin only) */}
      {user?.role === 'admin' && stats.topUsers?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-200 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Top utilisateurs</p>
            <p className="text-xs text-ink-400">30 derniers jours</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-cream-50 border-b border-cream-100">
                <th className="text-left text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-2.5">Utilisateur</th>
                <th className="text-right text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-2.5">Documents</th>
                <th className="text-right text-[10px] font-semibold text-ink-400 uppercase tracking-widest px-5 py-2.5">Entités</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {stats.topUsers.map((row, i) => (
                <tr key={i} className="hover:bg-cream-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-ink-700 flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${i === 0 ? 'bg-ink text-white' : 'bg-cream-200 text-ink-500'}`}>{i + 1}</span>
                    {row.email}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-bold text-ink">{row.count}</span>
                    <span className="text-xs text-ink-400 ml-1">doc{row.count > 1 ? 's' : ''}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-semibold text-ink-600">{(row.entities || 0).toLocaleString('fr-FR')}</span>
                    <span className="text-xs text-ink-400 ml-1">entité{row.entities > 1 ? 's' : ''}</span>
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
