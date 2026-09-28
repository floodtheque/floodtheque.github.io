import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimecodePipe } from '../core/format';
import { PlayerService } from '../core/player.service';

/** Lecteur collant en bas d'écran, façon dictaphone. */
@Component({
  selector: 'app-player-bar',
  imports: [RouterLink, TimecodePipe],
  template: `
    @if (player.episode(); as ep) {
      <div class="bar" role="region" aria-label="Lecteur audio">
        <div class="inner container">
          <img class="thumb" [src]="ep.image" alt="" width="48" height="48" />
          <div class="info">
            <a class="title" [routerLink]="['/episodes', ep.slug]">
              <span class="code">{{ ep.code }}</span> {{ ep.title }}
            </a>
            <div class="scrub">
              <span class="tc">{{ player.time() | timecode }}</span>
              <input type="range" min="0" [max]="player.duration() || 1" step="1"
                [value]="player.time()" (input)="player.seek(+$any($event.target).value)"
                aria-label="Position dans l'épisode" [style.--p]="player.progress()" />
              <span class="tc">{{ player.duration() | timecode }}</span>
            </div>
          </div>
          <div class="controls">
            <button type="button" class="ctl" (click)="player.skip(-15)" aria-label="Reculer de 15 secondes">↺15</button>
            <button type="button" class="ctl main" (click)="player.toggle()"
              [attr.aria-label]="player.playing() ? 'Pause' : 'Lecture'">
              @if (player.loading()) { <span class="spin">◌</span> }
              @else if (player.playing()) { ❚❚ } @else { ▶ }
            </button>
            <button type="button" class="ctl" (click)="player.skip(30)" aria-label="Avancer de 30 secondes">30↻</button>
            <button type="button" class="ctl close" (click)="player.close()" aria-label="Fermer le lecteur">✕</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .bar {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 900;
      background: var(--ink); color: var(--paper);
      border-top: 4px solid var(--can);
      box-shadow: 0 -10px 30px -10px rgb(0 0 0 / 0.5);
    }
    .inner { display: flex; align-items: center; gap: 14px; padding-block: 10px; }
    .thumb { width: 48px; height: 48px; object-fit: cover; border: 2px solid var(--paper); flex: none; }
    .info { flex: 1; min-width: 0; }
    .title {
      display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-family: var(--font-display); font-weight: 700; text-decoration: none; font-size: 0.95rem;
    }
    .code { color: var(--stamp); font-family: var(--font-stamp); font-size: 1.1rem; font-weight: 400; }
    .scrub { display: flex; align-items: center; gap: 10px; }
    .tc { font-family: var(--font-stamp); font-size: 1.05rem; color: var(--stamp); min-width: 52px; }
    .tc:last-child { text-align: right; }
    input[type='range'] {
      flex: 1; appearance: none; height: 6px; border-radius: 3px; cursor: pointer;
      background: linear-gradient(90deg, var(--can) calc(var(--p) * 100%), rgb(255 255 255 / 0.2) 0);
    }
    input[type='range']::-webkit-slider-thumb {
      appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--paper);
    }
    input[type='range']::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--paper); }
    .controls { display: flex; gap: 6px; align-items: center; }
    .ctl {
      background: transparent; border: 1.5px solid rgb(255 255 255 / 0.3); color: var(--paper);
      border-radius: 999px; min-width: 42px; height: 36px; cursor: pointer;
      font-family: var(--font-label); font-size: 0.8rem; letter-spacing: 0.05em;
    }
    .ctl:hover { border-color: var(--paper); }
    .main { background: var(--can); border-color: var(--can); width: 48px; height: 48px; font-size: 1rem; }
    .close { border: none; opacity: 0.6; }
    .spin { display: inline-block; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) {
      .thumb, .ctl:not(.main) { display: none; }
      .tc { min-width: 0; font-size: 0.95rem; }
    }
  `,
})
export class PlayerBarComponent {
  readonly player = inject(PlayerService);
}
