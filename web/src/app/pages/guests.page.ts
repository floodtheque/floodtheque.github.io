import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { fold } from '../core/format';
import { Guest } from '../core/models';

@Component({
  selector: 'app-guests-page',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="container head">
      <p class="kicker">Qui est passé s'asseoir dans le salon</p>
      <h1 class="h-display">Les invités</h1>
      <div class="toolbar">
        <input class="field" type="search" placeholder="Chercher un invité…" aria-label="Chercher un invité"
          [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
        <div class="sort" role="group" aria-label="Trier">
          <button type="button" class="dymo dymo--ghost" [attr.aria-pressed]="sort() === 'count'" (click)="sort.set('count')">Les plus présents</button>
          <button type="button" class="dymo dymo--ghost" [attr.aria-pressed]="sort() === 'alpha'" (click)="sort.set('alpha')">A → Z</button>
        </div>
      </div>
    </section>

    <section class="container">
      @if (sort() === 'alpha') {
        @for (group of byLetter(); track group.letter) {
          <div class="letter-group">
            <h2 class="letter">{{ group.letter }}</h2>
            <div class="wall">
              @for (g of group.guests; track g.slug) {
                <a class="dymo" [routerLink]="['/invites', g.slug]">{{ g.name }} <span class="n">×{{ g.episodes }}</span></a>
              }
            </div>
          </div>
        }
      } @else {
        <ol class="ranking">
          @for (g of filtered(); track g.slug; let i = $index) {
            <li>
              <a [routerLink]="['/invites', g.slug]">
                <span class="rank stamp">{{ i + 1 }}</span>
                <span class="name">{{ g.name }}</span>
                <span class="bar" [style.width.%]="(g.episodes / max()) * 100"></span>
                <span class="n">{{ g.episodes }} ép.</span>
                <span class="years">{{ year(g.first_date) }}@if (year(g.first_date) !== year(g.last_date)) {–{{ year(g.last_date) }}}</span>
              </a>
            </li>
          }
        </ol>
      }
      @if (!filtered().length) {
        <p class="quote empty">Jamais venu. Peut-être la prochaine fois (ah non, c'est fini).</p>
      }
    </section>
  `,
  styles: `
    .head { padding-top: 36px; }
    h1 { font-size: clamp(2.6rem, 7vw, 5rem); margin: 4px 0 24px; }
    .toolbar { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 30px; }
    .toolbar .field { max-width: 360px; }
    .sort { display: flex; gap: 8px; }
    .sort .dymo { border: 0; }
    .ranking { list-style: none; margin: 0; padding: 0; columns: 2 420px; column-gap: 40px; }
    .ranking li { break-inside: avoid; }
    .ranking a {
      display: grid; grid-template-columns: 44px 1fr auto auto; align-items: center; gap: 4px 12px;
      padding: 8px 4px; text-decoration: none; border-bottom: 1px dashed var(--line);
    }
    .ranking a:hover .name { color: var(--can); }
    .rank { font-size: 1.5rem; text-align: right; }
    .name { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; }
    .bar { grid-column: 2; grid-row: 2; height: 5px; background: var(--can); border-radius: 3px; min-width: 6px; }
    .n { font-family: var(--font-label); letter-spacing: 0.06em; font-size: 0.85rem; }
    .years { font-family: var(--font-stamp); color: var(--ink-soft); font-size: 1rem; }
    .letter-group { display: grid; grid-template-columns: 60px 1fr; gap: 16px; margin-bottom: 18px; }
    .letter { font-family: var(--font-display); font-weight: 900; font-size: 2.4rem; margin: 0; line-height: 1; color: var(--can); }
    .wall { display: flex; flex-wrap: wrap; gap: 8px; }
    .wall .n { opacity: 0.6; }
    .empty { font-size: 1.4rem; }
  `,
})
export class GuestsPage {
  private readonly api = inject(ApiService);
  readonly guests = toSignal(this.api.guests$, { initialValue: [] as Guest[] });
  readonly filter = signal('');
  readonly sort = signal<'count' | 'alpha'>('count');

  readonly filtered = computed(() => {
    const f = fold(this.filter().trim());
    return f ? this.guests().filter((g) => fold(g.name).includes(f)) : this.guests();
  });
  readonly max = computed(() => Math.max(1, ...this.guests().map((g) => g.episodes)));

  readonly byLetter = computed(() => {
    const groups = new Map<string, Guest[]>();
    for (const g of [...this.filtered()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      const letter = fold(g.name)[0]?.toUpperCase() ?? '#';
      groups.set(letter, [...(groups.get(letter) ?? []), g]);
    }
    return [...groups].map(([letter, guests]) => ({ letter, guests }));
  });

  year(iso: string) {
    return new Date(iso).getFullYear();
  }
}
