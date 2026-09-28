import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { AUDIO_PROXY, DATA_DIR, FULL_TRANSCRIPT, PORT, PUBLIC, TRUST_PROXY, WEB_DIST } from './config.js';
import { checkSync, proxyAudio } from './audio.js';
import { getDb } from './db.js';
import { search, loadEpisodeCards } from './search.js';
import { PLATFORMS } from './platforms.js';
import { adminEnabled, isAdmin, login, logout, rateLimit, requireAdmin, securityHeaders } from './security.js';

const db = getDb();
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY);
app.use(securityHeaders);
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));
const jsonBody = express.json({ limit: '10kb' });

const EPISODE_ORDER = {
  recent: 'e.pub_date DESC',
  oldest: 'e.pub_date ASC',
  longest: 'e.duration_sec DESC',
};

app.get('/api/stats', (_req, res) => {
  res.json(db.prepare(`
    SELECT (SELECT count(*) FROM episodes) episodes,
           (SELECT count(*) FROM episodes WHERE has_transcript = 1) transcribed,
           (SELECT count(*) FROM guests) guests,
           (SELECT coalesce(sum(duration_sec), 0) FROM episodes) total_seconds,
           (SELECT count(*) FROM chunks c JOIN embeddings e ON e.hash = c.hash) embedded_chunks,
           (SELECT coalesce(round(sum(end - start)), 0) FROM ad_spans) ad_seconds,
           (SELECT min(pub_date) FROM episodes) first_date,
           (SELECT max(pub_date) FROM episodes) last_date
  `).get());
});

app.get('/api/platforms', (_req, res) => res.json(PLATFORMS));

// Réseaux et projets de Flo & Adrien : fichier éditable à la main (relu à chaque requête).
app.get('/api/people', (_req, res) => {
  const file = path.join(DATA_DIR, 'people.json');
  if (!fs.existsSync(file)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')).people ?? []);
});

// --- Hors Floodcast ---------------------------------------------------------------
// data/offsite.json est rempli par `npm run offsite`. Public : uniquement les contenus gardés.
// Le tri se fait dans l'espace /admin (session administrateur obligatoire).
const OFFSITE_FILE = path.join(DATA_DIR, 'offsite.json');
const OFFSITE_TYPES = ['interview', 'podcast', 'vidéo', 'live', 'sketch', 'extrait', 'coulisses', 'bande-annonce', 'critique', 'émission'];
const OFFSITE_STATUSES = ['pending', 'kept', 'rejected'];
const readOffsite = () => (fs.existsSync(OFFSITE_FILE) ? JSON.parse(fs.readFileSync(OFFSITE_FILE, 'utf8')) : { items: [] });
const PUBLIC_OFFSITE_FIELDS = ['id', 'source', 'url', 'title', 'show', 'date', 'duration', 'people', 'type', 'thumbnail'];

app.get('/api/offsite', (_req, res) => {
  const { items } = readOffsite();
  const kept = items
    .filter((i) => i.status === 'kept')
    .map((i) => Object.fromEntries(PUBLIC_OFFSITE_FIELDS.map((k) => [k, i[k] ?? null])));
  res.json({ types: OFFSITE_TYPES, items: kept });
});

// --- Administration ------------------------------------------------------------------
app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60_000, max: 5, message: 'Trop de tentatives, réessaie dans 15 minutes.' }), jsonBody, login);
app.post('/api/admin/logout', logout);
app.get('/api/admin/me', (req, res) => res.json({ enabled: adminEnabled(), admin: isAdmin(req) }));

app.get('/api/admin/offsite', requireAdmin, (req, res) => {
  const { items, updated_at } = readOffsite();
  const status = OFFSITE_STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const counts = Object.fromEntries(OFFSITE_STATUSES.map((st) => [st, items.filter((i) => i.status === st).length]));
  res.json({ types: OFFSITE_TYPES, counts, updated_at, items: items.filter((i) => i.status === status) });
});

