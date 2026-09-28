// Recherche « je me souviens d'une phrase » entièrement dans le navigateur (version GitHub Pages).
// Même logique que la passe lexicale du serveur (server/src/search.js) : phrase exacte > mots proches
// > tous les mots > une partie des mots, radical léger, mots vides ignorés, pubs exclues.
// Chargé à la demande (import dynamique) : le reste du site ne paie pas ce code.
import { Episode, HitPart, SearchResponse } from './models';

export interface SearchCorpus {
  stopwords: string[];
  episodes: { id: string; meta: string; segs: [number, number, string][] }[];
}

interface IndexedEpisode {
  id: string;
  meta: string;
  /** Texte replié de toute la transcription : " mot mot mot " (espaces simples). */
  text: string;
  /** Position de début de chaque segment dans `text`. */
  offsets: number[];
  segs: [number, number, string][];
}

/** Identique au fold() du serveur : minuscules, sans accents, ponctuation = espace. */
export function foldWords(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Radical très léger : "chauffeurs" -> préfixe "chauffeu". */
function stem(t: string): { key: string; prefix: boolean } {
  if (/^\d+$/.test(t) || t.length <= 4) return { key: t, prefix: false };
  if (t.length <= 6) return { key: t, prefix: true };
  return { key: t.slice(0, t.length - 2), prefix: true };
}

function positions(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
}

/** ~45 mots, comme les fenêtres indexées côté serveur. */
const WINDOW = 300;
/** ~12 mots : équivalent du NEAR(…, 12) de FTS5. */
const NEAR = 80;

export class StaticSearchIndex {
  private readonly eps: IndexedEpisode[];
  private readonly stop: Set<string>;

  constructor(corpus: SearchCorpus) {
    this.stop = new Set(corpus.stopwords);
    this.eps = corpus.episodes.map((e) => {
      const offsets: number[] = [];
      let text = ' ';
      for (const [, , t] of e.segs) {
        offsets.push(text.length);
        const f = foldWords(t);
        if (f) text += f + ' ';
      }
      return { id: e.id, meta: ` ${foldWords(e.meta)} `, text, offsets, segs: e.segs };
    });
  }

  search(q: string, cards: Map<string, Episode>, filter: (e: Episode) => boolean, limit = 20): SearchResponse {
    const t0 = performance.now();
    const all = foldWords(q).split(' ').filter(Boolean);
    const empty: SearchResponse = { query: q, tookMs: 0, semantic: false, total: 0, results: [] };
    if (!all.length) return empty;
    const content = all.filter((t) => !this.stop.has(t));
    const words = content.length ? content : all;
    const stems = [...new Map(words.map((w) => [stem(w).key, stem(w)])).values()];
    const needles = stems.map((s) => ` ${s.key}${s.prefix ? '' : ' '}`);
    const phrase = all.length > 1 ? ` ${all.join(' ')} ` : null;
    // Avec 1 ou 2 mots, il les faut tous ; au-delà, une partie suffit (score moindre).
    const minTerms = stems.length > 2 ? 2 : stems.length;

    // Rareté de chaque terme dans le corpus (un mot rare pèse plus lourd).
    const candidates = this.eps.filter((e) => cards.has(e.id) && filter(cards.get(e.id)!));
    const df = needles.map((n) => candidates.reduce((acc, e) => acc + (e.text.includes(n) ? 1 : 0), 0));
    const idf = df.map((d) => Math.log(1 + candidates.length / (1 + d)));

    const results: { id: string; score: number; metaMatch: boolean; hits: SearchResponse['results'][0]['hits'] }[] = [];
    for (const ep of candidates) {
      const metaMatch = !!phrase && ep.meta.includes(phrase)
        || needles.every((n) => ep.meta.includes(n));
      const metaScore = metaMatch ? 2 : 0;

      const hits: { pos: number; term: number }[] = [];
      needles.forEach((n, term) => { for (const p of positions(ep.text, n)) hits.push({ pos: p, term }); });
      const phraseHits = phrase ? positions(ep.text, phrase) : [];
      if (!hits.length && !metaMatch) continue;
      hits.sort((a, b) => a.pos - b.pos);

      // Fenêtres glissantes : pour chaque occurrence, les termes distincts présents juste après.
      const windows: { start: number; end: number; score: number; exact: boolean }[] = [];
      for (let i = 0; i < hits.length; i++) {
        const seen = new Map<number, number>();
        let j = i;
        for (; j < hits.length && hits[j].pos - hits[i].pos <= WINDOW; j++) {
          if (!seen.has(hits[j].term)) seen.set(hits[j].term, hits[j].pos);
        }
        if (seen.size < minTerms) continue;
        const end = hits[j - 1].pos;
        let score = [...seen.keys()].reduce((acc, t) => acc + idf[t], 0) * (seen.size / stems.length);
        if (seen.size === stems.length) score *= 1.5;
        if (stems.length > 1 && seen.size === stems.length && Math.max(...seen.values()) - hits[i].pos <= NEAR) score *= 1.4;
        const exact = phraseHits.some((p) => p >= hits[i].pos - 1 && p <= end);
        if (exact) score *= 2;
        windows.push({ start: hits[i].pos, end, score, exact });
      }
      windows.sort((a, b) => b.score - a.score);
      const picked: typeof windows = [];
      for (const w of windows) {
        if (picked.every((p) => Math.abs(p.start - w.start) > WINDOW)) picked.push(w);
        if (picked.length === 3) break;
      }
      if (!picked.length && !metaMatch) continue;

      const score = picked.reduce((acc, w, i) => acc + w.score / (i + 1), 0) + metaScore;
      results.push({ id: ep.id, score, metaMatch, hits: picked.map((w) => this.snippet(ep, w, q, stems.map((s) => s.key))) });
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, limit);
    const max = top[0]?.score || 1;
    return {
      query: q,
      tookMs: Math.round(performance.now() - t0),
      semantic: false,
      total: results.length,
      results: top.map((r) => ({
        episode: cards.get(r.id)!,
        relevance: Math.round((r.score / max) * 100),
        metaMatch: r.metaMatch,
        hits: r.hits,
      })),
    };
  }

  /** Extrait d'environ 45 mots autour de la fenêtre, avec son timecode estimé. */
  private snippet(ep: IndexedEpisode, w: { start: number; exact: boolean }, q: string, prefixes: string[]) {
    // Segment qui contient le début de la fenêtre (recherche dichotomique).
    let lo = 0;
    let hi = ep.offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ep.offsets[mid] <= w.start) lo = mid;
      else hi = mid - 1;
    }
    const segIdx = lo;
    const [segStart, segEnd, segText] = ep.segs[segIdx];
    const segFolded = ep.text.slice(ep.offsets[segIdx], ep.offsets[segIdx + 1] ?? ep.text.length).trim();
    const foldedWordsBefore = ep.text.slice(ep.offsets[segIdx], w.start).trim().split(' ').filter(Boolean).length;
    const ratio = foldedWordsBefore / Math.max(1, segFolded.split(' ').length);

    // Mots d'origine du segment et de ses voisins, pour un extrait complet même sur un segment court.
    const prev = (ep.segs[segIdx - 1]?.[2] ?? '').split(/\s+/).filter(Boolean);
    const cur = segText.split(/\s+/).filter(Boolean);
    const next = (ep.segs[segIdx + 1]?.[2] ?? '').split(/\s+/).filter(Boolean);
    const words = [...prev, ...cur, ...next];
    const center = prev.length + Math.round(ratio * cur.length);
    const from = Math.max(0, center - 15);
    const text = words.slice(from, from + 45).join(' ');

    return {
      start: Math.max(0, segStart + (segEnd - segStart) * ratio - 1),
      end: segEnd,
      exact: w.exact,
      parts: highlightStems(text, prefixes),
    };
  }
}

/** Même surlignage que le serveur : mots qui commencent par un des radicaux. */
function highlightStems(text: string, prefixes: string[]): HitPart[] {
  if (!prefixes.length) return [{ t: text, hit: false }];
  const out: HitPart[] = [];
  for (const p of text.split(/(\s+)/)) {
    const f = foldWords(p);
    const hit = !!f && prefixes.some((pre) => f.split(' ').some((w) => w.startsWith(pre)));
    const last = out.at(-1);
    if (last && last.hit === hit) last.t += p;
    else out.push({ t: p, hit });
  }
  return out;
}
