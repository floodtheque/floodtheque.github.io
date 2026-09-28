import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListenLinksComponent } from '../shared/listen-links.component';

@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, ListenLinksComponent],
  template: `
    <article class="container legal">
      <p class="kicker">Les trucs sérieux (promis c'est court)</p>
      <h1 class="h-display">Mentions légales</h1>

      <div class="notice">
        <p class="quote">Site de fan, gratuit, sans pub, et je ne gagne pas un centime avec.</p>
      </div>

      <section>
        <h2>Un site de fan, non officiel</h2>
        <p>
          La Floodthèque est un projet personnel et bénévole, réalisé par un auditeur du Floodcast.
          Elle n'est ni affiliée, ni validée, ni sponsorisée par Florent Bernard, Adrien Ménielle,
          leurs invités, Acast ou une quelconque plateforme d'écoute.
        </p>
      </section>

      <section>
        <h2>Aucune activité commerciale</h2>
        <p>Ce site est <strong>non lucratif</strong> : l'éditeur n'en tire aucun revenu, direct ou indirect.</p>
        <ul>
          <li>pas de publicité, pas de lien affilié, pas de partenariat ;</li>
          <li>pas d'abonnement, pas de dons, pas de contenu payant ;</li>
          <li>pas de revente ni d'exploitation des données des visiteurs.</li>
        </ul>
        <p>
          Les publicités que tu peux entendre pendant la lecture sont insérées par l'hébergeur du podcast
          (Acast) dans le flux audio officiel. Elles ne rapportent rien à ce site.
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Le Floodcast, son nom, ses pochettes, ses épisodes et leur contenu appartiennent à leurs auteurs
          et ayants droit. Ce site n'héberge aucun fichier audio : la lecture se fait directement depuis le
          flux public d'Acast, et chaque épisode renvoie vers les plateformes officielles.
        </p>
        <p>
          Les transcriptions sont générées automatiquement (reconnaissance vocale) dans le seul but de
          permettre la recherche d'un passage et d'aider à retrouver l'épisode, pour l'écouter sur les
          plateformes officielles. Elles peuvent contenir des erreurs et ne remplacent pas l'écoute.
        </p>
        <p>
          <strong>Retrait sur simple demande :</strong> si tu es auteur, invité ou ayant droit et qu'un contenu
          te dérange (transcription, pochette, nom…), écris à l'adresse ci-dessous : il sera retiré rapidement,
          sans discussion.
        </p>
      </section>

      <section>
        <h2>Écouter le Floodcast pour de vrai</h2>
        <p>Le meilleur moyen de soutenir l'émission, c'est de l'écouter là où elle est diffusée :</p>
        <app-listen-links />
      </section>

      <section>
        <h2>Données personnelles et cookies</h2>
        <ul>
          <li>Aucun compte, aucun formulaire, aucun cookie publicitaire, aucun outil de mesure d'audience.</li>
          <li>Seule préférence stockée dans ton navigateur : le thème clair/sombre (stockage local, jamais transmis).</li>
          <li>
            Les recherches sont faites directement dans ton navigateur : ce que tu tapes n'est envoyé nulle part.
          </li>
          <li>Les polices d'écriture sont hébergées sur ce site : aucun appel à Google Fonts.</li>
          <li>
            Le site est hébergé par GitHub Pages, qui reçoit ton adresse IP pour servir les pages
            (journaux techniques, selon la politique de confidentialité de GitHub).
          </li>
          <li>
            Services tiers chargés par les pages : Acast (audio et pochettes des épisodes), YouTube et Apple
            (miniatures de la page « Hors Floodcast »). Ces services reçoivent ton adresse IP lors du chargement,
            selon leurs propres politiques de confidentialité.
          </li>
        </ul>
      </section>

      <section>
        <h2>Éditeur et hébergement</h2>
        <dl>
          <dt>Éditeur</dt>
          <dd>Saltyman (personne physique, à titre non professionnel)</dd>
          <dt>Contact</dt>
          <dd><a href="mailto:saltymanfr@gmail.com">saltymanfr&#64;gmail.com</a></dd>
          <dt>Directeur de la publication</dt>
          <dd>Saltyman</dd>
          <dt>Hébergeur</dt>
          <dd>GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis</dd>
        </dl>
        <p class="small">
          Conformément à l'article 6, III, 2 de la loi n° 2004-575 du 21 juin 2004 (LCEN), un éditeur non
          professionnel peut conserver l'anonymat à condition d'avoir communiqué son identité à son hébergeur.
        </p>
      </section>

      <p><a class="btn btn--ghost" routerLink="/">← Retour à l'accueil</a></p>
    </article>
  `,
  styles: `
    .legal { max-width: 820px; padding-top: 36px; }
    h1 { font-size: clamp(2.4rem, 6vw, 4rem); margin: 4px 0 24px; }
    .notice { border: 2.5px solid var(--ink); background: var(--paper-2); padding: 18px 22px; box-shadow: 6px 6px 0 var(--can); rotate: -0.6deg; margin-bottom: 36px; }
    .notice .quote { font-size: clamp(1.3rem, 3vw, 1.7rem); margin: 0; line-height: 1.25; }
    section { margin-bottom: 30px; }
    h2 { font-family: var(--font-display); font-weight: 800; font-size: 1.35rem; margin: 0 0 8px; }
    p, li { line-height: 1.6; }
    ul { padding-left: 1.2em; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; }
    dt { font-family: var(--font-label); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem; padding-top: 3px; }
    dd { margin: 0; color: var(--can); }
    .small { font-size: 0.85rem; color: var(--ink-soft); }
    @media (max-width: 560px) { dl { grid-template-columns: 1fr; } dd { margin-bottom: 8px; } }
  `,
})
export class LegalPage {}
