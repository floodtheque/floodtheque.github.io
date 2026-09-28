import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

const PLACEHOLDERS = [
  'le mec qui a une nuque longue…',
  'un chauffeur Uber compliqué',
  'les règles du Monopoly',
  'la soupe Royco',
  'Pierre Bachelet',
  'un Mickey menaçant',
  'le docteur Guigui',
];

@Component({
  selector: 'app-search-box',
  imports: [FormsModule],
  template: `
    <form class="box" [class.box--big]="big()" role="search" (ngSubmit)="submit()">
      <label class="visually-hidden" for="q-{{ uid }}">Phrase ou sujet dont tu te souviens</label>
      <span class="quote-mark" aria-hidden="true">“</span>
      <input id="q-{{ uid }}" name="q" type="search" autocomplete="off" enterkeyhint="search"
        [(ngModel)]="value" [placeholder]="placeholder()" />
      <button class="btn btn--red" type="submit">Retrouve-le</button>
    </form>
  `,
  styles: `
    .box {
      display: flex; align-items: center; gap: 10px;
      background: var(--paper-2);
      border: 2.5px solid var(--ink);
      border-radius: 14px;
      padding: 6px 6px 6px 14px;
      box-shadow: 6px 6px 0 var(--ink);
      transition: box-shadow 0.15s ease, transform 0.15s ease;
    }
    .box:focus-within { box-shadow: 8px 8px 0 var(--can); transform: translate(-2px, -2px); }
    .quote-mark {
      font-family: var(--font-quote); font-size: 2.6rem; line-height: 0.6; color: var(--can);
      translate: 0 8px;
    }
    input {
      flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
      font-family: var(--font-quote); font-style: italic; font-size: 1.25rem; padding: 10px 0;
    }
    input::placeholder { color: var(--ink-soft); opacity: 0.7; }
    .box--big { padding: 10px 10px 10px 20px; border-radius: 18px; }
    .box--big input { font-size: clamp(1.25rem, 2.6vw, 1.7rem); }
    .box--big .quote-mark { font-size: 3.6rem; }
    button { flex: none; }
    @media (max-width: 520px) {
      .box { flex-wrap: wrap; padding: 8px; }
      .quote-mark { display: none; }
      input { flex-basis: 100%; padding: 8px 6px; }
      button { width: 100%; }
    }
  `,
})
export class SearchBoxComponent {
  private static seq = 0;
  private readonly router = inject(Router);
  readonly uid = ++SearchBoxComponent.seq;

  readonly initial = input('');
  readonly big = input(false);
  /** Paramètres à conserver dans l'URL (filtre invité, saison…). */
  readonly extraParams = input<Record<string, string | number | null>>({});

  value = '';
  readonly placeholder = signal(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);

  constructor() {
    effect(() => (this.value = this.initial()));
  }

  submit() {
    const q = this.value.trim();
    if (!q) return;
    void this.router.navigate(['/recherche'], { queryParams: { ...this.extraParams(), q } });
  }
}
