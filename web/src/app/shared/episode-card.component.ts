import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CameraDatePipe, DurationPipe } from '../core/format';
import { Episode } from '../core/models';
import { PlayerService } from '../core/player.service';

/** Un épisode = un tirage photo punaisé avec du scotch. */
@Component({
  selector: 'app-episode-card',
  imports: [RouterLink, CameraDatePipe, DurationPipe],
  template: `
    <article class="print" [style.--tilt.deg]="tilt()">
      <span class="tape" aria-hidden="true"></span>
      <a class="photo" [routerLink]="['/episodes', episode().slug]" [attr.aria-label]="episode().full_title">
        @if (episode().image) {
          <img [src]="episode().image" alt="" loading="lazy" width="400" height="400" />
        } @else {
          <span class="no-photo">🎙️</span>
        }
        <span class="stamp date">{{ episode().pub_date | cameraDate }}</span>
      </a>
      <div class="caption">
        <div class="meta">
          <span class="code">{{ episode().code ?? 'Hors-série' }}</span>
          <span>{{ episode().duration_sec | duration }}</span>
          @if (episode().has_transcript) {
            <span class="tx" title="Transcription disponible">TXT</span>
          }
        </div>
        <h3><a [routerLink]="['/episodes', episode().slug]">{{ episode().title }}</a></h3>
        @if (episode().guests.length) {
          <p class="guests">
            avec
            @for (g of episode().guests; track g.slug; let last = $last) {
              <a [routerLink]="['/invites', g.slug]">{{ g.name }}</a>@if (!last) {<span>, </span>}
            }
          </p>
        } @else {
          <p class="guests solo">Flo &amp; Adrien, en tête à tête</p>
        }
        <button type="button" class="play" (click)="player.play(episode())"
          [attr.aria-label]="(player.isCurrent(episode()) && player.playing() ? 'Pause ' : 'Écouter ') + episode().full_title"
          [attr.aria-pressed]="player.isCurrent(episode()) && player.playing()">
          @if (player.isCurrent(episode()) && player.playing()) { ❚❚ } @else { ▶ }
        </button>
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .print {
      position: relative;
      height: 100%;
      background: var(--paper-2);
      padding: 10px 10px 14px;
      box-shadow: var(--shadow);
      transform: rotate(var(--tilt));
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .print:hover, .print:focus-within {
      transform: rotate(0deg) translateY(-4px);
      box-shadow: 0 18px 34px -16px rgb(0 0 0 / 0.5);
      z-index: 3;
    }
    .tape { top: -10px; left: 50%; translate: -50% 0; rotate: calc(var(--tilt) * -2); }
    .photo {
      position: relative;
      display: block;
      aspect-ratio: 1;
      overflow: hidden;
      background: var(--flash);
    }
    .photo img {
      width: 100%; height: 100%; object-fit: cover;
      filter: saturate(0.9) contrast(1.05);
      transition: transform 0.4s ease;
    }
    .print:hover img { transform: scale(1.04); }
    .no-photo { display: grid; place-items: center; height: 100%; font-size: 3rem; }
    .date { position: absolute; right: 10px; bottom: 8px; }
    .caption { position: relative; padding: 10px 4px 0; }
    .meta {
      display: flex; gap: 10px; align-items: center;
      font-family: var(--font-label); font-size: 0.74rem; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--ink-soft);
    }
    .code { color: var(--can); font-weight: 600; }
    .tx {
      border: 1.5px solid currentColor; border-radius: 3px; padding: 0 4px;
      font-size: 0.65rem; line-height: 1.3;
    }
    h3 {
      margin: 4px 44px 6px 0;
      font-family: var(--font-display); font-weight: 800; font-size: 1.12rem;
      line-height: 1.12; letter-spacing: -0.01em;
    }
    h3 a { text-decoration: none; }
    h3 a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 3px; }
    .guests { margin: 0; font-size: 0.86rem; color: var(--ink-soft); line-height: 1.35; }
    .guests a { color: var(--ink); text-decoration: none; font-weight: 500; }
    .guests a:hover { color: var(--can); }
    .solo { font-family: var(--font-quote); font-style: italic; font-size: 0.98rem; }
    .play {
      position: absolute; right: 2px; top: 30px;
      width: 38px; height: 38px; border-radius: 50%;
      border: none; background: var(--can); color: #fff;
      font-size: 0.8rem; cursor: pointer;
      box-shadow: 2px 2px 0 var(--ink);
      transition: transform 0.12s ease;
    }
    .play:hover { transform: scale(1.08); }
    .play[aria-pressed='true'] { background: var(--ink); color: var(--paper); box-shadow: 2px 2px 0 var(--can); }
  `,
})
export class EpisodeCardComponent {
  readonly episode = input.required<Episode>();
  readonly player = inject(PlayerService);

  /** Inclinaison pseudo-aléatoire mais stable par épisode. */
  readonly tilt = computed(() => {
    const id = this.episode().id;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((Math.abs(h) % 5) - 2) * 0.6;
  });
}
