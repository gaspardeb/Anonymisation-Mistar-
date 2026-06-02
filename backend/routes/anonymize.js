const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { anonymizationRateLimit } = require('../middleware/rateLimit');
const db = require('../db/database');

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

const CATEGORY_RULES = {
  persons:       "- Noms et prénoms → remplacés par \"Monsieur A\", \"Madame B\", \"Dr. C\"... (lettres alphabétiques dans l'ordre d'apparition, respect du genre et du titre)",
  numbers:       "- Numéros structurés (téléphone, sécurité sociale, IBAN, plaques d'immatriculation, numéros de factures, dossiers, dates de naissance) → [TEL_1], [SS_1], [IBAN_1], [PLAQUE_1], [FACT_1], [REF_1], [DATE_NAISS_1]",
  addresses:     "- Adresses postales complètes → [ADRESSE_1], [ADRESSE_2]...",
  gps:           "- Coordonnées GPS (latitude/longitude) → [GPS_1], [GPS_2]...",
  emails:        "- Adresses email → [EMAIL_1], [EMAIL_2]...",
  sensitive:     "- Données sensibles (santé, religion, syndicat, politique, orientation sexuelle) → [SENSIBLE_1 (catégorie)], [SENSIBLE_2 (catégorie)]...",
  organizations: "- Noms d'organisations, marques, entreprises → [ORG_1], [ORG_2]...",
};

router.post('/', requireAuth, anonymizationRateLimit, async (req, res) => {
  const { text, filename, categories } = req.body;

  if (!text || !text.trim()) return res.status(400).json({ error: 'Texte vide' });
  if (!Array.isArray(categories) || categories.length === 0)
    return res.status(400).json({ error: 'Sélectionnez au moins une catégorie' });

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey === 'VOTRE_CLE_ICI')
    return res.status(500).json({ error: 'Clé API Mistral non configurée — renseignez MISTRAL_API_KEY dans backend/.env' });

  const rules = categories
    .filter(c => CATEGORY_RULES[c])
    .map(c => CATEGORY_RULES[c])
    .join('\n');

  const prompt = `Tu es un expert en anonymisation RGPD. Anonymise le texte suivant en remplaçant toutes les données identifiantes selon ces règles :
${rules}
RÈGLES IMPORTANTES : cohérence des substituts (même personne = même code partout), numérotation séquentielle, conserver la structure et la mise en forme du texte.
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

    if (!parsed)         return res.status(502).json({ error: 'Réponse Mistral non parseable — réessayez' });
    if (!parsed.anonymized) return res.status(502).json({ error: 'Réponse Mistral incomplète (champ anonymized manquant)' });

    const durationMs  = Date.now() - startTime;
    const mapping     = Array.isArray(parsed.mapping) ? parsed.mapping : [];
    const entityCount = mapping.length;
    const entityTypes = {};
    for (const item of mapping) {
      if (item.type) entityTypes[item.type] = (entityTypes[item.type] || 0) + 1;
    }

    const safeFilename = (filename || 'sans_nom.txt').slice(0, 255);

    db.prepare(
      'INSERT INTO history (user_id, filename, entity_count, categories, duration_ms, entity_types) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, safeFilename, entityCount, JSON.stringify(categories), durationMs, JSON.stringify(entityTypes));

    audit(req.user.id, 'ANONYMIZE', `Fichier: ${safeFilename}, Entités: ${entityCount}, Durée: ${durationMs}ms`, req.ip);

    res.json({ anonymized: parsed.anonymized, mapping, durationMs, entityTypes });
  } catch (err) {
    console.error('Anonymization error:', err);
    res.status(500).json({ error: "Erreur interne lors de l'anonymisation" });
  }
});

module.exports = router;
