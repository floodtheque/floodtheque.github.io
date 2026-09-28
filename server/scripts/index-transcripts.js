// Indexe les transcriptions (data/transcripts/*.json) : détection des pubs, segments, fenêtres FTS5.
//
// La détection des pubs compare les épisodes entre eux (une pub Acast revient dans plusieurs
// épisodes) : chaque nouvel épisode transcrit peut révéler des pubs dans les anciens. On
// réindexe donc tout le corpus à chaque passage (quelques secondes) ; les embeddings déjà
// calculés sont conservés grâce au cache indexé par empreinte du texte.
import fs from 'node:fs';
import path from 'node:path';
import { TRANSCRIPTS_DIR } from '../src/config.js';

const HALLUCINATION = /sous-titr|sous titres? (par|réalis)|amara\.org/i;
import { getDb, transaction } from '../src/db.js';
import { detectAds } from '../src/ads.js';
import { buildChunks, textHash } from '../src/indexing.js';
import { timecode } from '../src/text.js';

const verbose = process.argv.includes('--verbose');
const db = getDb();

if (!fs.existsSync(TRANSCRIPTS_DIR)) {
  console.log(`Aucun dossier ${TRANSCRIPTS_DIR} : lance d'abord le transcripteur.`);
  process.exit(0);
}

const titles = new Map(db.prepare('SELECT id, full_title FROM episodes').all().map((r) => [r.id, r.full_title]));
const corpus = new Map();
const meta = new Map();
for (const file of fs.readdirSync(TRANSCRIPTS_DIR).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(TRANSCRIPTS_DIR, file), 'utf8'));
  // L'identifiant fait foi dans le JSON : le nom de fichier est assaini (vieux GUID SoundCloud).
  const id = data.episode_id ?? path.basename(file, '.json');
  if (!titles.has(id)) {
    console.warn(`  ? ${file} ne correspond à aucun épisode connu, ignoré`);
    continue;
  }
  // Filet de sécurité : les hallucinations de Whisper (« Sous-titrage Société Radio-Canada »…) ne sont
  // jamais indexées ni affichées. `npm run transcribe -- --repair` retranscrit ces passages.
  const segments = (data.segments ?? []).filter((s) => !HALLUCINATION.test(s.text));
  corpus.set(id, { title: titles.get(id), segments });
  meta.set(id, { code: data.code ?? id, model: data.model ?? null, audioBytes: data.audio_bytes ?? null });
}

console.log(`Détection des pubs sur ${corpus.size} transcription(s)…`);
const detected = detectAds(corpus);

const insSegment = db.prepare('INSERT INTO segments (episode_id, start, end, text, is_ad) VALUES (?, ?, ?, ?, ?)');
const insChunk = db.prepare('INSERT INTO chunks (episode_id, start, end, text, hash) VALUES (?, ?, ?, ?, ?)');
const insSpan = db.prepare('INSERT INTO ad_spans (episode_id, start, end) VALUES (?, ?, ?)');
const markDone = db.prepare('UPDATE episodes SET has_transcript = 1, transcript_model = ?, audio_bytes = ? WHERE id = ?');

let adSeconds = 0;
transaction(db, () => {
  db.exec('DELETE FROM segments; DELETE FROM chunks; DELETE FROM ad_spans; UPDATE episodes SET has_transcript = 0, audio_bytes = NULL;');
  for (const [id, { segments }] of corpus) {
    const { words, adMask, spans } = detected.get(id);

    // Les segments Whisper qui chevauchent une frontière pub/contenu sont redécoupés à cet
    // endroit : l'affichage montre la discussion d'un côté, la pub de l'autre.
    for (const part of splitAtAdBoundaries(segments, words, adMask)) {
      insSegment.run(id, part.start, part.end, part.text, part.isAd ? 1 : 0);
    }

    for (const c of buildChunks(words, adMask)) insChunk.run(id, c.start, c.end, c.text, textHash(c.text));
    for (const s of spans) insSpan.run(id, s.start, s.end);
    markDone.run(meta.get(id).model, meta.get(id).audioBytes, id);

    const secs = spans.reduce((acc, s) => acc + (s.end - s.start), 0);
    adSeconds += secs;
    if (verbose || spans.length) {
      const list = spans.map((s) => `${timecode(s.start)}→${timecode(s.end)}`).join(', ');
      console.log(`  ${meta.get(id).code.padEnd(7)} ${spans.length ? `📺 ${Math.round(secs)} s de pub : ${list}` : 'pas de pub détectée'}`);
    }
  }
});

function splitAtAdBoundaries(segments, words, adMask) {
  const out = [];
  let group = null;
  const flush = (nextT) => {
    if (!group) return;
    const seg = segments[group.si];
    out.push({ start: group.start, end: nextT ?? seg.end, text: group.words.join(' '), isAd: group.isAd });
    group = null;
  };
  words.forEach((w, i) => {
    const isAd = !!adMask[i];
    if (group && (group.si !== w.si || group.isAd !== isAd)) flush(group.si === w.si ? w.t : undefined);
    group ??= { si: w.si, isAd, start: w.t, words: [] };
    group.words.push(w.w);
  });
  flush();
  return out;
}

console.log('Reconstruction de l’index plein texte…');
db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('optimize')");

const { missing } = db.prepare('SELECT count(*) missing FROM chunks c LEFT JOIN embeddings e ON e.hash = c.hash WHERE e.hash IS NULL').get();
console.log(`✔ ${corpus.size} épisode(s) indexé(s), ${Math.round(adSeconds / 60)} min de pub écartées de la recherche.`);
if (missing) console.log(`Astuce : \`npm run embed\` pour vectoriser ${missing} nouvelle(s) fenêtre(s) (recherche sémantique).`);
