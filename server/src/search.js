// Recherche "je me souviens d'une phrase" : hybride lexical (FTS5/BM25) + sémantique (e5),
// fusionnée par Reciprocal Rank Fusion, puis agrégée par épisode.
import { AUDIO_PROXY } from './config.js';
import { STOPWORDS, fold } from './text.js';
import { semanticSearch, loadVectorIndex } from './embeddings.js';

const RRF_K = 60;

function tokenize(q) {
  return fold(q).split(' ').filter(Boolean);
}

/** Radical très léger : "chauffeurs" -> "chauffeu*". Tolère pluriels et conjugaisons. */
function stem(t) {
  if (/^\d+$/.test(t) || t.length <= 4) return t;
  if (t.length <= 6) return `${t}*`;
  return `${t.slice(0, t.length - 2)}*`;
}

const quote = (t) => `"${t.replace(/"/g, '')}"`;
const term = (t) => (t.endsWith('*') ? `${quote(t.slice(0, -1))}*` : quote(t));

/** Construit les requêtes FTS5, de la plus stricte à la plus tolérante. */
export function buildFtsQueries(q) {
  const all = tokenize(q);
  if (!all.length) return [];
  const content = all.filter((t) => !STOPWORDS.has(t));
  const words = content.length ? content : all;
  const stems = [...new Set(words.map(stem))];

  const queries = [];
  if (all.length > 1) queries.push({ kind: 'phrase', weight: 3, match: quote(all.join(' ')) });
  if (stems.length > 1) queries.push({ kind: 'near', weight: 2, match: `NEAR(${stems.map(term).join(' ')}, 12)` });
  queries.push({ kind: 'all', weight: 1.5, match: stems.map(term).join(' AND ') });
  if (stems.length > 2) queries.push({ kind: 'any', weight: 0.6, match: stems.map(term).join(' OR ') });
  return queries;
}

function episodeFilterSet(db, { guest, season }) {
  if (!guest && !season) return null;
  const where = [];
  const params = [];
  if (guest) {
    where.push('e.id IN (SELECT eg.episode_id FROM episode_guests eg JOIN guests g ON g.id = eg.guest_id WHERE g.slug = ?)');
    params.push(guest);
  }
  if (season) {
    where.push('e.season = ?');
    params.push(Number(season));
  }
  return new Set(db.prepare(`SELECT e.id FROM episodes e WHERE ${where.join(' AND ')}`).all(...params).map((r) => r.id));
}

/** Découpe le texte en morceaux {t, hit} pour surligner côté client sans innerHTML. */
export function highlight(text, q) {
  const stems = tokenize(q).filter((t) => !STOPWORDS.has(t)).map((t) => t.replace(/\*$/, ''));
  const prefixes = stems.map((t) => (t.length > 6 ? t.slice(0, t.length - 2) : t));
  if (!prefixes.length) return [{ t: text, hit: false }];
  const parts = text.split(/(\s+)/);
  const out = [];
  for (const p of parts) {
    const f = fold(p);
    const hit = !!f && prefixes.some((pre) => f.split(' ').some((w) => w.startsWith(pre)));
    const last = out.at(-1);
    if (last && last.hit === hit) last.t += p;
    else out.push({ t: p, hit });
  }
  return out;
}

