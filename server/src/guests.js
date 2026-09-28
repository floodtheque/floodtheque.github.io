import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { fold } from './text.js';

export const HOSTS = ['Florent Bernard', 'Adrien Ménielle'];
const HOST_KEYS = new Set(HOSTS.map(fold));

// Variantes d'écriture d'un même invité -> nom canonique (clé = forme "fold").
// À compléter au fil de l'eau : `npm run guests:report` liste les quasi-doublons.
const ALIASES = {
  'le druide pio marmai': 'Pio Marmaï',
  'druide pio marmai': 'Pio Marmaï',
  'pijama': 'Pi Ja Ma',
  'anis': 'Anis Rhali',
  'p a domingo': 'Domingo',
  'gregoire ludig du palmashow': 'Grégoire Ludig',
  'ben renault': 'Ben Renaut',
  'jeremie galand': 'Jérémie Galan',
  'aslak lefevre': 'Aslak Lefebvre',
  'adrien menielle': 'Adrien Ménielle',
  'flober': 'Florent Bernard',
};

// Fin de la liste d'invités : fin de phrase (hors initiales type "P.A"), ou amorces
// de la suite de la description parfois collées sans espace dans les vieux épisodes.
const LIST_END = new RegExp(
  [
    String.raw`(?<!\b\p{Lu})\.`,
    String.raw`\s*(?:Dans (?:ce|cette)|On en parle|Présenté par|Pour fêter|Nouvelle saison|Un (?:podcast|épisode)|Ainsi qu)`,
    String.raw`(?<=\p{Ll})(?=[AÀ] l['’])`,
    String.raw`\s[-–—]\s`,
    ':',
  ].join('|'),
  'u',
);

/**
 * Extrait les invités depuis la description ("Avec X, Y et Z.") ou le sous-titre iTunes.
 * Renvoie une liste de noms nettoyés, sans les animateurs.
 */
export function extractGuests(paragraphs, subtitle = '') {
  const line = [...paragraphs, subtitle].find((p) => /^\s*avec\s+/i.test(p ?? ''));
  if (!line) return [];

  let list = line.replace(/^\s*avec\s+/i, '');
  const end = list.search(LIST_END);
  if (end >= 0) list = list.slice(0, end);
  list = list.replace(/\(.*?\)/g, ' ').replace(/[«»"“”]/g, ' ');

  const out = [];
  const seen = new Set();
  for (const part of list.split(/\s*,\s*|\s+et\s+|\s*&\s*/)) {
    const name = part.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    // Un élément en minuscule ("on parle de…", "ma mère") = on est sorti de la liste.
    if (/^\p{Ll}/u.test(name) && !/^(le|la|les|l') \p{Lu}/u.test(name)) break;
    if (name.length < 2 || name.length > 50) continue;
    const canonical = ALIASES[fold(name)] ?? name;
    const key = fold(canonical);
    if (HOST_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

/**
 * Corrections manuelles : data/guests-overrides.json
 *   { "S10E26": ["Invité 1", "Invité 2"], "<guid>": [] }
 */
export function loadGuestOverrides() {
  const file = path.join(DATA_DIR, 'guests-overrides.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
