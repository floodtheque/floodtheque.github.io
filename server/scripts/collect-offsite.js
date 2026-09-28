// Collecte des contenus "hors Floodcast" liés à Flo & Adrien : interviews vidéo, passages
// dans d'autres podcasts, émissions… Les résultats arrivent en statut "pending" dans
// data/offsite.json : c'est à toi de trier (page /hors-floodcast, onglet "À trier").
// Relancer le script n'écrase jamais un tri déjà fait.
//
// Usage : npm run offsite            (YouTube via yt-dlp + podcasts via l'API Apple)
//         npm run offsite -- --no-youtube
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../src/config.js';
import { fold } from '../src/text.js';

const run = promisify(execFile);
const FILE = path.join(DATA_DIR, 'offsite.json');
const withYoutube = !process.argv.includes('--no-youtube');

const YT_QUERIES = [
  'Florent Bernard', 'Florent Bernard interview', 'Florent Bernard podcast', 'FloBer Florent Bernard',
  'Adrien Ménielle', 'Adrien Ménielle interview', 'Adrien Ménielle podcast', 'Adrien Ménielle live',
  'Florent Bernard Adrien Ménielle', 'Floodcast interview', 'Nous les Leroy Florent Bernard',
];
const APPLE_TERMS = ['Florent Bernard', 'Adrien Ménielle', 'Adrien Menielle', 'FloBer', 'Floodcast'];
const PER_QUERY = 30;

// --- Qui est concerné ? -------------------------------------------------------
function whoIsIn(text) {
  const t = ` ${fold(text)} `;
  const people = new Set();
  if (/ florent bernard | flober /.test(t)) people.add('flo');
  // "Ménielle" seul attraperait aussi Julien, le frère d'Adrien.
  if (/ adrien menielle | adrienmenielle /.test(t) || (/ adrien /.test(t) && / menielle /.test(t))) people.add('adrien');
  if (/ floodcast /.test(t)) { people.add('flo'); people.add('adrien'); }
  return [...people];
}

function guessType(source, title, show = '') {
  const t = fold(title);
  if (source === 'apple') return 'podcast';
  if (/golden moustache/.test(fold(show ?? ''))) return 'sketch';
  if (/critique|review|avis sur/.test(t)) return 'critique';
  if (/\bpodcast\b/.test(t)) return 'podcast';
  if (/interview|entretien|\bitw\b|rencontre avec/.test(t)) return 'interview';
  if (/\blive\b|twitch|stream/.test(t)) return 'live';
  if (/making of|coulisses|behind/.test(t)) return 'coulisses';
  if (/bande annonce|trailer|teaser/.test(t)) return 'bande-annonce';
  if (/floodcast/.test(t)) return 'extrait';
  return 'vidéo';
}

const excerpt = (s = '') => s.replace(/\s+/g, ' ').trim().slice(0, 220);

