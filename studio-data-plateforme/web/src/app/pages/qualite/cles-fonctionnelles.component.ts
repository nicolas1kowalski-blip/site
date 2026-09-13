/**
 * Clés fonctionnelles composites et doublons approchés (repris de l'application classique). Pour la source choisie :
 *   • des profils de clé : un périmètre facultatif (filtres) + des composants — colonne de la source, ou colonne
 *     d'une table liée par le modèle de données (avec une condition facultative sur cette table), chacun avec un
 *     mode d'appariement (strict, normalisé, ressemblance tolérée) ; ils sont enregistrés dans le dictionnaire ;
 *   • l'analyse : groupes de clés identiques, clés identiques une fois normalisées mais écrites différemment,
 *     paires de clés ressemblantes (similarité de Jaro-Winkler au-dessus du seuil choisi).
 */
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    ComposantCle,
    LignesEnDouble,
    ModeAppariement,
    ProfilCle,
    Relation,
    ResultatProfilCle,
    Source,
    TypeDoublon,
    VocabulaireQualite
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { telechargerBlob, telechargerCsv, telechargerJson } from '../../coeur/telechargement';
import { FiltresAuditComponent } from './filtres-audit.component';

const SEUIL_PAR_DEFAUT = 0.92;
const LIBELLE_TYPE_DOUBLON: Record<TypeDoublon, string> = {
    stricte: 'Strict',
    normalisee: 'Casse-accents tolérés',
    floue: 'Paire floue'
};

