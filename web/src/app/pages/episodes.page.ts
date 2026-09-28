import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { EpisodeCardComponent } from '../shared/episode-card.component';

@Component({
  selector: 'app-episodes-page',
  imports: [FormsModule, RouterLink, EpisodeCardComponent],
  template: `
    <section class="container head">
      <p class="kicker">Toute la pellicule</p>
      <h1 class="h-display">Les épisodes</h1>

      <div class="toolbar">
        <input class="field grow" type="search" placeholder="Filtrer par titre ou sujet…"
          aria-label="Filtrer par titre ou sujet" [ngModel]="q() ?? ''" (ngModelChange)="set('q', $event)" />
        <select class="field" aria-label="Saison" [ngModel]="season() ?? ''" (ngModelChange)="set('season', $event)">
          <option value="">Toutes les saisons</option>
          @for (s of seasons(); track s.season) {
            <option [value]="s.season">Saison {{ s.season }} · {{ s.episodes }} ép.</option>
          }
        </select>
        <select class="field" aria-label="Tri" [ngModel]="sort() ?? 'recent'" (ngModelChange)="set('sort', $event)">
          <option value="recent">Plus récents</option>
          <option value="oldest">Plus anciens</option>
          <option value="longest">Plus longs</option>
        </select>
        <label class="check">
          <input type="checkbox" [ngModel]="transcribed() === '1'" (ngModelChange)="set('transcribed', $event ? '1' : '')" />
          Transcrits seulement
        </label>
      </div>

      <div class="guest-filter">
        <span class="kicker">Avec :</span>
        @for (g of selectedGuests(); track g) {
          <button type="button" class="dymo dymo--red" (click)="toggleGuest(g)" [attr.aria-label]="'Retirer ' + guestName(g)">
            {{ guestName(g) }} ✕
          </button>
        }
        <select class="field small" aria-label="Ajouter un invité au filtre" [ngModel]="''" (ngModelChange)="toggleGuest($event)">
          <option value="">+ ajouter un invité</option>
          @for (g of guests(); track g.slug) {
            @if (!selectedGuests().includes(g.slug)) {
              <option [value]="g.slug">{{ g.name }} ({{ g.episodes }})</option>
            }
          }
        </select>
        @if (selectedGuests().length > 1) {
          <span class="hint">épisodes où ils sont <strong>tous</strong> présents</span>
        }
      </div>

      <p class="count"><span class="stamp">{{ episodes().length }}</span> épisode{{ episodes().length > 1 ? 's' : '' }}</p>
    </section>

    <section class="container">
      <div class="grid">
        @for (ep of episodes(); track ep.id) {
          <app-episode-card [episode]="ep" />
        } @empty {
          <p class="quote empty">Rien sur la pellicule. <a routerLink="/episodes">Tout réafficher</a></p>
        }
      </div>
    </section>
  `,
  styles: `
    .head { padding-top: 36px; }
    h1 { font-size: clamp(2.6rem, 7vw, 5rem); margin: 4px 0 24px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .toolbar .field { width: auto; }
    .grow { flex: 1 1 260px; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 0.92rem; cursor: pointer; }
    .check input { width: 18px; height: 18px; accent-color: var(--can); }
    .guest-filter { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 16px; }
    .guest-filter .dymo { border: 0; }
    .field.small { width: auto; padding: 0.4em 0.7em; font-size: 0.9rem; }
    .hint { font-size: 0.85rem; color: var(--ink-soft); }
    .count { margin: 26px 0 30px; font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.85rem; }
    .count .stamp { font-size: 1.8rem; vertical-align: -3px; margin-right: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 34px 26px; }
    .empty { font-size: 1.4rem; }
  `,
})
export class EpisodesPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly q = input<string>();
  readonly season = input<string>();
  readonly sort = input<'recent' | 'oldest' | 'longest'>();
  readonly guest = input<string>();
  readonly transcribed = input<string>();

  readonly guests = toSignal(this.api.guests$, { initialValue: [] });
  readonly seasons = toSignal(this.api.seasons$, { initialValue: [] });
  readonly selectedGuests = computed(() => (this.guest() ?? '').split(',').filter(Boolean));
  private readonly guestNames = computed(() => new Map(this.guests().map((g) => [g.slug, g.name])));

  private readonly filters = computed(() => ({
    q: this.q() ?? '',
    season: this.season() ? Number(this.season()) : null,
    sort: this.sort() ?? 'recent',
    guest: this.selectedGuests(),
    transcribed: this.transcribed() === '1',
  }));

  readonly episodes = toSignal(
    toObservable(this.filters).pipe(debounceTime(150), switchMap((f) => this.api.episodes(f))),
    { initialValue: [] },
  );

  guestName(slug: string) {
    return this.guestNames().get(slug) ?? slug;
  }

  set(key: string, value: string) {
    void this.router.navigate([], { queryParams: { [key]: value || null }, queryParamsHandling: 'merge', replaceUrl: key === 'q' });
  }

  toggleGuest(slug: string) {
    if (!slug) return;
    const cur = this.selectedGuests();
    const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
    this.set('guest', next.join(','));
  }
}
