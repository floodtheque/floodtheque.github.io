// Liens vers les plateformes d'écoute.
// - Apple Podcasts et Deezer : API publiques, on relie chaque épisode à sa page.
// - Spotify : l'API exige une clé développeur, on se contente du lien de l'émission
//   (+ un lien de recherche par épisode côté front).
import { fold } from './text.js';

export const PLATFORMS = {
  spotify: 'https://open.spotify.com/show/0bmWonDp36VG0OpSYJwJHr',
  deezer: 'https://www.deezer.com/show/376492',
  apple: 'https://podcasts.apple.com/fr/podcast/floodcast/id1019768302',
};

const APPLE_ID = '1019768302';
const DEEZER_ID = '376492';

/** Clé de rapprochement : le code SxxExx s'il existe, sinon le titre normalisé. */
function matchKey(title) {
  const m = String(title).match(/S(\d+)\s*E(\d+)/i);
  return m ? `s${Number(m[1])}e${Number(m[2])}` : fold(title);
}

async function appleEpisodes() {
  // L'API iTunes plafonne à ~200 épisodes (les plus récents).
  const res = await fetch(`https://itunes.apple.com/lookup?id=${APPLE_ID}&entity=podcastEpisode&limit=300&country=fr`);
  const { results } = await res.json();
  return results
    .filter((r) => r.wrapperType === 'podcastEpisode')
    .map((r) => ({ title: r.trackName, url: r.trackViewUrl.replace(/[?&]uo=\d+/, '') }));
}

async function deezerEpisodes() {
  const out = [];
  let url = `https://api.deezer.com/podcast/${DEEZER_ID}/episodes?limit=100`;
  while (url) {
    const page = await (await fetch(url)).json();
    for (const e of page.data ?? []) out.push({ title: e.title, url: `https://www.deezer.com/episode/${e.id}` });
    url = page.next ?? null;
  }
  return out;
}

export async function syncPlatformLinks(db) {
  const episodes = db.prepare('SELECT id, full_title FROM episodes').all();
  const byKey = new Map(episodes.map((e) => [matchKey(e.full_title), e.id]));
  const report = {};

  for (const [name, fetcher, column] of [['apple', appleEpisodes, 'apple_url'], ['deezer', deezerEpisodes, 'deezer_url']]) {
    try {
      const items = await fetcher();
      const update = db.prepare(`UPDATE episodes SET ${column} = ? WHERE id = ?`);
      let matched = 0;
      for (const item of items) {
        const id = byKey.get(matchKey(item.title));
        if (id) {
          update.run(item.url, id);
          matched++;
        }
      }
      report[name] = `${matched}/${episodes.length}`;
    } catch (err) {
      report[name] = `indisponible (${err.message})`;
    }
  }
  return report;
}
