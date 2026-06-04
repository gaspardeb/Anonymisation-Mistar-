const express = require('express');
const { requireAuth }           = require('../middleware/auth');
const { anonymizationRateLimit } = require('../middleware/rateLimit');
const db                        = require('../db/database');

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

function normalizeWord(t) {
  return (t || '').toLowerCase().replace(/[.,;:!?\-'"()[\]{}/\\«»]/g, '').trim();
}

function matchEntityBbox(entityText, words) {
  if (!entityText?.trim() || !words?.length) return null;
  const tokens = entityText.trim().split(/\s+/).filter(Boolean);

  for (let wi = 0; wi <= words.length - tokens.length; wi++) {
    let allMatch = true;
    for (let off = 0; off < tokens.length; off++) {
      const et = normalizeWord(tokens[off]);
      const wt = normalizeWord(words[wi + off]?.text || '');
      if (!et || !wt) { allMatch = false; break; }
      if (!wt.includes(et) && !et.includes(wt) && wt !== et) { allMatch = false; break; }
    }
    if (!allMatch) continue;

    const matched = words.slice(wi, wi + tokens.length);
    return {
      bbox: [
        Math.min(...matched.map(w => w.bbox[0])),
        Math.min(...matched.map(w => w.bbox[1])),
        Math.max(...matched.map(w => w.bbox[2])),
        Math.max(...matched.map(w => w.bbox[3])),
      ],
      wordConfidence: Math.round(
        matched.reduce((s, w) => s + (w.confidence || 80), 0) / matched.length
      ),
    };
  }
  return null;
}

router.post('/detect', requireAuth, anonymizationRateLimit, async (req, res) => {
  const { ocrText, words = [], filename = '', pageIndex = 0 } = req.body;

  if (!ocrText?.trim()) return res.status(400).json({ error: 'Texte OCR vide' });

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey === 'VOTRE_CLE_ICI')
    return res.status(500).json({ error: 'Clé API Mistral non configurée — renseignez MISTRAL_API_KEY dans backend/.env' });

  const start = Date.now();

  const prompt = `Tu es un expert en anonymisation RGPD spécialisé dans les documents scannés. Le texte ci-dessous a été extrait par OCR et peut contenir des erreurs de reconnaissance (caractères mal lus, accents manquants, espaces parasites).

RÈGLE ABSOLUE : le champ "text" de chaque entité doit reproduire exactement les caractères tels qu'ils apparaissent dans le texte OCR, y compris les éventuelles fautes OCR, sans les corriger.

Texte OCR :
"""
${ocrText}
"""

Retourne un objet JSON contenant un tableau "entities" avec toutes les données personnelles identifiantes :
{
  "entities": [
    { "text": "texte exact du document", "type": "TYPE" }
  ]
}

Types acceptés : PERSON, EMAIL, PHONE, ADDRESS, DOB, IBAN, SSN, ID_NUMBER, MEDICAL, ORG

Règles :
- PERSON : noms, prénoms, pseudonymes de personnes physiques
- EMAIL : adresses email
- PHONE : numéros de téléphone (fixe, mobile, fax)
- ADDRESS : adresses postales (rue, ville, code postal)
- DOB : dates de naissance
- IBAN : coordonnées bancaires (IBAN, RIB, numéro de compte)
- SSN : numéro de sécurité sociale / NIR
- ID_NUMBER : numéro de dossier, référence client, identifiant unique
- MEDICAL : pathologie, traitement, diagnostic nominatif
- ORG : organisations privées (cliniques, cabinets, sociétés) si elles identifient une personne

Ne pas détecter : noms de villes génériques, dates historiques, montants financiers sans titulaire.
Si aucune donnée personnelle n'est trouvée, retourner { "entities": [] }.`;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:           'mistral-large-latest',
        messages:        [{ role: 'user', content: prompt }],
        temperature:     0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = "Erreur de l'API Mistral";
      try {
        const j = JSON.parse(errText);
        if (j?.message)           msg = `Mistral : ${j.message}`;
        if (response.status === 401) msg = 'Clé API Mistral invalide';
        if (response.status === 429) msg = 'Quota Mistral dépassé — réessayez dans un moment';
      } catch {}
      return res.status(502).json({ error: msg });
    }

    const data    = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed  = parseJsonSafely(content);

    if (!parsed) return res.status(502).json({ error: 'Réponse Mistral non parseable' });

    const rawEntities = Array.isArray(parsed)
      ? parsed
      : (parsed.entities || parsed.data || parsed.results || []);

    const entities = [];
    for (const raw of rawEntities) {
      if (!raw.text?.trim() || !raw.type) continue;
      const match = matchEntityBbox(raw.text, words);
      if (match) {
        entities.push({
          text:       raw.text,
          type:       raw.type,
          bbox:       match.bbox,
          confidence: match.wordConfidence,
        });
      }
    }

    const durationMs  = Date.now() - start;
    const entityTypes = entities.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {});

    try {
      db.prepare(
        'INSERT INTO history (user_id, filename, entity_count, categories, duration_ms, entity_types, anonymization_mode) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        req.user.id,
        `[SCAN] ${(filename || 'scan').slice(0, 240)}`,
        entities.length,
        JSON.stringify(['scan']),
        durationMs,
        JSON.stringify(entityTypes),
        'scan',
      );
    } catch {}

    res.json({ entities, durationMs });
  } catch (err) {
    console.error('scan-detect error:', err);
    res.status(500).json({ error: "Erreur interne lors de la détection" });
  }
});

module.exports = router;
