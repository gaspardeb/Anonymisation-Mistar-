const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { anonymizationRateLimit } = require('../middleware/rateLimit');
const db = require('../db/database');
const { normalizeEntityType } = require('../utils/normalizeTypes');

const router = express.Router();

function parseJsonSafely(content) {
  if (!content) return null;
  try { return JSON.parse(content); } catch {}
  const stripped = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const start = content.indexOf('{');
  const end   = content.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(content.slice(start, end + 1)); } catch {}
  }
  return null;
}

function audit(userId, action, details, ip) {
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
  ).run(userId, action, details, ip);
}

// Pré-détection regex des patterns structurés français (certitude élevée)
function preDetectSensitiveData(text, categories) {
  const found = new Set();

  if (categories.includes('numbers')) {
    // Téléphones français (fixes et mobiles)
    const phones = [
      /(?:(?:\+|00)33[\s.\-]?(?:\(0\)[\s.\-]?)?|0)[1-9](?:[\s.\-]?\d{2}){4}/g,
    ];
    // Numéros de sécurité sociale
    const ssn = /[12][\s]?\d{2}[\s]?(?:0[1-9]|1[0-2]|[2-9]\d)[\s]?\d{2,3}[\s]?\d{3}[\s]?\d{3}[\s]?\d{2}/g;
    // IBAN (FR et autres)
    const iban = /\b[A-Z]{2}\d{2}(?:[\s]?[A-Z0-9]{4}){4,7}[\s]?[A-Z0-9]{0,4}\b/g;
    // Plaques d'immatriculation (nouveau format AA-123-AA)
    const plates = /\b[A-Z]{2}[\s\-]\d{3}[\s\-][A-Z]{2}\b/g;

    for (const re of [...phones, ssn, iban, plates]) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        const v = m[0].trim();
        if (v.length >= 6) found.add(v);
      }
    }
  }

  if (categories.includes('emails')) {
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    let m;
    while ((m = emailRe.exec(text)) !== null) found.add(m[0].trim());
  }

  if (categories.includes('addresses')) {
    // Code postal + ville
    const postalCity = /\b(?:0[1-9]|[1-8]\d|9[0-5])\d{3}\b[\s,\-]+[A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s\-']{1,35}/g;
    // Numéro + type de voie + nom de voie
    const street = /\b\d{1,4}(?:\s*(?:bis|ter|quater|b|t))?[,\s]+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|allée|impasse|place|route|voie|passage|cour|résidence|villa|cité|square|quai|esplanade|hameau|lieu[\s\-]dit|lotissement)\b[^\n,]{4,60}/gi;

    for (const re of [postalCity, street]) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        const v = m[0].trim();
        if (v.length >= 6) found.add(v);
      }
    }
  }

  if (categories.includes('gps')) {
    // Coordonnées GPS décimales
    const gps = /[-+]?\d{1,2}\.\d{4,},?\s*[-+]?\d{1,3}\.\d{4,}/g;
    // Coordonnées DMS
    const dms = /\d{1,3}°\s*\d{1,2}['′]\s*(?:\d{1,2}(?:[.,]\d+)?["″]\s*)?[NSEWnsew]/g;
    for (const re of [gps, dms]) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) found.add(m[0].trim());
    }
  }

  return [...found];
}

const CATEGORY_RULES = {
  mask: {
    persons:       "- Noms et prénoms (y compris initiales isolées si accompagnées d'un titre) → remplacés par \"Monsieur A\", \"Madame B\", \"Dr. C\"... (lettres alphabétiques dans l'ordre d'apparition, respect du genre et du titre)",
    numbers:       "- Numéros structurés : téléphone (0X XX XX XX XX, +33...), sécurité sociale (13 chiffres), IBAN, plaques d'immatriculation (AA-123-AA), numéros de factures, de dossiers, de contrats, dates de naissance → [TEL_1], [SS_1], [IBAN_1], [PLAQUE_1], [FACT_1], [REF_1], [DATE_NAISS_1]",
    addresses:     "- Adresses postales sous toutes leurs formes : adresse complète, fragment (code postal seul + ville, rue seule, numéro + rue, cedex, BP) → [ADRESSE_1], [ADRESSE_2]... Chaque fragment distinct = un token distinct",
    gps:           "- Coordonnées GPS (latitude/longitude décimales ou DMS) → [GPS_1], [GPS_2]...",
    emails:        "- Adresses email → [EMAIL_1], [EMAIL_2]...",
    sensitive:     "- Données sensibles (santé, pathologie, traitement médical, religion, appartenance syndicale, opinion politique, orientation sexuelle) → [SENSIBLE_1 (catégorie)], [SENSIBLE_2 (catégorie)]...",
    organizations: "- Noms d'organisations, sociétés, marques, administrations, établissements scolaires, hôpitaux → [ORG_1], [ORG_2]...",
  },
  tag: {
    persons:       "- Noms et prénoms (y compris initiales isolées si accompagnées d'un titre) → [ANONYMISÉ]",
    numbers:       "- Numéros structurés (téléphone, SS, IBAN, plaques, factures, dossiers, dates de naissance) → [ANONYMISÉ]",
    addresses:     "- Adresses postales sous toutes leurs formes (complètes ou fragments : code postal + ville, rue seule, BP, cedex) → [ANONYMISÉ]",
    gps:           "- Coordonnées GPS → [ANONYMISÉ]",
    emails:        "- Adresses email → [ANONYMISÉ]",
    sensitive:     "- Données sensibles (santé, religion, syndicat, politique, orientation sexuelle) → [ANONYMISÉ]",
    organizations: "- Noms d'organisations, marques, entreprises, établissements → [ANONYMISÉ]",
  },
  pseudo: {
    persons:       "- Noms et prénoms (y compris initiales isolées si accompagnées d'un titre) → pseudonymes séquentiels PERSONNE_001, PERSONNE_002... (même personne = même pseudonyme partout)",
    numbers:       "- Numéros structurés → TEL_001, SS_001, IBAN_001, PLAQUE_001, FACT_001, REF_001, DATE_001 (numérotés séquentiellement)",
    addresses:     "- Adresses postales sous toutes leurs formes (complètes ou fragments) → ADRESSE_001, ADRESSE_002...",
    gps:           "- Coordonnées GPS → GPS_001, GPS_002...",
    emails:        "- Adresses email → EMAIL_001, EMAIL_002...",
    sensitive:     "- Données sensibles → DONNEE_SENSIBLE_001, DONNEE_SENSIBLE_002...",
    organizations: "- Noms d'organisations → ORGANISATION_001, ORGANISATION_002...",
  },
};

