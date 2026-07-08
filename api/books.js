// API de stockage des livres (photos + texte) côté serveur, via Supabase
// (table Postgres "books" + bucket de stockage "book-photos").
//
// La lecture (GET) est publique : les enfants doivent pouvoir lire sans
// se connecter. L'ajout et la suppression (POST/DELETE) exigent le mot
// de passe administrateur défini dans la variable d'environnement
// ADMIN_PASSWORD.
//
// Variables d'environnement requises (Vercel → Project → Settings →
// Environment Variables) :
//   ADMIN_PASSWORD              mot de passe administrateur
//   SUPABASE_URL                URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY   clé "service_role" (jamais exposée au navigateur)
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'book-photos';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Retourne 'not-configured' si ADMIN_PASSWORD n'est pas défini côté serveur,
// 'ok' si le mot de passe envoyé correspond, sinon 'wrong'.
function checkAuth(req) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return 'not-configured';
  const token = req.headers['x-admin-token'];
  return safeEqual(token, configured) ? 'ok' : 'wrong';
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

// Envoie une image (data URL) dans le bucket et renvoie son URL publique.
async function uploadImage(supabase, path, dataUrl) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data ? data.publicUrl : null;
}

function rowToMeta(row) {
  return {
    id: row.id,
    title: row.title,
    accent: row.accent,
    custom: true,
    coverImage: row.cover_image,
    cover: row.cover,
    pageCount: row.page_count,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Vérification silencieuse du mot de passe (utilisée par l'écran de connexion)
      // — ne touche pas au stockage, doit fonctionner même si Supabase est mal configuré.
      if (req.query.verify === '1') {
        const auth = checkAuth(req);
        if (auth === 'ok') return res.status(200).json({ authorized: true });
        if (auth === 'not-configured') {
          return res.status(500).json({ authorized: false, error: 'not-configured' });
        }
        return res.status(401).json({ authorized: false, error: 'wrong' });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants)' });
      }

      const id = req.query.id;
      if (id) {
        const { data, error } = await supabase.from('books').select('*').eq('id', id).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Livre introuvable' });
        return res.status(200).json({ id: data.id, title: data.title, accent: data.accent, custom: true, pages: data.pages });
      }

      const { data, error } = await supabase
        .from('books')
        .select('id,title,accent,cover,cover_image,page_count,updated_at')
        .order('updated_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data.map(rowToMeta));
    }

    if (req.method === 'POST') {
      const auth = checkAuth(req);
      if (auth === 'not-configured') return res.status(500).json({ error: 'ADMIN_PASSWORD non configuré sur le serveur' });
      if (auth !== 'ok') return res.status(401).json({ error: 'Mot de passe administrateur requis' });

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants)' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const title = (body.title || '').trim();
      const inputPages = Array.isArray(body.pages) ? body.pages : [];
      if (!title || inputPages.length === 0) {
        return res.status(400).json({ error: 'Titre ou pages manquants' });
      }
      const id = body.id || 'book-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const accent = body.accent || '#FFD93C';

      const pages = [];
      for (let i = 0; i < inputPages.length; i++) {
        const p = inputPages[i];
        let imageUrl = null;
        if (p.image) {
          if (/^data:/.test(p.image)) {
            const ext = /image\/png/i.test(p.image) ? 'png' : 'jpg';
            imageUrl = await uploadImage(supabase, `${id}/page-${i}.${ext}`, p.image);
          } else {
            // Déjà une URL hébergée (page inchangée lors d'une modification)
            imageUrl = p.image;
          }
        }
        const zones = Array.isArray(p.zones)
          ? p.zones
              .filter((z) => z && typeof z.label === 'string' && z.label.trim())
              .map((z) => ({
                left: Number(z.left) || 0,
                top: Number(z.top) || 0,
                width: Number(z.width) || 0,
                height: Number(z.height) || 0,
                label: String(z.label).trim().slice(0, 60),
              }))
          : [];
        pages.push({ text: p.text || '', image: imageUrl, plain: !imageUrl, zones });
      }

      let coverImage = null;
      if (body.coverThumb) {
        coverImage = await uploadImage(supabase, `${id}/cover.jpg`, body.coverThumb);
      } else if (body.id) {
        // Modification sans nouvelle vignette : on garde l'ancienne couverture
        const { data: existing } = await supabase.from('books').select('cover_image').eq('id', body.id).maybeSingle();
        if (existing) coverImage = existing.cover_image;
      }

      const row = {
        id,
        title,
        accent,
        cover: coverImage ? null : '📗',
        cover_image: coverImage,
        page_count: pages.length,
        updated_at: Date.now(),
        pages,
      };

      const { error } = await supabase.from('books').upsert(row);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(rowToMeta(row));
    }

    if (req.method === 'DELETE') {
      const auth = checkAuth(req);
      if (auth === 'not-configured') return res.status(500).json({ error: 'ADMIN_PASSWORD non configuré sur le serveur' });
      if (auth !== 'ok') return res.status(401).json({ error: 'Mot de passe administrateur requis' });

      const supabase = getSupabase();
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants)' });
      }

      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id manquant' });

      const { data: files } = await supabase.storage.from(BUCKET).list(id);
      if (files && files.length) {
        await supabase.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`));
      }
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non supportée' });
  } catch (err) {
    return res.status(500).json({ error: String((err && err.message) || err) });
  }
}
