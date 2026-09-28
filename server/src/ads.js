// Détection des publicités dans les transcriptions.
//
// Idée principale : Acast insère ses pubs dynamiquement, donc le MÊME audio (et donc le même texte
// transcrit) se retrouve dans plusieurs épisodes, alors que le contenu du Floodcast, lui, ne se
// répète jamais. On repère les longues séquences de mots identiques partagées entre épisodes
// (empreintes par "shingles" de K mots), complétées par des formules publicitaires sans ambiguïté
// pour les pubs qui n'apparaissent qu'une fois.
import { fold } from './text.js';

const K = 7;                 // taille des shingles (mots)
const MIN_EPISODES = 3;      // une séquence vue dans ≥ 3 épisodes = contenu inséré
const MIN_RUN_WORDS = 25;    // en dessous : gimmick/jingle court, on garde
const MERGE_GAP_WORDS = 15;  // deux zones proches = même coupure pub

// Formules qu'on n'entend que dans des pubs (mentions légales, promos Acast…).
const STRONG_MARKERS = [
  'acast recommande', 'selection acast', 'offre valable', 'offres valables', 'voir conditions',
  'sous reserve d acceptation', 'dans la limite des stocks', 'reserve aux particuliers',
  'un credit vous engage', 'code promo', 'pour votre sante', 'manger bouger',
  'a consommer avec moderation', 'l abus d alcool', 'mentions legales', 'hors frais',
].map((m) => ` ${m} `);

// Compilations d'extraits d'anciens épisodes : elles dupliquent du vrai contenu,
// on ne les compte pas comme "preuve" qu'un passage est une pub.
export const isCompilation = (title = '') => /best[\s-]?of|compil/i.test(title);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Aplatis les segments en mots, avec un horodatage interpolé par mot. */
export function toWords(segments) {
  const words = [];
  segments.forEach((s, si) => {
    const toks = s.text.trim().split(/\s+/).filter(Boolean);
    toks.forEach((w, i) => {
      words.push({ w, f: fold(w), si, t: s.start + ((s.end - s.start) * i) / Math.max(toks.length, 1) });
    });
  });
  return words;
}

/**
 * @param episodes Map<id, { title, segments }>
 * @returns Map<id, { words, adMask: Uint8Array, spans: {start,end}[] }>
 */
export function detectAds(episodes) {
  const prepared = new Map();
  for (const [id, ep] of episodes) prepared.set(id, { ...ep, words: toWords(ep.segments) });

  // 1) Dans combien d'épisodes (hors compilations) apparaît chaque shingle ?
  const seenIn = new Map(); // hash -> Set<episodeId> (on s'arrête à MIN_EPISODES)
  for (const [id, ep] of prepared) {
    if (isCompilation(ep.title)) continue;
    const f = ep.words.map((w) => w.f).filter(Boolean);
    const local = new Set();
    for (let i = 0; i + K <= f.length; i++) local.add(hash(f.slice(i, i + K).join(' ')));
    for (const h of local) {
      let set = seenIn.get(h);
      if (!set) seenIn.set(h, (set = new Set()));
      if (set.size < MIN_EPISODES) set.add(id);
    }
  }

  const result = new Map();
  for (const [id, ep] of prepared) {
    const { words } = ep;
    const n = words.length;
    const shared = new Uint8Array(n);

    // 2) Mots couverts par un shingle récurrent.
    const idx = [];
    words.forEach((w, i) => w.f && idx.push(i));
    for (let j = 0; j + K <= idx.length; j++) {
      const h = hash(idx.slice(j, j + K).map((i) => words[i].f).join(' '));
      if ((seenIn.get(h)?.size ?? 0) >= MIN_EPISODES) for (let k = j; k < j + K; k++) shared[idx[k]] = 1;
    }

    // 3) Le générique et les formules rituelles de l'émission ("Il s'agit du Floodcast",
    //    "bienvenue dans ce nouvel épisode du Floodcast"…) reviennent aussi dans chaque épisode :
    //    une phrase qui parle de l'émission ou des animateurs n'est pas une pub.
    unmarkShowSentences(words, shared);

    // 4) Formules publicitaires fortes, à la phrase près (les segments Whisper en mode batché
    //    font ~30 s et mélangent souvent fin de discussion et début de pub).
    markStrongSentences(words, shared);

    // 5) Lissage : on fusionne les zones proches et on jette les trop courtes.
    const runs = [];
    for (let i = 0; i < n; i++) {
      if (!shared[i]) continue;
      let j = i;
      while (j + 1 < n && shared[j + 1]) j++;
      const last = runs.at(-1);
      if (last && i - last.to <= MERGE_GAP_WORDS) last.to = j;
      else runs.push({ from: i, to: j });
      i = j;
    }
    const adMask = new Uint8Array(n);
    const spans = [];
    for (const r of runs) {
      const len = r.to - r.from + 1;
      if (len < MIN_RUN_WORDS && !isStrongRun(words, r)) continue;
      for (let i = r.from; i <= r.to; i++) adMask[i] = 1;
      const endWord = words[r.to];
      const seg = ep.segments[endWord.si];
      spans.push({ start: words[r.from].t, end: r.to + 1 < n ? words[r.to + 1].t : seg.end });
    }
    result.set(id, { words, adMask, spans });
  }
  return result;
}

