// Maps Mistral's free-form type strings to our standard category IDs
const TYPE_MAP = [
  { key: 'persons',       patterns: ['person', 'nom', 'prénom', 'prenom', 'name', 'individu', 'identit', 'patient', 'docteur', 'médecin', 'dr ', 'mr ', 'mme ', 'monsieur', 'madame'] },
  { key: 'emails',        patterns: ['email', 'mail', 'courriel', '@'] },
  { key: 'addresses',     patterns: ['adresse', 'address', 'postal', 'rue ', 'avenue', 'boulevard', 'cedex', 'ville', 'city'] },
  { key: 'gps',           patterns: ['gps', 'coord', 'latitude', 'longitude', 'géo', 'geo'] },
  { key: 'sensitive',     patterns: ['sensib', 'sensitiv', 'santé', 'sante', 'medical', 'médical', 'religion', 'syndicat', 'politique', 'sexu'] },
  { key: 'organizations', patterns: ['org', 'entreprise', 'société', 'societe', 'company', 'association', 'établissement', 'etablissement', 'marque', 'brand', 'institution'] },
  { key: 'numbers',       patterns: ['num', 'tel', 'phone', 'date', 'iban', 'plaque', 'struct', 'sécurité', 'securite', 'ss_', 'ref', 'fact', 'naiss', 'siret', 'siren', 'nir'] },
];

function normalizeEntityType(type) {
  if (!type) return null;
  const t = type.toLowerCase().trim();
  // Already a valid key
  const VALID = ['persons', 'emails', 'numbers', 'addresses', 'gps', 'sensitive', 'organizations'];
  if (VALID.includes(t)) return t;
  // Pattern match
  for (const { key, patterns } of TYPE_MAP) {
    if (patterns.some(p => t.includes(p))) return key;
  }
  return null;
}

function normalizeEntityTypes(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [k, v] of Object.entries(raw)) {
    const normalized = normalizeEntityType(k);
    if (normalized) {
      result[normalized] = (result[normalized] || 0) + (v || 0);
    }
  }
  return result;
}

module.exports = { normalizeEntityType, normalizeEntityTypes };
