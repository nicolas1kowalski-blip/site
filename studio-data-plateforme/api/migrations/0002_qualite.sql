-- Qualité des données : règles de qualité (par source et colonne) et audits enregistrés.
CREATE TABLE IF NOT EXISTS regles_qualite (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
    nom text NOT NULL,
    source_id text NOT NULL,
    colonne text NOT NULL DEFAULT '',
    type text NOT NULL,
    parametres jsonb NOT NULL DEFAULT '{}'::jsonb,
    criticite text NOT NULL DEFAULT 'majeure',
    active boolean NOT NULL DEFAULT true,
    dernier_resultat jsonb,
    modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS regles_qualite_espace_index ON regles_qualite(espace_id, source_id);
CREATE TABLE IF NOT EXISTS audits_qualite (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    espace_id uuid NOT NULL REFERENCES espaces(id) ON DELETE CASCADE,
    source_id text NOT NULL,
    source_nom text NOT NULL,
    genre text NOT NULL,
    lance_le timestamptz NOT NULL DEFAULT now(),
    lance_par_id uuid REFERENCES utilisateurs(id) ON DELETE SET NULL,
    lignes bigint NOT NULL DEFAULT 0,
    resume jsonb NOT NULL DEFAULT '{}'::jsonb,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audits_qualite_espace_index ON audits_qualite(espace_id, source_id, lance_le);
