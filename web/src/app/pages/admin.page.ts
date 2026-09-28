import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { DurationPipe } from '../core/format';
import { AdminOffsiteResponse, OffsiteItem, OffsiteStatus } from '../core/models';

/**
 * Espace administrateur : connexion par mot de passe (session serveur, cookie HttpOnly),
 * puis tri des contenus "Hors Floodcast" : à trier / gardés / écartés.
 */
@Component({
  selector: 'app-admin-page',
  imports: [FormsModule, DurationPipe],
  template: `
    <section class="container head">
      <p class="kicker">Coulisses</p>
      <h1 class="h-display">Administration</h1>
    </section>

    <section class="container">
      @switch (state()) {
        @case ('loading') { <p class="stamp">Vérification de la session…</p> }

        @case ('disabled') {
          <div class="box">
            <p class="quote big">L'administration est désactivée.</p>
            <p>Aucun mot de passe n'est configuré sur le serveur. Pour l'activer :</p>
            <pre>npm run admin:password</pre>
            <p>puis redémarre le serveur.</p>
          </div>
        }

        @case ('login') {
          <form class="box login" (ngSubmit)="login()">
            <label for="pw" class="kicker">Mot de passe</label>
            <input id="pw" name="pw" class="field" type="password" autocomplete="current-password"
              [(ngModel)]="password" required />
            @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
            <button class="btn btn--red" type="submit" [disabled]="busy()">Entrer</button>
          </form>
        }

        @case ('admin') {
          <div class="bar">
            <div class="tabs" role="tablist" aria-label="Contenus Hors Floodcast">
              @for (t of tabs; track t.status) {
                <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === t.status" (click)="setTab(t.status)">
                  {{ t.label }} <span class="n" [class.hot]="t.status === 'pending'">{{ count(t.status) }}</span>
                </button>
              }
            </div>
            <button type="button" class="btn btn--ghost" (click)="logout()">Se déconnecter</button>
          </div>

          @if (tab() === 'pending') {
            <p class="help">
              Garde ce qui parle vraiment d'eux, écarte le reste (critiques de tiers, homonymes, reuploads…).
              Raccourcis sur la première carte : <kbd>G</kbd> garder · <kbd>X</kbd> écarter · <kbd>U</kbd> annuler.
              Pour chercher du nouveau : <code>npm run offsite</code>.
            </p>
          }
          @if (lastAction(); as last) {
            <p class="undo">
              « {{ last.item.title }} » → {{ statusLabel[last.status] }}.
              <button type="button" class="dymo dymo--ghost" (click)="undo()">↺ Annuler</button>
            </p>
          }

          <ol class="triage">
            @for (item of visible(); track item.id; let first = $first) {
              <li class="tcard" [class.first]="first && tab() === 'pending'">
                <a class="thumb" [href]="item.url" target="_blank" rel="noopener noreferrer">
                  @if (item.thumbnail) { <img [src]="item.thumbnail" alt="" loading="lazy" referrerpolicy="no-referrer" /> }
                  <span class="src">{{ item.source === 'apple' ? 'Podcast' : 'YouTube' }}</span>
                </a>
                <div class="tbody">
                  <p class="meta">
                    <span class="stamp">{{ item.date ?? '????' }}</span>
                    @if (item.show) { · {{ item.show }} }
                    @if (item.duration) { · {{ item.duration | duration }} }
                  </p>
                  <a class="title" [href]="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
                  @if (item.excerpt) { <p class="excerpt">{{ item.excerpt }}</p> }
                  <div class="edit">
                    <select class="field small" [ngModel]="item.type" (ngModelChange)="patch(item, { type: $event })" aria-label="Type">
                      @for (t of data().types; track t) { <option [value]="t">{{ t }}</option> }
                    </select>
                    <button type="button" class="dymo" [class.dymo--red]="item.people.includes('flo')"
                      [attr.aria-pressed]="item.people.includes('flo')" (click)="togglePerson(item, 'flo')">Flo</button>
                    <button type="button" class="dymo" [class.dymo--navy]="item.people.includes('adrien')"
                      [attr.aria-pressed]="item.people.includes('adrien')" (click)="togglePerson(item, 'adrien')">Adrien</button>
                  </div>
                </div>
                <div class="decide">
                  @if (tab() !== 'kept') { <button type="button" class="btn btn--red" (click)="decide(item, 'kept')">✓ Garder</button> }
                  @if (tab() !== 'rejected') { <button type="button" class="btn btn--ghost" (click)="decide(item, 'rejected')">✕ Écarter</button> }
                  @if (tab() !== 'pending') { <button type="button" class="btn btn--ghost" (click)="decide(item, 'pending')">↺ À trier</button> }
                </div>
              </li>
            } @empty {
              <li class="empty quote">{{ tab() === 'pending' ? 'Tout est trié. Chapeau.' : 'Rien ici.' }}</li>
            }
          </ol>
        }
      }
    </section>
  `,
  styles: `
    .head { padding-top: 36px; }
    h1 { font-size: clamp(2.4rem, 6vw, 4rem); margin: 4px 0 24px; }
    .box { max-width: 460px; padding: 24px; background: var(--paper-2); box-shadow: var(--shadow); border-top: 6px solid var(--can); }
    .big { font-size: 1.5rem; margin: 0 0 10px; }
    pre { background: var(--ink); color: var(--paper); padding: 10px 14px; border-radius: 4px; }
    .login { display: flex; flex-direction: column; gap: 12px; }
    .err { color: var(--can); margin: 0; }
    .bar { display: flex; justify-content: space-between; align-items: end; gap: 12px; flex-wrap: wrap; border-bottom: 2px solid var(--ink); margin-bottom: 18px; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .tab {
      border: 2px solid var(--ink); border-bottom: 0; background: var(--paper-3); padding: 8px 16px;
      border-radius: 8px 8px 0 0; cursor: pointer; font-family: var(--font-display); font-weight: 800; translate: 0 2px;
    }
    .tab[aria-selected='true'] { background: var(--paper); }
    .bar .btn { margin-bottom: 8px; }
    .n { font-family: var(--font-stamp); font-weight: 400; font-size: 1.15rem; margin-left: 4px; }
    .n.hot { color: var(--stamp); }
    .help { color: var(--ink-soft); font-size: 0.92rem; }
    kbd { font-family: var(--font-stamp); border: 1.5px solid var(--ink); border-radius: 3px; padding: 0 4px; font-size: 1rem; }
    .undo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 0.9rem; }
    .undo .dymo { border: 0; }
    .triage { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
    .tcard { display: grid; grid-template-columns: 200px 1fr auto; gap: 18px; align-items: center; padding: 14px; background: var(--paper-2); box-shadow: var(--shadow); }
    .tcard.first { outline: 3px solid var(--stamp); }
    .thumb { position: relative; display: block; aspect-ratio: 16 / 9; background: var(--flash); overflow: hidden; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .src { position: absolute; left: 4px; top: 4px; background: var(--ink); color: var(--paper); font-family: var(--font-label); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 1px 5px; }
    .meta { margin: 0; font-size: 0.85rem; color: var(--ink-soft); }
    .meta .stamp { font-size: 1.05rem; }
    .title { font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; text-decoration: none; line-height: 1.15; }
    .title:hover { color: var(--can); }
    .excerpt { margin: 6px 0 0; font-size: 0.85rem; color: var(--ink-soft); }
    .edit { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
    .edit .dymo { border: 0; }
    .edit .dymo[aria-pressed='false'] { --tape: var(--paper-3); --tape-ink: var(--ink-soft); text-shadow: none; }
    .field.small { width: auto; padding: 0.3em 0.6em; font-size: 0.85rem; }
    .decide { display: flex; flex-direction: column; gap: 8px; }
    .empty { font-size: 1.4rem; padding: 20px 0; }
    @media (max-width: 760px) {
      .tcard { grid-template-columns: 1fr; }
      .decide { flex-direction: row; flex-wrap: wrap; }
    }
  `,
})
export class AdminPage {
  private readonly api = inject(ApiService);