app.patch('/api/admin/offsite/:id', requireAdmin, jsonBody, (req, res) => {
  const store = readOffsite();
  const item = store.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Contenu introuvable' });
  const { status, type, people } = req.body ?? {};
  if (OFFSITE_STATUSES.includes(status)) item.status = status;
  if (OFFSITE_TYPES.includes(type)) item.type = type;
  if (Array.isArray(people)) item.people = [...new Set(people.filter((p) => p === 'flo' || p === 'adrien'))];
  const tmp = `${OFFSITE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, OFFSITE_FILE);
  res.json(item);
});

app.get('/api/seasons', (_req, res) => {
  res.json(db.prepare(`
    SELECT season, count(*) episodes, min(pub_date) first_date, max(pub_date) last_date
    FROM episodes WHERE season IS NOT NULL GROUP BY season ORDER BY season
  `).all());
});

app.get('/api/episodes', (req, res) => {
  const { guest, season, q, transcribed } = req.query;
  const where = [];
  const params = [];
  if (guest) {
    // Plusieurs invités possibles (?guest=a,b) : épisodes où ils sont TOUS présents.
    const slugs = String(guest).split(',').filter(Boolean);
    for (const s of slugs) {
      where.push('e.id IN (SELECT eg.episode_id FROM episode_guests eg JOIN guests g ON g.id = eg.guest_id WHERE g.slug = ?)');
      params.push(s);
    }
  }
  if (season) {
    where.push('e.season = ?');
    params.push(Number(season));
  }
  if (transcribed === '1') where.push('e.has_transcript = 1');
  if (q) {
    where.push("(e.full_title LIKE ? OR e.topics LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const order = EPISODE_ORDER[req.query.sort] ?? EPISODE_ORDER.recent;
  const ids = db.prepare(`SELECT e.id FROM episodes e ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`)
    .all(...params).map((r) => r.id);
  const cards = loadEpisodeCards(db, ids);
  res.json(ids.map((id) => cards.get(id)));
});

app.get('/api/episodes/:slug', (req, res) => {
  const row = db.prepare('SELECT id FROM episodes WHERE slug = ? OR id = ? OR lower(code) = lower(?)')
    .get(req.params.slug, req.params.slug, req.params.slug);
  if (!row) return res.status(404).json({ error: 'Épisode introuvable' });
  const card = loadEpisodeCards(db, [row.id]).get(row.id);
  const extra = db.prepare('SELECT description, link, transcript_model FROM episodes WHERE id = ?').get(row.id);
  const siblings = db.prepare(`
    SELECT
      (SELECT slug FROM episodes WHERE pub_date < e.pub_date ORDER BY pub_date DESC LIMIT 1) prev,
      (SELECT slug FROM episodes WHERE pub_date > e.pub_date ORDER BY pub_date ASC LIMIT 1) next
    FROM episodes e WHERE e.id = ?
  `).get(row.id);
  const adSpans = db.prepare('SELECT start, end FROM ad_spans WHERE episode_id = ? ORDER BY start').all(row.id);
  res.json({ ...card, ...extra, ...siblings, ad_spans: adSpans, full_transcript: FULL_TRANSCRIPT || isAdmin(req) });
});

app.get('/api/episodes/:slug/transcript', (req, res) => {
  // Publier le texte intégral revient à reproduire l'épisode : désactivé par défaut en ligne.
  if (!FULL_TRANSCRIPT && !isAdmin(req)) {
    return res.status(403).json({ error: 'Transcription intégrale non publiée', reason: 'copyright' });
  }
  const row = db.prepare('SELECT id FROM episodes WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Épisode introuvable' });
  const rows = db.prepare('SELECT start, end, text, is_ad FROM segments WHERE episode_id = ? ORDER BY start').all(row.id);
  res.json(rows.map((r) => ({ ...r, is_ad: !!r.is_ad })));
});

// L'écoute correspondra-t-elle exactement à la transcription ? (même assemblage de pubs)
app.get('/api/episodes/:slug/sync', async (req, res) => {
  const ep = db.prepare('SELECT id, audio_url, audio_bytes FROM episodes WHERE slug = ?').get(req.params.slug);
  if (!ep) return res.status(404).json({ error: 'Épisode introuvable' });
  if (!AUDIO_PROXY) return res.json({ status: 'unknown', reason: 'Relais audio désactivé' });
  res.json(await checkSync(ep));
});

app.get('/api/guests',(_req, res) => {
  res.json(db.prepare(`
    SELECT g.name, g.slug, count(*) episodes, min(e.pub_date) first_date, max(e.pub_date) last_date
    FROM guests g JOIN episode_guests eg ON eg.guest_id = g.id JOIN episodes e ON e.id = eg.episode_id
    GROUP BY g.id ORDER BY episodes DESC, g.name COLLATE NOCASE
  `).all());
});

app.get('/api/guests/:slug', (req, res) => {
  const guest = db.prepare('SELECT id, name, slug FROM guests WHERE slug = ?').get(req.params.slug);
  if (!guest) return res.status(404).json({ error: 'Invité introuvable' });
  const ids = db.prepare(`
    SELECT e.id FROM episodes e JOIN episode_guests eg ON eg.episode_id = e.id
    WHERE eg.guest_id = ? ORDER BY e.pub_date DESC
  `).all(guest.id).map((r) => r.id);
  const cards = loadEpisodeCards(db, ids);
  // Les compagnons de table les plus fréquents.
  const buddies = db.prepare(`
    SELECT g.name, g.slug, count(*) n FROM episode_guests a
    JOIN episode_guests b ON b.episode_id = a.episode_id AND b.guest_id != a.guest_id
    JOIN guests g ON g.id = b.guest_id WHERE a.guest_id = ?
    GROUP BY g.id ORDER BY n DESC, g.name LIMIT 8
  `).all(guest.id);
  res.json({ name: guest.name, slug: guest.slug, episodes: ids.map((id) => cards.get(id)), buddies });
});

// La recherche sémantique coûte du CPU : limite par IP pour éviter la saturation.
app.get('/api/search', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res, next) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ query: q, results: [], total: 0, tookMs: 0, semantic: false });
  try {
    res.json(await search(db, {
      q: q.slice(0, 300),
      guest: req.query.guest ? String(req.query.guest) : undefined,
      season: req.query.season ? String(req.query.season) : undefined,
      mode: req.query.mode === 'exact' ? 'exact' : 'hybrid',
      limit: Math.min(Number(req.query.limit) || 20, 50),
    }));
  } catch (err) {
    next(err);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Relais audio synchronisé vers Acast (rien n'est stocké, cf. src/audio.js).
if (AUDIO_PROXY) {
  app.get('/audio/:id.mp3', rateLimit({ windowMs: 60_000, max: 120 }), async (req, res) => {
    const ep = db.prepare('SELECT audio_url FROM episodes WHERE id = ?').get(req.params.id);
    if (!ep?.audio_url) return res.status(404).end();
    await proxyAudio(req, res, ep.audio_url);
  });
}
// Relais désactivé (ou fichier inconnu) : vrai 404, pas la page d'accueil de l'app.
app.use('/audio', (_req, res) => res.status(404).json({ error: 'Audio indisponible' }));

// En production, le serveur sert aussi le front Angular compilé.
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const server = app.listen(PORT, () => {
  console.log(`🎙️  Floodcast fan API sur http://localhost:${PORT}`);
  console.log(`   mode ${PUBLIC ? 'PUBLIC' : 'local'} · relais audio ${AUDIO_PROXY ? 'oui' : 'non'} · transcription intégrale ${FULL_TRANSCRIPT ? 'oui' : 'admin seulement'} · admin ${adminEnabled() ? 'activé' : 'désactivé (pas de mot de passe)'}`);
});

// Arrêt propre sur SIGTERM / Ctrl+C.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
