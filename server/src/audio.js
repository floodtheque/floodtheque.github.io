// Relais audio vers Acast, sans rien stocker.
//
// Acast assemble les pubs par "auditeur" (IP + User-Agent) et ressert le même assemblage aux
// requêtes suivantes. Le transcripteur télécharge avec ACAST_UA ; en relayant l'écoute avec ce
// même User-Agent (depuis la même machine), on entend exactement les pubs qui ont été transcrites :
// les timecodes tombent juste. L'audio ne fait que transiter (pubs comprises, écoute comptée
// normalement par Acast). Sur un site public, désactiver avec FLOOD_AUDIO_PROXY=0.
import { Readable } from 'node:stream';
import { ACAST_UA } from './config.js';

const FORWARDED = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export async function proxyAudio(req, res, audioUrl) {
  const controller = new AbortController();
  req.on('close', () => controller.abort()); // l'auditeur saute ailleurs : on coupe l'amont
  const headers = { 'User-Agent': ACAST_UA };
  if (req.headers.range) headers.Range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(audioUrl, { headers, redirect: 'follow', signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) return;
    return res.status(502).json({ error: `Acast injoignable (${err.message})` });
  }
  res.status(upstream.status);
  for (const h of FORWARDED) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader('Cache-Control', 'no-store'); // jamais de copie, même dans le cache navigateur
  if (!upstream.body) return res.end();
  Readable.fromWeb(upstream.body)
    .on('error', () => res.destroy())
    .pipe(res);
}

/** Taille totale du fichier qu'Acast servirait maintenant avec notre User-Agent. */
async function remoteSize(audioUrl) {
  const r = await fetch(audioUrl, { headers: { 'User-Agent': ACAST_UA, Range: 'bytes=0-0' }, redirect: 'follow' });
  await r.body?.cancel();
  const total = (r.headers.get('content-range') ?? '').split('/')[1];
  return /^\d+$/.test(total ?? '') ? Number(total) : null;
}

const cache = new Map(); // episodeId -> { at, result }
const TTL = 10 * 60 * 1000;

/**
 * Compare l'assemblage actuel à celui qui a été transcrit.
 * status : 'synced' | 'desynced' | 'unknown' (pas d'empreinte, ou Acast injoignable)
 */
export async function checkSync(episode) {
  const hit = cache.get(episode.id);
  if (hit && Date.now() - hit.at < TTL) return hit.result;
  let result;
  if (!episode.audio_bytes || !episode.audio_url) {
    result = { status: 'unknown', reason: 'Pas d’empreinte pour cet épisode' };
  } else {
    try {
      const size = await remoteSize(episode.audio_url);
      result = size === episode.audio_bytes
        ? { status: 'synced' }
        : { status: size ? 'desynced' : 'unknown', expected: episode.audio_bytes, got: size };
    } catch (err) {
      result = { status: 'unknown', reason: err.message };
    }
  }
  cache.set(episode.id, { at: Date.now(), result });
  return result;
}