  readonly tabs: { status: OffsiteStatus; label: string }[] = [
    { status: 'pending', label: 'À trier' },
    { status: 'kept', label: 'Gardés' },
    { status: 'rejected', label: 'Écartés' },
  ];
  readonly statusLabel: Record<OffsiteStatus, string> = { pending: 'remis à trier', kept: 'gardé', rejected: 'écarté' };

  password = '';
  readonly busy = signal(false);
  readonly error = signal('');

  // --- Session ---
  private readonly meRefresh = signal(0);
  private readonly me = toSignal(
    toObservable(this.meRefresh).pipe(
      switchMap(() => this.api.adminMe().pipe(catchError(() => of({ enabled: false, admin: false })), startWith(null))),
    ),
  );
  readonly state = computed(() => {
    const me = this.me();
    if (!me) return 'loading';
    if (!me.enabled) return 'disabled';
    return me.admin ? 'admin' : 'login';
  });

  // --- Contenus ---
  readonly tab = signal<OffsiteStatus>('pending');
  private readonly reload = signal(0);
  private readonly response = toSignal(
    toObservable(computed(() => ({ tab: this.tab(), n: this.reload(), admin: this.state() === 'admin' }))).pipe(
      switchMap(({ tab, admin }) =>
        admin ? this.api.adminOffsite(tab).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
  );
  readonly data = computed<AdminOffsiteResponse>(
    () => this.response() ?? { types: [], items: [], counts: { pending: 0, kept: 0, rejected: 0 } },
  );

  /** Décisions prises dans l'onglet courant (les cartes disparaissent sans recharger). */
  private readonly moved = signal(new Map<string, OffsiteStatus>());
  readonly visible = computed(() => this.data().items.filter((i) => !this.moved().has(i.id)));
  readonly lastAction = signal<{ item: OffsiteItem; status: OffsiteStatus; from: OffsiteStatus } | null>(null);

  count(status: OffsiteStatus) {
    let n = this.data().counts[status] ?? 0;
    for (const [, to] of this.moved()) if (to === status) n++;
    if (status === this.tab()) n -= this.moved().size;
    return Math.max(0, n);
  }

  login() {
    this.busy.set(true);
    this.error.set('');
    this.api.adminLogin(this.password).subscribe({
      next: () => {
        this.password = '';
        this.busy.set(false);
        this.meRefresh.update((n) => n + 1);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.error ?? 'Connexion impossible.');
      },
    });
  }

  logout() {
    this.api.adminLogout().subscribe(() => this.meRefresh.update((n) => n + 1));
  }

  setTab(status: OffsiteStatus) {
    this.moved.set(new Map());
    this.lastAction.set(null);
    this.tab.set(status);
    this.reload.update((n) => n + 1);
  }

  decide(item: OffsiteItem, status: OffsiteStatus) {
    const from = this.tab();
    this.moved.update((m) => new Map(m).set(item.id, status));
    this.lastAction.set({ item, status, from });
    this.api.adminUpdateOffsite(item.id, { status }).subscribe({
      error: () => this.moved.update((m) => { const n = new Map(m); n.delete(item.id); return n; }),
    });
  }

  undo() {
    const last = this.lastAction();
    if (!last) return;
    this.moved.update((m) => { const n = new Map(m); n.delete(last.item.id); return n; });
    this.lastAction.set(null);
    this.api.adminUpdateOffsite(last.item.id, { status: last.from }).subscribe();
  }

  patch(item: OffsiteItem, patch: Partial<Pick<OffsiteItem, 'type' | 'people'>>) {
    Object.assign(item, patch);
    this.api.adminUpdateOffsite(item.id, patch).subscribe();
  }

  togglePerson(item: OffsiteItem, who: 'flo' | 'adrien') {
    const people = item.people.includes(who) ? item.people.filter((p) => p !== who) : [...item.people, who];
    this.patch(item, { people });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (this.state() !== 'admin' || this.tab() !== 'pending' || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    const first = this.visible()[0];
    const key = e.key.toLowerCase();
    if (key === 'g' && first) this.decide(first, 'kept');
    else if (key === 'x' && first) this.decide(first, 'rejected');
    else if (key === 'u') this.undo();
    else return;
    e.preventDefault();
  }
}
