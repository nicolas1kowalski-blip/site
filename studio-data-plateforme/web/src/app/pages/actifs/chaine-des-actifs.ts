/**
 * La chaîne des actifs — reprise de la V13.
 *
 * Le modèle que l'écran applique, et qu'il énonce en tête :
 *
 *   🖥 Application  contient →  📄 Sources  alimentent →  🏛️ Objet métier  alimente →  📥 Consommateurs
 *
 * C'est l'**application** qui est maître, jamais le fichier : un fichier n'apparaît pas tout seul, quelqu'un
 * le produit. Une source n'appartient donc qu'à une application à la fois, et tout le reste s'en déduit —
 * les objets métier qu'elle alimente, les consommateurs en aval. La V13 le montre plutôt que de le faire
 * ressaisir : « déduit du paramétrage amont, rien à ressaisir ».
 *
 * Fonctions pures : elles ne connaissent que ce qu'on leur donne.
 */
import type { Actif, AnalyseImpact, ObjetMetier } from '../../coeur/modeles';

/** L'application qui possède une source, ou rien quand personne ne l'a revendiquée. */
export function proprietaireDeLaSource(actifs: Actif[], nomSource: string): Actif | null {
    return actifs.find(actif => actif.kind === 'app' && (actif.sources || []).includes(nomSource)) || null;
}

/** Ce qu'une case « source produite » doit dire : rattachable, déjà à moi, ou prise par une autre. */
export type EtatDeLaSource = { rattachee: boolean; priseParUnAutre: boolean; proprietaire: string };

export function etatDeLaSource(actifs: Actif[], actif: Actif, nomSource: string): EtatDeLaSource {
    const proprietaire = proprietaireDeLaSource(actifs, nomSource);
    return {
        rattachee: !!proprietaire && proprietaire.id === actif.id,
        priseParUnAutre: !!proprietaire && proprietaire.id !== actif.id,
        proprietaire: proprietaire ? proprietaire.name : ''
    };
}

/**
 * Les objets métier qu'une application alimente. On ne les saisit pas : ils se déduisent des sources
 * qu'elle produit, puisqu'un objet métier déclare de quelles tables il vient.
 */
export function objetsAlimentes(actif: Actif, objets: ObjetMetier[]): ObjetMetier[] {
    const siennes = new Set(actif.sources || []);
    return objets.filter(objet => (objet.sources || []).some(source => siennes.has(source.table)));
}

/** La chaîne en aval d'une application : ses sources, les objets qu'elles alimentent, et qui s'en sert. */
export type ChaineAval = { sources: string[]; objets: string[]; consommateurs: string[] };

export function chaineAval(actif: Actif, objets: ObjetMetier[], actifs: Actif[]): ChaineAval {
    const alimentes = objetsAlimentes(actif, objets);
    const identifiants = new Set(alimentes.map(objet => objet.id));
    const consommateurs = actifs.filter(
        candidat => candidat.id !== actif.id && (candidat.boIds || []).some(identifiant => identifiants.has(identifiant))
    );
    return {
        sources: [...(actif.sources || [])],
        objets: alimentes.map(objet => objet.name),
        consommateurs: consommateurs.map(candidat => candidat.name)
    };
}

/** Ce à quoi un actif est relié, compté : c'est ce qui dit s'il est vraiment branché ou seulement déclaré. */
export type UsageDunActif = { sources: number; objets: number; processus: number };

export function usageDunActif(actif: Actif, objets: ObjetMetier[], actifs: Actif[]): UsageDunActif {
    return {
        sources: (actif.sources || []).length + (actif.tables || []).length,
        objets: new Set([...(actif.boIds || []), ...objetsAlimentes(actif, objets).map(objet => objet.id)]).size,
        processus: actifs.filter(candidat => candidat.kind === 'process' && (candidat.appIds || []).includes(actif.id)).length
    };
}

/**
 * L'usage en une phrase, ou l'invitation à brancher l'actif quand il ne l'est pas encore : un actif
 * déclaré mais relié à rien ne sert à personne, et le dire vaut mieux que de laisser la ligne vide.
 */
export function phraseDeLUsage(usage: UsageDunActif): string {
    const morceaux: string[] = [];
    if (usage.sources) morceaux.push(`${usage.sources} source(s)`);
    if (usage.objets) morceaux.push(`${usage.objets} objet(s) métier`);
    if (usage.processus) morceaux.push(`${usage.processus} processus outillé(s)`);
    return morceaux.length
        ? morceaux.join(' · ')
        : 'pas encore relié — rattachez-lui des sources, des tables lues ou des objets métier ci-dessus';
}

/** Une colonne déclarée critique par un processus : « clients.csv.email ». */
export type ColonneCritique = { table: string; col: string };

/** Le libellé d'une colonne critique. */
export function libelleDeLaColonne(colonne: ColonneCritique): string {
    return `${colonne.table}.${colonne.col}`;
}

/** Ajoute une colonne critique sans jamais la poser deux fois ; rend vrai quand elle a été ajoutée. */
export function ajouterUneColonneCritique(colonnes: ColonneCritique[], table: string, col: string): boolean {
    if (!table || !col) return false;
    if (colonnes.some(candidate => candidate.table === table && candidate.col === col)) return false;
    colonnes.push({ table, col });
    return true;
}

/** Les trois familles d'impact, dans l'ordre du classique, avec ce que chaque titre annonce. */
export function blocsDImpact(impact: AnalyseImpact): { titre: string; actifs: AnalyseImpact['direct'] }[] {
    return [
        { titre: 'Impact direct (utilise cette donnée)', actifs: impact.direct },
        { titre: `Via le parcours de la donnée (tables alimentées : ${impact.downstream.join(', ') || '—'})`, actifs: impact.viaLineage },
        {
            titre: `Via les relations du modèle de données (tables jointes : ${impact.related.join(', ') || '—'})`,
            actifs: impact.viaRelations
        }
    ];
}
