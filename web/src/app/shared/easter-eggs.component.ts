import { Component, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

interface Sax {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  spin: number;
}

/**
 * Easter eggs, pour les auditeurs :
 *  - « 14 » : chaque épisode est « le numéro 14 », comme Flo l'annonçait en intro.
 *  - « sax » : ça envoie du sax 🎷.
 * Déclenchés en tapant 14 / sax n'importe où (hors champ de saisie), depuis la recherche ou le pied de page.
 */
@Injectable({ providedIn: 'root' })
export class EasterEggService {
  readonly saxes = signal<Sax[]>([]);
  readonly quatorze = signal(0);
  readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  private seq = 0;

  private get reducedMotion() {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  sax() {
    this.say('🎷 Ça envoie du sax !');
    if (this.reducedMotion) return;
    const batch = Array.from({ length: 28 }, () => ({
      id: ++this.seq,
      left: Math.random() * 96,
      delay: Math.random() * 1.4,
      duration: 2.6 + Math.random() * 1.8,
      size: 1.6 + Math.random() * 2.2,
      spin: Math.round(Math.random() * 720 - 360),
    }));
    this.saxes.update((s) => [...s, ...batch]);
    setTimeout(() => this.saxes.update((s) => s.filter((x) => !batch.includes(x))), 5000);
  }

  numero14() {
    this.say('Il s’agit du numéro 14. Comme d’hab.');
    if (!this.reducedMotion) this.quatorze.update((n) => n + 1);
  }

  private say(text: string) {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3200);
  }
}

@Component({
  selector: 'app-easter-eggs',
  template: `
    @for (s of eggs.saxes(); track s.id) {
      <span class="sax" aria-hidden="true"
        [style.left.%]="s.left" [style.font-size.rem]="s.size"
        [style.animation-delay.s]="s.delay" [style.animation-duration.s]="s.duration"
        [style.--spin]="s.spin + 'deg'">🎷</span>
    }
    @if (eggs.quatorze(); as n) {
      @for (k of [n]; track k) {
        <div class="n14" aria-hidden="true"><span class="stamp">N°14</span></div>
      }
    }
    <p class="toast" role="status" aria-live="polite" [class.on]="eggs.toast()">{{ eggs.toast() }}</p>
  `,
  styles: `
    .sax {
      position: fixed; top: -3rem; z-index: 1300; pointer-events: none; line-height: 1;
      animation: fall linear both;
    }
    @keyframes fall {
      to { transform: translateY(calc(100vh + 6rem)) rotate(var(--spin, 180deg)); }
    }
    .n14 {
      position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; pointer-events: none;
    }
    .n14 .stamp {
      font-size: clamp(5rem, 22vw, 14rem); line-height: 1; padding: 0.05em 0.25em;
      border: 0.06em solid currentColor; border-radius: 0.08em;
      animation: slam 2.4s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
    }
    @keyframes slam {
      0%   { transform: scale(2.6) rotate(-4deg); opacity: 0; }
      14%  { transform: scale(1) rotate(-8deg); opacity: 0.95; }
      80%  { transform: scale(1) rotate(-8deg); opacity: 0.95; }
      100% { transform: scale(1.02) rotate(-8deg); opacity: 0; }
    }
    .toast {
      position: fixed; left: 50%; bottom: 96px; z-index: 1310; margin: 0;
      translate: -50% 20px; opacity: 0; pointer-events: none;
      background: var(--ink); color: var(--paper); padding: 10px 18px;
      font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.08em;
      box-shadow: 4px 4px 0 var(--can); transition: opacity 0.2s ease, translate 0.2s ease;
    }
    .toast.on { opacity: 1; translate: -50% 0; }
  `,
})
export class EasterEggsComponent {
  readonly eggs = inject(EasterEggService);

  constructor() {
    const doc = inject(DOCUMENT);
    let buffer = '';
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-8);
      if (buffer.endsWith('sax')) { this.eggs.sax(); buffer = ''; }
      else if (buffer.endsWith('14')) { this.eggs.numero14(); buffer = ''; }
    };
    doc.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('keydown', onKey));

    // Pour les curieux qui ouvrent la console.
    console.log('%c🎷 Ça envoie du sax. %cIl s’agit du numéro 14.', 'font: 700 16px sans-serif; color: #C81E2B', 'font: 16px monospace; color: #FF6A13');
  }
}
