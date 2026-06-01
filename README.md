# Anonymisation RGPD

Plateforme web d'anonymisation de documents sensibles, propulsée par Mistral AI.

---

## Prérequis

- Node.js 18 ou supérieur
- npm 9+

---

## Installation

```bash
# 1. Cloner le dépôt puis se placer à la racine
npm run install:all
```

Cela installe les dépendances du projet racine, du backend et du frontend en une seule commande.

---

## Configuration

```bash
cp backend/.env.example backend/.env
```

Ouvrir `backend/.env` et renseigner les valeurs :

```
MISTRAL_API_KEY=votre_clé_api_mistral
JWT_SECRET=une_chaine_aleatoire_longue_et_secrete
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

- **MISTRAL_API_KEY** : obtenir une clé sur https://console.mistral.ai
- **JWT_SECRET** : chaîne aléatoire d'au moins 32 caractères (ex: `openssl rand -hex 32`)

---

## Démarrage

```bash
npm run dev
```

Lance le backend (port 3001) et le frontend (port 3000) simultanément.

Ouvrir http://localhost:3000 dans le navigateur.

---

## Premier accès

| Champ | Valeur |
|-------|--------|
| Email | `admin@entreprise.fr` |
| Mot de passe | `Admin1234!` |

**Le mot de passe doit être changé à la première connexion.**

---

## Fonctionnalités

### Anonymisation
- Interface deux panneaux : texte original / texte anonymisé
- Import de fichiers `.txt` et `.docx`
- Filtres par catégorie : noms, numéros structurés, adresses, GPS, emails, données sensibles, organisations
- Résultat coloré par type d'entité
- Panneau "Mapping" : tableau original → substitut
- Export en `.txt` et `.docx`

### Historique
- Chaque traitement est enregistré (utilisateur, fichier, nombre d'entités, date)
- Le contenu des documents n'est jamais stocké
- Filtrable par utilisateur (admin uniquement)

### Administration *(admin uniquement)*
- Créer / désactiver / réinitialiser les comptes utilisateurs
- Statistiques d'utilisation
- Mettre à jour la clé API Mistral sans redéployer
- Journaux d'audit

### Sécurité
- JWT en cookie httpOnly
- Clé API Mistral jamais exposée au frontend
- Rate limiting : 10 anonymisations / heure / utilisateur
- Logs d'audit sans stockage du contenu des documents

---

## Structure du projet

```
/
├── backend/
│   ├── server.js           Point d'entrée Express
│   ├── routes/             auth · anonymize · history · admin
│   ├── middleware/         auth JWT · rate limit
│   ├── db/                 SQLite (better-sqlite3)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/          Login · Anonymizer · History · Admin
│   │   ├── components/     Layout · FileImport · MappingPanel
│   │   └── api/client.js
│   └── package.json
├── data/                   Base SQLite (générée automatiquement)
└── package.json            Scripts racine (concurrently)
```

---

## Déploiement sur Antigravity

### Build du frontend

```bash
npm run build
# Génère frontend/dist/
```

### Variables d'environnement à configurer sur le serveur

```
MISTRAL_API_KEY=...
JWT_SECRET=...
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://votre-domaine.fr
```

### Servir les fichiers statiques du frontend

Dans `backend/server.js`, ajouter avant le lancement en production :

```js
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});
```

### Démarrage en production

```bash
cd backend && node server.js
```

Ou avec un gestionnaire de processus :

```bash
npm install -g pm2
pm2 start backend/server.js --name anonymisation
pm2 save
```

### Note sur better-sqlite3

`better-sqlite3` est un module natif Node.js. Sur Antigravity, s'assurer que les outils de compilation natifs sont disponibles (`python3`, `make`, `g++`) ou utiliser un environnement avec des binaires pré-compilés pour la version Node.js cible.

```bash
# Si la compilation échoue :
cd backend && npm rebuild better-sqlite3
```

---

## Licence

Usage interne — tous droits réservés.
