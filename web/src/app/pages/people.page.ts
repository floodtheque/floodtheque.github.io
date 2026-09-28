import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';
import { Person } from '../core/models';

/** "Flo & Adrien" : où les suivre, ce qu'ils ont fait à côté du Floodcast. */
@Component({
  selector: 'app-people-page',
  template: `
    <section class="container head">
      <p class="kicker">Les deux au micro</p>
      <h1 class="h-display">Flo &amp; Adrien</h1>
      <p class="lede">Le Floodcast est fini, mais eux continuent. Où les suivre, et tout ce qu'ils ont fait à côté.</p>
    </section>

    <section class="container duo">
      @for (p of people(); track p.slug; let i = $index) {
        <article class="card" [class.alt]="i % 2 === 1">
          <span class="tape" aria-hidden="true"></span>
          <header>
            <h2 class="name">{{ p.name }}</h2>
            @if (p.nickname) { <span class="stamp nick">aka {{ p.nickname }}</span> }
            <p class="tagline quote">{{ p.tagline }}</p>
          </header>

          <h3 class="kicker">Le suivre</h3>
          <ul class="socials">
            @for (s of p.socials; track s.url) {
              <li>
                <a class="dymo" [class.dymo--red]="$first" [href]="s.url" target="_blank" rel="noopener">
                  {{ s.label }} ↗
                </a>
                @if (s.handle) { <span class="handle">{{ s.handle }}</span> }
              </li>
            }
          </ul>

          <h3 class="kicker">Ses projets</h3>
          <ol class="timeline">
            @for (pr of p.projects; track pr.title + pr.year) {
              <li>
                <span class="year stamp">{{ pr.year ?? '…' }}</span>
                <div>
                  <span class="title">{{ pr.title }}</span>
                  <span class="type">{{ pr.type }}</span>
                  @if (pr.status) { <span class="status">{{ pr.status }}</span> }
                  @if (pr.role || pr.note) {
                    <p class="detail">{{ pr.role }}@if (pr.role && pr.note) { · }{{ pr.note }}</p>
                  }
                </div>
              </li>
            }
          </ol>

          <p class="sources">
            Sources :
            @for (src of p.sources; track src; let last = $last) {
              <a [href]="src" target="_blank" rel="noopener">{{ host(src) }}</a>@if (!last) {, }
            }
          </p>
        </article>
      }
    </section>

    <section class="container">
      <p class="note">
        Liens vérifiés sur leurs pages officielles. Une info manque ou a changé ?
        Tout est dans <code>data/people.json</code>.
      </p>
    </section>
  `,
  styles: `
    .head { padding-top: 36px; }
    h1 { font-size: clamp(2.6rem, 7vw, 5rem); margin: 4px 0 12px; }
    .lede { font-size: 1.15rem; max-width: 52ch; margin: 0 0 36px; }
    .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 40px; align-items: start; }
    .card {
      position: relative; background: var(--paper-2); padding: 28px 26px 22px;
      box-shadow: var(--shadow); border-top: 6px solid var(--can); rotate: -0.6deg;
    }
    .card.alt { border-top-color: var(--navy); rotate: 0.6deg; }
    .tape { top: -14px; right: 30px; rotate: 6deg; }
    .name { font-family: var(--font-display); font-weight: 900; font-size: 2.2rem; line-height: 1; margin: 0; letter-spacing: -0.02em; }
    .nick { display: inline-block; margin-top: 6px; }
    .tagline { font-size: 1.15rem; margin: 8px 0 22px; color: var(--ink-soft); }
    h3.kicker { margin: 22px 0 10px; font-weight: 500; }
    .socials { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .socials li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .handle { font-size: 0.85rem; color: var(--ink-soft); }
    .timeline { list-style: none; padding: 0; margin: 0; border-left: 2px dashed var(--line); }
    .timeline li { display: grid; grid-template-columns: 58px 1fr; gap: 8px; padding: 6px 0 6px 12px; }
    .year { font-size: 1.15rem; }
    .title { font-weight: 700; margin-right: 8px; }
    .type, .status {
      font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.68rem;
      border: 1.5px solid var(--line); border-radius: 3px; padding: 0 5px; margin-right: 4px; white-space: nowrap;
    }
    .status { border-color: var(--stamp); color: var(--stamp); }
    .detail { margin: 2px 0 0; font-size: 0.85rem; color: var(--ink-soft); }
    .sources { margin: 20px 0 0; font-size: 0.78rem; color: var(--ink-soft); }
    .note { margin-top: 30px; font-size: 0.88rem; color: var(--ink-soft); }
    @media (max-width: 420px) { .duo { grid-template-columns: 1fr; } .card { padding: 22px 16px; } }
  `,
})
export class PeoplePage {
  readonly people = toSignal(inject(ApiService).people$, { initialValue: [] as Person[] });

  host(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
}