router.post('/', requireAuth, anonymizationRateLimit, async (req, res) => {
  const { text, filename, categories, mode = 'mask', qualityScores, forcedEntities = [] } = req.body;

  if (!text || !text.trim()) return res.status(400).json({ error: 'Texte vide' });
  if (!Array.isArray(categories) || categories.length === 0)
    return res.status(400).json({ error: 'Sélectionnez au moins une catégorie' });

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey === 'VOTRE_CLE_ICI')
    return res.status(500).json({ error: 'Clé API Mistral non configurée — renseignez MISTRAL_API_KEY dans backend/.env' });

  const modeKey = ['mask', 'tag', 'pseudo'].includes(mode) ? mode : 'mask';
  const rulesMap = CATEGORY_RULES[modeKey];

  const rules = categories
    .filter(c => rulesMap[c])
    .map(c => rulesMap[c])
    .join('\n');

  const typeHints = categories
    .filter(c => rulesMap[c])
    .map(c => `"${c}"`)
    .join(', ');

  const preDetected = preDetectSensitiveData(text, categories);
  const safeForced = Array.isArray(forcedEntities)
    ? forcedEntities.filter(e => typeof e === 'string' && e.trim()).map(e => e.trim())
    : [];
  const allMandatory = [...preDetected, ...safeForced];
  const mandatorySection = allMandatory.length > 0
    ? `\nENTITÉS DÉTECTÉES AVEC CERTITUDE — tu DOIS toutes les anonymiser sans exception :\n${allMandatory.map(e => `• "${e}"`).join('\n')}\n`
    : '';

  const prompt = `Tu es un expert en anonymisation RGPD. Anonymise le texte suivant en remplaçant toutes les données identifiantes selon ces règles :
${rules}
${mandatorySection}
RÈGLES IMPORTANTES :
- Parcours le texte ligne par ligne, mot par mot — ne saute aucune donnée même si elle semble anodine
- Cohérence des substituts : même entité = même code partout dans le texte
- Numérotation séquentielle pour chaque type
- Anonymise les adresses même fragmentées : un code postal seul + une ville = une adresse à anonymiser
- Conserver exactement la structure, la mise en forme et les sauts de ligne du texte
- Dans le mapping, le champ "type" doit être EXACTEMENT l'une de ces valeurs : ${typeHints}
Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks :
{"anonymized":"...","mapping":[{"original":"...","anonymized":"...","type":"..."}]}

Texte à anonymiser :
${text}`;

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = "Erreur de l'API Mistral";
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.message) msg = `Mistral : ${errJson.message}`;
        if (response.status === 401) msg = 'Clé API Mistral invalide';
        if (response.status === 429) msg = 'Quota Mistral dépassé — réessayez dans un moment';
      } catch {}
      return res.status(502).json({ error: msg });
    }

    const data    = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed  = parseJsonSafely(content);

    if (!parsed)            return res.status(502).json({ error: 'Réponse Mistral non parseable — réessayez' });
    if (!parsed.anonymized) return res.status(502).json({ error: 'Réponse Mistral incomplète (champ anonymized manquant)' });

    const durationMs  = Date.now() - startTime;
    const mapping     = Array.isArray(parsed.mapping) ? parsed.mapping : [];
    const entityCount = mapping.length;
    const entityTypes = {};
    for (const item of mapping) {
      const key = normalizeEntityType(item.type);
      if (key) entityTypes[key] = (entityTypes[key] || 0) + 1;
    }

    const safeFilename = (filename || 'sans_nom.txt').slice(0, 255);

    db.prepare(
      'INSERT INTO history (user_id, filename, entity_count, categories, duration_ms, entity_types, anonymization_mode, quality_scores) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, safeFilename, entityCount, JSON.stringify(categories), durationMs, JSON.stringify(entityTypes), modeKey, qualityScores ? JSON.stringify(qualityScores) : null);

    audit(req.user.id, 'ANONYMIZE', `Fichier: ${safeFilename}, Entités: ${entityCount}, Mode: ${modeKey}, Durée: ${durationMs}ms`, req.ip);

    res.json({ anonymized: parsed.anonymized, mapping, durationMs, entityTypes });
  } catch (err) {
    console.error('Anonymization error:', err);
    res.status(500).json({ error: "Erreur interne lors de l'anonymisation" });
  }
});

module.exports = router;
