import { createHash } from 'node:crypto';
import { transaction } from './db.js';

export function rebuildEpisodeFts(db) {
  transaction(db, () => {
    db.exec('DELETE FROM episodes_fts');
    db.exec(`
      INSERT INTO episodes_fts (episode_id, title, guests, topics, description)
      SELECT e.id, e.full_title,
             coalesce((SELECT group_concat(g.name, ', ') FROM episode_guests eg
                       JOIN guests g ON g.id = eg.guest_id WHERE eg.episode_id = e.id), ''),
             coalesce(e.topics, ''), coalesce(e.description, '')
      FROM episodes e
    `);
  });
}

export const textHash = (text) => createHash('sha1').update(text).digest('hex');

/**
 * Découpe les mots (déjà horodatés, cf. ads.toWords) en fenêtres de ~targetWords mots avec 50 %
 * de chevauchement. Les mots marqués comme pub sont exclus et une fenêtre ne franchit jamais
 * une coupure pub : chaque zone de contenu est découpée séparément.
 */
export function buildChunks(words, adMask, targetWords = 45) {
  const zones = [];
  let cur = [];
  words.forEach((w, i) => {
    if (adMask?.[i]) {
      if (cur.length) zones.push(cur);
      cur = [];
    } else cur.push(w);
  });
  if (cur.length) zones.push(cur);

  const chunks = [];
  const stride = Math.max(1, Math.floor(targetWords / 2));
  for (const zone of zones) {
    for (let i = 0; i < zone.length; i += stride) {
      const slice = zone.slice(i, i + targetWords);
      if (slice.length < 6 && i > 0) break;
      const next = zone[i + targetWords];
      chunks.push({
        start: slice[0].t,
        end: next ? next.t : slice.at(-1).t + 2,
        text: slice.map((x) => x.w).join(' '),
      });
      if (i + targetWords >= zone.length) break;
    }
  }
  return chunks;
}
