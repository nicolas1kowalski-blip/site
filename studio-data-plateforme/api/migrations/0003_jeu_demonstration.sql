-- Jeu de démonstration rangé dans la base : un enregistrement par fichier, contenu compressé (gzip).
-- Le mode démonstration s'installe ainsi sans dépendre de fichiers présents sur le disque du serveur.
CREATE TABLE IF NOT EXISTS jeu_demonstration (
    nom text PRIMARY KEY,
    taille_octets bigint NOT NULL,
    contenu bytea NOT NULL,
    taille_compressee_octets bigint NOT NULL,
    charge_le timestamptz NOT NULL DEFAULT now()
);
