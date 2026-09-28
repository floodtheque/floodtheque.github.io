# Todolist Floodthèque

## En cours
- [ ] Transcription de tous les épisodes (Whisper, GPU, en fond) — suivi : `data/transcribe.log`

## Publicités
- [x] Détection des pubs Acast par empreintes répétées entre épisodes + formules pub (mentions légales, « Acast Recommande »)
- [x] Découpe à la phrase, redécoupage des segments à la frontière pub/contenu
- [x] Pubs exclues de l'index de recherche (lexical + sémantique)
- [x] Cache d'embeddings par empreinte (une réindexation complète ne relance pas tout le calcul)
- [x] Affichage des coupures pub repliées dans la transcription (« 📺 Coupure pub · 30 s »)
- [x] Compteur de minutes de pub écartées sur l'accueil
- [x] Faux positifs sur le générique d'intro (« Il s'agit du Floodcast… ») : phrases parlant de l'émission ignorées
- [x] Décalage des timecodes SANS stocker l'audio : relais local vers Acast avec le même User-Agent que le
      transcripteur → même assemblage de pubs, timecodes exacts ; vérification par taille de fichier
      (`--resync` retranscrit les épisodes désynchronisés). MP3 locaux supprimés.
- [ ] En ligne (relais désactivé) : timecodes approximatifs. Piste : recalage par empreinte audio

## Plateformes d'écoute
- [x] Liens Spotify, Deezer, Apple Podcasts sur tout le site (niveau podcast)
- [x] Liens par épisode : Apple (API iTunes, ~200 épisodes les plus récents) et Deezer (API publique)
- [x] Spotify par épisode : lien de recherche en attendant (l'API Spotify demande une clé développeur)

## Légal
- [x] Page « Mentions légales » : site de fan non officiel, aucun revenu, propriété intellectuelle,
      données personnelles, retrait sur demande
- [ ] Compléter l'éditeur et l'hébergeur dans la page (à remplir par toi, voir `[À COMPLÉTER]`)
- [x] Polices auto-hébergées (Fontsource, sous-ensemble latin) : plus aucun appel à Google Fonts

## Autour de Flo & Adrien
- [x] Section « Suivre Flober & Adrien » : réseaux vérifiés sur leurs pages officielles (`data/people.json`)
- [x] Page « Leurs projets » (page `/flo-et-adrien`, rôles laissés vides quand non confirmés) : films, séries, livres/BD, spectacles, autres podcasts (ex. le film de Flo,
      les projets Golden Moustache, les séries YouTube Originals évoquées dans l'émission…), avec dates et liens
- [x] Page « Hors Floodcast » (`/hors-floodcast`) : tout le contenu relatif à eux ailleurs (interviews vidéo, passages dans
      d'autres podcasts, émissions, making-of, lives), classé par date/type, avec filtre
  - [x] Collecte : `npm run offsite` (YouTube via yt-dlp + podcasts via l'API Apple), relançable sans perdre le tri
  - [ ] **Finir le tri** (92 restants) dans `/admin`, raccourcis G / X / U
  - [x] Données dans `data/offsite.json` (titre, type, date, plateforme, lien, avec qui) pour pouvoir compléter à la main
  - [ ] Bonus : transcrire aussi ces contenus pour les rendre cherchables avec la même recherche

## Sécurité / mise en ligne (voir DEPLOY.md)
- [x] **GitHub Pages** : version statique (`npm run export` + build `pages`), recherche dans le navigateur, workflow `.github/workflows/pages.yml`
- [ ] Créer le dépôt GitHub, activer Pages (source : GitHub Actions), premier push (DEPLOY.md)
- [ ] Transcriptions désormais publiques : prévenir / demander l'accord de Flo & Adrien si possible
- [x] Espace `/admin` avec mot de passe haché, session HttpOnly/SameSite/Secure, anti-CSRF, anti force brute
- [x] En-têtes de sécurité (CSP, anti-iframe, HSTS…), limites de débit (API, recherche)
- [x] Mode `FLOOD_PUBLIC=1` : transcription intégrale réservée à l'admin (droit d'auteur), pas de relais audio
- [x] Dépendances : 0 vulnérabilité (transformers.js 4)
- [x] Mot de passe admin défini (`npm run admin:password`)

## Fun
- [x] Épisode au hasard « Au pif » : défilement de tirages, flash, photo qui se développe (menu + accueil)
- [x] Plus de barres de défilement pendant l'animation
- [x] Easter eggs : taper « 14 » (tampon « N°14 ») ou « sax » (pluie de 🎷) n'importe où, recherche « quatorze » / « sax », 🎷 caché dans le pied de page, message dans la console

## Après la transcription complète
- [ ] `npm run index && npm run export`, puis commit + push de `web/site-data/` (mise à jour du site)
- [x] Relire `npm run guests:report` : 2 heures de perdues, Hot Girls Only, Moguri, Anis → Anis Rhali, Le Père Fouras
