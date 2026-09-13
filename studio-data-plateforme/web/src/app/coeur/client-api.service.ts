/**
 * Client de l'API : une méthode par route, typée, avec les mêmes noms qu'en base et dans l'API.
 * Les composants n'appellent jamais HttpClient directement ; ils passent par ce service.
 *
 * L'intercepteur `intercepteurErreursApi` transforme toute réponse d'erreur { erreur } en Error dont le
 * message est affichable tel quel, et renvoie vers la page de connexion sur 401.
 */
import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, throwError } from 'rxjs';
import {
    Cockpit,
    ApercuPreparation,
    ExecutionPreparation,
    Ligne360,
    ParametresStatistiques,
    RecettePreparation,
    RelancePreparations,
    ResultatStatistiques,
    VocabulairePreparation,
    Voisins360,
    Actif,
    Alerte,
    AnalyseImpact,
    Contrat,
    Derive,
    EtatSurveillance,
    FiltresCatalogue,
    Instantane,
    RapportImport,
    ResultatCatalogue,
    ResultatDelta,
    ResultatReconciliationSources,
    VerificationContrat,
    AnalyseSerie,
    ApercuExtraction,
    ConfigurationSerie,
    PaireCandidate,
    ParametresComparaison,
    Rapprochement,
    ResultatComparaison,
    ResultatTuile,
    TableauDeBord,
    VocabulaireExploitation,
    BilanSynchronisation,
    CarteFlux,
    Flux,
    Graphe,
    LienFlux,
    NoeudFlux,
    ResultatReconciliation,
    VocabulaireLineage,
    ActionEntreeZip,
    AuditObjet,
    AuditQualite,
    BilanZip,
    EntreeLivraisonZip,
    FichierDepose,
    LigneCouverture,
    MesureRelation,
    OptionsLectureCsv,
    RegleLien,
    ResultatRegleLien,
    VocabulaireImportation,
    VocabulaireReglesLiens,
    ParametresAdresse,
    ParametresCouverture,
    ResultatImport,
    FiltreAudit,
    GenreAnomalie,
    PageLignes,
    ProfilCle,
    LignesEnDouble,
    ResultatProfilCle,
    Classification,
    ColonnePersonnelle,
    ControleListe,
    DefinitionProposition,
    ListeValeurs,
    ObjetMetier,
    Perimetre,
    Personne,
    Proposition,
    VocabulaireGouvernance,
    Contribution,
    RapportEcarts,
    Recette,
    TableConcue,
    VocabulaireTablesConcues,
    BilanExtraction,
    DefinitionRegle,
    DetailColonne,
    ExecutionRegles,
    EntreeJournal,
    Espace,
    FicheDictionnaire,
    Identite,
    Membre,
    ModeleExtraction,
    Materialisation,
    ProfilSource,
    PropositionLien,
    RegleQualite,
    Relation,
    ResultatDoublons,
    ResultatSql,
    RoleEspace,
    RoleGlobal,
    Sante,
    Source,
    SpecificationExtraction,
    TermeGlossaire,
    Utilisateur,
    VocabulaireExtraction,
    VocabulaireQualite
} from './modeles';

export class ErreurApi extends Error {
    constructor(
        message: string,
        readonly statut: number
    ) {
        super(message);
    }
}

export const intercepteurErreursApi: HttpInterceptorFn = (requete, suivant) => {
    const routeur = inject(Router);
    return suivant(requete).pipe(
        catchError((reponse: HttpErrorResponse) => {
            const message =
                (reponse.error && typeof reponse.error === 'object' && (reponse.error as { erreur?: string }).erreur) ||
                (reponse.status === 0 ? 'Serveur injoignable.' : `Erreur ${reponse.status}`);
            if (reponse.status === 401 && !requete.url.endsWith('/auth/connexion') && !requete.url.endsWith('/auth/moi')) {
                routeur.navigate(['/connexion']);
            }
            return throwError(() => new ErreurApi(message, reponse.status));
        })
    );
};

@Injectable({ providedIn: 'root' })
export class ClientApiService {
    private readonly http = inject(HttpClient);
    private readonly racine = '/api';

    // ---- authentification et session ----
    moi(): Promise<Identite> {
        return firstValueFrom(this.http.get<Identite>(`${this.racine}/auth/moi`));
    }
    connexion(identifiant: string, motDePasse: string): Promise<Identite> {
        return firstValueFrom(this.http.post<Identite>(`${this.racine}/auth/connexion`, { identifiant, motDePasse }));
    }
    deconnexion(): Promise<unknown> {
        return firstValueFrom(this.http.post(`${this.racine}/auth/deconnexion`, {}));
    }
    changerEspaceCourant(code: string): Promise<Identite> {
        return firstValueFrom(this.http.put<Identite>(`${this.racine}/auth/espace-courant`, { code }));
    }
    changerMotDePasse(ancien: string, nouveau: string): Promise<unknown> {
        return firstValueFrom(this.http.put(`${this.racine}/auth/mot-de-passe`, { ancien, nouveau }));
    }

    // ---- santé ----
    cockpit(): Promise<Cockpit> {
        return firstValueFrom(this.http.get<Cockpit>(`${this.racine}/cockpit`));
    }
    sante(): Promise<Sante> {
        return firstValueFrom(this.http.get<Sante>(`${this.racine}/sante`));
    }

    // ---- SQL ----
    sql(sql: string): Promise<ResultatSql> {
        return firstValueFrom(this.http.post<ResultatSql>(`${this.racine}/sql`, { sql }));
    }