export async function search(db, { q, guest, season, mode = 'hybrid', limit = 20 }) {
  const t0 = performance.now();
  const filter = episodeFilterSet(db, { guest, season });
  const chunkScores = new Map(); // chunk id -> score RRF
  const add = (id, rank, weight) => chunkScores.set(id, (chunkScores.get(id) ?? 0) + weight / (RRF_K + rank));

  // 1) Lexical sur les transcriptions
  const ftsStmt = db.prepare(`
    SELECT c.id, c.episode_id FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
    WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT 300
  `);
  const exactIds = new Set();
  for (const { match, weight, kind } of buildFtsQueries(q)) {
    let rows;
    try {
      rows = ftsStmt.all(match);
    } catch {
      continue; // requête FTS invalide (caractères exotiques) : on ignore cette passe
    }
    rows = filter ? rows.filter((r) => filter.has(r.episode_id)) : rows;
    rows.forEach((r, rank) => {
      add(r.id, rank, weight);
      if (kind === 'phrase') exactIds.add(r.id);
    });
  }

  // 2) Sémantique (si les embeddings ont été calculés)
  let semanticUsed = false;
  if (mode !== 'exact' && loadVectorIndex(db)) {
    const hits = await semanticSearch(db, q, { k: 150, episodeFilter: filter });
    hits.forEach((h, rank) => add(h.id, rank, 1.2));
    semanticUsed = hits.length > 0;
  }

  // 3) Métadonnées (titre, invités, "on en parle de…") : utile même sans transcription
  const episodeScores = new Map();
  const metaStmt = db.prepare(`
    SELECT episode_id FROM episodes_fts WHERE episodes_fts MATCH ? ORDER BY bm25(episodes_fts, 0, 3, 2, 2, 1) LIMIT 50
  `);
  const metaQueries = buildFtsQueries(q).filter((x) => x.kind !== 'near');
  for (const { match, weight } of metaQueries) {
    let rows;
    try {
      rows = metaStmt.all(match);
    } catch {
      continue;
    }
    rows = filter ? rows.filter((r) => filter.has(r.episode_id)) : rows;
    rows.forEach((r, rank) => episodeScores.set(r.episode_id, (episodeScores.get(r.episode_id) ?? 0) + (weight * 1.5) / (RRF_K + rank)));
  }

  // Agrégation par épisode : meilleure fenêtre + bonus décroissant pour les suivantes.
  const chunkIds = [...chunkScores.keys()];
  const chunkRows = new Map();
  const getChunk = db.prepare('SELECT id, episode_id, start, end, text FROM chunks WHERE id = ?');
  for (const id of chunkIds) chunkRows.set(id, getChunk.get(id));

  const byEpisode = new Map();
  for (const [id, score] of chunkScores) {
    const c = chunkRows.get(id);
    const list = byEpisode.get(c.episode_id) ?? [];
    list.push({ ...c, score, exact: exactIds.has(id) });
    byEpisode.set(c.episode_id, list);
  }
  for (const id of episodeScores.keys()) if (!byEpisode.has(id)) byEpisode.set(id, []);

  const results = [];
  for (const [episodeId, chunks] of byEpisode) {
    chunks.sort((a, b) => b.score - a.score);
    // Garde des extraits qui ne se chevauchent pas (fenêtres à 50 % de recouvrement).
    const picked = [];
    for (const c of chunks) {
      if (picked.every((p) => Math.abs(p.start - c.start) > 20)) picked.push(c);
      if (picked.length === 3) break;
    }
    const transcriptScore = picked.reduce((acc, c, i) => acc + c.score / (i + 1), 0);
    const score = transcriptScore + (episodeScores.get(episodeId) ?? 0);
    results.push({ episodeId, score, picked, metaMatch: episodeScores.has(episodeId) });
  }
  results.sort((a, b) => b.score - a.score);

  const top = results.slice(0, limit);
  const maxScore = top[0]?.score ?? 1;
  const episodes = loadEpisodeCards(db, top.map((r) => r.episodeId));

  return {
    query: q,
    tookMs: Math.round(performance.now() - t0),
    semantic: semanticUsed,
    total: results.length,
    results: top.map((r) => ({
      episode: episodes.get(r.episodeId),
      relevance: Math.round((r.score / maxScore) * 100),
      metaMatch: r.metaMatch,
      hits: r.picked.map((c) => ({
        start: c.start,
        end: c.end,
        exact: c.exact,
        parts: highlight(c.text, q),
      })),
    })),
  };
}

export function loadEpisodeCards(db, ids) {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, code, season, number, title, full_title, slug, pub_date, duration_sec, image, topics,
           has_transcript, audio_url, apple_url, deezer_url, audio_bytes
    FROM episodes WHERE id IN (${placeholders})
  `).all(...ids);
  const guests = db.prepare(`
    SELECT eg.episode_id, g.name, g.slug FROM episode_guests eg JOIN guests g ON g.id = eg.guest_id
    WHERE eg.episode_id IN (${placeholders}) ORDER BY eg.position
  `).all(...ids);
  const map = new Map(rows.map((r) => [r.id, {
    ...r,
    has_transcript: !!r.has_transcript,
    // Écoute via le relais synchronisé (sinon : flux Acast direct, timecodes approximatifs).
    audio_proxy: AUDIO_PROXY && !!r.audio_bytes,
    guests: [],
  }]));
  for (const g of guests) map.get(g.episode_id)?.guests.push({ name: g.name, slug: g.slug });
  return map;
}
