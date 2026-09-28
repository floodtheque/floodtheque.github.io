import { Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

/**
 * Logo "qui coule" : texte passé dans un filtre SVG gooey + turbulence,
 * avec quelques gouttes animées qui fusionnent avec les lettres.
 * Création originale, clin d'œil à l'esprit liquide de l'univers Floodcast.
 */
@Component({
  selector: 'app-wordmark',
  template: `
    <svg class="defs" aria-hidden="true" width="0" height="0">
      <filter id="flood-goo" x="-10%" y="-20%" width="120%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.04" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" result="wobble" />
        <feGaussianBlur in="wobble" stdDeviation="3.2" result="blur" />
        <feColorMatrix in="blur" mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" />
      </filter>
      <!-- Le flou est en pixels absolus : il faut une version plus légère en petite taille. -->
      <filter id="flood-goo-sm" x="-10%" y="-20%" width="120%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05 0.09" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" result="wobble" />
        <feGaussianBlur in="wobble" stdDeviation="1" result="blur" />
        <feColorMatrix in="blur" mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
      </filter>
    </svg>
    <span class="mark" [class.paused]="!visible()" [class.mark--small]="size() === 'small'" role="img" [attr.aria-label]="text()">
      <span class="letters" aria-hidden="true">{{ text() }}</span>
      <span class="drip d1" aria-hidden="true"></span>
      <span class="drip d2" aria-hidden="true"></span>
      <span class="drip d3" aria-hidden="true"></span>
    </span>
  `,
  styles: `
    :host { display: inline-block; line-height: 1; }
    .defs { position: absolute; }
    .mark {
      position: relative;
      display: inline-block;
      filter: url(#flood-goo);
      color: var(--wordmark-color, var(--ink));
      font-family: var(--font-display);
      font-weight: 800;
      font-size: var(--wordmark-size, clamp(3.4rem, 12vw, 9rem));
      letter-spacing: -0.035em;
      padding: 0.08em 0.14em 0.3em;
    }
    .mark--small { font-size: 1.9rem; padding: 0.06em 0.1em 0.18em; filter: url(#flood-goo-sm); letter-spacing: -0.02em; }
    .letters { position: relative; z-index: 1; }
    .drip {
      position: absolute;
      top: 62%;
      width: 0.09em;
      height: 0.09em;
      border-radius: 50%;
      background: currentColor;
      animation: drip 4.8s cubic-bezier(0.55, 0, 0.75, 0.3) infinite;
    }
    .d1 { left: 19%; animation-delay: 0.4s; }
    .d2 { left: 55%; animation-delay: 2.1s; width: 0.07em; height: 0.07em; }
    .d3 { left: 83%; animation-delay: 3.3s; }
    .mark--small .drip { display: none; }
    /* Le filtre SVG est recalculé à chaque image tant que les gouttes bougent : hors écran, on fige. */
    .paused .drip { animation-play-state: paused; }
    @keyframes drip {
      0%   { transform: translateY(0) scale(1, 1); opacity: 1; }
      55%  { transform: translateY(0.12em) scale(0.9, 1.5); opacity: 1; }
      80%  { transform: translateY(0.34em) scale(0.8, 1.1); opacity: 1; }
      100% { transform: translateY(0.5em) scale(0.3); opacity: 0; }
    }
  `,
})
export class WordmarkComponent {
  readonly text = input('floodthèque');
  readonly size = input<'big' | 'small'>('big');
  protected readonly visible = signal(true);

  constructor() {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => this.visible.set(e.isIntersecting));
    io.observe(inject(ElementRef).nativeElement);
    inject(DestroyRef).onDestroy(() => io.disconnect());
  }
}
