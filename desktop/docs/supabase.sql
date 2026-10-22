-- ============================================================================
--  Eyzi — serveur de licences (Supabase)
--  À coller UNE FOIS dans Supabase → SQL Editor → Run.
--  Ensuite, les licences se gèrent dans Table Editor → licences :
--    une ligne = une licence. Colonnes : key (le numéro à donner), family
--    (nom de la famille), channel ('prod' ou 'test'), max_tablets, enabled,
--    expires_at (vide = sans fin). Les activations (quelle tablette, quand,
--    quelle version) apparaissent dans la table activations.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.licences (
  key          text primary key,
  family       text not null default '',
  channel      text not null default 'prod' check (channel in ('prod', 'test')),
  max_tablets  int  not null default 2,
  enabled      boolean not null default true,
  expires_at   date,
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists public.activations (
  licence_key  text not null references public.licences(key) on delete cascade,
  machine      text not null,
  app_version  text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  primary key (licence_key, machine)
);

-- Personne ne lit ces tables directement depuis l'application (anon) :
-- tout passe par la fonction activate_licence ci-dessous.
alter table public.licences    enable row level security;
alter table public.activations enable row level security;

-- Génère un numéro de licence : EYZ-XXXX-XXXX-XXXX-XXXX (lettres/chiffres sans ambiguïté).
create or replace function public.new_licence_key() returns text language plpgsql as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text := ''; i int;
begin
  for i in 1..16 loop
    s := s || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'EYZ-' || substr(s,1,4) || '-' || substr(s,5,4) || '-' || substr(s,9,4) || '-' || substr(s,13,4);
end $$;

-- Normalise un numéro tapé par la famille : majuscules, et l'ancien préfixe MPJ- devient EYZ-.
create or replace function public.norm_key(p_key text) returns text language sql immutable as $$
  select regexp_replace(upper(trim(p_key)), '^MPJ-', 'EYZ-');
$$;

-- Crée une licence et renvoie son numéro :  select public.create_licence('Famille Dupont', 'prod', 2);
create or replace function public.create_licence(p_family text, p_channel text default 'prod', p_max int default 2, p_expires date default null)
returns text language plpgsql security definer as $$
declare k text := public.new_licence_key();
begin
  insert into public.licences(key, family, channel, max_tablets, expires_at) values (k, p_family, p_channel, p_max, p_expires);
  return k;
end $$;
revoke all on function public.create_licence(text, text, int, date) from public, anon;

-- ----------------------------------------------------------------------------
--  Le NUAGE DE LA FAMILLE : un espace de stockage par licence, cloisonné.
--  Chaque licence a une identité de connexion (créée automatiquement à la
--  première activation) ; le serveur n'autorise chaque identité qu'à SON
--  dossier familles/<identité>/. Les fichiers y sont chiffrés par l'appli.
-- ----------------------------------------------------------------------------
alter table public.licences add column if not exists cloud_user uuid;
alter table public.licences add column if not exists cloud_secret text;

insert into storage.buckets (id, name, public, file_size_limit)
  values ('familles', 'familles', false, 524288000)  -- 500 Mo par fichier
  on conflict (id) do nothing;

drop policy if exists "famille lit son dossier" on storage.objects;
create policy "famille lit son dossier" on storage.objects for select to authenticated
  using (bucket_id = 'familles' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "famille ecrit son dossier" on storage.objects;
create policy "famille ecrit son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'familles' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "famille remplace son dossier" on storage.objects;
create policy "famille remplace son dossier" on storage.objects for update to authenticated
  using (bucket_id = 'familles' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "famille supprime son dossier" on storage.objects;
create policy "famille supprime son dossier" on storage.objects for delete to authenticated
  using (bucket_id = 'familles' and (storage.foldername(name))[1] = auth.uid()::text);

-- Crée l'identité de connexion d'une licence (une seule fois).
create or replace function public.ensure_cloud_identity(p_key text) returns void language plpgsql security definer as $$
declare lic public.licences%rowtype; uid uuid; secret text; mail text;
begin
  select * into lic from public.licences where key = p_key;
  if lic.cloud_user is not null then return; end if;
  uid := gen_random_uuid();
  secret := encode(gen_random_bytes(24), 'base64');
  mail := 'famille-' || replace(lower(lic.key), '-', '') || '@mpj.local';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
          crypt(secret, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, json_build_object('sub', uid::text, 'email', mail), 'email', now(), now(), now());
  update public.licences set cloud_user = uid, cloud_secret = secret where key = p_key;
end $$;
revoke all on function public.ensure_cloud_identity(text) from public, anon;

-- L'ACTIVATION, appelée par l'application : vérifie et enregistre la tablette.
create or replace function public.activate_licence(p_key text, p_machine text, p_version text default null)
returns json language plpgsql security definer as $$
declare lic public.licences%rowtype; n int;
begin
  select * into lic from public.licences where key = public.norm_key(p_key);
  if not found then
    return json_build_object('ok', false, 'message', 'Numéro de licence inconnu.');
  end if;
  if not lic.enabled then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette licence a été désactivée.');
  end if;
  if lic.expires_at is not null and lic.expires_at < current_date then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette licence a expiré le ' || to_char(lic.expires_at, 'DD/MM/YYYY') || '.');
  end if;
  select count(*) into n from public.activations where licence_key = lic.key and machine <> p_machine;
  if n >= lic.max_tablets then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette licence est déjà utilisée sur ' || n || ' tablette(s), le maximum.');
  end if;
  insert into public.activations(licence_key, machine, app_version) values (lic.key, p_machine, p_version)
    on conflict (licence_key, machine) do update set last_seen = now(), app_version = excluded.app_version;
  perform public.ensure_cloud_identity(lic.key);
  select * into lic from public.licences where key = lic.key;
  return json_build_object('ok', true, 'family', lic.family, 'channel', lic.channel, 'max_tablets', lic.max_tablets,
                           'expires_at', lic.expires_at, 'message', 'Bienvenue, ' || lic.family || ' !',
                           'cloud_email', 'famille-' || replace(lower(lic.key), '-', '') || '@mpj.local',
                           'cloud_secret', lic.cloud_secret);
end $$;
grant execute on function public.activate_licence(text, text, text) to anon, authenticated;

-- Première licence (à toi) :  canal test, 3 tablettes.
-- select public.create_licence('Famille Kowalski', 'test', 3);

-- ============================================================================
--  TABLETTES : limite STRICTE au nombre de tablettes, désactivation d'un poste
--  (à distance par l'éditeur, ou « Libérer cette tablette » par la famille).
-- ============================================================================
alter table public.activations add column if not exists enabled boolean not null default true;
alter table public.activations add column if not exists disabled_at timestamptz;

-- L'ACTIVATION (version 2) : seules les tablettes ACTIVES comptent ; une
-- tablette désactivée est refusée ; la réponse dit combien de places sont prises.
create or replace function public.activate_licence(p_key text, p_machine text, p_version text default null)
returns json language plpgsql security definer as $$
declare lic public.licences%rowtype; act public.activations%rowtype; n int;
begin
  select * into lic from public.licences where key = public.norm_key(p_key);
  if not found then
    return json_build_object('ok', false, 'message', 'Numéro de licence inconnu.');
  end if;
  if not lic.enabled then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette licence a été désactivée.');
  end if;
  if lic.expires_at is not null and lic.expires_at < current_date then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette licence a expiré le ' || to_char(lic.expires_at, 'DD/MM/YYYY') || '.');
  end if;
  select * into act from public.activations where licence_key = lic.key and machine = p_machine;
  if found and not act.enabled then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette tablette a été désactivée pour la licence ' || lic.family || '. Demandez à l''éditeur de la réactiver, ou libérez une autre tablette.');
  end if;
  select count(*) into n from public.activations where licence_key = lic.key and machine <> p_machine and enabled;
  if act.licence_key is null and n >= lic.max_tablets then
    return json_build_object('ok', false, 'family', lic.family, 'message', 'Cette licence est déjà utilisée sur ' || n || ' tablette(s), le maximum. Sur une ancienne tablette : réglages → « Libérer cette tablette ».');
  end if;
  insert into public.activations(licence_key, machine, app_version) values (lic.key, p_machine, p_version)
    on conflict (licence_key, machine) do update set last_seen = now(), app_version = excluded.app_version;
  perform public.ensure_cloud_identity(lic.key);
  select * into lic from public.licences where key = lic.key;
  return json_build_object('ok', true, 'family', lic.family, 'channel', lic.channel, 'max_tablets', lic.max_tablets,
                           'used_tablets', n + 1,
                           'expires_at', lic.expires_at, 'message', 'Bienvenue, ' || lic.family || ' !',
                           'cloud_email', 'famille-' || replace(lower(lic.key), '-', '') || '@mpj.local',
                           'cloud_secret', lic.cloud_secret);
end $$;
grant execute on function public.activate_licence(text, text, text) to anon, authenticated;

-- La famille libère sa tablette (bouton « Libérer cette tablette ») : la ligne
-- est supprimée, la place redevient libre. Il faut connaître le numéro de licence.
create or replace function public.release_activation(p_key text, p_machine text)
returns json language plpgsql security definer as $$
declare n int;
begin
  delete from public.activations where licence_key = public.norm_key(p_key) and machine = p_machine;
  get diagnostics n = row_count;
  if n = 0 then return json_build_object('ok', false, 'message', 'Cette tablette n''était pas enregistrée.'); end if;
  return json_build_object('ok', true, 'message', 'Tablette libérée.');
end $$;
grant execute on function public.release_activation(text, text) to anon, authenticated;

-- L'ÉDITEUR désactive (ou réactive) une tablette à distance :
--   select public.disable_tablet('EYZ-XXXX-XXXX-XXXX-XXXX', 'NOM-DE-LA-TABLETTE');
--   select public.disable_tablet('EYZ-XXXX-XXXX-XXXX-XXXX', 'NOM-DE-LA-TABLETTE', true);  -- réactiver
-- La tablette perd l'accès à sa prochaine vérification (au plus 30 jours hors ligne).
create or replace function public.disable_tablet(p_key text, p_machine text, p_enabled boolean default false)
returns text language plpgsql security definer as $$
declare n int;
begin
  update public.activations set enabled = p_enabled, disabled_at = case when p_enabled then null else now() end
   where licence_key = public.norm_key(p_key) and machine = p_machine;
  get diagnostics n = row_count;
  return case when n = 0 then 'tablette inconnue' when p_enabled then 'réactivée' else 'désactivée' end;
end $$;
revoke all on function public.disable_tablet(text, text, boolean) from public, anon;

-- Vue : toutes les tablettes, par famille (Table Editor → tablettes, ou SQL).
create or replace view public.tablettes as
  select l.family as famille, l.key as licence, a.machine as tablette, a.enabled as active,
         a.app_version as version, a.first_seen as premiere_fois, a.last_seen as derniere_fois,
         l.max_tablets as max_tablettes
    from public.activations a join public.licences l on l.key = a.licence_key
   order by l.family, a.last_seen desc;
revoke all on public.tablettes from public, anon;

-- ============================================================================
--  USAGE PAR FAMILLE : ce qui est utilisé le plus et le moins.
--  L'application envoie, une fois par jour et à la fermeture, ses compteurs :
--  par jour et par activité, ouvertures / réussites / secondes. Rien d'autre
--  (ni prénom, ni contenu). Les lignes d'un jour sont REMPLACÉES par la
--  dernière valeur envoyée (la tablette est la référence).
-- ============================================================================
create table if not exists public.usage (
  licence_key  text not null references public.licences(key) on delete cascade,
  machine      text not null,
  day          date not null,
  activity     text not null,
  label        text,
  launches     int  not null default 0,
  successes    int  not null default 0,
  seconds      int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (licence_key, machine, day, activity)
);
alter table public.usage enable row level security;

create or replace function public.report_usage(p_key text, p_machine text, p_rows json)
returns json language plpgsql security definer as $$
declare lic public.licences%rowtype; act public.activations%rowtype; r json; n int := 0;
begin
  select * into lic from public.licences where key = public.norm_key(p_key);
  if not found or not lic.enabled then return json_build_object('ok', false, 'message', 'licence inconnue ou désactivée'); end if;
  select * into act from public.activations where licence_key = lic.key and machine = p_machine;
  if not found or not act.enabled then return json_build_object('ok', false, 'message', 'tablette non activée'); end if;
  for r in select * from json_array_elements(coalesce(p_rows, '[]'::json)) loop
    insert into public.usage(licence_key, machine, day, activity, label, launches, successes, seconds)
      values (lic.key, p_machine, (r->>'day')::date, left(r->>'activity', 80), left(r->>'label', 120),
              greatest(0, least(100000, coalesce((r->>'launches')::int, 0))),
              greatest(0, least(100000, coalesce((r->>'successes')::int, 0))),
              greatest(0, least(86400, coalesce((r->>'seconds')::int, 0))))
      on conflict (licence_key, machine, day, activity) do update
        set label = excluded.label, launches = excluded.launches, successes = excluded.successes,
            seconds = excluded.seconds, updated_at = now();
    n := n + 1;
  end loop;
  update public.activations set last_seen = now() where licence_key = lic.key and machine = p_machine;
  return json_build_object('ok', true, 'rows', n);
end $$;
grant execute on function public.report_usage(text, text, json) to anon, authenticated;

-- Vue : par famille et par activité, du plus utilisé au moins utilisé (toutes dates).
create or replace view public.usage_par_famille as
  select l.family as famille, u.activity as activite, max(u.label) as nom,
         sum(u.seconds) / 60 as minutes, sum(u.launches) as ouvertures, sum(u.successes) as reussites,
         count(distinct u.day) as jours, max(u.day) as dernier_jour
    from public.usage u join public.licences l on l.key = u.licence_key
   group by l.family, u.activity
   order by l.family, minutes desc;
revoke all on public.usage_par_famille from public, anon;

-- Vue : la même chose sur les 30 derniers jours.
create or replace view public.usage_30_jours as
  select l.family as famille, u.activity as activite, max(u.label) as nom,
         sum(u.seconds) / 60 as minutes, sum(u.launches) as ouvertures, sum(u.successes) as reussites,
         count(distinct u.day) as jours, max(u.day) as dernier_jour
    from public.usage u join public.licences l on l.key = u.licence_key
   where u.day >= current_date - 30
   group by l.family, u.activity
   order by l.family, minutes desc;
revoke all on public.usage_30_jours from public, anon;

-- Vue : un résumé par famille (temps total, jours d'utilisation, tablettes, dernière fois).
create or replace view public.usage_resume as
  select l.family as famille, l.key as licence,
         coalesce(sum(u.seconds) / 60, 0) as minutes_total,
         count(distinct u.day) as jours_utilises,
         count(distinct u.machine) as tablettes_vues,
         max(u.day) as dernier_jour,
         (select count(*) from public.activations a where a.licence_key = l.key and a.enabled) as tablettes_actives,
         l.max_tablets as max_tablettes
    from public.licences l left join public.usage u on u.licence_key = l.key
   group by l.family, l.key, l.max_tablets
   order by minutes_total desc;
revoke all on public.usage_resume from public, anon;

-- ============================================================================
--  DEMANDES DE LICENCE ET RETOURS (eyzi.fr/licence.html et retours.html → api/licence-request.js).
--  Écrites par le serveur du site (clé service_role) ; jamais lisibles par
--  l'application ni par le navigateur. À traiter dans Table Editor :
--  créer la licence (create_licence), envoyer le numéro, passer status à 'done'.
-- ============================================================================
create table if not exists public.licence_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  topic       text not null default 'licence' check (topic in ('licence', 'retour')),
  name        text not null,
  email       text not null default '',
  kind        text not null default 'famille' check (kind in ('famille', 'etablissement', 'professionnel')),
  org         text,
  child       text,
  gear        text,
  recontact   boolean not null default false,
  tablets     int  not null default 1,
  message     text,
  user_agent  text,
  status      text not null default 'new' check (status in ('new', 'done', 'refused')),
  licence_key text references public.licences(key),
  note        text
);
alter table public.licence_requests enable row level security;
