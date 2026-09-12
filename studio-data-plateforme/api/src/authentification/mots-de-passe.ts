/**
 * Empreintes de mots de passe avec scrypt (fourni par Node, aucune dépendance native).
 *
 * Format stocké : « scrypt$<sel en hexadécimal>$<empreinte en hexadécimal> ». Le sel est aléatoire par
 * mot de passe ; la comparaison est faite en temps constant pour ne pas trahir la longueur de la
 * correspondance.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const LONGUEUR_EMPREINTE = 64;
const PARAMETRES_SCRYPT = { N: 16384, r: 8, p: 1 };

export function hacherMotDePasse(motDePasse: string): string {
    const sel = randomBytes(16);
    const empreinte = scryptSync(motDePasse, sel, LONGUEUR_EMPREINTE, PARAMETRES_SCRYPT);
    return `scrypt$${sel.toString('hex')}$${empreinte.toString('hex')}`;
}

export function verifierMotDePasse(motDePasse: string, empreinteStockee: string): boolean {
    const [algorithme, selHex, empreinteHex] = empreinteStockee.split('$');
    if (algorithme !== 'scrypt' || !selHex || !empreinteHex) return false;
    const attendue = Buffer.from(empreinteHex, 'hex');
    const calculee = scryptSync(motDePasse, Buffer.from(selHex, 'hex'), attendue.length, PARAMETRES_SCRYPT);
    return calculee.length === attendue.length && timingSafeEqual(calculee, attendue);
}

/** Mot de passe aléatoire lisible (pour le premier administrateur quand aucun n'est configuré). */
export function genererMotDePasse(longueur = 16): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const octets = randomBytes(longueur);
    return Array.from(octets, octet => alphabet[octet % alphabet.length]).join('');
}