    // ---- fichiers : dépôt avec progression ----
    deposerFichier(nom: string, fichier: File): Observable<HttpEvent<unknown>> {
        return this.http.put(`${this.racine}/fichiers/${encodeURIComponent(nom)}`, fichier, {
            headers: { 'content-type': 'application/octet-stream' },
            reportProgress: true,
            observe: 'events'
        });
    }

    // ---- sources ----
    sources(): Promise<Source[]> {
        return firstValueFrom(this.http.get<Source[]>(`${this.racine}/tables`));
    }
    enregistrerSource(id: string, document: Omit<Source, 'id'>): Promise<unknown> {
        return firstValueFrom(this.http.put(`${this.racine}/tables/${encodeURIComponent(id)}`, document));
    }
    supprimerSource(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/tables/${encodeURIComponent(id)}`));
    }
    optimiserSource(id: string): Promise<{ fichier: string; taille: number }> {
        return firstValueFrom(
            this.http.post<{ fichier: string; taille: number }>(`${this.racine}/tables/${encodeURIComponent(id)}/optimiser`, {})
        );
    }

    // ---- importation (le fichier est d'abord déposé par deposerFichier) ----
    importerFichier(fichier: FichierDepose, sourceId?: string): Promise<ResultatImport> {
        return firstValueFrom(
            this.http.post<ResultatImport>(`${this.racine}/importation/fichier`, { ...fichier, ...(sourceId ? { sourceId } : {}) })
        );
    }
    vocabulaireImportation(): Promise<VocabulaireImportation> {
        return firstValueFrom(this.http.get<VocabulaireImportation>(`${this.racine}/importation/vocabulaire`));
    }
    relireSource(sourceId: string, config: OptionsLectureCsv): Promise<ResultatImport> {
        return firstValueFrom(this.http.post<ResultatImport>(`${this.racine}/importation/relire`, { sourceId, config }));
    }
    feuillesExcel(nomServeur: string): Promise<string[]> {
        return firstValueFrom(this.http.post<string[]>(`${this.racine}/importation/excel/feuilles`, { nomServeur }));
    }
    fusionnerSources(parametres: {
        nom: string;
        fichiers: FichierDepose[];
        sourceIds: string[];
        retirerOrigines: boolean;
    }): Promise<ResultatImport> {
        return firstValueFrom(this.http.post<ResultatImport>(`${this.racine}/importation/fusion`, parametres));
    }
    importerDepuisAdresse(parametres: ParametresAdresse): Promise<ResultatImport> {
        return firstValueFrom(this.http.post<ResultatImport>(`${this.racine}/importation/adresse`, parametres));
    }
    inventaireZip(nomServeur: string): Promise<EntreeLivraisonZip[]> {
        return firstValueFrom(this.http.post<EntreeLivraisonZip[]>(`${this.racine}/importation/zip/inventaire`, { nomServeur }));
    }
    importerZip(nomServeur: string, choix: { nom: string; action: ActionEntreeZip; nomSource?: string }[]): Promise<BilanZip> {
        return firstValueFrom(this.http.post<BilanZip>(`${this.racine}/importation/zip/importer`, { nomServeur, choix }));
    }
    couverture(parametres: ParametresCouverture): Promise<LigneCouverture[]> {
        return firstValueFrom(this.http.post<LigneCouverture[]>(`${this.racine}/exploitation/couverture`, parametres));
    }

    // ---- gouvernance ----
    glossaire(): Promise<TermeGlossaire[]> {
        return firstValueFrom(this.http.get<TermeGlossaire[]>(`${this.racine}/gouvernance/glossaire`));
    }
    enregistrerTerme(id: string, terme: Omit<TermeGlossaire, 'id'>): Promise<TermeGlossaire> {
        return firstValueFrom(this.http.put<TermeGlossaire>(`${this.racine}/gouvernance/glossaire/${encodeURIComponent(id)}`, terme));
    }
    supprimerTerme(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/glossaire/${encodeURIComponent(id)}`));
    }
    dictionnaire(): Promise<Record<string, FicheDictionnaire>> {
        return firstValueFrom(this.http.get<Record<string, FicheDictionnaire>>(`${this.racine}/gouvernance/dictionnaire`));
    }
    enregistrerFiche(source: string, fiche: FicheDictionnaire): Promise<FicheDictionnaire> {
        return firstValueFrom(
            this.http.put<FicheDictionnaire>(`${this.racine}/gouvernance/dictionnaire/${encodeURIComponent(source)}`, fiche)
        );
    }

    // ---- modèle de données ----
    relations(): Promise<Relation[]> {
        return firstValueFrom(this.http.get<Relation[]>(`${this.racine}/modele/relations`));
    }
    ajouterRelation(relation: Omit<Relation, 'id' | 'sourceId' | 'targetId'>): Promise<{ ajoute: boolean; relations: Relation[] }> {
        return firstValueFrom(this.http.post<{ ajoute: boolean; relations: Relation[] }>(`${this.racine}/modele/relations`, relation));
    }
    supprimerRelation(id: string): Promise<Relation[]> {
        return firstValueFrom(this.http.delete<Relation[]>(`${this.racine}/modele/relations/${encodeURIComponent(id)}`));
    }
    modifierRelation(id: string, changements: { cardinality?: string; kind?: string }): Promise<Relation[]> {
        return firstValueFrom(this.http.put<Relation[]>(`${this.racine}/modele/relations/${encodeURIComponent(id)}`, changements));
    }
    mesurerRelation(id: string): Promise<MesureRelation> {
        return firstValueFrom(this.http.post<MesureRelation>(`${this.racine}/modele/relations/${encodeURIComponent(id)}/mesurer`, {}));
    }
    vocabulaireReglesLiens(): Promise<VocabulaireReglesLiens> {
        return firstValueFrom(this.http.get<VocabulaireReglesLiens>(`${this.racine}/modele/regles/vocabulaire`));
    }
    reglesLiens(): Promise<RegleLien[]> {
        return firstValueFrom(this.http.get<RegleLien[]>(`${this.racine}/modele/regles`));
    }
    ecrireRegleLien(regle: RegleLien): Promise<RegleLien[]> {
        // Le libellé calculé n'est pas renvoyé : le serveur le recalcule.
        const corps = { ...regle, id: undefined, libelle: undefined };
        return firstValueFrom(this.http.put<RegleLien[]>(`${this.racine}/modele/regles/${encodeURIComponent(regle.id)}`, corps));
    }
    supprimerRegleLien(id: string): Promise<RegleLien[]> {
        return firstValueFrom(this.http.delete<RegleLien[]>(`${this.racine}/modele/regles/${encodeURIComponent(id)}`));
    }
    testerRegleLien(id: string): Promise<ResultatRegleLien> {
        return firstValueFrom(this.http.post<ResultatRegleLien>(`${this.racine}/modele/regles/${encodeURIComponent(id)}/tester`, {}));
    }
    lignesRegleLien(id: string, offset: number): Promise<PageLignes> {
        return firstValueFrom(
            this.http.get<PageLignes>(`${this.racine}/modele/regles/${encodeURIComponent(id)}/lignes`, {
                params: { offset: String(offset) }
            })
        );
    }
    detecterRelations(): Promise<PropositionLien[]> {
        return firstValueFrom(this.http.post<PropositionLien[]>(`${this.racine}/modele/relations/detecter`, {}));
    }

    // ---- extraction ----
    vocabulaireExtraction(): Promise<VocabulaireExtraction> {
        return firstValueFrom(this.http.get<VocabulaireExtraction>(`${this.racine}/extraction/vocabulaire`));
    }
    apercuExtraction(specification: SpecificationExtraction, limite = 200): Promise<ApercuExtraction> {
        return firstValueFrom(this.http.post<ApercuExtraction>(`${this.racine}/extraction/apercu`, { specification, limite }));
    }
    compterExtraction(specification: SpecificationExtraction): Promise<{ total: number }> {
        return firstValueFrom(this.http.post<{ total: number }>(`${this.racine}/extraction/compter`, specification));
    }
    bilanExtraction(specification: SpecificationExtraction): Promise<BilanExtraction> {
        return firstValueFrom(this.http.post<BilanExtraction>(`${this.racine}/extraction/bilan`, specification));
    }
    materialiserExtraction(specification: SpecificationExtraction, nom: string): Promise<Materialisation> {
        return firstValueFrom(this.http.post<Materialisation>(`${this.racine}/extraction/materialiser`, { specification, nom }));
    }
    exporterExtractionCsv(specification: SpecificationExtraction, nomFichier: string): Promise<Blob> {
        return firstValueFrom(
            this.http.post(`${this.racine}/extraction/export.csv`, { specification, nomFichier }, { responseType: 'blob' })
        );
    }
    modelesExtraction(): Promise<ModeleExtraction[]> {
        return firstValueFrom(this.http.get<ModeleExtraction[]>(`${this.racine}/extraction/modeles`));
    }
    enregistrerModeleExtraction(
        id: string,
        modele: { nom: string; description: string; specification: SpecificationExtraction }
    ): Promise<ModeleExtraction> {
        return firstValueFrom(this.http.put<ModeleExtraction>(`${this.racine}/extraction/modeles/${encodeURIComponent(id)}`, modele));
    }
    supprimerModeleExtraction(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/extraction/modeles/${encodeURIComponent(id)}`));
    }

    // ---- qualité ----
    vocabulaireQualite(): Promise<VocabulaireQualite> {
        return firstValueFrom(this.http.get<VocabulaireQualite>(`${this.racine}/qualite/vocabulaire`));
    }
    profilerSource(sourceId: string, filtres: FiltreAudit[] = [], echantillon?: number): Promise<ProfilSource> {
        return firstValueFrom(
            this.http.post<ProfilSource>(`${this.racine}/qualite/profil`, { sourceId, filtres, ...(echantillon ? { echantillon } : {}) })
        );
    }
    detailColonne(sourceId: string, colonne: string, filtres: FiltreAudit[] = [], echantillon?: number): Promise<DetailColonne> {
        return firstValueFrom(
            this.http.post<DetailColonne>(`${this.racine}/qualite/colonne`, {
                sourceId,
                colonne,
                filtres,
                ...(echantillon ? { echantillon } : {})
            })
        );
    }
    lignesAnomalie(
        sourceId: string,
        genre: GenreAnomalie,
        colonne: string,
        offset: number,
        filtres: FiltreAudit[] = []
    ): Promise<PageLignes> {
        return firstValueFrom(
            this.http.post<PageLignes>(`${this.racine}/qualite/anomalies/lignes`, { sourceId, genre, colonne, offset, filtres })
        );
    }
    chercherDoublons(sourceId: string, cle: string[], filtres: FiltreAudit[] = []): Promise<ResultatDoublons> {
        return firstValueFrom(this.http.post<ResultatDoublons>(`${this.racine}/qualite/doublons`, { sourceId, cle, filtres }));
    }
    profilsCle(nomSource: string): Promise<ProfilCle[]> {
        return firstValueFrom(this.http.get<ProfilCle[]>(`${this.racine}/qualite/cles/${encodeURIComponent(nomSource)}`));
    }
    enregistrerProfilsCle(nomSource: string, profils: ProfilCle[]): Promise<ProfilCle[]> {
        return firstValueFrom(this.http.put<ProfilCle[]>(`${this.racine}/qualite/cles/${encodeURIComponent(nomSource)}`, { profils }));
    }
    lignesEnDouble(sourceId: string, seuil: number): Promise<LignesEnDouble> {
        return firstValueFrom(this.http.post<LignesEnDouble>(`${this.racine}/qualite/doublons-approches/lignes`, { sourceId, seuil }));
    }
    classeurDoublons(sourceId: string, seuil: number): Promise<Blob> {
        return firstValueFrom(
            this.http.post(`${this.racine}/qualite/doublons-approches/export.xlsx`, { sourceId, seuil }, { responseType: 'blob' })
        );
    }
    doublonsApproches(sourceId: string, seuil: number): Promise<ResultatProfilCle[]> {
        return firstValueFrom(this.http.post<ResultatProfilCle[]>(`${this.racine}/qualite/doublons-approches`, { sourceId, seuil }));
    }
    auditerObjet(objetId: string, filtres: FiltreAudit[] = []): Promise<AuditObjet> {
        return firstValueFrom(this.http.post<AuditObjet>(`${this.racine}/qualite/objet`, { objetId, filtres }));
    }
    lignesRegle(id: string, offset: number): Promise<PageLignes> {
        return firstValueFrom(
            this.http.get<PageLignes>(`${this.racine}/qualite/regles/${encodeURIComponent(id)}/lignes`, {
                params: { offset: String(offset) }
            })
        );
    }
    reglesQualite(sourceId?: string): Promise<RegleQualite[]> {
        return firstValueFrom(this.http.get<RegleQualite[]>(`${this.racine}/qualite/regles`, { params: sourceId ? { sourceId } : {} }));
    }
    creerRegleQualite(definition: DefinitionRegle): Promise<RegleQualite> {
        return firstValueFrom(this.http.post<RegleQualite>(`${this.racine}/qualite/regles`, definition));
    }
    modifierRegleQualite(id: string, definition: DefinitionRegle): Promise<RegleQualite> {
        return firstValueFrom(this.http.put<RegleQualite>(`${this.racine}/qualite/regles/${encodeURIComponent(id)}`, definition));
    }
    supprimerRegleQualite(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/qualite/regles/${encodeURIComponent(id)}`));
    }
    executerReglesQualite(sourceId?: string): Promise<ExecutionRegles> {
        return firstValueFrom(this.http.post<ExecutionRegles>(`${this.racine}/qualite/regles/executer`, sourceId ? { sourceId } : {}));
    }
    executerUneRegle(id: string): Promise<ExecutionRegles['regles'][number]> {
        return firstValueFrom(
            this.http.post<ExecutionRegles['regles'][number]>(`${this.racine}/qualite/regles/${encodeURIComponent(id)}/executer`, {})
        );
    }
    dupliquerRegleQualite(id: string): Promise<RegleQualite> {
        return firstValueFrom(this.http.post<RegleQualite>(`${this.racine}/qualite/regles/${encodeURIComponent(id)}/dupliquer`, {}));
    }
    auditsQualite(sourceId?: string, limite = 100): Promise<AuditQualite[]> {
        return firstValueFrom(
            this.http.get<AuditQualite[]>(`${this.racine}/qualite/audits`, {
                params: { limite: String(limite), ...(sourceId ? { sourceId } : {}) }
            })
        );
    }

    // ---- tables conçues ----
    vocabulaireTablesConcues(): Promise<VocabulaireTablesConcues> {
        return firstValueFrom(this.http.get<VocabulaireTablesConcues>(`${this.racine}/tables-concues/vocabulaire`));
    }
    tablesConcues(): Promise<TableConcue[]> {
        return firstValueFrom(this.http.get<TableConcue[]>(`${this.racine}/tables-concues`));
    }
    sqlTableConcue(recette: Recette): Promise<{ sql: string }> {
        return firstValueFrom(this.http.post<{ sql: string }>(`${this.racine}/tables-concues/sql`, recette));
    }
    apercuTableConcue(recette: Recette, limite = 50): Promise<ResultatSql> {
        return firstValueFrom(this.http.post<ResultatSql>(`${this.racine}/tables-concues/apercu`, { recette, limite }));
    }
    construireTableConcue(recette: Recette): Promise<TableConcue> {
        return firstValueFrom(this.http.post<TableConcue>(`${this.racine}/tables-concues/construire`, recette));
    }
    reconstruireTableConcue(id: string): Promise<TableConcue> {
        return firstValueFrom(this.http.post<TableConcue>(`${this.racine}/tables-concues/${encodeURIComponent(id)}/reconstruire`, {}));
    }
    reconstruireTablesDependantes(nomSource: string): Promise<{ reconstruites: string[]; erreurs: { table: string; erreur: string }[] }> {
        return firstValueFrom(
            this.http.post<{ reconstruites: string[]; erreurs: { table: string; erreur: string }[] }>(
                `${this.racine}/tables-concues/reconstruire-dependantes`,
                { nomSource }
            )
        );
    }
    ecartsTableConcue(id: string, limite = 1500): Promise<RapportEcarts> {
        return firstValueFrom(
            this.http.get<RapportEcarts>(`${this.racine}/tables-concues/${encodeURIComponent(id)}/ecarts`, {
                params: { limite: String(limite) }
            })
        );
    }
    contributionsTableConcue(id: string): Promise<Contribution[]> {
        return firstValueFrom(this.http.get<Contribution[]>(`${this.racine}/tables-concues/${encodeURIComponent(id)}/contributions`));
    }

    // ---- gouvernance : référentiels ----
    vocabulaireGouvernance(): Promise<VocabulaireGouvernance> {
        return firstValueFrom(this.http.get<VocabulaireGouvernance>(`${this.racine}/gouvernance/vocabulaire`));
    }
    objetsMetier(): Promise<ObjetMetier[]> {
        return firstValueFrom(this.http.get<ObjetMetier[]>(`${this.racine}/gouvernance/objets-metier`));
    }
    enregistrerObjetMetier(id: string, objet: Omit<ObjetMetier, 'id'>): Promise<ObjetMetier> {
        return firstValueFrom(this.http.put<ObjetMetier>(`${this.racine}/gouvernance/objets-metier/${encodeURIComponent(id)}`, objet));
    }
    supprimerObjetMetier(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/objets-metier/${encodeURIComponent(id)}`));
    }
    actifs(): Promise<Actif[]> {
        return firstValueFrom(this.http.get<Actif[]>(`${this.racine}/gouvernance/actifs`));
    }
    enregistrerActif(id: string, actif: Omit<Actif, 'id'>): Promise<Actif> {
        return firstValueFrom(this.http.put<Actif>(`${this.racine}/gouvernance/actifs/${encodeURIComponent(id)}`, actif));
    }
    supprimerActif(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/actifs/${encodeURIComponent(id)}`));
    }
    perimetres(): Promise<Perimetre[]> {
        return firstValueFrom(this.http.get<Perimetre[]>(`${this.racine}/gouvernance/perimetres`));
    }
    enregistrerPerimetre(id: string, perimetre: Omit<Perimetre, 'id'>): Promise<Perimetre> {
        return firstValueFrom(this.http.put<Perimetre>(`${this.racine}/gouvernance/perimetres/${encodeURIComponent(id)}`, perimetre));
    }
    supprimerPerimetre(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/perimetres/${encodeURIComponent(id)}`));
    }
    personnes(): Promise<Personne[]> {
        return firstValueFrom(this.http.get<Personne[]>(`${this.racine}/gouvernance/personnes`));
    }
    enregistrerPersonne(id: string, personne: Omit<Personne, 'id'>): Promise<Personne> {
        return firstValueFrom(this.http.put<Personne>(`${this.racine}/gouvernance/personnes/${encodeURIComponent(id)}`, personne));
    }
    supprimerPersonne(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/personnes/${encodeURIComponent(id)}`));
    }
    domaines(): Promise<string[]> {
        return firstValueFrom(this.http.get<string[]>(`${this.racine}/gouvernance/domaines`));
    }
    ajouterDomaine(name: string): Promise<string[]> {
        return firstValueFrom(this.http.post<string[]>(`${this.racine}/gouvernance/domaines`, { name }));
    }
    retirerDomaine(name: string): Promise<string[]> {
        return firstValueFrom(this.http.delete<string[]>(`${this.racine}/gouvernance/domaines/${encodeURIComponent(name)}`));
    }

    // ---- gouvernance : listes de valeurs ----
    listesValeurs(): Promise<ListeValeurs[]> {
        return firstValueFrom(this.http.get<ListeValeurs[]>(`${this.racine}/gouvernance/listes-de-valeurs`));
    }
    enregistrerListeValeurs(id: string, liste: Omit<ListeValeurs, 'id' | 'utilisations'>): Promise<ListeValeurs> {
        return firstValueFrom(this.http.put<ListeValeurs>(`${this.racine}/gouvernance/listes-de-valeurs/${encodeURIComponent(id)}`, liste));
    }
    supprimerListeValeurs(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/listes-de-valeurs/${encodeURIComponent(id)}`));
    }
    apercuListeValeurs(id: string): Promise<{ codes: string[]; total: number }> {
        return firstValueFrom(
            this.http.post<{ codes: string[]; total: number }>(
                `${this.racine}/gouvernance/listes-de-valeurs/${encodeURIComponent(id)}/apercu`,
                {}
            )
        );
    }
    controlerListeValeurs(id: string, table: string, col: string): Promise<ControleListe> {
        return firstValueFrom(
            this.http.post<ControleListe>(`${this.racine}/gouvernance/listes-de-valeurs/${encodeURIComponent(id)}/controler`, {
                table,
                col
            })
        );
    }
    rattacherListeValeurs(id: string, table: string, col: string): Promise<{ utilisations: { table: string; col: string }[] }> {
        return firstValueFrom(
            this.http.put<{ utilisations: { table: string; col: string }[] }>(
                `${this.racine}/gouvernance/listes-de-valeurs/${encodeURIComponent(id)}/rattacher`,
                { table, col }
            )
        );
    }
    detacherListeValeurs(id: string, table: string, col: string): Promise<{ utilisations: { table: string; col: string }[] }> {
        return firstValueFrom(
            this.http.post<{ utilisations: { table: string; col: string }[] }>(
                `${this.racine}/gouvernance/listes-de-valeurs/${encodeURIComponent(id)}/detacher`,
                { table, col }
            )
        );
    }

    // ---- gouvernance : sensibilité ----
    classification(): Promise<Classification> {
        return firstValueFrom(this.http.get<Classification>(`${this.racine}/gouvernance/sensibilite`));
    }
    definirNiveauSensibilite(table: string, col: string, niveau: string): Promise<unknown> {
        return firstValueFrom(this.http.put(`${this.racine}/gouvernance/sensibilite/niveau`, { table, col, niveau }));
    }
    definirActionsSensibilite(actions: Record<string, string>): Promise<Record<string, string>> {
        return firstValueFrom(this.http.put<Record<string, string>>(`${this.racine}/gouvernance/sensibilite/actions`, { actions }));
    }
    detecterDonneesPersonnelles(): Promise<ColonnePersonnelle[]> {
        return firstValueFrom(this.http.post<ColonnePersonnelle[]>(`${this.racine}/gouvernance/sensibilite/detecter`, {}));
    }

    // ---- gouvernance : propositions ----
    propositions(): Promise<Proposition[]> {
        return firstValueFrom(this.http.get<Proposition[]>(`${this.racine}/gouvernance/propositions`));
    }
    proposer(proposition: DefinitionProposition): Promise<Proposition> {
        return firstValueFrom(this.http.post<Proposition>(`${this.racine}/gouvernance/propositions`, proposition));
    }
    accepterProposition(id: string, comment = ''): Promise<Proposition> {
        return firstValueFrom(
            this.http.post<Proposition>(`${this.racine}/gouvernance/propositions/${encodeURIComponent(id)}/accepter`, { comment })
        );
    }
    refuserProposition(id: string, comment = ''): Promise<Proposition> {
        return firstValueFrom(
            this.http.post<Proposition>(`${this.racine}/gouvernance/propositions/${encodeURIComponent(id)}/refuser`, { comment })
        );
    }
    retirerProposition(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/gouvernance/propositions/${encodeURIComponent(id)}`));
    }

    // ---- lineage ----
    vocabulaireLineage(): Promise<VocabulaireLineage> {
        return firstValueFrom(this.http.get<VocabulaireLineage>(`${this.racine}/lineage/vocabulaire`));
    }
    carteFlux(): Promise<CarteFlux> {
        return firstValueFrom(this.http.get<CarteFlux>(`${this.racine}/lineage/flux`));
    }
    synchroniserFlux(): Promise<BilanSynchronisation> {
        return firstValueFrom(this.http.post<BilanSynchronisation>(`${this.racine}/lineage/flux/synchroniser`, {}));
    }
    definirOptionsFlux(options: Partial<Pick<Flux, 'threshold' | 'showObjects' | 'hideSources' | 'grain'>>): Promise<Flux> {
        return firstValueFrom(this.http.put<Flux>(`${this.racine}/lineage/flux/options`, options));
    }
    enregistrerNoeudFlux(id: string, noeud: Partial<NoeudFlux> & { name: string }): Promise<NoeudFlux> {
        return firstValueFrom(this.http.put<NoeudFlux>(`${this.racine}/lineage/flux/noeuds/${encodeURIComponent(id)}`, noeud));
    }
    supprimerNoeudFlux(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/lineage/flux/noeuds/${encodeURIComponent(id)}`));
    }
    enregistrerLienFlux(id: string, lien: Partial<LienFlux> & { source: string; target: string }): Promise<LienFlux> {
        return firstValueFrom(this.http.put<LienFlux>(`${this.racine}/lineage/flux/liens/${encodeURIComponent(id)}`, lien));
    }
    supprimerLienFlux(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/lineage/flux/liens/${encodeURIComponent(id)}`));
    }
    reconcilierLien(id: string): Promise<ResultatReconciliation> {
        return firstValueFrom(
            this.http.post<ResultatReconciliation>(`${this.racine}/lineage/flux/liens/${encodeURIComponent(id)}/reconcilier`, {})
        );
    }
    parcoursAttribut(boId: string, elId: string): Promise<Graphe> {
        return firstValueFrom(this.http.get<Graphe>(`${this.racine}/lineage/attribut`, { params: { boId, elId } }));
    }
    lineageTable(nom: string): Promise<Graphe> {
        return firstValueFrom(this.http.get<Graphe>(`${this.racine}/lineage/table/${encodeURIComponent(nom)}`));
    }

    // ---- exploitation ----
    // ---- statistiques et explorateur 360° ----
    statistiques(parametres: ParametresStatistiques): Promise<ResultatStatistiques> {
        return firstValueFrom(this.http.post<ResultatStatistiques>(`${this.racine}/exploitation/statistiques`, parametres));
    }
    rechercher360(table: string, colonne: string, valeur: string): Promise<Ligne360[]> {
        return firstValueFrom(this.http.post<Ligne360[]>(`${this.racine}/exploitation/explorer-360`, { table, colonne, valeur }));
    }
    voisins360(table: string, ligne: Ligne360): Promise<Voisins360[]> {
        return firstValueFrom(this.http.post<Voisins360[]>(`${this.racine}/exploitation/explorer-360/voisins`, { table, ligne }));
    }

    // ---- préparation (recettes de nettoyage) ----
    vocabulairePreparation(): Promise<VocabulairePreparation> {
        return firstValueFrom(this.http.get<VocabulairePreparation>(`${this.racine}/preparation/vocabulaire`));
    }
    recettesPreparation(): Promise<RecettePreparation[]> {
        return firstValueFrom(this.http.get<RecettePreparation[]>(`${this.racine}/preparation/recettes`));
    }
    enregistrerRecettePreparation(recette: RecettePreparation): Promise<RecettePreparation> {
        const { id, ...corps } = recette;
        return firstValueFrom(this.http.put<RecettePreparation>(`${this.racine}/preparation/recettes/${encodeURIComponent(id)}`, corps));
    }
    supprimerRecettePreparation(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/preparation/recettes/${encodeURIComponent(id)}`));
    }
    apercuPreparation(id: string, jusquA?: number): Promise<ApercuPreparation> {
        return firstValueFrom(
            this.http.post<ApercuPreparation>(
                `${this.racine}/preparation/recettes/${encodeURIComponent(id)}/apercu`,
                jusquA == null ? {} : { jusquA }
            )
        );
    }
    executerPreparation(id: string): Promise<ExecutionPreparation> {
        return firstValueFrom(
            this.http.post<ExecutionPreparation>(`${this.racine}/preparation/recettes/${encodeURIComponent(id)}/executer`, {})
        );
    }
    executerPreparationsPourSource(nomSource: string): Promise<RelancePreparations> {
        return firstValueFrom(this.http.post<RelancePreparations>(`${this.racine}/preparation/executer-pour-source`, { nomSource }));
    }

    vocabulaireExploitation(): Promise<VocabulaireExploitation> {
        return firstValueFrom(this.http.get<VocabulaireExploitation>(`${this.racine}/exploitation/vocabulaire`));
    }
    tableauxDeBord(): Promise<TableauDeBord[]> {
        return firstValueFrom(this.http.get<TableauDeBord[]>(`${this.racine}/exploitation/tableaux-de-bord`));
    }
    enregistrerTableauDeBord(id: string, tableau: Omit<TableauDeBord, 'id'>): Promise<TableauDeBord> {
        return firstValueFrom(
            this.http.put<TableauDeBord>(`${this.racine}/exploitation/tableaux-de-bord/${encodeURIComponent(id)}`, tableau)
        );
    }
    supprimerTableauDeBord(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/exploitation/tableaux-de-bord/${encodeURIComponent(id)}`));
    }
    executerTableauDeBord(id: string): Promise<ResultatTuile[]> {
        return firstValueFrom(
            this.http.post<ResultatTuile[]>(`${this.racine}/exploitation/tableaux-de-bord/${encodeURIComponent(id)}/executer`, {})
        );
    }
    alertesTableauxDeBord(): Promise<Alerte[]> {
        return firstValueFrom(this.http.post<Alerte[]>(`${this.racine}/exploitation/tableaux-de-bord/alertes`, {}));
    }
    comparer(parametres: ParametresComparaison): Promise<ResultatComparaison> {
        return firstValueFrom(this.http.post<ResultatComparaison>(`${this.racine}/exploitation/comparer`, parametres));
    }
    series(): Promise<ConfigurationSerie[]> {
        return firstValueFrom(this.http.get<ConfigurationSerie[]>(`${this.racine}/exploitation/series`));
    }
    enregistrerSerie(id: string, serie: Omit<ConfigurationSerie, 'id'>): Promise<ConfigurationSerie> {
        return firstValueFrom(this.http.put<ConfigurationSerie>(`${this.racine}/exploitation/series/${encodeURIComponent(id)}`, serie));
    }
    supprimerSerie(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/exploitation/series/${encodeURIComponent(id)}`));
    }
    analyserSerie(id: string): Promise<AnalyseSerie> {
        return firstValueFrom(this.http.post<AnalyseSerie>(`${this.racine}/exploitation/series/${encodeURIComponent(id)}/analyser`, {}));
    }
    rapprochements(): Promise<Rapprochement[]> {
        return firstValueFrom(this.http.get<Rapprochement[]>(`${this.racine}/exploitation/rapprochements`));
    }
    enregistrerRapprochement(id: string, rapprochement: Omit<Rapprochement, 'id'>): Promise<Rapprochement> {
        return firstValueFrom(
            this.http.put<Rapprochement>(`${this.racine}/exploitation/rapprochements/${encodeURIComponent(id)}`, rapprochement)
        );
    }
    supprimerRapprochement(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/exploitation/rapprochements/${encodeURIComponent(id)}`));
    }
    executerRapprochement(id: string): Promise<PaireCandidate[]> {
        return firstValueFrom(
            this.http.post<PaireCandidate[]>(`${this.racine}/exploitation/rapprochements/${encodeURIComponent(id)}/executer`, {})
        );
    }
    deciderPaire(id: string, cle: string, decision: 'ok' | 'ko'): Promise<Rapprochement> {
        return firstValueFrom(
            this.http.post<Rapprochement>(`${this.racine}/exploitation/rapprochements/${encodeURIComponent(id)}/decider`, { cle, decision })
        );
    }
    produireGolden(id: string): Promise<{ liens: string; golden: string; fusions: number }> {
        return firstValueFrom(
            this.http.post<{ liens: string; golden: string; fusions: number }>(
                `${this.racine}/exploitation/rapprochements/${encodeURIComponent(id)}/golden`,
                {}
            )
        );
    }

    // ---- catalogue ----
    catalogue(filtres: FiltresCatalogue): Promise<ResultatCatalogue> {
        const params: Record<string, string> = {};
        if (filtres.q) params['q'] = filtres.q;
        if (filtres.couche) params['couche'] = filtres.couche;
        for (const nom of ['type', 'domaine', 'sensibilite', 'proprietaire'] as const)
            if (filtres[nom]?.length) params[nom] = filtres[nom]!.join(',');
        return firstValueFrom(this.http.get<ResultatCatalogue>(`${this.racine}/catalogue`, { params }));
    }

    // ---- surveillance des sources ----
    etatSurveillance(): Promise<EtatSurveillance[]> {
        return firstValueFrom(this.http.get<EtatSurveillance[]>(`${this.racine}/surveillance`));
    }
    prendreInstantane(nom: string): Promise<{ instantane: Instantane; derive: Derive | null }> {
        return firstValueFrom(
            this.http.post<{ instantane: Instantane; derive: Derive | null }>(
                `${this.racine}/surveillance/${encodeURIComponent(nom)}/instantane`,
                {}
            )
        );
    }
    genererContrat(nom: string): Promise<Contrat> {
        return firstValueFrom(this.http.post<Contrat>(`${this.racine}/surveillance/${encodeURIComponent(nom)}/contrat/generer`, {}));
    }
    enregistrerContrat(nom: string, contrat: Contrat): Promise<Contrat> {
        return firstValueFrom(this.http.put<Contrat>(`${this.racine}/surveillance/${encodeURIComponent(nom)}/contrat`, contrat));
    }
    verifierContrat(nom: string): Promise<VerificationContrat> {
        return firstValueFrom(
            this.http.post<VerificationContrat>(`${this.racine}/surveillance/${encodeURIComponent(nom)}/contrat/verifier`, {})
        );
    }
    figerDonnees(nom: string): Promise<{ ts: number; rows: number }> {
        return firstValueFrom(
            this.http.post<{ ts: number; rows: number }>(`${this.racine}/surveillance/${encodeURIComponent(nom)}/figer`, {})
        );
    }
    calculerDelta(nom: string, cle: string): Promise<ResultatDelta> {
        return firstValueFrom(this.http.post<ResultatDelta>(`${this.racine}/surveillance/${encodeURIComponent(nom)}/delta`, { cle }));
    }
    reconcilierSources(a: string, cleA: string, b: string, cleB: string): Promise<ResultatReconciliationSources> {
        return firstValueFrom(
            this.http.post<ResultatReconciliationSources>(`${this.racine}/surveillance/reconcilier`, { a, cleA, b, cleB })
        );
    }

    // ---- sauvegarde et partage ----
    importerSauvegarde(fichier: unknown): Promise<RapportImport> {
        return firstValueFrom(this.http.post<RapportImport>(`${this.racine}/sauvegarde/import`, fichier));
    }
    /** Adresse de téléchargement d'un export (le navigateur y joint la session). */
    adresseExport(format: 'plateforme' | 'classique'): string {
        return `${this.racine}/sauvegarde/export?telecharger=1${format === 'classique' ? '&format=classique' : ''}`;
    }
    adresseDossier(telecharger: boolean): string {
        return `${this.racine}/sauvegarde/dossier${telecharger ? '?telecharger=1' : ''}`;
    }

    // ---- analyse d'impact ----
    analyseImpact(table: string, colonne?: string): Promise<AnalyseImpact> {
        return firstValueFrom(
            this.http.get<AnalyseImpact>(`${this.racine}/lineage/impact`, { params: { table, ...(colonne ? { col: colonne } : {}) } })
        );
    }

    // ---- journal ----
    journal(limite = 100): Promise<EntreeJournal[]> {
        return firstValueFrom(this.http.get<EntreeJournal[]>(`${this.racine}/journal`, { params: { limite: String(limite) } }));
    }

    // ---- espaces ----
    espaces(): Promise<Espace[]> {
        return firstValueFrom(this.http.get<Espace[]>(`${this.racine}/espaces`));
    }
    creerEspace(code: string, nom: string): Promise<Espace> {
        return firstValueFrom(this.http.post<Espace>(`${this.racine}/espaces`, { code, nom }));
    }
    membres(code: string): Promise<Membre[]> {
        return firstValueFrom(this.http.get<Membre[]>(`${this.racine}/espaces/${encodeURIComponent(code)}/membres`));
    }
    definirMembre(code: string, identifiant: string, role: RoleEspace): Promise<Membre[]> {
        return firstValueFrom(
            this.http.put<Membre[]>(`${this.racine}/espaces/${encodeURIComponent(code)}/membres/${encodeURIComponent(identifiant)}`, {
                role
            })
        );
    }
    retirerMembre(code: string, identifiant: string): Promise<Membre[]> {
        return firstValueFrom(
            this.http.delete<Membre[]>(`${this.racine}/espaces/${encodeURIComponent(code)}/membres/${encodeURIComponent(identifiant)}`)
        );
    }

    // ---- utilisateurs (administration) ----
    utilisateurs(): Promise<Utilisateur[]> {
        return firstValueFrom(this.http.get<Utilisateur[]>(`${this.racine}/utilisateurs`));
    }
    creerUtilisateur(donnees: {
        identifiant: string;
        nomAffiche: string;
        email?: string;
        motDePasse: string;
        roleGlobal: RoleGlobal;
    }): Promise<Utilisateur> {
        return firstValueFrom(this.http.post<Utilisateur>(`${this.racine}/utilisateurs`, donnees));
    }
    modifierUtilisateur(
        id: string,
        donnees: Partial<{ nomAffiche: string; email: string; roleGlobal: RoleGlobal; actif: boolean; motDePasse: string }>
    ): Promise<Utilisateur> {
        return firstValueFrom(this.http.put<Utilisateur>(`${this.racine}/utilisateurs/${encodeURIComponent(id)}`, donnees));
    }
    supprimerUtilisateur(id: string): Promise<unknown> {
        return firstValueFrom(this.http.delete(`${this.racine}/utilisateurs/${encodeURIComponent(id)}`));
    }
}

/** Pourcentage d'avancement d'un événement de dépôt (0 à 100), ou null si l'événement n'en dit rien. */
export function progressionDe(evenement: HttpEvent<unknown>): number | null {
    if (evenement.type === HttpEventType.UploadProgress && evenement.total) return Math.round((100 * evenement.loaded) / evenement.total);
    if (evenement.type === HttpEventType.Response) return 100;
    return null;
}
