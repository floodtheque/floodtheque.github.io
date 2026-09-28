const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è',
  agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', icirc: 'î', ucirc: 'û', ndash: '–', mdash: '—',
};

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** HTML de description -> paragraphes texte (sans la mention Acast). */
export function htmlToParagraphs(html = '') {
  const withoutFooter = html.split(/<hr\s*\/?>/i)[0];
  return withoutFooter
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => decodeEntities(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Minuscule, sans accents, sans ponctuation : pour comparer des noms. */
export function fold(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(s) {
  return fold(s).replace(/\s+/g, '-');
}

export function parseDuration(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (/^\d+$/.test(str)) return Number(str);
  const parts = str.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function timecode(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

// Mots vides français : ignorés quand on cherche une phrase "de mémoire".
export const STOPWORDS = new Set(
  `a à au aux avec ce ces c ça cela cet cette d dans de des du elle elles en et eux il ils
  j je l la le les leur leurs lui m ma mais me même mes moi mon n ne nos notre nous on ou où
  par pas pour qu que qui s sa se ses si son sur t ta te tes toi ton tu un une vos votre vous
  y est était sont été être ai as avait avoir fait faire plus très bien alors donc genre truc
  quoi ouais oui non euh ben bah voilà tout tous toute toutes comme ça c'est cest y'a ya`
    .split(/\s+/)
    .filter(Boolean)
    .map(fold),
);
