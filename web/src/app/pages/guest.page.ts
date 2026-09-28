import { Component, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { catchError, of, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { EpisodeCardComponent } from '../shared/episode-card.component';
import { SearchBoxComponent } from '../shared/search-box.component';

@Component({
  selector: 'app-guest-page',
  imports: [RouterLink, EpisodeCardComponent, SearchBoxComponent],
  template: `
    @if (guest(); as g) {
      <section class="container head">
        <a routerLink="/invites" class="back kicker">← Tous les invités</a>
        <h1><span class="dymo dymo--red big">{{ g.name }}</span></h1>
        <p class="count">
          <span class="stamp">{{ g.episodes.length }}</span>
          passage{{ g.episodes.length > 1 ? 's' : '' }} dans le Floodcast
        </p>

        <div class="search">
          <p class="kicker">Retrouver une phrase dans ses épisodes</p>
          <app-search-box [extraParams]="{ guest: g.slug }" />
        </div>

        @if (g.buddies.length) {
          <div class="buddies">
            <p class="kicker">Souvent à table avec</p>
            <div class="chips">
              @for (b of g.buddies; track b.slug) {
                <a class="dymo" [routerLink]="['/episodes']" [queryParams]="{ guest: g.slug + ',' + b.slug }"
                  [title]="'Les épisodes avec ' + g.name + ' et ' + b.name">
                  {{ b.name }} <span class="n">×{{ b.n }}</span>
                </a>
              }
            </div>
          </div>
        }
      </section>

      <section class="container">
        <div class="grid">
          @for (ep of g.episodes; track ep.id) {
            <app-episode-card [episode]="ep" />
          }
        </div>
      </section>
    }
  `,
  styles: `
    .head { padding-top: 36px; margin-bottom: 36px; }
    .back { text-decoration: none; }
    h1 { margin: 22px 0 12px; }
    .big { font-size: clamp(1.6rem, 5vw, 3rem); padding: 0.3em 0.6em 0.22em; rotate: -1.5deg; cursor: default; }
    .count { font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.1em; }
    .count .stamp { font-size: 2rem; vertical-align: -4px; }
    .search { max-width: 720px; margin-top: 26px; }
    .search .kicker, .buddies .kicker { margin-bottom: 8px; }
    .buddies { margin-top: 26px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .n { opacity: 0.6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 34px 26px; }
  `,
})
export class GuestPage {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  readonly slug = input.required<string>();

  readonly guest = toSignal(toObservable(this.slug).pipe(switchMap((s) => this.api.guest(s).pipe(catchError(() => of(null))))));

  constructor() {
    effect(() => {
      const g = this.guest();
      if (g) this.titleService.setTitle(`${g.name} — Floodthèque`);
    });
  }
}
