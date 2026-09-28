import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { STATIC_SITE } from '../core/environment';
import { CameraDatePipe, TimecodePipe } from '../core/format';
import { SearchResponse, SearchResult, SearchHit } from '../core/models';
import { PlayerService } from '../core/player.service';
import { SearchBoxComponent } from '../shared/search-box.component';
import { EasterEggService } from '../shared/easter-eggs.component';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'done'; data: SearchResponse };

const LOADING_LINES = [
  'Adrien rembobine la cassette…',
  'Flo relit ses notes…',
  'On fouille sous le canapé…',
  'On réécoute tout en ×2…',
];

@Component({
  selector: 'app-search-page',
  imports: [RouterLink, FormsModule, SearchBoxComponent, TimecodePipe, CameraDatePipe],
  template: `
    <section class="container head">
      <p class="kicker">Retrouver un moment</p>
      <app-search-box [initial]="q() ?? ''" [extraParams]="{ guest: guest() ?? null, season: season() ?? null }" />

      <div class="filters">
        <label>
          <span class="kicker">Invité</span>
          <select class="field" [ngModel]="guest() ?? ''" (ngModelChange)="setParam('guest', $event)">
            <option value="">Tous les invités</option>
            @for (g of guests(); track g.slug) {
              <option [value]="g.slug">{{ g.name }} ({{ g.episodes }})</option>
            }
          </select>
        </label>
        <label>
          <span class="kicker">Saison</span>
          <select class="field" [ngModel]="season() ?? ''" (ngModelChange)="setParam('season', $event)">
            <option value="">Toutes</option>
            @for (s of seasons(); track s.season) {
              <option [value]="s.season">Saison {{ s.season }}</option>
            }
          </select>
        </label>
      </div>
    </section>

    <section class="container results" aria-live="polite">
      @switch (state().status) {
        @case ('idle') {
          <div class="empty">
            <p class="quote big">« C'était quoi déjà l'histoire du mec avec… »</p>
            @if (staticSite) {
              <p>Tape une phrase, même approximative : les mots n'ont pas besoin d'être dans l'ordre ni
                parfaitement orthographiés au pluriel près. Le plus efficace : les mots les plus rares dont tu te souviens.</p>
            } @else {
              <p>Tape une phrase, même approximative. La recherche comprend les mots exacts
                <strong>et</strong> le sens (si les embeddings sont calculés) : pas besoin de la citation parfaite.</p>
            }
          </div>
        }
        @case ('loading') {
          <p class="loading stamp">{{ loadingLine }}</p>
        }
        @case ('error') {
          @if (staticSite) {
            <p class="empty">Impossible de charger les transcriptions. Recharge la page pour réessayer.</p>
          } @else {
            <p class="empty">Le serveur fait la gueule. Il tourne bien (<code>npm start</code> dans <code>server/</code>) ?</p>
          }
        }
        @case ('done') {
          @let data = response()!;
          <p class="summary">
            <strong>{{ data.total }}</strong> épisode{{ data.total > 1 ? 's' : '' }} pour
            <em class="quote">« {{ data.query }} »</em>
            <span class="muted">· {{ data.tookMs }} ms · {{ data.semantic ? 'mots + sens' : 'mots exacts' }}</span>
          </p>
          @if (egg() === 'quatorze') {
            <p class="egg stamp">Rappel : chaque épisode du Floodcast est le numéro 14. Tout le monde le sait.</p>
          }
          @if (!data.results.length) {
            <div class="empty">
              <p class="quote big">Personne n'a dit ça. Ou alors c'était off.</p>
              <p>Essaie avec moins de mots, ou juste le mot le plus bizarre de la phrase.
                @if (stats()?.transcribed !== stats()?.episodes) {
                  (Seuls {{ stats()?.transcribed }} épisodes sur {{ stats()?.episodes }} sont transcrits pour l'instant.)
                }
              </p>
            </div>
          }
          <ol class="list">
            @for (r of data.results; track r.episode.id; let i = $index) {
              <li class="result" [class.top]="i === 0">
                <a class="thumb" [routerLink]="['/episodes', r.episode.slug]">
                  <img [src]="r.episode.image" alt="" loading="lazy" width="120" height="120" />
                  <span class="stamp">{{ r.episode.pub_date | cameraDate }}</span>
                </a>
                <div class="body">
                  <div class="line1">
                    <span class="code">{{ r.episode.code }}</span>
                    <a class="title" [routerLink]="['/episodes', r.episode.slug]">{{ r.episode.title }}</a>
                    <span class="meter" [attr.aria-label]="'Pertinence ' + r.relevance + ' %'">
                      <span [style.width.%]="r.relevance"></span>
                    </span>
                  </div>
                  @if (r.episode.guests.length) {
                    <p class="guests">avec {{ guestNames(r) }}</p>
                  }
                  @for (h of r.hits; track h.start) {
                    <div class="hit">
                      <button type="button" class="dymo" [class.dymo--red]="h.exact"
                        (click)="listen(r, h)" [attr.aria-label]="'Écouter à ' + (h.start | timecode)">
                        ▶ {{ h.start | timecode }}
                      </button>
                      <a class="snippet quote" [routerLink]="['/episodes', r.episode.slug]"
                        [queryParams]="{ t: floor(h.start), q: data.query }">
                        …@for (p of h.parts; track $index) {@if (p.hit) {<mark>{{ p.t }}</mark>} @else {{{ p.t }}}}…
                      </a>
                    </div>
                  }
                  @if (!r.hits.length && r.metaMatch) {
                    <p class="meta-only">Trouvé dans le titre, les invités ou le résumé de l'épisode.
                      @if (r.episode.topics) { <span class="topics">On en parle de choses : {{ r.episode.topics }}</span> }
                    </p>
                  }
                </div>
              </li>
            }
          </ol>
        }
      }
    </section>
  `,
  styles: `
    .head { padding-top: 36px; }
    .head .kicker { display: block; margin-bottom: 10px; }
    .filters { display: flex; gap: 14px; margin-top: 22px; flex-wrap: wrap; }
    .filters label { display: flex; flex-direction: column; gap: 4px; min-width: 220px; flex: 1; max-width: 320px; }
    .results { margin-top: 36px; }
    .summary { font-size: 1.05rem; border-bottom: 2px solid var(--ink); padding-bottom: 12px; }
    .summary em { font-size: 1.2em; }
    .muted { color: var(--ink-soft); font-size: 0.9rem; }
    .empty { max-width: 60ch; padding: 30px 0; color: var(--ink-soft); }
    .big { font-size: 2rem; line-height: 1.1; color: var(--ink); margin: 0 0 10px; }
    .loading { font-size: 1.8rem; padding: 30px 0; animation: blink 1s steps(2) infinite; }
    @keyframes blink { 50% { opacity: 0.4; } }
    .list { list-style: none; padding: 0; margin: 0; }
    .result {
      display: grid; grid-template-columns: 120px 1fr; gap: 22px;
      padding: 24px 0; border-bottom: 1.5px dashed var(--line);
    }
    .thumb { position: relative; display: block; align-self: start; box-shadow: var(--shadow); border: 6px solid var(--paper-2); }
    .thumb img { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .thumb .stamp { position: absolute; right: 4px; bottom: 3px; font-size: 0.95rem; }
    .top .thumb { rotate: -2deg; }
    .line1 { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .code { font-family: var(--font-label); color: var(--can); letter-spacing: 0.1em; font-size: 0.85rem; }
    .title { font-family: var(--font-display); font-weight: 800; font-size: 1.35rem; text-decoration: none; line-height: 1.1; }
    .title:hover { text-decoration: underline; }
    .meter { margin-left: auto; width: 70px; height: 8px; border: 1.5px solid var(--ink); border-radius: 4px; overflow: hidden; }
    .meter span { display: block; height: 100%; background: var(--stamp); }
    .guests { margin: 4px 0 10px; color: var(--ink-soft); font-size: 0.9rem; }
    .hit { display: flex; align-items: flex-start; gap: 12px; margin: 10px 0; }
    .hit .dymo { flex: none; border: 0; margin-top: 3px; }
    .snippet { font-size: 1.12rem; line-height: 1.4; text-decoration: none; }
    .snippet:hover { color: var(--can); }
    .meta-only { color: var(--ink-soft); font-size: 0.92rem; }
    .egg { display: inline-block; margin: 0 0 18px; font-size: 1.3rem; rotate: -1.4deg; }
    .topics { display: block; margin-top: 6px; font-style: italic; }
    @media (max-width: 600px) {
      .result { grid-template-columns: 72px 1fr; gap: 14px; }
      .thumb { border-width: 3px; }
      .thumb .stamp { display: none; }
      .hit { flex-direction: column; gap: 4px; }
    }
  `,
})
export class SearchPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly player = inject(PlayerService);
  readonly staticSite = STATIC_SITE;
  private readonly eggs = inject(EasterEggService);

  /** Easter eggs : « 14 » (le numéro de chaque épisode, évidemment) et « sax ». */
  readonly egg = computed(() => {
    const f = (this.q() ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (/^(n[°o]?\s*)?14$|^(le\s+)?(numero\s+)?(14|quatorze|quatorzieme)$/.test(f)) return 'quatorze';
    if (/(^|[^a-z])sax(o|ophone)?s?([^a-z]|$)/.test(f)) return 'sax';
    return null;
  });

  constructor() {
    effect(() => {
      const egg = this.egg();
      untracked(() => (egg === 'sax' ? this.eggs.sax() : egg === 'quatorze' ? this.eggs.numero14() : null));
    });
  }

  // Paramètres d'URL liés automatiquement (withComponentInputBinding).
  readonly q = input<string>();
  readonly guest = input<string>();
  readonly season = input<string>();

  readonly guests = toSignal(this.api.guests$, { initialValue: [] });
  readonly seasons = toSignal(this.api.seasons$, { initialValue: [] });
  readonly stats = toSignal(this.api.stats$);
  readonly loadingLine = LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];

  private readonly params = computed(() => ({ q: this.q()?.trim() ?? '', guest: this.guest(), season: this.season() }));

  readonly state = toSignal(
    toObservable(this.params).pipe(
      switchMap(({ q, guest, season }) =>
        q.length < 2
          ? of<State>({ status: 'idle' })
          : this.api.search(q, { guest, season: season ? Number(season) : null }).pipe(
              map((data): State => ({ status: 'done', data })),
              catchError(() => of<State>({ status: 'error' })),
              startWith<State>({ status: 'loading' }),
            ),
      ),
    ),
    { initialValue: { status: 'idle' } as State },
  );

  readonly response = computed(() => {
    const s = this.state();
    return s.status === 'done' ? s.data : null;
  });

  floor = Math.floor;

  guestNames(r: SearchResult) {
    return r.episode.guests.map((g) => g.name).join(', ');
  }

  listen(r: SearchResult, h: SearchHit) {
    this.player.play(r.episode, h.start);
  }

  setParam(key: 'guest' | 'season', value: string) {
    void this.router.navigate([], { queryParams: { [key]: value || null }, queryParamsHandling: 'merge' });
  }
}
