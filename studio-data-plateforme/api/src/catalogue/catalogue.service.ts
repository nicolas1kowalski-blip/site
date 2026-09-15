/**
 * Service du catalogue : construit l'index à partir des sources (métadonnées, dictionnaire, classification,
 * derniers audits) et du référentiel de gouvernance, puis répond aux recherches.
 */
import { Injectable } from '@nestjs/common';
import { EtatApplication, GouvernanceService } from '../gouvernance/gouvernance.service';
import { niveauPropose } from '../gouvernance/sensibilite';
import { QualiteService } from '../qualite/qualite.service';
import { DocumentSource, SourcesService } from '../sources/sources.service';
import {
    EntreeCatalogue,
    FiltresCatalogue,
    TYPES_CATALOGUE,
    exemplesDeRecherche,
    indexer,
    rechercher,
    sensibiliteDe,
    statistiquesDuCatalogue,
    trier,
    validationDe
} from './catalogue';

type Element = Record<string, unknown> & { id: string };
type RegleResumee = {
    id: string;
    nom: string;
    sourceId: string;
    colonne: string;
    type: string;
    criticite: string;
    taux: number | null;
    executeLe: number | null;
};
const texte = (valeur: unknown) => (valeur == null ? '' : String(valeur));
const liste = <T = unknown,>(valeur: unknown): T[] => (Array.isArray(valeur) ? (valeur as T[]) : []);
/** Une date quelconque (texte ISO, horodatage) ramenée en millisecondes, ou null quand elle est illisible. */
function dateEnMillisecondes(valeur: unknown): number | null {
    if (valeur == null || valeur === '') return null;
    const quand = typeof valeur === 'number' ? valeur : Date.parse(String(valeur));
    return Number.isFinite(quand) ? quand : null;
}

@Injectable()
export class CatalogueService {
    constructor(
        private readonly gouvernance: GouvernanceService,
        private readonly sources: SourcesService,
        private readonly qualite: QualiteService
    ) {}

    async rechercher(espaceId: string, filtres: FiltresCatalogue) {
        const index = await this.index(espaceId);
        const trouve = rechercher(index, filtres);
        const [etat, sources] = await Promise.all([this.gouvernance.etat(espaceId), this.sources.lister(espaceId)]);
        const fiches = etat.governance.dictionary as Record<string, Record<string, unknown>>;
        const objets = etat.governance.businessObjects as Element[];
        const statuts = [
            ...sources.filter(source => fiches[source.name]).map(source => texte(fiches[source.name]['status']) || 'Brouillon'),
            ...objets.map(objet => texte(objet['status']) || 'Brouillon')
        ];
        return {
            ...trouve,
            resultats: trier(trouve.resultats, filtres.tri),
            types: TYPES_CATALOGUE,
            total: index.length,
            statistiques: statistiquesDuCatalogue(
                index,
                sources.map(source => ({ documentee: !!texte(fiches[source.name]?.['description']) })),
                statuts
            ),
            exemples: exemplesDeRecherche(sources[0]?.name || '', texte(objets[0]?.['name']), this.premierProprietaire(fiches))
        };
    }

    /** Le premier propriétaire nommé dans le dictionnaire : il sert d'exemple de recherche par responsable. */
    private premierProprietaire(fiches: Record<string, Record<string, unknown>>): string {
        return (
            Object.values(fiches)
                .map(fiche => texte(fiche['owner']))
                .find(Boolean) || ''
        );
    }

    /** Règles de qualité (table regles_qualite) résumées pour le catalogue. */
    private async reglesDe(espaceId: string): Promise<RegleResumee[]> {
        return (await this.qualite.regles(espaceId)).map(regle => ({
            id: regle.id,
            nom: regle.nom,
            sourceId: regle.sourceId,
            colonne: regle.colonne,
            type: regle.type,
            criticite: regle.criticite,
            taux: regle.dernierResultat ? Math.round(100 * (regle.dernierResultat as { taux: number }).taux) : null,
            executeLe: dateEnMillisecondes((regle.dernierResultat as { executeLe?: unknown } | null)?.executeLe)
        }));
    }

