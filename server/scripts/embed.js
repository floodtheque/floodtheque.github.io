// Calcule les embeddings des fenêtres de transcription qui n'en ont pas encore.
// Les vecteurs sont mis en cache par empreinte du texte (table `embeddings`) : une réindexation
// ne les perd pas. Premier lancement : télécharge le modèle (~120 Mo) dans le cache de transformers.js.
import { getDb, transaction } from '../src/db.js';
import { embed } from '../src/embeddings.js';

const BATCH = 32;
const db = getDb();
const pending = db.prepare(`
  SELECT c.hash, min(c.text) AS text FROM chunks c
  LEFT JOIN embeddings e ON e.hash = c.hash
  WHERE e.hash IS NULL GROUP BY c.hash
`).all();
const insert = db.prepare('INSERT OR REPLACE INTO embeddings (hash, vec) VALUES (?, ?)');

console.log(`${pending.length} fenêtre(s) à vectoriser…`);
const t0 = Date.now();
for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH);
  const vectors = await embed(batch.map((c) => c.text), 'passage');
  transaction(db, () => {
    batch.forEach((c, j) => insert.run(c.hash, new Uint8Array(vectors[j].buffer, vectors[j].byteOffset, vectors[j].byteLength)));
  });
  if ((i / BATCH) % 20 === 0 || i + BATCH >= pending.length) {
    const done = Math.min(i + BATCH, pending.length);
    const rate = done / ((Date.now() - t0) / 1000);
    process.stdout.write(`\r  ${done}/${pending.length} (${rate.toFixed(0)}/s)   `);
  }
}

// Ménage : vecteurs de fenêtres qui n'existent plus (ex. passages reclassés en pub).
const { changes } = db.prepare('DELETE FROM embeddings WHERE hash NOT IN (SELECT hash FROM chunks)').run();
console.log(`\n✔ Embeddings à jour${changes ? ` (${changes} obsolète(s) supprimé(s))` : ''}.`);
