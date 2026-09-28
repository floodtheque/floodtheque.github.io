// Recherche sémantique : embeddings multilingues (e5) calculés localement via transformers.js.
// Les vecteurs sont stockés dans la table embeddings et chargés en mémoire au premier usage.
import { EMBED_MODEL, MODEL_DIR, ALLOW_REMOTE_MODELS } from './config.js';

let extractorPromise;

export function getExtractor() {
  extractorPromise ??= import('@huggingface/transformers').then(({ pipeline, env }) => {
    // En conteneur, le modèle est embarqué dans l'image (scripts/fetch-model.js) : pas de
    // téléchargement au démarrage, fonctionne sans accès internet.
    if (MODEL_DIR) env.cacheDir = MODEL_DIR;
    env.allowRemoteModels = ALLOW_REMOTE_MODELS;
    return pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' });
  });
  return extractorPromise;
}

/** e5 attend les préfixes "query: " / "passage: ". Renvoie des Float32Array normalisés. */
export async function embed(texts, kind = 'passage') {
  const extractor = await getExtractor();
  const out = await extractor(texts.map((t) => `${kind}: ${t}`), { pooling: 'mean', normalize: true });
  const dim = out.dims.at(-1);
  return texts.map((_, i) => out.data.slice(i * dim, (i + 1) * dim));
}

let index; // { ids: Int32Array, episodeIds: string[], matrix: Float32Array, dim }

export function loadVectorIndex(db, { reload = false } = {}) {
  if (index && !reload) return index;
  const rows = db.prepare('SELECT c.id, c.episode_id, e.vec AS embedding FROM chunks c JOIN embeddings e ON e.hash = c.hash').all();
  if (!rows.length) return (index = null);
  const dim = rows[0].embedding.byteLength / 4;
  const matrix = new Float32Array(rows.length * dim);
  const ids = new Int32Array(rows.length);
  const episodeIds = new Array(rows.length);
  rows.forEach((r, i) => {
    matrix.set(new Float32Array(r.embedding.buffer, r.embedding.byteOffset, dim), i * dim);
    ids[i] = r.id;
    episodeIds[i] = r.episode_id;
  });
  return (index = { ids, episodeIds, matrix, dim });
}

/** Top-k des fenêtres les plus proches (produit scalaire = cosinus, vecteurs normalisés). */
export async function semanticSearch(db, query, { k = 150, episodeFilter } = {}) {
  const idx = loadVectorIndex(db);
  if (!idx) return [];
  const [q] = await embed([query], 'query');
  const { matrix, dim, ids, episodeIds } = idx;
  const best = [];
  for (let i = 0; i < ids.length; i++) {
    if (episodeFilter && !episodeFilter.has(episodeIds[i])) continue;
    let s = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) s += matrix[off + d] * q[d];
    if (best.length < k) {
      best.push({ id: ids[i], score: s });
      if (best.length === k) best.sort((a, b) => b.score - a.score);
    } else if (s > best[k - 1].score) {
      best[k - 1] = { id: ids[i], score: s };
      for (let j = k - 1; j > 0 && best[j].score > best[j - 1].score; j--) [best[j], best[j - 1]] = [best[j - 1], best[j]];
    }
  }
  return best.sort((a, b) => b.score - a.score);
}