    /** L'index complet de l'espace (recalculé à chaque appel : les volumes restent ceux d'une équipe). */
    async index(espaceId: string): Promise<EntreeCatalogue[]> {
        const [etat, sources, audits, regles] = await Promise.all([
            this.gouvernance.etat(espaceId),
            this.sources.lister(espaceId),
            this.qualite.audits(espaceId, undefined, 500),
            this.reglesDe(espaceId)
        ]);
        const scoreDe = new Map<string, number>();
        const completudeDe = new Map<string, number>();
        for (const audit of audits) {
            if (audit.genre === 'regles' && !scoreDe.has(audit.sourceId) && typeof (audit.resume as { score?: number }).score === 'number')
                scoreDe.set(audit.sourceId, (audit.resume as { score: number }).score);
            if (audit.genre === 'profilage' && !completudeDe.has(audit.sourceId))
                completudeDe.set(
                    audit.sourceId,
                    Math.round(100 * Number((audit.resume as { completudeMoyenne?: number }).completudeMoyenne || 0))
                );
        }
        const entrees: EntreeCatalogue[] = [];
        for (const source of sources)
            entrees.push(...this.entreesSource(etat, source, scoreDe.get(source.id!) ?? completudeDe.get(source.id!) ?? null));
        entrees.push(...this.entreesGouvernance(etat, sources, regles));
        return entrees.map(indexer);
    }

    /** Une table (ou vue dérivée) et chacune de ses colonnes. */
    private entreesSource(etat: EtatApplication, source: DocumentSource, qualite: number | null): EntreeCatalogue[] {
        const fiche = etat.governance.dictionary[source.name] || {};
        const colonnes = (fiche.columns || {}) as Record<string, Record<string, unknown>>;
        const niveaux = etat.governance.privacy.levels[source.name] || {};
        const niveauColonne = (colonne: string) => niveaux[colonne] || niveauPropose(texte(colonnes[colonne]?.['sensitivity']), colonne);
        const entete = this.entreeTable(source, fiche, qualite, (source.headers || []).map(niveauColonne));
        const colonnesCatalogue = (source.headers || []).map(colonne =>
            this.entreeColonne(source, entete, colonne, colonnes[colonne] || {}, niveauColonne(colonne))
        );
        return [entete, ...colonnesCatalogue];
    }

    /** Fiche catalogue d'une table : sa sensibilité est la pire de ses colonnes. */
    private entreeTable(
        source: DocumentSource,
        fiche: Record<string, unknown>,
        qualite: number | null,
        niveauxColonnes: string[]
    ): EntreeCatalogue {
        const pire = niveauxColonnes.includes('personnel')
            ? 'Personnel'
            : niveauxColonnes.includes('confidentiel')
              ? 'Confidentiel'
              : niveauxColonnes.some(Boolean)
                ? 'Public'
                : '';
        const estConcue = source.type === 'designed';
        const estDerivee = source.type === 'extraction';
        return entree({
            type: estConcue || estDerivee ? 'view' : 'table',
            id: source.id!,
            titre: source.name,
            sousTitre: `${(source.headers || []).length} colonne(s)`,
            description: texte(fiche['description']),
            domaine: texte(fiche['domain']) || '—',
            proprietaire: texte(fiche['owner']),
            qualite,
            sensibilite: sensibiliteDe(pire),
            validation: validationDe(fiche['status']),
            etiquettes: [estConcue ? 'table conçue' : estDerivee ? 'dérivée' : source.type || 'table', texte(fiche['sourceSystem'])].filter(
                Boolean
            ),
            lien: estConcue ? '/tables-concues' : '/sources',
            fraicheur: dateEnMillisecondes(source['enregistreLe'])
        });
    }

