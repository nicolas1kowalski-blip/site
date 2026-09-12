/**
 * Erreurs applicatives et validations partagées.
 *
 * Le front affiche les messages tels quels : ils sont donc écrits pour un utilisateur, en français, et
 * décrivent quoi faire. Les exceptions NestJS portent le code HTTP.
 */
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    PayloadTooLargeException,
    UnauthorizedException
} from '@nestjs/common';

export const erreurRequete = (message: string) => new BadRequestException({ erreur: message });
export const erreurIntrouvable = (message: string) => new NotFoundException({ erreur: message });
export const erreurTropVolumineux = (message: string) => new PayloadTooLargeException({ erreur: message });
export const erreurNonAuthentifie = (message = 'Connexion requise.') => new UnauthorizedException({ erreur: message });
export const erreurInterdit = (message = 'Action non autorisée pour votre rôle.') => new ForbiddenException({ erreur: message });

/** Nom de fichier ou clé accepté par l'API : un seul segment, lettres, chiffres, _ . - ; jamais de « .. ». */
const NOM_SUR = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/;

export function verifierNomSur(nom: unknown, quoi = 'nom'): string {
    if (typeof nom !== 'string' || !NOM_SUR.test(nom) || nom.includes('..')) {
        throw erreurRequete(`${quoi} invalide : « ${String(nom).slice(0, 60)} » (lettres, chiffres, _ . - uniquement).`);
    }
    return nom;
}

/** Code d'espace de travail : minuscules, chiffres et tirets, 2 à 40 caractères (utilisé dans les chemins et les URL). */
const CODE_ESPACE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function verifierCodeEspace(code: unknown): string {
    if (typeof code !== 'string' || !CODE_ESPACE.test(code)) {
        throw erreurRequete(
            `Code d'espace invalide : « ${String(code).slice(0, 40)} » (minuscules, chiffres et tirets, 2 à 40 caractères).`
        );
    }
    return code;
}
