import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlayerService } from './core/player.service';
import { PlayerBarComponent } from './shared/player-bar.component';
import { ListenLinksComponent } from './shared/listen-links.component';
import { RandomEpisodeComponent, RandomEpisodeService } from './shared/random-episode.component';
import { WordmarkComponent } from './shared/wordmark.component';
import { EasterEggService, EasterEggsComponent } from './shared/easter-eggs.component';

type Theme = 'auto' | 'light' | 'dark';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, WordmarkComponent, PlayerBarComponent, ListenLinksComponent,
    RandomEpisodeComponent, EasterEggsComponent,
  ],
  template: `
    <a class="skip" href="#main">Aller au contenu</a>
    <header class="top">
      <div class="container inner">
        <a routerLink="/" class="brand" aria-label="Accueil Floodthèque">
          <app-wordmark size="small" />
        </a>
        <nav aria-label="Navigation principale">
          <a routerLink="/recherche" routerLinkActive="on">Recherche</a>
          <a routerLink="/episodes" routerLinkActive="on">Épisodes</a>
          <a routerLink="/invites" routerLinkActive="on">Invités</a>
          <a routerLink="/flo-et-adrien" routerLinkActive="on">Flo &amp; Adrien</a>
          <a routerLink="/hors-floodcast" routerLinkActive="on">Hors Flood</a>
        </nav>
        <button type="button" class="random" (click)="random.start()" title="Un épisode au hasard">
          <span aria-hidden="true">📷</span> Au pif
        </button>
        <button type="button" class="theme" (click)="cycleTheme()"
          [attr.aria-label]="'Thème : ' + themeLabel[theme()]" [title]="'Thème : ' + themeLabel[theme()]">
          {{ themeIcon[theme()] }}
        </button>
      </div>
    </header>

    <main id="main" [class.with-player]="player.episode()">
      <router-outlet />
    </main>

    <footer class="foot" [class.with-player]="player.episode()">
      <div class="container inner">
        <p class="sign quote">Bises,<br />les fans.</p>
        <div class="foot-text">
          <p class="small">
            Site de fan non officiel et <strong>non lucratif</strong> (ni pub, ni affiliation, ni dons), fait avec amour
            pour retrouver les moments cultes du Floodcast de Florent Bernard &amp; Adrien Ménielle.
            Les épisodes sont hébergés par Acast&nbsp;; les transcriptions sont générées automatiquement
            et peuvent contenir des coquilles.
          </p>
          <div class="foot-links">
            <span class="kicker">Écouter le Floodcast</span>
            <app-listen-links [compact]="true" />
          </div>
          <p class="small">
            <a routerLink="/mentions-legales">Mentions légales</a>
            <button type="button" class="sax-btn" (click)="eggs.sax()" title="Ça envoie du sax">🎷</button>
          </p>
        </div>
      </div>
    </footer>

    <app-player-bar />
    <app-random-episode />
    <app-easter-eggs />
  `,
  styles: `
    .sax-btn {
      margin-left: 10px; background: none; border: 0; padding: 0 4px; cursor: pointer;
      font-size: 1rem; opacity: 0.35; filter: grayscale(1); transition: opacity 0.15s ease, filter 0.15s ease, transform 0.15s ease;
    }
    .sax-btn:hover, .sax-btn:focus-visible { opacity: 1; filter: none; transform: rotate(-14deg) scale(1.3); }
    .skip { position: absolute; left: -999px; top: 8px; z-index: 2000; }
    .skip:focus { left: 8px; background: var(--ink); color: var(--paper); padding: 8px 12px; }
    .top {
      position: sticky; top: 0; z-index: 800;
      /* Fond quasi opaque plutôt qu'un flou d'arrière-plan, recalculé à chaque défilement. */
      background: color-mix(in srgb, var(--paper) 95%, transparent);
      border-bottom: 2px solid var(--ink);
    }
    .inner { display: flex; align-items: center; gap: 20px; min-height: 64px; }
    .brand { text-decoration: none; margin-top: 6px; }
    nav { display: flex; gap: 6px; margin-left: auto; }
    nav a {
      font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.1em;
      font-size: 0.86rem; text-decoration: none; padding: 6px 12px; border-radius: 999px;
    }
    nav a:hover { background: var(--paper-3); }
    nav a.on { background: var(--ink); color: var(--paper); }
    .random {
      flex: none; border: 2px solid var(--can); background: var(--can); color: #fff; border-radius: 999px;
      padding: 6px 12px; cursor: pointer; font-family: var(--font-label); text-transform: uppercase;
      letter-spacing: 0.1em; font-size: 0.8rem; box-shadow: 2px 2px 0 var(--ink); transition: transform 0.12s ease;
    }
    .random:hover { transform: rotate(-3deg) scale(1.05); }
    .random:active { transform: scale(0.95); }
    .theme {
      width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--ink);
      background: transparent; cursor: pointer; font-size: 1rem;
    }
    main { min-height: 70vh; }
    .foot { margin-top: 80px; border-top: 2px solid var(--ink); padding-block: 28px 40px; }
    .foot .inner { align-items: flex-start; gap: 40px; }
    .sign { font-size: 1.8rem; line-height: 1; margin: 0; color: var(--can); flex: none; }
    .small { font-size: 0.85rem; color: var(--ink-soft); max-width: 60ch; margin: 0; }
    .foot-text { display: flex; flex-direction: column; gap: 14px; }
    .foot-links { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .with-player { padding-bottom: 84px; }
    @media (max-width: 640px) {
      .inner { gap: 10px; }
      .brand { display: none; }
      .random { padding: 6px 9px; font-size: 0; }
      .random span { font-size: 1rem; }
      nav { margin-left: 0; }
      nav a { padding: 6px 9px; font-size: 0.8rem; }
      .theme { margin-left: auto; }
      .foot .inner { flex-direction: column; gap: 14px; }
    }
  `,
})
export class App {
  readonly player = inject(PlayerService);
  readonly random = inject(RandomEpisodeService);
  readonly eggs = inject(EasterEggService);
  readonly theme = signal<Theme>(this.readTheme());
  readonly themeIcon: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' };
  readonly themeLabel: Record<Theme, string> = { auto: 'automatique', light: 'flash', dark: 'chambre noire' };

  constructor() {
    this.applyTheme(this.theme());
  }

  cycleTheme() {
    const next: Theme = this.theme() === 'auto' ? 'light' : this.theme() === 'light' ? 'dark' : 'auto';
    this.theme.set(next);
    this.applyTheme(next);
    try {
      localStorage.setItem('flood-theme', next);
    } catch {
      /* stockage indisponible : tant pis, on garde le thème pour la session */
    }
  }

  private readTheme(): Theme {
    try {
      const t = localStorage.getItem('flood-theme');
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch {
      return 'auto';
    }
  }

  private applyTheme(t: Theme) {
    const root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
  }
}
