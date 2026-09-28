// Sécurité : en-têtes HTTP, limitation de débit, et session administrateur.
import crypto from 'node:crypto';
import { ADMIN_PASSWORD_HASH, PUBLIC } from './config.js';

// --- En-têtes ---------------------------------------------------------------------
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Angular injecte les styles des composants dans des balises <style>.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // Pochettes (Acast), miniatures (YouTube, Apple), grain en data: URI.
  "img-src 'self' data: https://assets.pippa.io https://i.ytimg.com https://*.mzstatic.com",
  // Lecture directe du flux Acast quand le relais est désactivé.
  "media-src 'self' https://*.acast.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (PUBLIC) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// --- Limitation de débit (mémoire, par IP) -----------------------------------------
export function rateLimit({ windowMs, max, message = 'Trop de requêtes, réessaie dans un instant.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.reset < now) hits.set(key, (entry = { count: 0, reset: now + windowMs }));
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

// --- Mot de passe administrateur -------------------------------------------------------
// Format stocké : scrypt$<sel hex>$<hash hex>  (généré par `npm run admin:password`)
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export const adminEnabled = () => !!ADMIN_PASSWORD_HASH;

// --- Sessions (en mémoire : un redémarrage déconnecte, c'est voulu) -----------------------
const COOKIE = 'flood_admin';
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> expiration

function readCookie(req) {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function isAdmin(req) {
  const token = readCookie(req);
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function setCookie(res, value, maxAgeSec) {
  const attrs = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSec}`,
  ];
  if (PUBLIC) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function login(req, res) {
  if (!adminEnabled()) {
    return res.status(503).json({ error: 'Administration désactivée : aucun mot de passe configuré (npm run admin:password).' });
  }
  const password = req.body?.password;
  if (typeof password !== 'string' || !password || !verifyPassword(password, ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + SESSION_TTL);
  setCookie(res, token, SESSION_TTL / 1000);
  res.json({ ok: true });
}

export function logout(req, res) {
  const token = readCookie(req);
  if (token) sessions.delete(token);
  setCookie(res, '', 0);
  res.json({ ok: true });
}

/**
 * Routes admin : session valide + en-tête anti-CSRF sur les écritures (un formulaire d'un
 * autre site ne peut pas poser d'en-tête personnalisé ; le cookie SameSite=Strict complète).
 */
export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Connexion administrateur requise.' });
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'floodtheque') {
    return res.status(403).json({ error: 'Requête refusée.' });
  }
  next();
}
