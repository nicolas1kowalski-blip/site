-- Le socle : qui a le droit d'entrer, où il travaille, ce qu'il a déclaré, et la trace
-- de ce qu'il a fait. Aucun secret n'est rangé ici — seulement la RÉFÉRENCE d'un secret
-- gardé ailleurs, dans le coffre de l'hébergeur.

-- Les comptes. Il n'y a volontairement PAS de colonne « mot de passe » : c'est l'annuaire
-- de l'entreprise qui authentifie, et nous ne détenons rien qui puisse être volé.
CREATE TABLE comptes (
    identifiant        TEXT PRIMARY KEY,
    identite_annuaire  TEXT NOT NULL UNIQUE,
    nom_affiche        TEXT NOT NULL,
    courriel           TEXT NOT NULL,
    role_global        TEXT NOT NULL DEFAULT 'utilisateur',
    cree_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    desactive_le       TIMESTAMPTZ
);

-- Un espace de travail regroupe des sources, une gouvernance et ses membres.
CREATE TABLE espaces_de_travail (
    identifiant  TEXT PRIMARY KEY,
    nom          TEXT NOT NULL,
    cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
    cree_par     TEXT NOT NULL REFERENCES comptes (identifiant)
);

-- Le rôle d'une personne DANS un espace : lecteur, contributeur ou administrateur.
CREATE TABLE membres (
    espace    TEXT NOT NULL REFERENCES espaces_de_travail (identifiant) ON DELETE CASCADE,
    compte    TEXT NOT NULL REFERENCES comptes (identifiant) ON DELETE CASCADE,
    role      TEXT NOT NULL,
    ajoute_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (espace, compte),
    CONSTRAINT role_connu CHECK (role IN ('lecteur', 'contributeur', 'administrateur'))
);

-- Une source DÉCLARÉE : son genre, où la trouver, et le NOM du secret qui permet de s'y
-- connecter. Le secret lui-même n'entre jamais dans cette base.
CREATE TABLE sources (
    identifiant         TEXT PRIMARY KEY,
    espace              TEXT NOT NULL REFERENCES espaces_de_travail (identifiant) ON DELETE CASCADE,
    nom                 TEXT NOT NULL,
    genre               TEXT NOT NULL,
    emplacement         TEXT NOT NULL,
    reference_du_secret TEXT,
    declaree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    declaree_par        TEXT NOT NULL REFERENCES comptes (identifiant),
    CONSTRAINT genre_connu CHECK (genre IN ('entrepot', 'lac', 'fichier')),
    CONSTRAINT nom_unique_dans_l_espace UNIQUE (espace, nom)
);

-- Le journal d'audit : qui, quoi, quand, sur quoi. On n'y écrit qu'en ajoutant.
CREATE TABLE journal (
    identifiant BIGSERIAL PRIMARY KEY,
    survenu_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
    compte      TEXT,
    espace      TEXT,
    action      TEXT NOT NULL,
    objet       TEXT,
    detail      JSONB,
    adresse     TEXT
);
CREATE INDEX journal_par_date ON journal (survenu_le DESC);

-- « Inaltérable » n'est pas une intention, c'est une règle que la base fait respecter :
-- toute tentative de modification ou de suppression d'une ligne du journal échoue.
CREATE FUNCTION journal_refuser_la_modification() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Le journal d''audit ne peut être ni modifié ni supprimé.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_sans_modification
    BEFORE UPDATE OR DELETE ON journal
    FOR EACH ROW EXECUTE FUNCTION journal_refuser_la_modification();
