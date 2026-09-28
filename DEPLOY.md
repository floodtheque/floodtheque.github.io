# Mettre la Floodthèque en ligne

## GitHub Pages (version statique, recommandée)

GitHub Pages ne sert que des fichiers : pas de serveur Node en ligne. Tout le calcul (transcription,
index, tri « Hors Floodcast ») reste sur ta machine, et le site publié lit des fichiers JSON exportés.

| Local (serveur Node) | En ligne (GitHub Pages) |
| --- | --- |
| Recherche mots + sens (embeddings) | Recherche mots / phrases, dans le navigateur du visiteur |
| `/admin` pour trier « Hors Floodcast » | Pas d'admin : on trie en local puis on exporte |
| Relais audio synchronisé | Lecture directe Acast (timecodes approximatifs, pubs variables) |
| Transcriptions complètes | Transcriptions complètes **publiques** (fichiers JSON téléchargeables) |

### Première mise en ligne
1. Remplir les champs `[À COMPLÉTER]` de `web/src/app/pages/legal.page.ts` (éditeur, contact).
2. Créer un dépôt sur GitHub (ex. `floodtheque`), puis dans *Settings → Pages* : **Source = GitHub Actions**.
3. Exporter les données et pousser :
   ```bash
   npm run export
   git init && git add . && git commit -m "Floodthèque"
   git branch -M main && git remote add origin https://github.com/<toi>/floodtheque.git && git push -u origin main
   ```
4. Le workflow `.github/workflows/pages.yml` construit le site (base href = `/<nom du dépôt>/`) et le publie
   sur `https://<toi>.github.io/floodtheque/`.

### Mettre à jour
```bash
npm run ingest            # nouveaux épisodes
npm run transcribe        # transcription GPU
npm run index             # index + détection des pubs
npm run export            # -> web/site-data/
git add web/site-data && git commit -m "Nouveaux épisodes" && git push
```
Pour « Hors Floodcast » : `npm run offsite`, tri dans `/admin` en local (`npm start`), puis `npm run export` et push.

Tester la version statique en local : `npm run build:pages` (sortie : `web/dist/pages/browser`).

---

## Serveur Node en mode public (alternative)

### 1. Avant de publier (obligatoire)

- [ ] **Mentions légales** : remplir les champs `[À COMPLÉTER]` dans `web/src/app/pages/legal.page.ts`
      (éditeur ou pseudonyme, contact, hébergeur). Obligatoire en France (LCEN).
- [ ] **Mot de passe admin** : `npm run admin:password` (12 caractères minimum). Seul un hash est
      écrit dans `.env`. Sans ce hash, l'espace `/admin` est simplement désactivé.
- [ ] **Build** : `npm run build`

### 2. Variables d'environnement du serveur

| Variable | Valeur en ligne | Rôle |
| --- | --- | --- |
| `FLOOD_PUBLIC` | `1` | Active les réglages prudents ci-dessous + cookie `Secure` + HSTS |
| `FLOOD_ADMIN_PASSWORD_HASH` | (depuis `.env`) | Mot de passe admin haché |
| `FLOOD_TRUST_PROXY` | `1` si nginx/Caddy devant | Pour que les limites de débit voient la vraie IP |
| `PORT` | `3000` | Port d'écoute (derrière le reverse proxy) |
| `FLOOD_FULL_TRANSCRIPT` | *(ne pas définir)* | En public, transcription intégrale réservée à l'admin. Mettre `1` seulement avec l'accord des ayants droit |
| `FLOOD_AUDIO_PROXY` | *(ne pas définir)* | En public, lecture directe du flux Acast (voir plus bas) |

### 3. Ce que fait le mode public

| Protection | Détail |
| --- | --- |
| Espace admin | Mot de passe (scrypt), session serveur, cookie `HttpOnly` + `SameSite=Strict` + `Secure`, en-tête anti-CSRF, 5 essais / 15 min |
| En-têtes HTTP | CSP stricte, `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy` |
| Limites de débit | 300 req/min sur l'API, 30 recherches/min, par IP |
| Transcriptions | Recherche et courts extraits horodatés publics ; texte intégral réservé à l'admin (droit d'auteur) |
| Hors Floodcast | Seuls les contenus gardés sont publics, sans les champs internes |
| Audio | Pas de relais : les visiteurs écoutent directement Acast (statistiques et pubs normales pour l'émission) |
| Polices | Auto-hébergées, aucun appel à Google |

**Conséquence du mode public sur l'audio** : Acast insère des pubs différentes pour chaque auditeur,
donc un timecode peut être décalé de la durée de ces pubs (le site l'indique). En local, le relais
synchronisé reste actif et les timecodes sont exacts.

### 4. Ce qu'il faut copier sur le serveur

Pas besoin de Python, de GPU ni des MP3 : tout le calcul lourd se fait sur ta machine.

```
server/            (avec node_modules : npm ci --omit=dev)
web/dist/          (le front compilé, servi par le serveur Node)
data/floodcast.db  (épisodes, invités, index de recherche, embeddings)
data/people.json
data/offsite.json
.env               (le hash admin)
```

`data/transcripts/` n'est pas nécessaire en ligne (tout est déjà dans la base).
Node ≥ 22.13 requis. Au premier appel, la recherche sémantique télécharge le modèle (~120 Mo).

### 5. Exemple nginx (HTTPS obligatoire)

```nginx
server {
  server_name floodtheque.example;
  listen 443 ssl http2;
  # certificats Let's Encrypt (certbot) …

  client_max_body_size 16k;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Lancer le serveur : `FLOOD_PUBLIC=1 FLOOD_TRUST_PROXY=1 npm start` (ou via un service systemd / pm2).

### 6. Mettre à jour le contenu

Sur ta machine : `npm run update` (nouveaux épisodes, transcription, index, embeddings),
`npm run offsite` puis tri dans `/admin`. Ensuite, recopier `data/floodcast.db` et `data/offsite.json`.
