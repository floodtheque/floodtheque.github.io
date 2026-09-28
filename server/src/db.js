import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH } from './config.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS episodes (
  id            TEXT PRIMARY KEY,          -- guid Acast
  code          TEXT,                      -- "S10E43"
  season        INTEGER,
  number        INTEGER,
  title         TEXT NOT NULL,             -- titre sans le préfixe SxxExx
  full_title    TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  pub_date      TEXT NOT NULL,             -- ISO
  duration_sec  INTEGER,
  audio_url     TEXT,
  link          TEXT,
  image         TEXT,
  description   TEXT,                      -- texte brut, paragraphes séparés par \n
  topics        TEXT,                      -- "On en parle de choses dans cet épisode : …"
  has_transcript INTEGER NOT NULL DEFAULT 0,
  transcript_model TEXT,
  apple_url     TEXT,
  deezer_url    TEXT,
  audio_bytes   INTEGER                    -- taille du MP3 transcrit (empreinte de l'assemblage de pubs)
);

CREATE TABLE IF NOT EXISTS guests (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS episode_guests (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  guest_id   INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (episode_id, guest_id)
);

-- Segments bruts de Whisper (pour l'affichage de la transcription, horodatée).
CREATE TABLE IF NOT EXISTS segments (
  id         INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  start      REAL NOT NULL,
  end        REAL NOT NULL,
  text       TEXT NOT NULL,
  is_ad      INTEGER NOT NULL DEFAULT 0     -- segment majoritairement publicitaire
);
CREATE INDEX IF NOT EXISTS segments_episode ON segments(episode_id, start);

-- Coupures pub détectées (cf. src/ads.js), en secondes dans le fichier transcrit.
CREATE TABLE IF NOT EXISTS ad_spans (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  start      REAL NOT NULL,
  end        REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_spans_episode ON ad_spans(episode_id);

-- Cache d'embeddings par empreinte du texte : survit aux réindexations complètes.
CREATE TABLE IF NOT EXISTS embeddings (
  hash TEXT PRIMARY KEY,
  vec  BLOB NOT NULL                        -- Float32Array normalisé
);

-- Fenêtres glissantes (~45 mots, chevauchement 50 %) : une phrase dont on se souvient
-- peut chevaucher deux segments Whisper, les fenêtres évitent de la rater.
CREATE TABLE IF NOT EXISTS chunks (
  id         INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  start      REAL NOT NULL,
  end        REAL NOT NULL,
  text       TEXT NOT NULL,
  hash       TEXT NOT NULL                  -- clé vers embeddings(hash)
);
CREATE INDEX IF NOT EXISTS chunks_hash ON chunks(hash);
CREATE INDEX IF NOT EXISTS chunks_episode ON chunks(episode_id, start);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text, content='chunks', content_rowid='id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
  episode_id UNINDEXED, title, guests, topics, description,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  migrate(db);
  db.exec(SCHEMA);
  return db;
}

const columns = (database, table) => database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/**
 * Segments et fenêtres sont entièrement dérivés des JSON de transcription (`npm run index`) :
 * si leur structure a changé, on les supprime simplement pour qu'ils soient reconstruits.
 */
function migrate(database) {
  const ep = columns(database, 'episodes');
  for (const [col, type] of [['apple_url', 'TEXT'], ['deezer_url', 'TEXT'], ['audio_bytes', 'INTEGER']]) {
    if (ep.length && !ep.includes(col)) database.exec(`ALTER TABLE episodes ADD COLUMN ${col} ${type}`);
  }

  const seg = columns(database, 'segments');
  const chk = columns(database, 'chunks');
  const stale = (seg.length && !seg.includes('is_ad')) || (chk.length && !chk.includes('hash'));
  if (!stale) return;
  database.exec(`
    DROP TABLE IF EXISTS chunks_fts;
    DROP TABLE IF EXISTS chunks;
    DROP TABLE IF EXISTS segments;
    UPDATE episodes SET has_transcript = 0;
  `);
}

export function transaction(database, fn) {
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}
