import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { csrfInterceptor } from './core/csrf.interceptor';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { routes } from './app.routes';
import { ApiService } from './core/api.service';
import { STATIC_SITE } from './core/environment';
import { StaticApiService } from './core/static-api.service';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([csrfInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    // GitHub Pages : données JSON statiques + recherche dans le navigateur (cf. core/environment.pages.ts).
    ...(STATIC_SITE ? [{ provide: ApiService, useClass: StaticApiService }] : []),
  ],
};
