# Floodthèque — l'archive des fans du Floodcast

Tous les épisodes du Floodcast (Florent Bernard & Adrien Ménielle, 2015 → 2025), leurs invités,
leurs transcriptions, et surtout : **retrouver l'épisode à partir d'une phrase dont tu te souviens.**

> Site de fan non officiel. L'audio reste hébergé par Acast. Les transcriptions sont générées localement
> pour un usage personnel de recherche.

## Démarrage rapide

```bash
npm run setup          # dépendances Node (server + web)
npm run setup:whisper  # venv Python + faster-whisper (GPU NVIDIA conseillé)
npm run ingest         # récupère le flux RSS : épisodes + invités
npm run transcribe     # transcrit les MP3 (reprend là où il s'est arrêté)
npm run index          # indexe les transcriptions (plein texte)
npm run embed          # vectorise pour la recherche sémantique (optionnel mais recommandé)
npm run build && npm start   # http://localhost:3000
```

En développement : `npm run dev:api` et `npm run dev:web` dans deux terminaux (http://localhost:4200,
l'API est proxifiée).

## Architecture

```
server/        API Node (Express 5) + SQLite intégré à Node (node:sqlite, FTS5) — aucune dépendance native
  scripts/     ingest-rss · index-transcripts · embed · guests-report
  src/         search.js (recherche hybride), guests.js (extraction des invités), server.js (API)
transcriber/   transcribe.py — faster-whisper large-v3-turbo, inférence par lots sur GPU
web/           Angular 21 (standalone, signals, zoneless), la DA "pellicule jetable"
data/          floodcast.db, transcripts/<guid>.json, guests-overrides.json (optionnel)
```

### Données

- **Épisodes** : flux RSS public Acast (`feeds.acast.com/public/shows/5ffe3facad3e633276e9ea57`), 250 épisodes.
- **Invités** : extraits de la première phrase des descriptions (« Avec X, Y et Z. »), animateurs retirés,
  alias pour fusionner les variantes d'orthographe (`server/src/guests.js`).
  `npm run guests:report` liste les quasi-doublons et les épisodes sans invité détecté.
  Pour corriger à la main, créer `data/guests-overrides.json` :
  ```json
  { "S10E26": ["Invité A", "Invité B"] }
  ```
  puis relancer `npm run ingest`.
- **Transcriptions** : Whisper `large-v3-turbo` en local. Sur une RTX 3070 : environ ×55 temps réel en mode
  batché, soit ~6 h pour les ~440 h d'archive. Un « prompt » avec les noms des invités de l'épisode
  améliore l'orthographe des noms propres.

### La recherche « je me souviens d'une phrase »

Une phrase de mémoire est rarement exacte, donc la recherche combine plusieurs signaux, fusionnés par
**Reciprocal Rank Fusion** puis agrégés par épisode :

1. **Fenêtres glissantes** de ~45 mots avec 50 % de chevauchement : une phrase à cheval sur deux segments
   Whisper n'est pas perdue.
2. **Lexical (SQLite FTS5 / BM25)**, du plus strict au plus tolérant : phrase exacte → mots proches (NEAR) →
   tous les mots → n'importe lequel. Accents ignorés, mots vides retirés, radicalisation légère
   (`chauffeurs` → `chauffeu*`).
3. **Sémantique** (`multilingual-e5-small` via transformers.js, 100 % local) : retrouve
   « le mec qui voulait une nuque longue » même si les mots prononcés étaient différents.
4. **Métadonnées** : titre, invités et « On en parle de choses dans cet épisode : … ». Utile même
   pour les épisodes pas encore transcrits.

Chaque résultat donne les extraits avec leur timecode : un clic lance l'audio Acast à ce moment-là,
ou ouvre la transcription complète centrée sur le passage.

Filtres : par invité (un ou plusieurs, épisodes où ils sont *tous* présents) et par saison.

## Direction artistique : « pellicule jetable »

Inspirée de la pochette du podcast (photo argentique prise au flash dans un salon, canettes rouges,
chemise à carreaux, logo blanc qui coule) et du ton de l'émission (potes, décalé, un peu crado) :

| Élément | Traitement |
| --- | --- |
| Logo | « floodthèque » passé dans un filtre SVG *gooey* + turbulence, avec des gouttes qui tombent |
| Fond | papier photo mat + grain argentique + vignettage ; halo de flash sur le hero |
| Épisodes | tirages photo scotchés, légèrement de travers, qui se redressent au survol |
| Dates / timecodes | date orange incrustée façon appareil jetable (VT323 + lueur) |
| Invités | étiquettes **Dymo** embossées |
| Couleurs | encre `#151515`, papier `#ECE8DF`, mur au flash `#C9D6E0`, canette `#C81E2B`, date `#FF6A13` |
| Typo | Rubik (titres), Space Grotesk (texte), Instrument Serif italique (citations), Oswald (étiquettes) |
| Thèmes | « flash » (clair) et « chambre noire » (sombre), auto ou forcé |
| Ton | micro-textes dans l'esprit de l'émission (« Personne n'a dit ça. Ou alors c'était off. », « Bises, les fans. ») |

## API

| Route | Description |
| --- | --- |
| `GET /api/search?q=&guest=&season=&mode=hybrid\|exact` | recherche par phrase |
| `GET /api/episodes?guest=a,b&season=&q=&sort=recent\|oldest\|longest&transcribed=1` | liste filtrée |
| `GET /api/episodes/:slug` · `/api/episodes/:slug/transcript` | fiche + transcription horodatée |
| `GET /api/guests` · `/api/guests/:slug` | invités (+ compagnons de table fréquents) |
| `GET /api/stats` · `/api/seasons` | compteurs |

## Mise en ligne

Voir [DEPLOY.md](DEPLOY.md) : version statique sur GitHub Pages (`npm run export` puis push), ou serveur Node en mode public.
