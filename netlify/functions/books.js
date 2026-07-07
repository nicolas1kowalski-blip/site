// API de stockage des livres (photos + texte) côté serveur, via Netlify Blobs.
// Chaque livre est stocké en deux morceaux :
//  - "meta:<id>"  : infos légères pour la bibliothèque (titre, vignette de couverture)
//  - "full:<id>"  : le livre complet avec toutes les pages (photo + texte)
// Ainsi la liste de la bibliothèque reste rapide à charger même avec
// beaucoup de livres, et les photos pleine résolution ne sont
// téléchargées qu'à l'ouverture du livre concerné.
//
// La lecture (GET) est publique : les enfants doivent pouvoir lire sans
// se connecter. L'ajout et la suppression (POST/DELETE) exigent le mot
// de passe administrateur défini dans la variable d'environnement
// ADMIN_PASSWORD (Netlify → Site settings → Environment variables).
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const META_PREFIX = 'meta:';
const FULL_PREFIX = 'full:';

// Sur certains sites, Netlify n'injecte pas automatiquement le contexte
// Netlify Blobs dans les fonctions ("MissingBlobsEnvironmentError"). Dans ce
// cas, on bascule sur une configuration manuelle avec BLOBS_SITE_ID et
// BLOBS_TOKEN (variables d'environnement à créer dans Netlify).
function getBooksStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'books', siteID, token });
  }
  return getStore('books');
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Retourne 'not-configured' si ADMIN_PASSWORD n'est pas défini côté serveur,
// 'ok' si le mot de passe envoyé correspond, sinon 'wrong'.
function checkAuth(event) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return 'not-configured';
  const headers = event.headers || {};
  const token = headers['x-admin-token'] || headers['X-Admin-Token'];
  return safeEqual(token, configured) ? 'ok' : 'wrong';
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      // Vérification silencieuse du mot de passe (utilisée par l'écran de connexion)
      // — ne touche pas au stockage, doit fonctionner même si Blobs est mal configuré.
      if (event.queryStringParameters && event.queryStringParameters.verify === '1') {
        const auth = checkAuth(event);
        if (auth === 'ok') return json(200, { authorized: true });
        if (auth === 'not-configured') {
          return json(500, { authorized: false, error: 'not-configured' });
        }
        return json(401, { authorized: false, error: 'wrong' });
      }
      const store = getBooksStore();
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (id) {
        const full = await store.get(FULL_PREFIX + id, { type: 'json' });
        if (!full) return json(404, { error: 'Livre introuvable' });
        return json(200, full);
      }
      const { blobs } = await store.list({ prefix: META_PREFIX });
      const metas = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
      return json(200, metas.filter(Boolean));
    }

    if (event.httpMethod === 'POST') {
      const auth = checkAuth(event);
      if (auth === 'not-configured') return json(500, { error: 'ADMIN_PASSWORD non configuré sur le serveur' });
      if (auth !== 'ok') return json(401, { error: 'Mot de passe administrateur requis' });
      const store = getBooksStore();

      const body = JSON.parse(event.body || '{}');
      const title = (body.title || '').trim();
      const pages = Array.isArray(body.pages) ? body.pages : [];
      if (!title || pages.length === 0) {
        return json(400, { error: 'Titre ou pages manquants' });
      }
      const id = body.id || 'book-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const accent = body.accent || '#FFD93C';

      const meta = {
        id,
        title,
        accent,
        custom: true,
        coverImage: body.coverThumb || null,
        cover: body.coverThumb ? null : '📗',
        pageCount: pages.length,
        updatedAt: Date.now(),
      };
      const full = { id, title, accent, custom: true, pages };

      await store.setJSON(META_PREFIX + id, meta);
      await store.setJSON(FULL_PREFIX + id, full);
      return json(200, meta);
    }

    if (event.httpMethod === 'DELETE') {
      const auth = checkAuth(event);
      if (auth === 'not-configured') return json(500, { error: 'ADMIN_PASSWORD non configuré sur le serveur' });
      if (auth !== 'ok') return json(401, { error: 'Mot de passe administrateur requis' });
      const store = getBooksStore();

      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: 'id manquant' });
      await store.delete(META_PREFIX + id);
      await store.delete(FULL_PREFIX + id);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Méthode non supportée' });
  } catch (err) {
    const message = String((err && err.message) || err);
    if (err.name === 'MissingBlobsEnvironmentError' || message.includes('has not been configured to use Netlify Blobs')) {
      return json(500, {
        authorized: false,
        error: 'blobs-not-configured',
        detail: 'Netlify Blobs indisponible : définissez BLOBS_SITE_ID et BLOBS_TOKEN dans les variables d\'environnement.',
      });
    }
    return json(500, { error: message });
  }
};
