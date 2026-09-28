import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, defer, from, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import { ApiService, EpisodeFilters } from './api.service';
import {
  AdminMe, Episode, EpisodeDetail, Guest, GuestDetail, OffsiteResponse, Person, Platforms, Season, SearchResponse, Segment, Stats, SyncStatus,
} from './models';
import type { SearchCorpus, StaticSearchIndex } from './static-search';

/** Contenu de data/site.json (cf. server/scripts/export-static.js). */
interface SiteData {
  generated_at: string;
  stats: Stats;
  seasons: Season[];
  platforms: Platforms;
  people: Person[];
  guests: Guest[];
  episodes: Episode[];
  offsite: OffsiteResponse;
}

interface EpisodeFile {
  description: string | null;
  link: string | null;
  transcript_model: string | null;
  prev: string | null;
  next: string | null;
  ad_spans: { start: number; end: number }[];
  segments: [number, number, string, 0 | 1][];
}

const foldLower = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Version GitHub Pages : même interface que l'API Node, mais tout vient de fichiers JSON
 * statiques (chemins relatifs à <base href>) et la recherche tourne dans le navigateur.
 */
@Injectable()
export class StaticApiService extends ApiService {
  private readonly httpClient = inject(HttpClient);

  private readonly site$ = this.httpClient.get<SiteData>('data/site.json').pipe(shareReplay(1));
  private readonly bySlug$ = this.site$.pipe(map((s) => new Map(s.episodes.map((e) => [e.slug, e]))), shareReplay(1));
  private readonly episodeFiles = new Map<string, Observable<EpisodeFile>>();
  /** Corpus + index de recherche : ~quelques Mo, chargés seulement à la première recherche. */
  private readonly index$ = defer(() =>
    combineLatest([this.httpClient.get<SearchCorpus>('data/search.json'), from(import('./static-search'))]),
  ).pipe(map(([corpus, mod]) => new mod.StaticSearchIndex(corpus) as StaticSearchIndex), shareReplay(1));

  override readonly stats$ = this.site$.pipe(map((s) => s.stats), shareReplay(1));
  override readonly guests$ = this.site$.pipe(map((s) => s.guests), shareReplay(1));
  override readonly seasons$ = this.site$.pipe(map((s) => s.seasons), shareReplay(1));
  override readonly platforms$ = this.site$.pipe(map((s) => s.platforms), shareReplay(1));
  override readonly people$ = this.site$.pipe(map((s) => s.people), shareReplay(1));
  override readonly allEpisodes$ = this.site$.pipe(map((s) => s.episodes), shareReplay(1));

  override episodes(f: EpisodeFilters = {}) {
    return this.site$.pipe(
      map((s) => {
        const q = f.q ? foldLower(f.q) : '';
        const list = s.episodes.filter(
          (e) =>
            (!f.guest?.length || f.guest.every((g) => e.guests.some((x) => x.slug === g))) &&
            (!f.season || e.season === Number(f.season)) &&
            (!f.transcribed || e.has_transcript) &&
            (!q || foldLower(`${e.full_title} ${e.topics ?? ''}`).includes(q)),
        );
        if (f.sort === 'oldest') return [...list].reverse();
        if (f.sort === 'longest') return [...list].sort((a, b) => (b.duration_sec ?? 0) - (a.duration_sec ?? 0));
        return list;
      }),
    );
  }

  private episodeFile(slug: string) {
    let obs = this.episodeFiles.get(slug);
    if (!obs) {
      obs = this.httpClient.get<EpisodeFile>(`data/episodes/${encodeURIComponent(slug)}.json`).pipe(shareReplay(1));
      this.episodeFiles.set(slug, obs);
    }
    return obs;
  }

  /** Accepte le slug, l'id ou le code (S10E38), comme l'API. */
  private resolve(slugOrCode: string) {
    return this.site$.pipe(
      map((s) => {
        const key = slugOrCode.toLowerCase();
        return s.episodes.find((e) => e.slug === slugOrCode || e.id === slugOrCode || e.code?.toLowerCase() === key) ?? null;
      }),
    );
  }

  override episode(slug: string) {
    return this.resolve(slug).pipe(
      switchMap((card) =>
        card
          ? this.episodeFile(card.slug).pipe(
              map((f): EpisodeDetail => {
                const { segments: _segments, ...extra } = f;
                return { ...card, ...extra, full_transcript: true };
              }),
            )
          : throwError(() => new Error('Épisode introuvable')),
      ),
    );
  }

  override transcript(slug: string) {
    return this.resolve(slug).pipe(
      switchMap((card) => (card ? this.episodeFile(card.slug) : throwError(() => new Error('Épisode introuvable')))),
      map((f) => f.segments.map(([start, end, text, ad]): Segment => ({ start, end, text, is_ad: !!ad }))),
    );
  }

  /** Pas de relais audio : chaque auditeur reçoit ses propres pubs Acast. */
  override sync(_slug: string) {
    return of<SyncStatus>({ status: 'unknown', reason: 'écoute directe sur Acast, les pubs peuvent différer' });
  }

  override guest(slug: string) {
    return this.site$.pipe(
      switchMap((s) => {
        const g = s.guests.find((x) => x.slug === slug);
        if (!g) return throwError(() => new Error('Invité introuvable'));
        const episodes = s.episodes.filter((e) => e.guests.some((x) => x.slug === slug));
        const counts = new Map<string, { name: string; slug: string; n: number }>();
        for (const e of episodes) {
          for (const b of e.guests) {
            if (b.slug === slug) continue;
            const c = counts.get(b.slug) ?? { name: b.name, slug: b.slug, n: 0 };
            c.n++;
            counts.set(b.slug, c);
          }
        }
        const buddies = [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 8);
        return of<GuestDetail>({ name: g.name, slug: g.slug, episodes, buddies });
      }),
    );
  }

  override offsite() {
    return this.site$.pipe(map((s) => s.offsite));
  }

  // Pas d'administration en ligne : le tri se fait en local, puis `npm run export`.
  override adminMe() {
    return of<AdminMe>({ enabled: false, admin: false });
  }

  override search(q: string, opts: { guest?: string | null; season?: number | null; mode?: 'hybrid' | 'exact' } = {}) {
    return combineLatest([this.index$, this.bySlug$]).pipe(
      map(([index, bySlug]): SearchResponse => {
        const cards = new Map([...bySlug.values()].map((e) => [e.id, e]));
        const filter = (e: Episode) =>
          (!opts.guest || e.guests.some((g) => g.slug === opts.guest)) && (!opts.season || e.season === Number(opts.season));
        return index.search(q.trim().slice(0, 300), cards, filter);
      }),
    );
  }
}
