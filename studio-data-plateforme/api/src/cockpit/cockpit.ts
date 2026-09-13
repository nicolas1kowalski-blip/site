/**
 * Cockpit : les chiffres et les points d'attention de l'espace, calculés à partir de listes déjà chargées.
 * Fonctions pures, testées sans base : le service ne fait que rassembler les entrées.
 */

export type SourcePourCockpit = { id: string; name: string; type?: string; enregistreLe?: string; lignes: number | null; domaine: string };
export type RelationPourCockpit = { sourceTable: string; targetTable: string };
export type ObjetPourCockpit = { name: string; globalOwner?: string };
export type AuditPourCockpit = { sourceNom: string; genre: string; lanceLe: string; lignes: number; resume: Record<string, unknown> };

export type PointAttention = { gravite: 'alerte' | 'info'; message: string; lien: string };

export type DernierAudit = {
    source: string;
    date: string;
    lignes: number;
    completude: number | null;
    doublons: number | null;
} | null;

export type Cockpit = {
    sources: number;
    lignes: number;
    domaines: number;
    liens: number;
    objetsMetier: number;
    audits: number;
    scoreQualite: number | null;
    dernierAudit: DernierAudit;
    pointsAttention: PointAttention[];
    volumetrie: { nom: string; lignes: number; domaine: string }[];
};

const JOURS_AVANT_ALERTE_FRAICHEUR = 7;

/** Résume une liste de noms : les trois premiers, puis « … ». */
export function citer(noms: string[]): string {
    return noms.slice(0, 3).join(', ') + (noms.length > 3 ? '…' : '');
}

/** Points d'attention : objets sans propriétaire, tables hors modèle, tables sans domaine, sources anciennes. */
export function pointsAttention(
    sources: SourcePourCockpit[],
    relations: RelationPourCockpit[],
    objets: ObjetPourCockpit[],
    maintenant = Date.now()
): PointAttention[] {
    const points: PointAttention[] = [];
    const sansProprietaire = objets.filter(objet => !String(objet.globalOwner || '').trim());
    if (sansProprietaire.length)
        points.push({
            gravite: 'alerte',
            message: `${sansProprietaire.length} objet(s) métier sans propriétaire : ${citer(sansProprietaire.map(objet => objet.name))}`,
            lien: '/objets-metier'
        });
    const reliees = new Set(relations.flatMap(relation => [relation.sourceTable, relation.targetTable]));
    const nonReliees = sources.filter(source => !reliees.has(source.id) && !reliees.has(source.name));
    if (nonReliees.length && sources.length > 1)
        points.push({
            gravite: 'alerte',
            message: `${nonReliees.length} table(s) non reliée(s) au modèle : ${citer(nonReliees.map(source => source.name))}`,
            lien: '/modele'
        });
    const sansDomaine = sources.filter(source => !source.domaine);
    if (sansDomaine.length)
        points.push({
            gravite: 'info',
            message: `${sansDomaine.length} table(s) sans domaine : ${citer(sansDomaine.map(source => source.name))}`,
            lien: '/dictionnaire'
        });
    const limite = maintenant - JOURS_AVANT_ALERTE_FRAICHEUR * 86_400_000;
    const anciennes = sources.filter(
        source =>
            source.type !== 'designed' && source.type !== 'extraction' && source.enregistreLe && Date.parse(source.enregistreLe) < limite
    );
    if (anciennes.length)
        points.push({
            gravite: 'info',
            message: `${anciennes.length} source(s) non rafraîchie(s) depuis plus de ${JOURS_AVANT_ALERTE_FRAICHEUR} jours`,
            lien: '/sources'
        });
    return points;
}

/** Le dernier audit de profilage, résumé pour la carte « Dernier audit qualité ». */
export function dernierAudit(audits: AuditPourCockpit[]): DernierAudit {
    const audit = audits.find(candidat => candidat.genre === 'profilage') || audits[0];
    if (!audit) return null;
    const completude = audit.resume['completudeMoyenne'];
    const doublons = audit.resume['doublonsExacts'];
    return {
        source: audit.sourceNom,
        date: audit.lanceLe,
        lignes: audit.lignes,
        completude: typeof completude === 'number' ? Math.round(100 * completude) : null,
        doublons: typeof doublons === 'number' ? doublons : null
    };
}

/** Score du dernier audit de règles, s'il y en a un. */
export function scoreQualite(audits: AuditPourCockpit[]): number | null {
    const audit = audits.find(candidat => candidat.genre === 'regles' && typeof candidat.resume['score'] === 'number');
    return audit ? (audit.resume['score'] as number) : null;
}

export function assemblerCockpit(
    sources: SourcePourCockpit[],
    relations: RelationPourCockpit[],
    objets: ObjetPourCockpit[],
    audits: AuditPourCockpit[],
    domaines: string[],
    maintenant = Date.now()
): Cockpit {
    const volumetrie = sources
        .filter(source => source.lignes != null)
        .map(source => ({ nom: source.name, lignes: source.lignes as number, domaine: source.domaine }))
        .sort((premier, second) => second.lignes - premier.lignes);
    return {
        sources: sources.length,
        lignes: volumetrie.reduce((somme, ligne) => somme + ligne.lignes, 0),
        domaines: domaines.length,
        liens: relations.length,
        objetsMetier: objets.length,
        audits: audits.length,
        scoreQualite: scoreQualite(audits),
        dernierAudit: dernierAudit(audits),
        pointsAttention: pointsAttention(sources, relations, objets, maintenant),
        volumetrie
    };
}
