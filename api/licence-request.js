// Demande de licence (eyzi.fr/licence.html) ou retour d'utilisateur (eyzi.fr/retours.html).
// Enregistre la demande dans la table Supabase "licence_requests" avec la clé
// service_role (côté serveur uniquement). L'éditeur lit les demandes dans
// Supabase → Table Editor → licence_requests, puis crée la licence avec
// select public.create_licence(...) et répond à la famille par e-mail.
//
// Variables d'environnement (Vercel → Settings → Environment Variables) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (déjà utilisées par api/books.js)
import { createClient } from '@supabase/supabase-js';

const MAX = { name: 120, email: 160, org: 160, message: 2000, child: 40, gear: 80 };

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Méthode non autorisée.' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  // Piège à robots : le champ "site" est caché ; un humain le laisse vide.
  if (clean(body.site, 50)) { res.status(200).json({ ok: true }); return; }

  const topic = body.topic === 'retour' ? 'retour' : 'licence';
  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const kind = ['famille', 'etablissement', 'professionnel'].includes(body.kind) ? body.kind : 'famille';
  const org = clean(body.org, MAX.org);
  const child = clean(body.child, MAX.child);
  const gear = clean(body.gear, MAX.gear);
  const recontact = body.recontact === '1' || body.recontact === true;
  const tablets = Math.min(50, Math.max(1, parseInt(body.tablets, 10) || 1));
  const message = clean(body.message, MAX.message);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (topic === 'licence' && (name.length < 2 || !emailOk)) {
    res.status(400).json({ ok: false, message: 'Il manque un nom ou une adresse e-mail valide.' });
    return;
  }
  if (topic === 'retour' && (message.length < 5 || (email && !emailOk))) {
    res.status(400).json({ ok: false, message: 'Écrivez votre retour (et une adresse e-mail valide, si vous en donnez une).' });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(503).json({ ok: false, message: "Le serveur n'est pas encore configuré. Écrivez-nous directement par e-mail." });
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from('licence_requests').insert({
    topic, name: name || '(anonyme)', email: email || '', kind, org, child, gear, tablets, message, recontact,
    user_agent: clean(req.headers['user-agent'], 300),
  });
  if (error) {
    console.error('licence_requests insert', error);
    res.status(500).json({ ok: false, message: "Impossible d'enregistrer la demande pour le moment. Réessayez dans quelques minutes." });
    return;
  }
  res.status(200).json({ ok: true });
}
