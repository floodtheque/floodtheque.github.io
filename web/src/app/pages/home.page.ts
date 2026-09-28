import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ApiService } from '../core/api.service';
import { EpisodeCardComponent } from '../shared/episode-card.component';
import { SearchBoxComponent } from '../shared/search-box.component';
import { WordmarkComponent } from '../shared/wordmark.component';
import { RandomEpisodeService } from '../shared/random-episode.component';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, DecimalPipe, WordmarkComponent, SearchBoxComponent, EpisodeCardComponent],
  template: `
    <section class="hero">
      <div class="flash" aria-hidden="true"></div>
      <div class="container hero-inner">
        <p class="kicker">L'archive des fans du Floodcast · 2015 → 2025</p>
        <h1 class="visually-hidden">Floodthèque</h1>
        <app-wordmark />
        <p class="lede">
          T'as une phrase en tête mais tu sais plus <em class="quote">dans quel épisode</em> c'était&nbsp;?
          Balance-la, on fouille dans les {{ hoursLabel() }} de conneries pour toi.
        </p>
        <div class="search"><app-search-box [big]="true" /></div>
        <p class="or">
          Pas d'idée&nbsp;?
          <button type="button" class="btn" (click)="random.start()">📷 Tire un épisode au pif</button>
        </p>

        @if (stats(); as s) {
          <dl class="counters">
            <div><dt>épisodes</dt><dd>{{ s.episodes }}</dd></div>
            <div><dt>invités</dt><dd>{{ s.guests }}</dd></div>
            <div><dt>heures</dt><dd>{{ s.total_seconds / 3600 | number: '1.0-0' }}</dd></div>
            <div><dt>transcrits</dt><dd>{{ s.transcribed }}<small>/{{ s.episodes }}</small></dd></div>
            @if (s.ad_seconds) {
              <div><dt>min de pub virées</dt><dd>{{ s.ad_seconds / 60 | number: '1.0-0' }}</dd></div>
            }
          </dl>
        }
      </div>
    </section>

    <section class="container block">
      <header class="block-head">
        <h2 class="h-display">Les habitués de la table</h2>
        <a routerLink="/invites" class="btn btn--ghost">Tous les invités →</a>
      </header>
      <div class="regulars">
        @for (g of regulars(); track g.slug) {
          <a class="dymo" [class.dymo--red]="$index < 3" [routerLink]="['/invites', g.slug]">
            {{ g.name }} <span class="count">×{{ g.episodes }}</span>
          </a>
        }
      </div>
    </section>

    <section class="container block">
      <header class="block-head">
        <h2 class="h-display">Derniers tirages</h2>
        <a routerLink="/episodes" class="btn btn--ghost">Les {{ stats()?.episodes }} épisodes →</a>
      </header>
      <div class="grid">
        @for (ep of latest(); track ep.id) {
          <app-episode-card [episode]="ep" />
        }
      </div>
    </section>
  `,
  styles: `
    .hero {
      position: relative;
      overflow: hidden;
      border-bottom: 2px solid var(--ink);
      background:
        linear-gradient(180deg, transparent 60%, var(--paper) 100%),
        var(--flash);
    }
    /* Halo de flash qui crame le mur du salon */
    .flash {
      position: absolute; inset: -20% -10% auto auto; width: 70vmax; height: 70vmax;
      background: radial-gradient(circle, rgb(255 255 255 / 0.85) 0%, rgb(255 255 255 / 0.25) 30%, transparent 62%);
      pointer-events: none;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(:root:not([data-theme='light'])) .flash { opacity: 0.12; }
    }
    :host-context(:root[data-theme='dark']) .flash { opacity: 0.12; }
    .hero-inner { position: relative; padding-block: 48px 56px; }
    .lede { font-size: clamp(1.1rem, 2.2vw, 1.4rem); max-width: 40ch; margin: 0 0 28px; line-height: 1.35; }
    .lede em { font-size: 1.15em; color: var(--can); }
    .search { max-width: 820px; }
    .or { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 26px 0 0; font-family: var(--font-quote); font-style: italic; font-size: 1.25rem; }
    .counters { display: flex; flex-wrap: wrap; gap: 12px 36px; margin: 40px 0 0; }
    .counters div { display: flex; flex-direction: column-reverse; }
    .counters dt { font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.75rem; color: var(--ink-soft); }
    .counters dd { margin: 0; font-family: var(--font-stamp); font-size: 2.6rem; line-height: 1; color: var(--stamp); text-shadow: 0 0 8px rgb(255 106 19 / 0.45); }
    .counters small { font-size: 0.55em; opacity: 0.7; }
    .block { margin-top: 64px; }
    .block-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 26px; flex-wrap: wrap; }
    .block-head h2 { font-size: clamp(2rem, 5vw, 3.2rem); }
    .regulars { display: flex; flex-wrap: wrap; gap: 10px 8px; }
    .regulars .dymo { font-size: 0.95rem; }
    .regulars .dymo:nth-child(3n) { rotate: -1.5deg; }
    .regulars .dymo:nth-child(4n + 1) { rotate: 1deg; }
    .count { opacity: 0.65; font-size: 0.85em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 34px 26px; }
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);
  readonly random = inject(RandomEpisodeService);
  readonly stats = toSignal(this.api.stats$);
  readonly regulars = toSignal(this.api.guests$.pipe(map((g) => g.slice(0, 24))), { initialValue: [] });
  readonly latest = toSignal(this.api.episodes({ sort: 'recent' }).pipe(map((e) => e.slice(0, 8))), { initialValue: [] });
  readonly hoursLabel = computed(() => {
    const s = this.stats();
    return s ? `${Math.round(s.total_seconds / 3600)} heures` : 'centaines d’heures';
  });
}
