-- ============================================================================
--  Mes Premiers Jeux — serveur de licences (Supabase)
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

-- Génère un numéro de licence : MPJ-XXXX-XXXX-XXXX-XXXX (lettres/chiffres sans ambiguïté).
create or replace function public.new_licence_key() returns text language plpgsql as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text := ''; i int;
begin
  for i in 1..16 loop
    s := s || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'MPJ-' || substr(s,1,4) || '-' || substr(s,5,4) || '-' || substr(s,9,4) || '-' || substr(s,13,4);
end $$;

-- Crée une licence et renvoie son numéro :  select public.create_licence('Famille Dupont', 'prod', 2);
create or replace function public.create_licence(p_family text, p_channel text default 'prod', p_max int default 2, p_expires date default null)
returns text language plpgsql security definer as $$
declare k text := public.new_licence_key();
begin
  insert into public.licences(key, family, channel, max_tablets, expires_at) values (k, p_family, p_channel, p_max, p_expires);
  return k;
end $$;
revoke all on function public.create_licence(text, text, int, date) from public, anon;

-- L'ACTIVATION, appelée par l'application : vérifie et enregistre la tablette.
create or replace function public.activate_licence(p_key text, p_machine text, p_version text default null)
returns json language plpgsql security definer as $$
declare lic public.licences%rowtype; n int;
begin
  select * into lic from public.licences where key = upper(trim(p_key));
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
  return json_build_object('ok', true, 'family', lic.family, 'channel', lic.channel, 'max_tablets', lic.max_tablets,
                           'expires_at', lic.expires_at, 'message', 'Bienvenue, ' || lic.family || ' !');
end $$;
grant execute on function public.activate_licence(text, text, text) to anon, authenticated;

-- Première licence (à toi) :  canal test, 3 tablettes.
-- select public.create_licence('Famille Kowalski', 'test', 3);
