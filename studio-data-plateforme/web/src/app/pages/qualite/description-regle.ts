/**
 * Ce qu'une règle de qualité contrôle, en un mot pour les tableaux : sa colonne, ou pour les règles sans colonne
 * (cohérence, SQL, agrégat par groupe) sa formule, sa condition ou sa clé de regroupement.
 */
import { RegleQualite } from '../../coeur/modeles';

export function cibleDeLaRegle(regle: Pick<RegleQualite, 'type' | 'colonne' | 'parametres'>): string {
    if (regle.colonne) return regle.colonne;
    const parametres = regle.parametres;
    if (regle.type === 'expression') return parametres.formule || '';
    if (regle.type === 'sql') return parametres.condition || '';
    if (regle.type === 'groupe') return 'par ' + (parametres.colonnesGroupe || []).join(' + ');
    return '';
}
