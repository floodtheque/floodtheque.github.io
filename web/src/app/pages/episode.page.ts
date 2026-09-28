import { Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { catchError, of, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { STATIC_SITE } from '../core/environment';
import { DurationPipe, TimecodePipe, fold, highlightParts } from '../core/format';
import { Segment } from '../core/models';
import { PlayerService } from '../core/player.service';
import { ListenLinksComponent } from '../shared/listen-links.component';

type Block =
  | { kind: 'seg'; start: number; segment: Segment }
  | { kind: 'ad'; start: number; duration: number; text: string };

@Component({
  selector: 'app-episode-page',
  imports: [RouterLink, FormsModule, DatePipe, DurationPipe, TimecodePipe, ListenLinksComponent],
  template: `
    @if (episode(); as ep) {
      <article class="container">
        <header class="hero">
          <div class="photo">
            <span class="tape" aria-hidden="true"></span>
            <img [src]="ep.image" alt="Pochette de l'épisode" width="360" height="360" />
          </div>
          <div class="intro">
            <p class="kicker">
              <span class="code">{{ ep.code ?? 'Hors-série' }}</span>
              · {{ ep.pub_date | date: 'd MMMM y' }} · {{ ep.duration_sec | duration }}
            </p>
            <h1 class="h-display">{{ ep.title }}</h1>

            @if (ep.guests.length) {
              <div class="guests">
                <span class="kicker">Autour de la table</span>
                <div class="chips">
                  <span class="dymo dymo--navy">Florent Bernard</span>
                  <span class="dymo dymo--navy">Adrien Ménielle</span>
                  @for (g of ep.guests; track g.slug) {
                    <a class="dymo" [routerLink]="['/invites', g.slug]">{{ g.name }}</a>
                  }
                </div>
              </div>
            }

            <div class="actions">
              <button type="button" class="btn btn--red" (click)="player.play(ep)">
                @if (player.isCurrent(ep) && player.playing()) { ❚❚ En cours } @else { ▶ Écouter }
              </button>
              @if (ep.link) {
                <a class="btn btn--ghost" [href]="ep.link" target="_blank" rel="noopener">Sur Acast ↗</a>
              }
            </div>
            <div class="platforms">
              <span class="kicker">Aussi sur</span>
              <app-listen-links [episode]="ep" [compact]="true" />
            </div>

            @if (ep.topics) {
              <div class="topics">
                <p class="kicker">On en parle de choses dans cet épisode</p>
                <p class="quote">{{ ep.topics }}</p>
              </div>
            }
          </div>
        </header>

        <nav class="siblings" aria-label="Épisodes voisins">
          @if (ep.prev) { <a [routerLink]="['/episodes', ep.prev]">← Épisode précédent</a> } @else { <span></span> }
          @if (ep.next) { <a [routerLink]="['/episodes', ep.next]">Épisode suivant →</a> }
        </nav>

        <section class="transcript" aria-labelledby="tx-title">
          <header class="tx-head">
            <h2 id="tx-title" class="h-display">Transcription</h2>
            @if (segments().length) {
              <div class="tx-tools">
                <input class="field" type="search" placeholder="Chercher dans l'épisode…"
                  aria-label="Chercher dans la transcription" [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
                <span class="tx-count">
                  @if (filter().length > 1) { {{ matchCount() }} passage{{ matchCount() > 1 ? 's' : '' }} }
                  @else { {{ segments().length }} segments }
                </span>
                <label class="check">
                  <input type="checkbox" [ngModel]="follow()" (ngModelChange)="follow.set($event)" /> Suivre la lecture
                </label>
              </div>
            }
          </header>

          @if (ep.has_transcript && !ep.full_transcript) {
            <div class="no-tx">
              <p class="quote">La transcription intégrale n'est pas publiée, par respect pour l'œuvre de Flo &amp; Adrien.</p>
              <p>Elle sert quand même à la recherche : tape une phrase dont tu te souviens et tu tomberas
                sur l'extrait et son timecode.</p>
              <p><a class="btn btn--red" routerLink="/recherche">Chercher une phrase</a></p>
            </div>
          } @else if (!ep.has_transcript) {
            <div class="no-tx">
              <p class="quote">Pas encore transcrit. La machine à écrire tourne…</p>
              @if (!staticSite) {
                <p>Lance <code>npm run transcribe</code> puis <code>npm run index</code> pour l'ajouter.</p>
              }
            </div>
          } @else {
            <p class="disclaimer">Transcription automatique ({{ ep.transcript_model }}) : les noms propres et les
              imitations de Pierre Bachelet peuvent avoir souffert. Clique sur un timecode pour écouter.</p>
            @if (ep.ad_spans.length) {
              <p class="disclaimer">
                📺 {{ ep.ad_spans.length }} coupure{{ ep.ad_spans.length > 1 ? 's' : '' }} pub détectée{{ ep.ad_spans.length > 1 ? 's' : '' }}
                ({{ adSeconds() }} s), repliée{{ ep.ad_spans.length > 1 ? 's' : '' }} et exclue{{ ep.ad_spans.length > 1 ? 's' : '' }} de la recherche.
              </p>
            }
            @switch (sync()?.status) {
              @case ('synced') {
                <p class="disclaimer ok">✓ Écoute synchronisée : tu entends les mêmes pubs que la transcription, les timecodes tombent juste.</p>
              }
              @case ('desynced') {
                <p class="disclaimer warn">
                  ⚠ Acast a changé les pubs de cet épisode depuis la transcription : les timecodes peuvent être décalés
                  de quelques secondes. Pour recaler : <code>npm run transcribe -- --resync</code> puis <code>npm run index</code>.
                </p>
              }
              @case ('unknown') {
                <p class="disclaimer warn">⚠ Synchronisation non vérifiable ({{ sync()?.reason ?? 'Acast injoignable' }}) : timecodes approximatifs.</p>
              }
            }
            <ol class="segments">
              @for (b of blocks(); track b.start) {
                @if (b.kind === 'ad') {
                  <li class="ad" [attr.data-start]="b.start">
                    <span class="tc ad-tc">{{ b.start | timecode }}</span>
                    <div>
                      <button type="button" class="dymo dymo--ghost ad-toggle" (click)="toggleAd(b.start)"
                        [attr.aria-expanded]="openAds().has(b.start)">
                        📺 Coupure pub · {{ b.duration }} s {{ openAds().has(b.start) ? '▴' : '▾' }}
                      </button>
                      @if (openAds().has(b.start)) {
                        <p class="ad-text">{{ b.text }}</p>
                      }
                    </div>
                  </li>
                } @else {
                  @let s = b.segment;
                  <li [attr.data-start]="s.start" [class.now]="isNow(s)" [class.target]="isTarget(s)">
                    <button type="button" class="tc" (click)="player.play(ep, s.start)">{{ s.start | timecode }}</button>
                    <span class="txt">@for (p of parts(s); track $index) {@if (p.hit) {<mark>{{ p.t }}</mark>} @else {{{ p.t }}}}</span>
                  </li>
                }
              }
            </ol>
          }
        </section>
      </article>
    } @else if (notFound()) {
      <div class="container missing">
        <p class="quote">Cet épisode n'existe pas. Ou alors c'était un rêve à réaliser.</p>
        <a class="btn" routerLink="/episodes">Retour aux épisodes</a>
      </div>
    }
  `,
  styles: `
    .hero { display: grid; grid-template-columns: minmax(220px, 360px) 1fr; gap: 44px; padding-top: 44px; align-items: start; }
    .photo { position: relative; background: var(--paper-2); padding: 12px 12px 44px; box-shadow: var(--shadow); rotate: -2deg; }
    .photo .tape { top: -12px; left: 30%; rotate: 4deg; }
    .photo img { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .code { color: var(--can); }
    h1 { font-size: clamp(2.4rem, 6vw, 4.6rem); margin: 8px 0 22px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .actions { display: flex; gap: 12px; margin: 26px 0; flex-wrap: wrap; }
    .topics { border-left: 4px solid var(--stamp); padding-left: 16px; }
    .topics .quote { font-size: 1.3rem; line-height: 1.35; margin: 6px 0 0; }
    .siblings { display: flex; justify-content: space-between; margin: 40px 0 0; font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.85rem; }
    .siblings a { text-decoration: none; }
    .siblings a:hover { color: var(--can); }
    .transcript { margin-top: 40px; border-top: 2px solid var(--ink); padding-top: 26px; }
    .tx-head { display: flex; justify-content: space-between; align-items: end; gap: 20px; flex-wrap: wrap; position: sticky; top: 66px; background: var(--paper); padding: 10px 0; z-index: 5; }
    .tx-head h2 { font-size: clamp(2rem, 5vw, 3rem); }
    .tx-tools { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .tx-tools .field { width: 280px; }
    .tx-count { font-family: var(--font-stamp); color: var(--stamp); font-size: 1.2rem; }
    .check { display: flex; gap: 6px; align-items: center; font-size: 0.9rem; cursor: pointer; }
    .check input { accent-color: var(--can); }
    .disclaimer { color: var(--ink-soft); font-size: 0.88rem; margin: 6px 0 20px; }
    .no-tx { padding: 30px; border: 2px dashed var(--line); text-align: center; }
    .no-tx .quote { font-size: 1.6rem; margin: 0 0 8px; }
    .segments { list-style: none; padding: 0; margin: 0; max-width: 860px; }
    .segments li { display: grid; grid-template-columns: 76px 1fr; gap: 14px; padding: 5px 8px; border-radius: 4px; scroll-margin-top: 180px; }
    .segments li:hover { background: var(--paper-3); }
    .segments li.now { background: color-mix(in srgb, var(--stamp) 22%, transparent); }
    .segments li.target { box-shadow: inset 4px 0 0 var(--can); background: var(--paper-3); }
    .tc { font-family: var(--font-stamp); font-size: 1.1rem; color: var(--stamp); background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
    .tc:hover { text-decoration: underline; }
    .disclaimer.warn { color: var(--can); }
    .disclaimer.ok { color: var(--ink-soft); }
    .platforms { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: -10px 0 26px; }
    .segments li.ad { padding-block: 8px; }
    .segments li.ad:hover { background: transparent; }
    .ad-tc { opacity: 0.45; cursor: default; }
    .ad-toggle { border: 0; font-size: 0.72rem; opacity: 0.75; }
    .ad-text { margin: 8px 0 0; padding: 8px 12px; border-left: 3px dashed var(--line); color: var(--ink-soft); font-size: 0.9rem; }
    .txt { line-height: 1.55; }
    .missing { padding: 80px var(--gutter); }
    .missing .quote { font-size: 2rem; }
    @media (max-width: 760px) {
      .hero { grid-template-columns: 1fr; gap: 26px; }
      .photo { max-width: 280px; }
      .tx-head { top: 64px; }
      .tx-tools .field { width: 100%; }
      .segments li { grid-template-columns: 58px 1fr; gap: 8px; }
    }
  `,
})
export class EpisodePage {
  private readonly api = inject(ApiService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly titleService = inject(Title);
  readonly player = inject(PlayerService);
  readonly staticSite = STATIC_SITE;

  readonly slug = input.required<string>();
  /** ?t=secondes&q=phrase : arrive depuis un résultat de recherche. */
  readonly t = input<string>();
  readonly q = input<string>();

  readonly filter = signal('');
  readonly follow = signal(false);
  readonly notFound = signal(false);

  readonly episode = toSignal(
    toObservable(this.slug).pipe(
      switchMap((s) => {
        this.notFound.set(false);
        return this.api.episode(s).pipe(catchError(() => (this.notFound.set(true), of(null))));
      }),
    ),
  );

  /** Vérifie que l'assemblage de pubs servi par Acast est celui qui a été transcrit. */
  readonly sync = toSignal(
    toObservable(this.slug).pipe(switchMap((s) => this.api.sync(s).pipe(catchError(() => of(null))))),
  );

  readonly segments = toSignal(
    toObservable(this.slug).pipe(switchMap((s) => this.api.transcript(s).pipe(catchError(() => of([] as Segment[]))))),
    { initialValue: [] as Segment[] },
  );

  private readonly foldedFilter = computed(() => fold(this.filter().trim()));

  readonly visibleSegments = computed(() => {
    const f = this.foldedFilter();
    const segs = this.segments();
    if (f.length < 2) return segs;
    const words = f.split(/\s+/);
    // En mode recherche dans l'épisode, on ignore les pubs.
    return segs.filter((s) => {
      const t = fold(s.text);
      return !s.is_ad && words.every((w) => t.includes(w));
    });
  });

  readonly matchCount = computed(() => this.visibleSegments().length);

  /** Les segments pub consécutifs sont regroupés en une coupure repliable. */
  readonly blocks = computed<Block[]>(() => {
    const out: Block[] = [];
    let ad: { start: number; end: number; texts: string[] } | null = null;
    const flush = () => {
      if (ad) out.push({ kind: 'ad', start: ad.start, duration: Math.round(ad.end - ad.start), text: ad.texts.join(' ') });
      ad = null;
    };
    for (const s of this.visibleSegments()) {
      if (s.is_ad) {
        ad ??= { start: s.start, end: s.end, texts: [] };
        ad.end = s.end;
        ad.texts.push(s.text);
      } else {
        flush();
        out.push({ kind: 'seg', start: s.start, segment: s });
      }
    }
    flush();
    return out;
  });

  readonly adSeconds = computed(() =>
    Math.round((this.episode()?.ad_spans ?? []).reduce((acc, s) => acc + s.end - s.start, 0)),
  );

  readonly openAds = signal(new Set<number>());

  toggleAd(start: number) {
    const next = new Set(this.openAds());
    if (next.has(start)) next.delete(start);
    else next.add(start);
    this.openAds.set(next);
  }

  private readonly highlightQuery = computed(() => (this.filter().trim().length > 1 ? this.filter() : this.q() ?? ''));
  private readonly targetTime = computed(() => (this.t() ? Number(this.t()) : null));

  constructor() {
    effect(() => {
      const ep = this.episode();
      if (ep) this.titleService.setTitle(`${ep.code ?? ''} ${ep.title} — Floodthèque`);
    });

    // Arrivée depuis la recherche : on scrolle vers le passage.
    effect(() => {
      const t = this.targetTime();
      // La transcription n'est dans le DOM qu'une fois l'épisode ET les segments chargés.
      if (t == null || !this.episode() || !this.segments().length) return;
      // Petit délai : on attend que la pochette et les polices aient fini de décaler la page.
      untracked(() => setTimeout(() => this.scrollTo(t, 'smooth'), 250));
    });

    // Mode "suivre la lecture".
    effect(() => {
      const time = this.player.time();
      if (!this.follow() || !this.player.isCurrent(this.episode())) return;
      untracked(() => this.scrollTo(time, 'smooth'));
    });
  }

  parts(s: Segment) {
    return highlightParts(s.text, this.highlightQuery());
  }

  isNow(s: Segment) {
    if (!this.player.isCurrent(this.episode())) return false;
    const now = this.player.time();
    return now >= s.start && now < s.end;
  }

  isTarget(s: Segment) {
    const t = this.targetTime();
    return t != null && t >= s.start - 0.5 && t < s.end;
  }

  private scrollTo(time: number, behavior: ScrollBehavior = 'auto') {
    const items = this.host.nativeElement.querySelectorAll('.segments li') as NodeListOf<HTMLElement>;
    let target: HTMLElement | null = null;
    for (const li of items) {
      if (Number(li.dataset['start']) <= time + 0.5) target = li;
      else break;
    }
    target?.scrollIntoView({ block: 'center', behavior });
  }
}
