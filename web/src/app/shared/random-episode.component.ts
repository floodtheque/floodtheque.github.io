import { Component, ElementRef, Injectable, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CameraDatePipe, DurationPipe } from '../core/format';
import { Episode } from '../core/models';
import { PlayerService } from '../core/player.service';

/** Ouvre le tirage au sort depuis n'importe où (menu, accueil…). */
@Injectable({ providedIn: 'root' })
export class RandomEpisodeService {
  readonly open = signal(false);
  /** Incrémenté à chaque tirage pour relancer l'animation. */
  readonly roll = signal(0);

  start() {
    this.open.set(true);
    this.roll.update((n) => n + 1);
  }

  close() {
    this.open.set(false);
  }
}

type Phase = 'shuffle' | 'flash' | 'develop' | 'done';

const SHUFFLE_LINES = ['On fouille le carton de photos…', 'Adrien secoue le jetable…', 'Flo cherche le bon tirage…'];

/**
 * "Clic-clac" : les tirages défilent, coup de flash, puis la photo de l'épisode tiré
 * au sort se développe, comme un jetable qu'on récupère chez le photographe.
 */
@Component({
  selector: 'app-random-episode',
  imports: [RouterLink, CameraDatePipe, DurationPipe],
  template: `
    @if (service.open()) {
      <div class="backdrop" (click)="service.close()" aria-hidden="true"></div>
      <div class="dialog" [class.scrollable]="phase() === 'done'" role="dialog" aria-modal="true" aria-labelledby="rnd-title" tabindex="-1" #dialog
        (keydown.escape)="service.close()">
        <h2 id="rnd-title" class="kicker">
          @switch (phase()) {
            @case ('shuffle') { {{ shuffleLine() }} }
            @case ('flash') { Clic-clac ! }
            @default { Ce soir, ce sera… }
          }
        </h2>

        <div class="stage">
          @if (phase() === 'shuffle') {
            @for (ep of flicker(); track $index) {
              <div class="print flick" [style.--i]="$index" [style.--r.deg]="tilts[$index % tilts.length]">
                <span class="flick-code">{{ ep.code ?? 'HS' }}</span>
                <span class="flick-title">{{ ep.title }}</span>
              </div>
            }
          }

          @if (picked(); as ep) {
            @if (phase() === 'develop' || phase() === 'done') {
              <article class="print final">
                <span class="tape" aria-hidden="true"></span>
                <div class="photo">
                  <img [src]="ep.image" alt="" width="360" height="360" />
                  <span class="stamp date">{{ ep.pub_date | cameraDate }}</span>
                </div>
                <div class="caption">
                  <span class="code">{{ ep.code ?? 'Hors-série' }} · {{ ep.duration_sec | duration }}</span>
                  <h3>{{ ep.title }}</h3>
                  <p class="guests">
                    @if (ep.guests.length) { avec {{ guestNames(ep) }} } @else { Flo &amp; Adrien, en tête à tête }
                  </p>
                </div>
              </article>
            }
          }
        </div>

        @if (phase() === 'done' && picked(); as ep) {
          <div class="actions">
            <button type="button" class="btn btn--red" (click)="listen(ep)">▶ Écouter</button>
            <a class="btn" [routerLink]="['/episodes', ep.slug]" (click)="service.close()">Voir l'épisode</a>
            <button type="button" class="btn btn--ghost" (click)="service.start()">↻ Encore un !</button>
          </div>
          @if (ep.topics) {
            <p class="topics quote">On en parle de choses : {{ ep.topics }}</p>
          }
        }

        <button type="button" class="close" (click)="service.close()" aria-label="Fermer">✕</button>
      </div>

      @if (phase() === 'flash') { <div class="flash" aria-hidden="true"></div> }
    }
  `,
  styles: `
    :host { display: contents; }
    .backdrop {
      position: fixed; inset: 0; z-index: 1100; overflow: hidden;
      background: rgb(10 10 12 / 0.88); backdrop-filter: blur(4px);
      animation: fade 0.2s ease;
    }
    .dialog {
      position: fixed; z-index: 1101; left: 50%; top: 50%; translate: -50% -50%;
      width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px);
      /* Les tirages qui s'envolent débordent volontairement du cadre : jamais de barres de défilement
         pendant l'animation. Défilement vertical seulement une fois le résultat affiché (petits écrans). */
      overflow: visible;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      padding: 24px 16px 20px; color: #ede9e1; outline: none; text-align: center;
    }
    /* Le focus est placé par programme sur la fenêtre (accessibilité clavier) : pas de contour. */
    .dialog:focus, .dialog:focus-visible { outline: none; }
    .dialog.scrollable { overflow: hidden auto; scrollbar-width: none; }
    .dialog.scrollable::-webkit-scrollbar { display: none; }
    h2.kicker { color: #ede9e1; margin: 0; min-height: 1.2em; font-size: 0.85rem; }
    .stage { position: relative; width: min(300px, 78vw); aspect-ratio: 0.82; }

    .print {
      position: absolute; inset: 0;
      background: #f7f4ee; color: #151515;
      padding: 12px 12px 16px;
      box-shadow: 0 20px 40px -18px rgb(0 0 0 / 0.8);
    }

    /* Les tirages qui défilent : chacun passe devant puis file hors-champ. */
    .flick {
      display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; text-align: left;
      background:
        linear-gradient(#c9d6e0, #9fb2c1) top / 100% 72% no-repeat,
        #f7f4ee;
      opacity: 0;
      rotate: var(--r);
      animation: flick 0.26s ease-in-out calc(var(--i) * 0.14s) both;
    }
    .flick-code { font-family: var(--font-stamp); color: var(--stamp); font-size: 1.2rem; }
    .flick-title { font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; line-height: 1.1; }
    @keyframes flick {
      0%   { opacity: 0; transform: translate(-60%, 12%) rotate(-14deg); }
      35%  { opacity: 1; transform: translate(0, 0) rotate(0deg); }
      70%  { opacity: 1; transform: translate(0, 0) rotate(0deg); }
      100% { opacity: 0; transform: translate(70%, -8%) rotate(16deg); }
    }

    /* Le tirage final qui "se développe" : blanc cramé par le flash -> image. */
    .final { position: relative; inset: auto; rotate: -2deg; animation: drop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
    .tape { top: -12px; left: 50%; translate: -50% 0; rotate: 3deg; }
    .photo { position: relative; aspect-ratio: 1; overflow: hidden; background: #fff; }
    .photo img {
      width: 100%; height: 100%; object-fit: cover;
      animation: develop 1.6s ease-out both;
    }
    .date { position: absolute; right: 10px; bottom: 8px; animation: stamp-in 0.3s ease 1.4s both; }
    .caption { text-align: left; padding-top: 10px; }
    .code { font-family: var(--font-label); letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.75rem; color: var(--can); }
    h3 { font-family: var(--font-display); font-weight: 900; font-size: 1.45rem; line-height: 1.05; margin: 4px 0 6px; }
    .guests { margin: 0; font-size: 0.88rem; color: #5a564f; }
    .caption > * { animation: fade 0.4s ease 0.9s both; }

    @keyframes develop {
      0%   { filter: brightness(3.2) contrast(0.35) saturate(0) blur(6px); }
      45%  { filter: brightness(1.6) contrast(0.7) saturate(0.3) sepia(0.6) blur(2px); }
      100% { filter: none; }
    }
    @keyframes drop {
      0%   { opacity: 0; transform: translateY(-30px) rotate(6deg) scale(1.08); }
      100% { opacity: 1; transform: none; }
    }
    @keyframes stamp-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

    /* Le coup de flash. */
    .flash {
      position: fixed; inset: 0; z-index: 1200; pointer-events: none;
      background: radial-gradient(circle at 50% 45%, #fff 0%, #fff 35%, rgb(255 250 235 / 0.9) 70%);
      animation: flash 0.38s ease-out both;
    }
    @keyframes flash {
      0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; }
    }

    .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; animation: fade 0.3s ease both; }
    .actions .btn--ghost { color: #ede9e1; border-color: #ede9e1; }
    .actions .btn--ghost:hover { background: rgb(255 255 255 / 0.1); }
    .topics { margin: 0; font-size: 1rem; color: #cfcac1; max-width: 40ch; animation: fade 0.3s ease both; }
    .close {
      position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border-radius: 50%;
      border: 1.5px solid rgb(255 255 255 / 0.35); background: transparent; color: #ede9e1; cursor: pointer;
    }
  `,
})
export class RandomEpisodeComponent {
  readonly service = inject(RandomEpisodeService);
  private readonly player = inject(PlayerService);
  private readonly router = inject(Router);
  private readonly episodes = toSignal(inject(ApiService).allEpisodes$, { initialValue: [] as Episode[] });
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  readonly phase = signal<Phase>('shuffle');
  readonly picked = signal<Episode | null>(null);
  readonly flicker = signal<Episode[]>([]);
  readonly shuffleLine = signal(SHUFFLE_LINES[0]);
  readonly tilts = [-4, 3, -2, 5, -3, 2, -5, 4];

