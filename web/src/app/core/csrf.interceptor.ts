import { HttpInterceptorFn } from '@angular/common/http';

/**
 * En-tête anti-CSRF exigé par le serveur sur les écritures admin : un formulaire posté
 * depuis un autre site ne peut pas l'ajouter. Uniquement pour nos propres routes /api.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.url.startsWith('/api/') ? req.clone({ setHeaders: { 'X-Requested-With': 'floodtheque' } }) : req);
