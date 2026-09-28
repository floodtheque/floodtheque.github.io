import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, map, of, startWith } from 'rxjs';
import { ApiService } from '../core/api.service';
import { DurationPipe, fold } from '../core/format';
import { OffsiteItem, OffsiteResponse } from '../core/models';

type Who = '' | 'flo' | 'adrien' | 'both';

/**
 * "Hors Floodcast" (public) : tout ce qu'ils ont fait ailleurs. Seuls les contenus gardés
 * lors du tri apparaissent ici ; le tri se fait dans l'espace /admin.
 */
@Component({
  selector: 'app-offsite-page',
  imports: [FormsModule, DurationPipe],
  template: `
    <section class="container head">
      <p class="kicker">Ailleurs sur les ondes</p>
      <h1 class="h-display">Hors Floodcast</h1>
      <p class="lede">Les interviews, les passages chez les copains, les émissions, les lives :
        tout ce que Flo et Adrien ont raconté en dehors du salon.</p>
    </section>

    <section class="container">
      <div class="filters">
        <div class="who" role="group" aria-label="Qui">
          @for (w of whoOptions; track w.value) {
            <button type="button" class="dymo dymo--ghost" [attr.aria-pressed]="who() === w.value" (click)="who.set(w.value)">{{ w.label }}</button>
          }
        </div>
        <select class="field" [ngModel]="type()" (ngModelChange)="type.set($event)" aria-label="Type">
          <option value="">Tous les types</option>
          @for (t of presentTypes(); track t) { <option [value]="t">{{ t }}</option> }
        </select>
        <input class="field grow" type="search" placeholder="Chercher (émission, sujet, invité…)"
          aria-label="Chercher" [ngModel]="text()" (ngModelChange)="text.set($event)" />
      </div>

      @for (group of byYear(); track group.year) {
        <h2 class="year">{{ group.year }}</h2>
        <div class="grid">
          @for (item of group.items; track item.id) {
            <a class="card" [href]="item.url" target="_blank" rel="noopener noreferrer">
              <span class="frame">
                @if (item.thumbnail) { <img [src]="item.thumbnail" alt="" loading="lazy" referrerpolicy="no-referrer" /> }
                @if (item.duration) { <span class="stamp dur">{{ item.duration | duration }}</span> }
              </span>
              <span class="labels">
                <span class="type">{{ item.type }}</span>
                @if (item.people.includes('flo')) { <span class="p flo">Flo</span> }
                @if (item.people.includes('adrien')) { <span class="p adrien">Adrien</span> }
              </span>
              <span class="ctitle">{{ item.title }}</span>
              <span class="show">{{ item.show }} · {{ item.source === 'apple' ? 'podcast' : 'YouTube' }} ↗</span>
            </a>
          }
        </div>
      } @empty {
        <div class="empty">
          @if (loading()) {
            <p class="stamp">On rembobine les cassettes…</p>
          } @else if (!data().items.length) {
            <p class="quote">La collection se remplit bientôt.</p>
          } @else {
            <p class="quote">Rien ne correspond. Élargis les filtres.</p>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .head { padding-top: 36px; }
    h1 { font-size: clamp(2.6rem, 7vw, 5rem); margin: 4px 0 12px; }
    .lede { font-size: 1.15rem; max-width: 56ch; margin: 0 0 28px; }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
    .filters .field { width: auto; }
    .grow { flex: 1 1 240px; }
    .who { display: flex; gap: 6px; flex-wrap: wrap; }
    .who .dymo { border: 0; }
    .year { font-family: var(--font-display); font-weight: 900; font-size: 2.4rem; color: var(--can); margin: 36px 0 14px; line-height: 1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 26px 22px; }
    .card { display: flex; flex-direction: column; gap: 6px; text-decoration: none; }
    .frame { position: relative; display: block; aspect-ratio: 16 / 9; background: var(--flash); border: 6px solid var(--paper-2); box-shadow: var(--shadow); overflow: hidden; transition: transform 0.2s ease; }
    .card:nth-child(odd) .frame { rotate: -0.8deg; }
    .card:nth-child(even) .frame { rotate: 0.7deg; }
    .card:hover .frame { transform: rotate(0.8deg) translateY(-3px); }
    .frame img { width: 100%; height: 100%; object-fit: cover; }
    .dur { position: absolute; right: 6px; bottom: 4px; font-size: 1rem; }
    .labels { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
    .type { font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.68rem; border: 1.5px solid var(--line); border-radius: 3px; padding: 0 5px; }
    .p { font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.66rem; padding: 1px 6px; border-radius: 2px; color: #fff; }
    .p.flo { background: var(--can); }
    .p.adrien { background: var(--navy); }
    .ctitle { font-family: var(--font-display); font-weight: 800; line-height: 1.15; }
    .card:hover .ctitle { color: var(--can); }
    .show { font-size: 0.82rem; color: var(--ink-soft); }
    .empty { padding: 30px 0; }
    .empty .quote { font-size: 1.6rem; margin: 0 0 8px; }
  `,
})
export class OffsitePage {
  private readonly response = toSignal(
    inject(ApiService).offsite().pipe(
      map((r): OffsiteResponse | null => r),
      catchError(() => of<OffsiteResponse>({ types: [], items: [] })),
      startWith(null),
    ),
  );
  readonly loading = computed(() => this.response() === null);
  readonly data = computed(() => this.response() ?? { types: [], items: [] as OffsiteItem[] });

  readonly who = signal<Who>('');
  readonly type = signal('');
  readonly text = signal('');
  readonly whoOptions: { value: Who; label: string }[] = [
    { value: '', label: 'Tous' },
    { value: 'flo', label: 'Flo' },
    { value: 'adrien', label: 'Adrien' },
    { value: 'both', label: 'Les deux' },
  ];

  readonly presentTypes = computed(() => [...new Set(this.data().items.map((i) => i.type))].sort());

  private readonly filtered = computed(() => {
    const who = this.who();
    const type = this.type();
    const q = fold(this.text().trim());
    return this.data().items.filter((i) => {
      if (who === 'flo' && !i.people.includes('flo')) return false;
      if (who === 'adrien' && !i.people.includes('adrien')) return false;
      if (who === 'both' && !(i.people.includes('flo') && i.people.includes('adrien'))) return false;
      if (type && i.type !== type) return false;
      if (q && !fold(`${i.title} ${i.show ?? ''}`).includes(q)) return false;
      return true;
    });
  });

  readonly byYear = computed(() => {
    const groups = new Map<string, OffsiteItem[]>();
    for (const i of this.filtered()) {
      const y = i.date?.slice(0, 4) ?? 'Date inconnue';
      groups.set(y, [...(groups.get(y) ?? []), i]);
    }
    return [...groups].map(([year, items]) => ({ year, items }));
  });
}