  private timers: ReturnType<typeof setTimeout>[] = [];
  private lastId: string | null = null;

  private readonly reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly ready = computed(() => this.episodes().length > 0);

  constructor() {
    // Nouveau tirage à chaque ouverture / "Encore un !" (une fois les épisodes chargés).
    effect(() => {
      const roll = this.service.roll();
      if (!this.service.open() || !this.ready() || !roll) return;
      this.run();
    });
    effect(() => {
      if (!this.service.open()) this.clearTimers();
      else queueMicrotask(() => this.dialog()?.nativeElement.focus());
    });
  }

  guestNames(ep: Episode) {
    return ep.guests.map((g) => g.name).join(', ');
  }

  listen(ep: Episode) {
    this.player.play(ep);
    this.service.close();
    void this.router.navigate(['/episodes', ep.slug]);
  }

  private run() {
    this.clearTimers();
    const all = this.episodes();
    let pick: Episode;
    do {
      pick = all[Math.floor(Math.random() * all.length)];
    } while (all.length > 1 && pick.id === this.lastId); // jamais deux fois le même d'affilée
    this.lastId = pick.id;

    this.picked.set(pick);
    this.shuffleLine.set(SHUFFLE_LINES[Math.floor(Math.random() * SHUFFLE_LINES.length)]);
    this.flicker.set(Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]));

    if (this.reducedMotion) {
      this.phase.set('done');
      return;
    }
    this.phase.set('shuffle');
    const at = (ms: number, fn: () => void) => this.timers.push(setTimeout(fn, ms));
    at(8 * 140 + 180, () => this.phase.set('flash'));
    at(8 * 140 + 330, () => this.phase.set('develop'));
    at(8 * 140 + 330 + 1700, () => this.phase.set('done'));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
