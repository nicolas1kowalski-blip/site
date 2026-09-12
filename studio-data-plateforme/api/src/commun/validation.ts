/**
 * Validation des corps de requête avec Zod.
 *
 * Usage dans un contrôleur : `@Body(valider(schemaConnexion)) corps: Connexion`.
 * Une entrée invalide renvoie 400 avec la liste des champs fautifs, lisible par l'utilisateur.
 */
import { PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { erreurRequete } from './erreurs';

class PipeZod<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodSchema<T>) {}

    transform(valeur: unknown): T {
        try {
            return this.schema.parse(valeur ?? {});
        } catch (erreur) {
            if (erreur instanceof ZodError) {
                const details = erreur.issues.map(probleme => `${probleme.path.join('.') || 'corps'} : ${probleme.message}`).join(' ; ');
                throw erreurRequete('Données invalides — ' + details);
            }
            throw erreur;
        }
    }
}

export function valider<T>(schema: ZodSchema<T>): PipeTransform<unknown, T> {
    return new PipeZod(schema);
}