/** Découpe les mots en phrases : [from, to] inclusifs. */
function sentences(words) {
  const out = [];
  let from = 0;
  words.forEach((w, i) => {
    if (/[.!?…]["»”]?$/.test(w.w) || i === words.length - 1) {
      out.push({ from, to: i, text: ` ${words.slice(from, i + 1).map((x) => x.f).join(' ')} ` });
      from = i + 1;
    }
  });
  return out;
}

// Inclut les variantes mal transcrites par Whisper ("Flow de Cast", "Flood Cast"…).
const SHOW_WORDS = /\s(floodcast|flood|florent|flober|flo|adrien|menielle|flow de cast|flow cast|flo de cast)\s/;

/**
 * Retire le marquage des phrases qui parlent de l'émission. On déborde d'une phrase de chaque
 * côté quand elle est courte : le générique enchaîne des répliques brèves ("Ah ouais, c'est
 * toujours un spectacle") qui, isolées, ne mentionnent pas l'émission.
 */
function unmarkShowSentences(words, mask) {
  const sents = sentences(words);
  const isShow = (s) => SHOW_WORDS.test(s.text) && !STRONG_MARKERS.some((m) => s.text.includes(m));
  const clear = (s) => { for (let i = s.from; i <= s.to; i++) mask[i] = 0; };
  sents.forEach((s, k) => {
    if (!isShow(s)) return;
    clear(s);
    // Répliques courtes collées au générique : on les rattache à l'émission.
    for (let j = k - 1; j >= 0 && sents[j].to - sents[j].from < 12 && !STRONG_MARKERS.some((m) => sents[j].text.includes(m)); j--) {
      clear(sents[j]);
      if (k - j >= 3) break;
    }
    for (let j = k + 1; j < sents.length && sents[j].to - sents[j].from < 12 && !STRONG_MARKERS.some((m) => sents[j].text.includes(m)); j++) {
      clear(sents[j]);
      if (j - k >= 3) break;
    }
  });
}

/**
 * Marque les phrases contenant une formule pub, puis étend la zone aux phrases voisines qui
 * parlent du même produit : typiquement une promo "Acast Recommande" où le nom du podcast promu
 * revient à chaque phrase ("C'est Marine du podcast Eden Stories… Sur Eden Stories, chaque…").
 */
function markStrongSentences(words, mask) {
  const sents = sentences(words);
  const mark = (s) => { for (let i = s.from; i <= s.to; i++) mask[i] = 1; };
  sents.forEach((s, k) => {
    if (!STRONG_MARKERS.some((m) => s.text.includes(m))) return;
    mark(s);
    // Nom du produit/podcast promu : mots en majuscule qui suivent "podcast" dans les phrases proches.
    const names = new Set();
    for (const near of sents.slice(Math.max(0, k - 2), k + 1)) {
      const raw = words.slice(near.from, near.to + 1).map((w) => w.w);
      raw.forEach((w, i) => {
        if (/^podcast/i.test(w)) {
          const name = raw.slice(i + 1, i + 4).filter((x) => /^\p{Lu}/u.test(x)).map((x) => fold(x)).join(' ');
          if (name.length > 2) names.add(` ${name} `);
        }
      });
    }
    const related = (x) => /\spodcasts?\s/.test(x.text) || [...names].some((n) => x.text.includes(n));
    for (let j = k - 1; j >= 0 && related(sents[j]); j--) mark(sents[j]);
    for (let j = k + 1; j < sents.length && related(sents[j]); j++) mark(sents[j]);
  });
}

function isStrongRun(words, run) {
  const text = ` ${words.slice(run.from, run.to + 1).map((w) => w.f).join(' ')} `;
  return STRONG_MARKERS.some((m) => text.includes(m));
}
