// Export de la base vers des fichiers JSON statiques, pour la version GitHub Pages du site.
// Usage : npm run export  (écrit dans web/site-data/, copié dans le build Angular "pages" sous /data)
//
//   web/site-data/site.json              stats, saisons, plateformes, Flo & Adrien, invités, épisodes, Hors Floodcast
//   web/site-data/episodes/<slug>.json   détail + transcription complète d'un épisode
//   web/site-data/search.json            corpus de recherche (transcriptions hors pubs + métadonnées)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ROOT } from '../src/config.js';
import { getDb } from '../src/db.js';
import { PLATFORMS } from '../src/platforms.js';
import { loadEpisodeCards } from '../src/search.js';
import { STOPWORDS } from '../src/text.js';

const OUT = path.resolve(ROOT, process.argv[2] ?? 'web/site-data');
const OFFSITE_TYPES = ['interview', 'podcast', 'vidéo', 'live', 'sketch', 'extrait', 'coulisses', 'bande-annonce', 'critique', 'émission'];
const PUBLIC_OFFSITE_FIELDS = ['id', 'source', 'url', 'title', 'show', 'date', 'duration', 'people', 'type', 'thumbnail'];

const db = getDb();
const r2 = (n) => Math.round(n * 100) / 100;
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

// On repart d'un dossier propre : un épisode renommé ne doit pas laisser de fichier orphelin.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'episodes'), { recursive: true });

const ids = db.prepare('SELECT id FROM episodes ORDER BY pub_date DESC').all().map((r) => r.id);
const cards = loadEpisodeCards(db, ids);
const episodes = ids.map((id) => ({ ...cards.get(id), audio_proxy: false, audio_bytes: undefined }));

const stats = db.prepare(`
  SELECT (SELECT count(*) FROM episodes) episodes,
         (SELECT count(*) FROM episodes WHERE has_transcript = 1) transcribed,
         (SELECT count(*) FROM guests) guests,
         (SELECT coalesce(sum(duration_sec), 0) FROM episodes) total_seconds,
         0 embedded_chunks,
         (SELECT coalesce(round(sum(end - start)), 0) FROM ad_spans) ad_seconds,
         (SELECT min(pub_date) FROM episodes) first_date,
         (SELECT max(pub_date) FROM episodes) last_date
`).get();

const seasons = db.prepare(`
  SELECT season, count(*) episodes, min(pub_date) first_date, max(pub_date) last_date
  FROM episodes WHERE season IS NOT NULL GROUP BY season ORDER BY season
`).all();

const guests = db.prepare(`
  SELECT g.name, g.slug, count(*) episodes, min(e.pub_date) first_date, max(e.pub_date) last_date
  FROM guests g JOIN episode_guests eg ON eg.guest_id = g.id JOIN episodes e ON e.id = eg.episode_id
  GROUP BY g.id ORDER BY episodes DESC, g.name COLLATE NOCASE
`).all();

// Hors Floodcast : uniquement les contenus gardés, sans les champs internes (comme l'API publique).
const offsiteItems = readJson(path.join(DATA_DIR, 'offsite.json'), { items: [] }).items
  .filter((i) => i.status === 'kept')
  .map((i) => Object.fromEntries(PUBLIC_OFFSITE_FIELDS.map((k) => [k, i[k] ?? null])));

const write = (rel, data) => fs.writeFileSync(path.join(OUT, rel), JSON.stringify(data));

write('site.json', {
  generated_at: new Date().toISOString(),
  stats,
  seasons,
  platforms: PLATFORMS,
  people: readJson(path.join(DATA_DIR, 'people.json'), { people: [] }).people ?? [],
  guests,
  episodes,
  offsite: { types: OFFSITE_TYPES, items: offsiteItems },
});

// Détail + transcription de chaque épisode. Segments en tableaux compacts [start, end, text, is_ad].
const extraStmt = db.prepare('SELECT description, link, transcript_model FROM episodes WHERE id = ?');
const segStmt = db.prepare('SELECT start, end, text, is_ad FROM segments WHERE episode_id = ? ORDER BY start');
const adStmt = db.prepare('SELECT start, end FROM ad_spans WHERE episode_id = ? ORDER BY start');
const corpus = [];

episodes.forEach((ep, i) => {
  const extra = extraStmt.get(ep.id);
  const segments = segStmt.all(ep.id);
  write(`episodes/${ep.slug}.json`, {
    ...extra,
    // Liste triée du plus récent au plus ancien : le précédent est après, le suivant avant.
    prev: episodes[i + 1]?.slug ?? null,
    next: episodes[i - 1]?.slug ?? null,
    ad_spans: adStmt.all(ep.id).map((s) => ({ start: r2(s.start), end: r2(s.end) })),
    segments: segments.map((s) => [r2(s.start), r2(s.end), s.text, s.is_ad ? 1 : 0]),
  });
  corpus.push({
    id: ep.id,
    meta: [ep.full_title, ep.guests.map((g) => g.name).join(', '), ep.topics ?? '', extra.description ?? ''].join(' \n '),
    // Comme sur le serveur, les pubs sont exclues de la recherche.
    segs: segments.filter((s) => !s.is_ad).map((s) => [r2(s.start), r2(s.end), s.text]),
  });
});

write('search.json', { stopwords: [...STOPWORDS], episodes: corpus });

const size = (rel) => `${(fs.statSync(path.join(OUT, rel)).size / 1e6).toFixed(1)} Mo`;
console.log(`✓ ${episodes.length} épisodes (${stats.transcribed} transcrits), ${guests.length} invités, ${offsiteItems.length} contenus Hors Floodcast`);
console.log(`  site.json ${size('site.json')} · search.json ${size('search.json')} → ${path.relative(ROOT, OUT)}/`);
