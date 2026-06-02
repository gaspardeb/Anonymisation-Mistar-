export const ENTITY_COLORS = {
  persons:       { light: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-500',    border: 'border-blue-200',   label: 'Noms / prénoms',    hex: '#3B82F6' },
  emails:        { light: 'bg-red-100 text-red-800',         dot: 'bg-red-500',     border: 'border-red-200',    label: 'Emails',             hex: '#EF4444' },
  numbers:       { light: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', border: 'border-emerald-200',label: 'Numéros',            hex: '#10B981' },
  addresses:     { light: 'bg-orange-100 text-orange-800',   dot: 'bg-orange-500',  border: 'border-orange-200', label: 'Adresses',           hex: '#F97316' },
  gps:           { light: 'bg-violet-100 text-violet-800',   dot: 'bg-violet-500',  border: 'border-violet-200', label: 'GPS',                hex: '#8B5CF6' },
  sensitive:     { light: 'bg-pink-100 text-pink-800',       dot: 'bg-pink-500',    border: 'border-pink-200',   label: 'Données sensibles',  hex: '#EC4899' },
  organizations: { light: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500',   border: 'border-amber-200',  label: 'Organisations',      hex: '#F59E0B' },
};

export function buildHighlights(text, mapping) {
  if (!text || !mapping?.length) return [];
  const highlights = [];
  const seen = new Set();

  for (const item of mapping) {
    if (!item.original || seen.has(item.original)) continue;
    seen.add(item.original);
    let idx = 0;
    while (idx < text.length) {
      const pos = text.indexOf(item.original, idx);
      if (pos === -1) break;
      highlights.push({ start: pos, end: pos + item.original.length, type: item.type, anonymizedTo: item.anonymized });
      idx = pos + item.original.length;
    }
  }

  highlights.sort((a, b) => a.start - b.start);

  // Remove overlapping ranges (keep first)
  const result = [];
  let lastEnd = 0;
  for (const h of highlights) {
    if (h.start >= lastEnd) {
      result.push(h);
      lastEnd = h.end;
    }
  }
  return result;
}

export function computeStats(mapping) {
  const stats = {};
  for (const item of mapping) {
    stats[item.type] = (stats[item.type] || 0) + 1;
  }
  return stats;
}
