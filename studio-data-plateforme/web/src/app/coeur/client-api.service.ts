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
    ApercuExtraction,
    EntreeJournal,
    Espace,
    FicheDictionnaire,
    Identite,
    Membre,
    ModeleExtraction,
    PropositionLien,
    Relation,
    ResultatSql,
    RoleEspace,
    RoleGlobal,
    Sante,
    Source,
    SpecificationExtraction,
    TermeGlossaire,
    Utilisateur,
    VocabulaireExtraction
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
