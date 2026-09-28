// Aide à la qualité des données : liste les invités et signale les quasi-doublons
// (à corriger via ALIASES dans src/guests.js).
import { getDb } from '../src/db.js';
import { fold } from '../src/text.js';

const db = getDb();
const rows = db.prepare(`
  SELECT g.name, count(*) n FROM guests g JOIN episode_guests eg ON eg.guest_id = g.id
  GROUP BY g.id ORDER BY n DESC, g.name
`).all();

console.log(`${rows.length} invités\n`);
for (const r of rows) console.log(String(r.n).padStart(3), r.name);

const lastNames = new Map();
for (const r of rows) {
  const last = fold(r.name).split(' ').at(-1);
  lastNames.set(last, [...(lastNames.get(last) ?? []), r.name]);
}
const suspects = [...lastNames.values()].filter((names) => names.length > 1);
if (suspects.length) {
  console.log('\nQuasi-doublons possibles :');
  for (const s of suspects) console.log('  -', s.join(' | '));
}

const empty = db.prepare(`
  SELECT code, title FROM episodes WHERE id NOT IN (SELECT episode_id FROM episode_guests) ORDER BY pub_date
`).all();
console.log(`\n${empty.length} épisodes sans invité détecté :`);
for (const e of empty) console.log('  -', e.code ?? '', e.title);
