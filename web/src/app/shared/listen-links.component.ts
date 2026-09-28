import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { Episode } from '../core/models';

/**
 * Liens "Écouter sur…" : page de l'épisode quand on la connaît (Apple, Deezer),
 * sinon page de l'émission. Pour Spotify, pas d'API publique : recherche de l'épisode.
 */
@Component({
  selector: 'app-listen-links',
  template: `
    @if (links(); as l) {
      <ul class="links" [class.compact]="compact()" aria-label="Écouter sur les plateformes">
        <li><a class="dymo dymo--ghost" [href]="l.spotify" target="_blank" rel="noopener">Spotify ↗</a></li>
        <li><a class="dymo dymo--ghost" [href]="l.deezer" target="_blank" rel="noopener">Deezer ↗</a></li>
        <li><a class="dymo dymo--ghost" [href]="l.apple" target="_blank" rel="noopener">Apple Podcasts ↗</a></li>
      </ul>
    }
  `,
  styles: `
    .links { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 0; padding: 0; }
    .compact .dymo { font-size: 0.72rem; }
  `,
})
export class ListenLinksComponent {
  private readonly platforms = toSignal(inject(ApiService).platforms$);
  readonly episode = input<Episode | null>(null);
  readonly compact = input(false);

  readonly links = computed(() => {
    const p = this.platforms();
    if (!p) return null;
    const ep = this.episode();
    if (!ep) return p;
    return {
      spotify: `https://open.spotify.com/search/${encodeURIComponent(`FloodCast ${ep.full_title}`)}/episodes`,
      deezer: ep.deezer_url ?? p.deezer,
      apple: ep.apple_url ?? p.apple,
    };
  });
}
