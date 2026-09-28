import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { shareReplay } from 'rxjs';
import {
  Episode, EpisodeDetail, Guest, GuestDetail, AdminMe, AdminOffsiteResponse, OffsiteItem, OffsiteResponse, OffsiteStatus, Person, Platforms, SyncStatus, SearchResponse, Season, Segment, Stats,
} from './models';

export interface EpisodeFilters {
  guest?: string[];
  season?: number | null;
  q?: string;
  sort?: 'recent' | 'oldest' | 'longest';
  transcribed?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  // Données quasi statiques : mises en cache pour toute la session.
  readonly stats$ = this.http.get<Stats>('/api/stats').pipe(shareReplay(1));
  readonly guests$ = this.http.get<Guest[]>('/api/guests').pipe(shareReplay(1));
  readonly seasons$ = this.http.get<Season[]>('/api/seasons').pipe(shareReplay(1));
  readonly platforms$ = this.http.get<Platforms>('/api/platforms').pipe(shareReplay(1));
  readonly people$ = this.http.get<Person[]>('/api/people').pipe(shareReplay(1));
  /** Tous les épisodes (tirage au sort) : chargé une fois par session. */
  readonly allEpisodes$ = this.http.get<Episode[]>('/api/episodes').pipe(shareReplay(1));

  episodes(f: EpisodeFilters = {}) {
    let params = new HttpParams();
    if (f.guest?.length) params = params.set('guest', f.guest.join(','));
    if (f.season) params = params.set('season', f.season);
    if (f.q) params = params.set('q', f.q);
    if (f.sort) params = params.set('sort', f.sort);
    if (f.transcribed) params = params.set('transcribed', '1');
    return this.http.get<Episode[]>('/api/episodes', { params });
  }

  episode(slug: string) {
    return this.http.get<EpisodeDetail>(`/api/episodes/${encodeURIComponent(slug)}`);
  }

  transcript(slug: string) {
    return this.http.get<Segment[]>(`/api/episodes/${encodeURIComponent(slug)}/transcript`);
  }

  sync(slug: string) {
    return this.http.get<SyncStatus>(`/api/episodes/${encodeURIComponent(slug)}/sync`);
  }

  guest(slug: string) {
    return this.http.get<GuestDetail>(`/api/guests/${encodeURIComponent(slug)}`);
  }

  offsite() {
    return this.http.get<OffsiteResponse>('/api/offsite');
  }

  // --- Administration ---
  adminMe() {
    return this.http.get<AdminMe>('/api/admin/me');
  }

  adminLogin(password: string) {
    return this.http.post<{ ok: boolean }>('/api/admin/login', { password });
  }

  adminLogout() {
    return this.http.post<{ ok: boolean }>('/api/admin/logout', {});
  }

  adminOffsite(status: OffsiteStatus) {
    return this.http.get<AdminOffsiteResponse>('/api/admin/offsite', { params: { status } });
  }

  adminUpdateOffsite(id: string, patch: Partial<Pick<OffsiteItem, 'status' | 'type' | 'people'>>) {
    return this.http.patch<OffsiteItem>(`/api/admin/offsite/${encodeURIComponent(id)}`, patch);
  }

  search(q: string, opts: { guest?: string | null; season?: number | null; mode?: 'hybrid' | 'exact' } = {}) {
    let params = new HttpParams().set('q', q);
    if (opts.guest) params = params.set('guest', opts.guest);
    if (opts.season) params = params.set('season', opts.season);
    if (opts.mode) params = params.set('mode', opts.mode);
    return this.http.get<SearchResponse>('/api/search', { params });
  }
}
