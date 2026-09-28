// Récupère le flux RSS Acast du Floodcast et (ré)alimente épisodes + invités.
// Idempotent : peut être relancé sans perdre les transcriptions déjà indexées.
import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { FEED_URL } from '../src/config.js';
import { getDb, transaction } from '../src/db.js';
import { extractGuests, loadGuestOverrides } from '../src/guests.js';
import { htmlToParagraphs, parseDuration, slugify, decodeEntities } from '../src/text.js';
import { rebuildEpisodeFts } from '../src/indexing.js';
import { syncPlatformLinks } from '../src/platforms.js';

const source = process.argv[2];
const xml = source && fs.existsSync(source)
  ? fs.readFileSync(source, 'utf8')
  : await (await fetch(FEED_URL)).text();

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', processEntities: false });
const channel = parser.parse(xml).rss.channel;
const items = Array.isArray(channel.item) ? channel.item : [channel.item];

const text = (v) => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));

function parseItem(item) {
  const fullTitle = decodeEntities(text(item.title)).trim();
  const m = fullTitle.match(/^S(\d+)E(\d+)\s*[-–—:]\s*(.*)$/i);
  const season = Number(item['itunes:season'] ?? (m ? m[1] : NaN)) || null;
  const number = Number(item['itunes:episode'] ?? (m ? m[2] : NaN)) || null;
  const code = m ? `S${m[1].padStart(2, '0')}E${m[2].padStart(2, '0')}` : null;
  const title = m ? m[3].trim() : fullTitle;

  const paragraphs = htmlToParagraphs(text(item.description) || text(item['itunes:summary']));
  const topicsLine = paragraphs.find((p) => /on (en )?parle|dans cet [ée]pisode/i.test(p)) ?? '';
  const topics = topicsLine.replace(/^.*?(dans cet [ée]pisode[^:]*:|on en parle[^:]*:)\s*/i, '');
  const guests = extractGuests(paragraphs, decodeEntities(text(item['itunes:subtitle'])));

  return {
    id: text(item.guid),
    code,
    season,
    number,
    title,
    full_title: fullTitle,
    slug: slugify(code ? `${code} ${title}` : fullTitle) || text(item.guid),
    pub_date: new Date(text(item.pubDate)).toISOString(),
    duration_sec: parseDuration(item['itunes:duration']),
    audio_url: item.enclosure?.url ?? null,
    link: text(item.link) || null,
    image: item['itunes:image']?.href ?? null,
    description: paragraphs.join('\n'),
    topics: topics || null,
    guests,
  };
}

const overrides = loadGuestOverrides();
const episodes = items.map(parseItem).map((ep) => {
  const manual = overrides[ep.code] ?? overrides[ep.id];
  return manual ? { ...ep, guests: manual } : ep;
});
const db = getDb();

const upsertEpisode = db.prepare(`
  INSERT INTO episodes (id, code, season, number, title, full_title, slug, pub_date, duration_sec,
                        audio_url, link, image, description, topics)
  VALUES (:id, :code, :season, :number, :title, :full_title, :slug, :pub_date, :duration_sec,
          :audio_url, :link, :image, :description, :topics)
  ON CONFLICT(id) DO UPDATE SET
    code=excluded.code, season=excluded.season, number=excluded.number, title=excluded.title,
    full_title=excluded.full_title, slug=excluded.slug, pub_date=excluded.pub_date,
    duration_sec=excluded.duration_sec, audio_url=excluded.audio_url, link=excluded.link,
    image=excluded.image, description=excluded.description, topics=excluded.topics
`);
const upsertGuest = db.prepare(
  `INSERT INTO guests (name, slug) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id`,
);
const clearLinks = db.prepare('DELETE FROM episode_guests WHERE episode_id = ?');
const link = db.prepare('INSERT OR IGNORE INTO episode_guests (episode_id, guest_id, position) VALUES (?, ?, ?)');

// Slugs uniques même si deux épisodes ont le même titre.
const usedSlugs = new Set();
for (const ep of episodes) {
  let slug = ep.slug;
  for (let i = 2; usedSlugs.has(slug); i++) slug = `${ep.slug}-${i}`;
  ep.slug = slug;
  usedSlugs.add(slug);
}

transaction(db, () => {
  db.exec('UPDATE episodes SET slug = id'); // libère les slugs avant ré-attribution
  for (const ep of episodes) {
    const { guests, ...row } = ep;
    upsertEpisode.run(row);
    clearLinks.run(ep.id);
    guests.forEach((name, i) => {
      const { id } = upsertGuest.get(name, slugify(name));
      link.run(ep.id, id, i);
    });
  }
  db.exec('DELETE FROM guests WHERE id NOT IN (SELECT guest_id FROM episode_guests)');
});

rebuildEpisodeFts(db);

const stats = db.prepare(`
  SELECT (SELECT count(*) FROM episodes) episodes,
         (SELECT count(*) FROM guests) guests,
         (SELECT count(*) FROM episodes WHERE id NOT IN (SELECT episode_id FROM episode_guests)) sans_invite
`).get();
console.log(`✔ Flux ingéré :`, stats);

if (!process.argv.includes('--offline')) {
  const links = await syncPlatformLinks(db);
  console.log('✔ Liens plateformes (épisodes reliés) :', links);
}