// --- YouTube ------------------------------------------------------------------
async function ytdlp(args) {
  // lang=fr : sinon YouTube renvoie des titres traduits automatiquement en anglais.
  const { stdout } = await run('yt-dlp', ['--no-update', '--no-warnings', '--extractor-args', 'youtube:lang=fr', ...args], { maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

async function collectYoutube() {
  const found = new Map();
  for (const q of YT_QUERIES) {
    process.stdout.write(`  YouTube « ${q} »… `);
    try {
      const data = JSON.parse(await ytdlp(['--flat-playlist', '-J', `ytsearch${PER_QUERY}:${q}`]));
      let n = 0;
      for (const e of data.entries ?? []) {
        if (!e?.id || !e.title || found.has(e.id)) continue; // vidéos privées/supprimées : pas de titre
        const people = whoIsIn(`${e.title} ${e.description ?? ''} ${e.channel ?? ''}`);
        if (!people.length) continue;
        found.set(e.id, {
          id: `yt:${e.id}`,
          source: 'youtube',
          url: `https://www.youtube.com/watch?v=${e.id}`,
          title: e.title,
          show: e.channel ?? null,
          date: null,
          duration: e.duration ?? null,
          people,
          type: guessType('youtube', e.title, e.channel),
          thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
          excerpt: excerpt(e.description),
        });
        n++;
      }
      console.log(`${n} pertinent(s)`);
    } catch (err) {
      console.log(`échec (${err.message.split('\n')[0]})`);
    }
  }
  return [...found.values()];
}

/** La recherche rapide ne donne pas les dates : seconde passe, vidéo par vidéo. */
async function fillYoutubeDates(items) {
  const missing = items.filter((i) => i.source === 'youtube' && !i.date);
  if (!missing.length) return;
  console.log(`  Dates de ${missing.length} vidéo(s)…`);
  for (let i = 0; i < missing.length; i += 20) {
    const batch = missing.slice(i, i + 20);
    try {
      const out = await ytdlp(['--skip-download', '--ignore-errors', '--print', '%(id)s\t%(upload_date)s', ...batch.map((b) => b.url)]);
      for (const line of out.trim().split('\n')) {
        const [id, d] = line.split('\t');
        const item = batch.find((b) => b.id === `yt:${id}`);
        if (item && /^\d{8}$/.test(d)) item.date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      }
    } catch (err) {
      // --ignore-errors : les vidéos indisponibles n'empêchent pas les autres
      const out = err.stdout ?? '';
      for (const line of out.trim().split('\n')) {
        const [id, d] = line.split('\t');
        const item = batch.find((b) => b.id === `yt:${id}`);
        if (item && /^\d{8}$/.test(d ?? '')) item.date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      }
    }
  }
}

// --- Podcasts (API iTunes, publique) ------------------------------------------
async function collectApple() {
  const found = new Map();
  for (const term of APPLE_TERMS) {
    process.stdout.write(`  Podcasts « ${term} »… `);
    try {
      const url = `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&limit=200&country=fr&term=${encodeURIComponent(term)}`;
      const { results = [] } = await (await fetch(url)).json();
      let n = 0;
      for (const r of results) {
        if (!r.trackId || !r.trackName || found.has(r.trackId)) continue;
        if (fold(r.collectionName ?? '') === 'floodcast') continue; // l'émission elle-même
        const people = whoIsIn(`${r.trackName} ${r.description ?? ''} ${r.collectionName ?? ''}`);
        if (!people.length) continue;
        found.set(r.trackId, {
          id: `apple:${r.trackId}`,
          source: 'apple',
          url: (r.trackViewUrl ?? '').replace(/[?&]uo=\d+/, ''),
          title: r.trackName,
          show: r.collectionName ?? null,
          date: r.releaseDate ? r.releaseDate.slice(0, 10) : null,
          duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
          people,
          type: 'podcast',
          thumbnail: r.artworkUrl600 ?? r.artworkUrl160 ?? null,
          excerpt: excerpt(r.description),
        });
        n++;
      }
      console.log(`${n} pertinent(s)`);
    } catch (err) {
      console.log(`échec (${err.message})`);
    }
  }
  return [...found.values()];
}

// --- Fusion avec l'existant (le tri manuel est sacré) --------------------------
const store = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { items: [] };
const known = new Map(store.items.map((i) => [i.id, i]));

console.log('Collecte des contenus hors Floodcast…');
const collected = [...(withYoutube ? await collectYoutube() : []), ...(await collectApple())];

let added = 0;
for (const item of collected) {
  const existing = known.get(item.id);
  if (existing) {
    // On complète seulement les infos manquantes, sans toucher au statut ni aux corrections.
    for (const k of ['date', 'duration', 'thumbnail', 'show']) existing[k] ??= item[k];
    // Tant que ce n'est pas trié, on peut rafraîchir titre et type (ex. titres traduits corrigés).
    if (existing.status === 'pending') Object.assign(existing, { title: item.title, type: item.type });
    continue;
  }
  known.set(item.id, { ...item, status: 'pending', added_at: new Date().toISOString().slice(0, 10) });
  added++;
}
const items = [...known.values()];
if (withYoutube) await fillYoutubeDates(items);

// La collecte prend quelques minutes : si un tri a été fait pendant ce temps depuis la page,
// on relit le fichier et on conserve ces décisions (statut, type, personnes).
if (fs.existsSync(FILE)) {
  for (const fresh of JSON.parse(fs.readFileSync(FILE, 'utf8')).items) {
    const mine = known.get(fresh.id);
    if (mine && fresh.status !== 'pending') Object.assign(mine, { status: fresh.status, type: fresh.type, people: fresh.people });
  }
}

items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
fs.writeFileSync(FILE, JSON.stringify({ updated_at: new Date().toISOString(), items }, null, 2));

const count = (s) => items.filter((i) => i.status === s).length;
console.log(`✔ ${added} nouveau(x). Total : ${items.length} — à trier ${count('pending')}, gardés ${count('kept')}, écartés ${count('rejected')}.`);
console.log('Trie-les sur http://localhost:3000/hors-floodcast (onglet « À trier »).');
