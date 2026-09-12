// Erreurs applicatives : un code HTTP et un message destiné à l'utilisateur (le front les affiche tels quels).
export class ErreurApplicative extends Error {
    constructor(statut, message) {
        super(message);
        this.statut = statut;
    }
}

export const erreurRequete = message => new ErreurApplicative(400, message);
export const erreurIntrouvable = message => new ErreurApplicative(404, message);
export const erreurTropVolumineux = message => new ErreurApplicative(413, message);

// Nom de fichier ou de clé accepté par l'API : un seul segment, sans séparateur de chemin ni caractère spécial.
const NOM_SUR = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/;
export function verifierNomSur(nom, quoi = 'nom') {
    if (typeof nom !== 'string' || !NOM_SUR.test(nom) || nom.includes('..')) {
        throw erreurRequete(
            `${quoi} invalide : « ${String(nom).slice(0, 60)} » (lettres, chiffres, _ . - uniquement).`
        );
    }
    return nom;
}
