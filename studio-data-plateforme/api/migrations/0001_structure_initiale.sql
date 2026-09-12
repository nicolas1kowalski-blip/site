-- Structure initiale de la base référentielle (PostgreSQL). Une instruction par ligne se terminant par « ; ».
-- Voir api/src/base-de-donnees/schema.ts pour la description de chaque table.
CREATE TABLE IF NOT EXISTS utilisateurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifiant text NOT NULL UNIQUE,
    nom_affiche text NOT NULL,
    email text,
    mot_de_passe_hache text NOT NULL,
    role_global text NOT NULL DEFAULT 'utilisateur',
    actif boolean NOT NULL DEFAULT true,
    cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS espaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    nom text NOT NULL,
    cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS membres (
    espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
    utilisateur_id uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'lecteur',
    PRIMARY KEY (espace_id, utilisateur_id)
);
CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    utilisateur_id uuid NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    espace_courant_id uuid REFERENCES espaces(id) ON DELETE SET NULL,
    cree_le timestamptz NOT NULL DEFAULT now(),
    expire_le timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_utilisateur_index ON sessions(utilisateur_id);
CREATE TABLE IF NOT EXISTS documents (
    espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
    cle text NOT NULL,
    valeur jsonb NOT NULL,
    modifie_le timestamptz NOT NULL DEFAULT now(),
    modifie_par_id uuid REFERENCES utilisateurs(id) ON DELETE SET NULL,
    PRIMARY KEY (espace_id, cle)
);
CREATE TABLE IF NOT EXISTS sources (
    id text NOT NULL,
    espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
    nom text NOT NULL,
    type text NOT NULL DEFAULT 'csv',
    stockage text NOT NULL DEFAULT 'table',
    taille_octets bigint NOT NULL DEFAULT 0,
    en_tetes jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadonnees jsonb NOT NULL DEFAULT '{}'::jsonb,
    modifie_le timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (espace_id, id)
);
CREATE TABLE IF NOT EXISTS journal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    espace_id uuid REFERENCES espaces(id) ON DELETE SET NULL,
    utilisateur_id uuid REFERENCES utilisateurs(id) ON DELETE SET NULL,
    action text NOT NULL,
    cible text,
    details jsonb,
    horodatage timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_espace_horodatage_index ON journal(espace_id, horodatage);