@Component({
    selector: 'app-cles-fonctionnelles',
    imports: [FormsModule, FiltresAuditComponent],
    template: `
        <div class="carte">
            <div class="entete-page" style="margin: 0">
                <div class="espace">
                    <h2>Profils de clé fonctionnelle de {{ source().name }}</h2>
                    <p class="discret">
                        Une clé fonctionnelle identifie une ligne « métier » (nom + ville, numéro + date…) : ses composants viennent de la
                        source ou d'une table liée par le modèle de données. L'analyse repère les doublons exacts, les écritures différentes
                        d'une même clé et les clés qui se ressemblent.
                    </p>
                </div>
                @if (session.peutEditer()) {
                    <button class="bouton" type="button" (click)="ajouterProfil()">Ajouter un profil</button>
                    <button class="bouton" type="button" (click)="enregistrer()" [disabled]="enCours()">Enregistrer les profils</button>
                }
                <label class="etiquette" style="margin: 0">Seuil de ressemblance</label>
                <input class="champ" type="number" step="0.01" min="0.5" max="1" name="seuil" style="width: 90px" [(ngModel)]="seuil" />
                <button class="bouton principal" type="button" (click)="analyser()" [disabled]="enCours() || !profils().length">
                    {{ enCours() ? 'Analyse…' : 'Analyser les doublons' }}
                </button>
            </div>
            @if (!profils().length) {
                <div class="vide" style="margin-top: 10px">Aucun profil : ajoutez-en un et composez sa clé.</div>
            }
            @for (profil of profils(); track profil.id; let indexProfil = $index) {
                <div class="profil">
                    <div class="entete-page" style="margin: 0 0 6px">
                        <b>Profil {{ indexProfil + 1 }}</b>
                        <span class="discret">{{ profil.id }}</span>
                        <span class="espace"></span>
                        <button class="bouton petit" type="button" (click)="ajouterComposant(indexProfil)">Ajouter un composant</button>
                        <button class="bouton petit danger" type="button" (click)="retirerProfil(indexProfil)">Retirer le profil</button>
                    </div>
                    <div class="discret" style="margin-bottom: 4px">Périmètre (lignes auditées)</div>
                    <app-filtres-audit
                        [colonnes]="source().headers"
                        [prefixe]="'perimetre-' + indexProfil"
                        libelleAjout="Ajouter une condition de périmètre"
                        [filtres]="profil.scope"
                        (filtresChange)="modifierProfil(indexProfil, { scope: $event })"
                    />
                    <table class="tableau" style="margin-top: 8px">
                        <thead>
                            <tr>
                                <th>Table</th>
                                <th>Colonne</th>
                                <th>Condition sur la table liée</th>
                                <th>Appariement</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (composant of profil.parts; track $index; let indexComposant = $index) {
                                <tr>
                                    <td>
                                        <select
                                            class="champ"
                                            [attr.name]="'composant-table-' + indexProfil + '-' + indexComposant"
                                            [ngModel]="composant.table"
                                            (ngModelChange)="changerTable(indexProfil, indexComposant, $event)"
                                        >
                                            @for (table of tablesDisponibles(); track table) {
                                                <option [value]="table">{{ table }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            class="champ"
                                            [attr.name]="'composant-colonne-' + indexProfil + '-' + indexComposant"
                                            [ngModel]="composant.col"
                                            (ngModelChange)="modifierComposant(indexProfil, indexComposant, { col: $event })"
                                        >
                                            @for (colonne of colonnesDe(composant.table); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td>
                                        @if (composant.table !== source().name) {
                                            <div style="display: flex; gap: 4px">
                                                <select
                                                    class="champ"
                                                    [attr.name]="'composant-condition-colonne-' + indexProfil + '-' + indexComposant"
                                                    [ngModel]="composant.whereCol"
                                                    (ngModelChange)="modifierComposant(indexProfil, indexComposant, { whereCol: $event })"
                                                >
                                                    <option value="">(aucune)</option>
                                                    @for (colonne of colonnesDe(composant.table); track colonne) {
                                                        <option [value]="colonne">{{ colonne }}</option>
                                                    }
                                                </select>
                                                @if (composant.whereCol) {
                                                    <input
                                                        class="champ"
                                                        [attr.name]="'composant-condition-valeur-' + indexProfil + '-' + indexComposant"
                                                        [ngModel]="composant.whereVal"
                                                        (ngModelChange)="
                                                            modifierComposant(indexProfil, indexComposant, { whereVal: $event })
                                                        "
                                                        placeholder="= valeur"
                                                    />
                                                }
                                            </div>
                                        } @else {
                                            <span class="discret">—</span>
                                        }
                                    </td>
                                    <td>
                                        <select
                                            class="champ"
                                            [attr.name]="'composant-mode-' + indexProfil + '-' + indexComposant"
                                            [ngModel]="composant.match"
                                            (ngModelChange)="modifierComposant(indexProfil, indexComposant, { match: $event })"
                                        >
                                            @for (mode of modesAppariement(); track mode[0]) {
                                                <option [value]="mode[0]">{{ mode[1] }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td>
                                        <button class="bouton petit" type="button" (click)="retirerComposant(indexProfil, indexComposant)">
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
        </div>

        @for (resultat of resultats(); track resultat.profil.id) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2>Résultat — {{ resultat.profil.id }}</h2>
                    <span class="badge neutre">{{ resultat.totalLignes }} ligne(s) analysée(s)</span>
                    @if (!resultat.erreur) {
                        <span class="badge" [class.succes]="resultat.exactes.groupes === 0" [class.erreur]="resultat.exactes.groupes > 0"
                            >{{ resultat.exactes.groupes }} clé(s) en doublon exact ({{ resultat.exactes.lignes }} lignes)</span
                        >
                        <span class="badge" [class.succes]="resultat.proches.groupes === 0" [class.alerte]="resultat.proches.groupes > 0"
                            >{{ resultat.proches.groupes }} clé(s) écrite(s) différemment</span
                        >
                        <span class="badge" [class.succes]="resultat.floues.length === 0" [class.alerte]="resultat.floues.length > 0"
                            >{{ resultat.floues.length }} paire(s) ressemblante(s)</span
                        >
                    }
                    <span class="espace"></span>
                    <button class="bouton petit" type="button" (click)="exporter()">Exporter (JSON)</button>
                    @if ($first) {
                        <button class="bouton petit" type="button" (click)="exporterClesEnDouble()" [disabled]="enCours()">
                            Toutes les clés en double (CSV)
                        </button>
                        <button class="bouton petit" type="button" (click)="exporterLignesEnDouble()" [disabled]="enCours()">
                            Toutes les lignes en double (CSV)
                        </button>
                        <button class="bouton petit" type="button" (click)="exporterClasseur()" [disabled]="enCours()">
                            Lignes en double (Excel, 3 onglets)
                        </button>
                    }
                </div>
                @if (resultat.erreur) {
                    <div class="badge erreur">{{ resultat.erreur }}</div>
                } @else {
                    <div class="grille">
                        @if (resultat.exactes.exemples.length) {
                            <div>
                                <b>Doublons exacts</b>
                                <ul class="liste-exemples">
                                    @for (exemple of resultat.exactes.exemples; track exemple.cle) {
                                        <li>
                                            {{ exemple.cle }} <span class="badge neutre">×{{ exemple.nombre }}</span>
                                        </li>
                                    }
                                </ul>
                            </div>
                        }
                        @if (resultat.proches.exemples.length) {
                            <div>
                                <b>Même clé, écritures différentes</b>
                                <ul class="liste-exemples">
                                    @for (exemple of resultat.proches.exemples; track exemple.cle) {
                                        <li>
                                            {{ exemple.ecritures.join(' / ') }} <span class="badge neutre">×{{ exemple.nombre }}</span>
                                        </li>
                                    }
                                </ul>
                            </div>
                        }
                        @if (resultat.floues.length) {
                            <div>
                                <b>Clés ressemblantes</b>
                                <ul class="liste-exemples">
                                    @for (paire of resultat.floues; track $index) {
                                        <li>
                                            {{ paire.exemple1 }} <span class="discret">(×{{ paire.nombre1 }})</span> ~ {{ paire.exemple2 }}
                                            <span class="discret">(×{{ paire.nombre2 }})</span>
                                            <span class="badge neutre">{{ (paire.similarite * 100).toFixed(1) }} %</span>
                                        </li>
                                    }
                                </ul>
                            </div>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: `
        .profil {
            margin-top: 12px;
            padding: 10px;
            border: 1px solid var(--bordure);
            border-radius: 8px;
        }
        .profil .champ {
            width: auto;
            min-width: 110px;
        }
        .liste-exemples {
            margin: 6px 0 0;
            padding-left: 18px;
        }
    `
})
export class ClesFonctionnellesComponent implements OnInit {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly source = input.required<Source>();
    readonly sources = input<Source[]>([]);
    readonly relations = input<Relation[]>([]);
    readonly vocabulaire = input.required<VocabulaireQualite>();

    readonly profils = signal<ProfilCle[]>([]);
    readonly resultats = signal<ResultatProfilCle[]>([]);
    readonly enCours = signal(false);
    seuil = SEUIL_PAR_DEFAUT;

    async ngOnInit(): Promise<void> {
        try {
            this.profils.set(await this.api.profilsCle(this.source().name));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    modesAppariement(): [ModeAppariement, string][] {
        return Object.entries(this.vocabulaire().modesAppariement) as [ModeAppariement, string][];
    }
    /** La source elle-même, puis les tables reliées à elle par le modèle de données. */
    tablesDisponibles(): string[] {
        const nom = this.source().name;
        const liees = this.relations()
            .filter(relation => relation.sourceTable === nom || relation.targetTable === nom)
            .map(relation => (relation.sourceTable === nom ? relation.targetTable : relation.sourceTable));
        return [nom, ...new Set(liees)];
    }
    colonnesDe(nomTable: string): string[] {
        return this.sources().find(candidate => candidate.name === nomTable)?.headers || [];
    }

    // ---- édition des profils ----
    ajouterProfil(): void {
        const numero = this.profils().length + 1;
        this.profils.update(profils => [
            ...profils,
            { id: `cle_${numero}_${Date.now().toString(36)}`, scope: [], parts: [this.composantParDefaut()] }
        ]);
    }
    retirerProfil(indexProfil: number): void {
        this.profils.update(profils => profils.filter((_, position) => position !== indexProfil));
    }
    modifierProfil(indexProfil: number, changement: Partial<ProfilCle>): void {
        this.profils.update(profils =>
            profils.map((profil, position) => (position === indexProfil ? { ...profil, ...changement } : profil))
        );
    }
    private composantParDefaut(): ComposantCle {
        return { table: this.source().name, col: this.source().headers[0] || '', whereCol: '', whereVal: '', match: 'fuzzy' };
    }
    ajouterComposant(indexProfil: number): void {
        const profil = this.profils()[indexProfil];
        this.modifierProfil(indexProfil, { parts: [...profil.parts, this.composantParDefaut()] });
    }
    retirerComposant(indexProfil: number, indexComposant: number): void {
        const profil = this.profils()[indexProfil];
        this.modifierProfil(indexProfil, { parts: profil.parts.filter((_, position) => position !== indexComposant) });
    }
    modifierComposant(indexProfil: number, indexComposant: number, changement: Partial<ComposantCle>): void {
        const profil = this.profils()[indexProfil];
        this.modifierProfil(indexProfil, {
            parts: profil.parts.map((composant, position) => (position === indexComposant ? { ...composant, ...changement } : composant))
        });
    }
    changerTable(indexProfil: number, indexComposant: number, table: string): void {
        this.modifierComposant(indexProfil, indexComposant, { table, col: this.colonnesDe(table)[0] || '', whereCol: '', whereVal: '' });
    }

    // ---- enregistrement et analyse ----
    async enregistrer(): Promise<void> {
        try {
            this.profils.set(await this.api.enregistrerProfilsCle(this.source().name, this.profils()));
            this.notifications.succes('Profils de clé enregistrés dans le dictionnaire.');
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
    async analyser(): Promise<void> {
        this.enCours.set(true);
        try {
            if (this.session.peutEditer()) await this.api.enregistrerProfilsCle(this.source().name, this.profils());
            this.resultats.set(await this.api.doublonsApproches(this.source().id, Number(this.seuil) || SEUIL_PAR_DEFAUT));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
    exporter(): void {
        telechargerJson(`${this.source().name} - doublons approches.json`, {
            source: this.source().name,
            seuil: this.seuil,
            resultats: this.resultats()
        });
    }

    // ---- exports des lignes en double (toutes les lignes, pas seulement les exemples) ----
    private async avecLignesEnDouble(action: (doublons: LignesEnDouble) => void): Promise<void> {
        this.enCours.set(true);
        try {
            const doublons = await this.api.lignesEnDouble(this.source().id, Number(this.seuil) || SEUIL_PAR_DEFAUT);
            for (const erreur of doublons.erreurs) this.notifications.erreur(erreur);
            if (!doublons.lignes.length) this.notifications.info('Aucune ligne en double à exporter.');
            else action(doublons);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
    /** Une ligne par clé en double : profil, type de rapprochement, groupe, clé, nombre de lignes. */
    exporterClesEnDouble(): void {
        void this.avecLignesEnDouble(doublons => {
            const comptes = new Map<string, { profil: string; type: string; groupe: string; cle: string; nombre: number }>();
            for (const ligne of doublons.lignes) {
                const identifiant = [ligne.profil, ligne.type, ligne.groupe].join('¦');
                const compte = comptes.get(identifiant) || {
                    profil: ligne.profil,
                    type: LIBELLE_TYPE_DOUBLON[ligne.type],
                    groupe: ligne.groupe,
                    cle: ligne.cle,
                    nombre: 0
                };
                compte.nombre++;
                comptes.set(identifiant, compte);
            }
            telechargerCsv(
                `${this.source().name} - cles en double.csv`,
                ['PROFIL', 'TYPE', 'GROUPE', 'CLE_FONCTIONNELLE', 'LIGNES'],
                [...comptes.values()].map(compte => [compte.profil, compte.type, compte.groupe, compte.cle, compte.nombre])
            );
            this.notifications.succes(`${comptes.size} clé(s) en double exportée(s).`);
        });
    }
    exporterLignesEnDouble(): void {
        void this.avecLignesEnDouble(doublons => {
            telechargerCsv(
                `${this.source().name} - lignes en double.csv`,
                ['PROFIL', 'TYPE', 'GROUPE', 'CLE_FONCTIONNELLE', ...doublons.colonnes],
                doublons.lignes.map(ligne => [ligne.profil, LIBELLE_TYPE_DOUBLON[ligne.type], ligne.groupe, ligne.cle, ...ligne.valeurs])
            );
            this.notifications.succes(`${doublons.lignes.length} ligne(s) en double exportée(s).`);
        });
    }
    async exporterClasseur(): Promise<void> {
        this.enCours.set(true);
        try {
            const classeur = await this.api.classeurDoublons(this.source().id, Number(this.seuil) || SEUIL_PAR_DEFAUT);
            telechargerBlob(`Doublons ${this.source().name}.xlsx`, classeur);
            this.notifications.succes('Classeur Excel téléchargé : synthèse, stricts, casse-accents tolérés, paires floues.');
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