    /** Fiche catalogue d'une colonne : hérite du domaine et du propriétaire de sa table. */
    private entreeColonne(
        source: DocumentSource,
        table: EntreeCatalogue,
        colonne: string,
        champs: Record<string, unknown>,
        niveau: string
    ): EntreeCatalogue {
        const sensibilite =
            niveau === 'personnel' ? 'Personnel' : niveau === 'confidentiel' ? 'Confidentiel' : texte(champs['sensitivity']) || 'Public';
        return entree({
            type: 'column',
            id: source.id + '.' + colonne,
            titre: colonne,
            sousTitre: 'dans ' + source.name,
            description: texte(champs['description']),
            domaine: table.domaine,
            proprietaire: table.proprietaire,
            sensibilite: sensibiliteDe(sensibilite),
            validation: champs['description'] ? 'ok' : null,
            etiquettes: [texte(champs['technicalType'])].filter(Boolean),
            motsCles: [source.name],
            lien: '/dictionnaire',
            fraicheur: table.fraicheur
        });
    }

    /** Objets métier, attributs, termes, actifs, périmètres, listes de valeurs, règles, tableaux de bord, séries, rapprochements. */
    private entreesGouvernance(etat: EtatApplication, sources: DocumentSource[], regles: RegleResumee[]): EntreeCatalogue[] {
        const nomSource = new Map(sources.map(source => [source.id!, source.name]));
        return [
            ...(etat.governance.businessObjects as Element[]).flatMap(objet => this.entreesObjetMetier(objet)),
            ...(etat.governance.glossary as Element[]).map(entreeTerme),
            ...(etat.governance.assets as Element[]).map(entreeActif),
            ...(etat.governance.perimeters as Element[]).map(entreePerimetre),
            ...(etat.governance.valueLists as Element[]).map(entreeListeValeurs),
            ...liste<Element>(etat['dashboards']).map(entreeTableauDeBord),
            ...liste<Element>(etat.governance['series']).map(entreeSerie),
            ...liste<Element>(etat['linkages']).map(entreeRapprochement),
            ...regles.map(regle => entreeRegle(regle, nomSource.get(regle.sourceId) || regle.sourceId))
        ];
    }

    /** Un objet métier puis chacun de ses attributs (qui héritent du domaine et, à défaut, du propriétaire). */
    private entreesObjetMetier(objet: Element): EntreeCatalogue[] {
        const attributs = liste<Element>(objet['elements']);
        const domaine = texte(objet['domain']) || '—';
        const objetCatalogue = entree({
            type: 'bo',
            id: objet.id,
            titre: texte(objet['name']),
            sousTitre: `${attributs.length} attribut(s)`,
            description: texte(objet['definition']),
            domaine,
            proprietaire: texte(objet['globalOwner']),
            validation: validationDe(objet['status']),
            etiquettes: ['objet métier'],
            motsCles: attributs.map(attribut => texte(attribut['name'])),
            lien: '/objets-metier'
        });
        const attributsCatalogue = attributs.map(attribut =>
            entree({
                type: 'attr',
                id: objet.id + '.' + attribut.id,
                titre: texte(attribut['name']),
                sousTitre: 'attribut de ' + texte(objet['name']),
                description: texte(attribut['definition']),
                domaine,
                proprietaire: texte(attribut['owner']) || texte(objet['globalOwner']),
                sensibilite: sensibiliteDe(attribut['sensitivity']),
                validation: attribut['definition'] ? 'ok' : null,
                etiquettes: ['attribut métier', ...(texte(attribut['term']) ? ['📖 ' + texte(attribut['term'])] : [])],
                motsCles: liste<{ table: string; col: string }>(attribut['mappings']).map(
                    correspondance => correspondance.table + '.' + correspondance.col
                ),
                lien: '/objets-metier'
            })
        );
        return [objetCatalogue, ...attributsCatalogue];
    }
}

/** Complète une fiche partielle avec les valeurs par défaut : pas de domaine, de propriétaire, de qualité ni de sensibilité. */
function entree(
    partiel: Pick<EntreeCatalogue, 'type' | 'id' | 'titre' | 'sousTitre' | 'description' | 'lien'> & Partial<EntreeCatalogue>
): EntreeCatalogue {
    return {
        domaine: '—',
        proprietaire: '',
        qualite: null,
        sensibilite: null,
        validation: null,
        etiquettes: [],
        motsCles: [],
        fraicheur: null,
        ...partiel
    };
}

