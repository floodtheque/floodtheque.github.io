import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = process.env.FLOOD_DATA_DIR ?? path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'floodcast.db');
export const TRANSCRIPTS_DIR = path.join(DATA_DIR, 'transcripts');
// User-Agent commun au transcripteur et au relais audio (cf. src/audio.js) : c'est lui qui
// permet de réentendre exactement l'assemblage de pubs qui a été transcrit.
export const ACAST_UA = process.env.FLOOD_ACAST_UA ?? 'floodcast-fan-transcriber/1.0';
// FLOOD_PUBLIC=1 : site en ligne. Active des réglages prudents par défaut (chacun reste
// surchargeable par sa propre variable).
export const PUBLIC = process.env.FLOOD_PUBLIC === '1';
const flag = (name, fallback) => (process.env[name] === undefined ? fallback : process.env[name] === '1');

// Relais audio synchronisé : en public, tous les visiteurs passeraient par la même IP et le même
// User-Agent, ce qui fausserait les statistiques d'Acast. Désactivé par défaut en ligne.
export const AUDIO_PROXY = flag('FLOOD_AUDIO_PROXY', !PUBLIC);

// Transcription intégrale : publier le texte complet d'un épisode revient à reproduire l'œuvre.
// En ligne, par défaut, seuls la recherche et ses courts extraits horodatés sont publics.
export const FULL_TRANSCRIPT = flag('FLOOD_FULL_TRANSCRIPT', !PUBLIC);

// Mot de passe administrateur (haché) : généré par `npm run admin:password`, à mettre dans .env.
export const ADMIN_PASSWORD_HASH = process.env.FLOOD_ADMIN_PASSWORD_HASH ?? '';

// Derrière un reverse proxy (nginx, Caddy…) : nombre de proxys de confiance, pour que les
// limites de débit voient la vraie IP des visiteurs.
export const TRUST_PROXY = Number(process.env.FLOOD_TRUST_PROXY ?? 0);
export const WEB_DIST = path.join(ROOT, 'web', 'dist', 'web', 'browser');

export const FEED_URL =
  process.env.FLOOD_FEED_URL ?? 'https://feeds.acast.com/public/shows/5ffe3facad3e633276e9ea57';

export const PORT = Number(process.env.PORT ?? 3000);

// Modèle d'embeddings multilingue (FR ok), utilisé pour la recherche sémantique.
export const EMBED_MODEL = process.env.FLOOD_EMBED_MODEL ?? 'Xenova/multilingual-e5-small';
// Dossier du cache de modèles. Vide = défaut transformers.js.
export const MODEL_DIR = process.env.FLOOD_MODEL_DIR ?? '';
export const ALLOW_REMOTE_MODELS = process.env.FLOOD_ALLOW_REMOTE_MODELS !== '0';
