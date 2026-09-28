import { Routes } from '@angular/router';
import { STATIC_SITE } from './core/environment';

export const routes: Routes = [
  { path: '', title: 'Floodthèque', loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  { path: 'recherche', title: 'Recherche — Floodthèque', loadComponent: () => import('./pages/search.page').then((m) => m.SearchPage) },
  { path: 'episodes', title: 'Épisodes — Floodthèque', loadComponent: () => import('./pages/episodes.page').then((m) => m.EpisodesPage) },
  { path: 'episodes/:slug', title: 'Épisode — Floodthèque', loadComponent: () => import('./pages/episode.page').then((m) => m.EpisodePage) },
  { path: 'invites', title: 'Invités — Floodthèque', loadComponent: () => import('./pages/guests.page').then((m) => m.GuestsPage) },
  { path: 'invites/:slug', title: 'Invité — Floodthèque', loadComponent: () => import('./pages/guest.page').then((m) => m.GuestPage) },
  { path: 'flo-et-adrien', title: 'Flo & Adrien — Floodthèque', loadComponent: () => import('./pages/people.page').then((m) => m.PeoplePage) },
  { path: 'hors-floodcast', title: 'Hors Floodcast — Floodthèque', loadComponent: () => import('./pages/offsite.page').then((m) => m.OffsitePage) },
  // Pas d'administration sur la version statique (GitHub Pages) : le tri se fait en local.
  ...(STATIC_SITE ? [] : [{ path: 'admin', title: 'Administration — Floodthèque', loadComponent: () => import('./pages/admin.page').then((m) => m.AdminPage) }]),
  { path: 'mentions-legales', title: 'Mentions légales — Floodthèque', loadComponent: () => import('./pages/legal.page').then((m) => m.LegalPage) },
  { path: '**', redirectTo: '' },
];