function entreeTerme(terme: Element): EntreeCatalogue {
    return entree({
        type: 'term',
        id: terme.id,
        titre: texte(terme['term']),
        sousTitre: texte(terme['domain']),
        description: texte(terme['definition']),
        domaine: texte(terme['domain']) || '—',
        proprietaire: texte(terme['owner']),
        validation: terme['definition'] ? 'ok' : null,
        etiquettes: ['glossaire', texte(terme['synonyms'])].filter(Boolean),
        lien: '/glossaire'
    });
}

function entreeActif(actif: Element): EntreeCatalogue {
    return entree({
        type: 'asset',
        id: actif.id,
        titre: texte(actif['name']),
        sousTitre: actif['kind'] === 'process' ? 'Processus' : actif['kind'] === 'report' ? 'Restitution' : 'Application',
        description: texte(actif['description']),
        domaine: texte(actif['domain']) || '—',
        proprietaire: texte(actif['owner']),
        etiquettes: [texte(actif['kind']), texte(actif['criticality'])].filter(Boolean),
        motsCles: [...liste<string>(actif['sources']), ...liste<string>(actif['tables'])],
        lien: '/actifs'
    });
}

function entreePerimetre(perimetre: Element): EntreeCatalogue {
    return entree({
        type: 'perimeter',
        id: perimetre.id,
        titre: texte(perimetre['name']),
        sousTitre: `${liste(perimetre['tables']).length} table(s)`,
        description: texte(perimetre['description']),
        domaine: texte(perimetre['name']),
        etiquettes: ['périmètre'],
        motsCles: liste<string>(perimetre['tables']),
        lien: '/perimetres'
    });
}

function entreeListeValeurs(listeValeurs: Element): EntreeCatalogue {
    const valeurs = liste<{ code: string; label: string }>(listeValeurs['values']);
    return entree({
        type: 'valuelist',
        id: listeValeurs.id,
        titre: texte(listeValeurs['name']),
        sousTitre: listeValeurs['kind'] === 'table' ? 'référentiel : ' + texte(listeValeurs['srcTable']) : `${valeurs.length} code(s)`,
        description: texte(listeValeurs['description']),
        etiquettes: ['liste de valeurs'],
        motsCles: valeurs.slice(0, 50).flatMap(valeur => [valeur.code, valeur.label]),
        lien: '/listes-de-valeurs'
    });
}

function entreeTableauDeBord(tableau: Element): EntreeCatalogue {
    const tuiles = liste<Element>(tableau['tiles']);
    return entree({
        type: 'report',
        id: tableau.id,
        titre: texte(tableau['name']),
        sousTitre: `${tuiles.length} tuile(s)`,
        description: tuiles.map(tuile => texte(tuile['title'])).join(', '),
        etiquettes: ['tableau de bord'],
        motsCles: tuiles.map(tuile => texte(tuile['table'])),
        lien: '/tableaux-de-bord'
    });
}

function entreeSerie(serie: Element): EntreeCatalogue {
    return entree({
        type: 'series',
        id: serie.id,
        titre: texte(serie['name']),
        sousTitre: texte(serie['table']),
        description: `clé ${liste<string>(serie['keyCols']).join(' + ')} · horodatage ${texte(serie['tsCol'])}`,
        etiquettes: ['série temporelle'],
        lien: '/series-temporelles'
    });
}

function entreeRapprochement(rapprochement: Element): EntreeCatalogue {
    return entree({
        type: 'linkage',
        id: rapprochement.id,
        titre: texte(rapprochement['name']),
        sousTitre: `${texte(rapprochement['a'])} ↔ ${texte(rapprochement['b'])}`,
        description: '',
        etiquettes: ['rapprochement'],
        lien: '/rapprochement'
    });
}

function entreeRegle(regle: RegleResumee, nomSource: string): EntreeCatalogue {
    return entree({
        type: 'rule',
        id: regle.id,
        titre: regle.nom,
        sousTitre: nomSource + ' · ' + regle.colonne,
        description: `${regle.type} — criticité ${regle.criticite}`,
        qualite: regle.taux,
        etiquettes: ['règle'],
        lien: '/qualite',
        fraicheur: regle.executeLe
    });
}
