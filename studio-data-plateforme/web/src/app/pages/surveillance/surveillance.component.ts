/**
 * Surveillance des sources : quatre outils autour d'une source rafraîchie depuis une application amont.
 *   • Moniteur — fraîcheur, instantanés (volumétrie, schéma) et dérive entre les deux derniers ;
 *   • Contrat de données — schéma attendu (colonnes obligatoires) et vérification ;
 *   • Suivi des changements — lignes ajoutées, supprimées, modifiées depuis des données figées ;
 *   • Réconciliation amont / aval — volumétrie et clés orphelines entre deux sources.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    Contrat,
    EtatSurveillance,
    ResultatDelta,
    ResultatReconciliationSources,
    Source,
    VerificationContrat,
    formaterDate
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

type Outil = 'moniteur' | 'contrat' | 'delta' | 'reconciliation';

@Component({
    selector: 'app-surveillance',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Surveillance des sources</h1>
                <p class="discret">
                    Fraîcheur, dérive de structure et de volumétrie, contrat de données, changements entre deux chargements, réconciliation.
                </p>
            </div>
        </div>
        <div class="onglets">
            <button [class.actif]="outil() === 'moniteur'" (click)="outil.set('moniteur')">Moniteur</button>
            <button [class.actif]="outil() === 'contrat'" (click)="outil.set('contrat')">Contrat de données</button>
            <button [class.actif]="outil() === 'delta'" (click)="outil.set('delta')">Suivi des changements</button>
            <button [class.actif]="outil() === 'reconciliation'" (click)="outil.set('reconciliation')">Réconciliation amont / aval</button>
        </div>

        @if (outil() === 'moniteur') {
            <div class="carte defilement-x">
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Fraîcheur</th>
                            <th>Dernier instantané</th>
                            <th>Dérive (deux derniers instantanés)</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (source of etats(); track source.id) {
                            <tr>
                                <td>
                                    <strong>{{ source.nom }}</strong>
                                </td>
                                <td>
                                    <span
                                        class="badge"
                                        [class.succes]="source.fraicheur.status === 'ok'"
                                        [class.alerte]="source.fraicheur.status === 'warn'"
                                        [class.erreur]="source.fraicheur.status === 'bad'"
                                        [class.neutre]="source.fraicheur.status === 'none'"
                                    >
                                        {{ texteFraicheur(source) }}
                                    </span>
                                </td>
                                <td class="discret">
                                    @if (source.dernierInstantane; as instantane) {
                                        {{ formaterDate(dateDe(instantane.ts)) }} · {{ instantane.rows }} ligne(s) ·
                                        {{ instantane.schema.length }} colonne(s) ({{ source.nombreInstantanes }} instantané(s))
                                    } @else {
                                        aucun
                                    }
                                </td>
                                <td>
                                    @if (source.derive; as derive) {
                                        <span [class.probleme]="derive.schemaChanged">
                                            {{ derive.rowsDelta >= 0 ? '+' : '' }}{{ derive.rowsDelta }} ligne(s){{
                                                derive.rowsPct == null ? '' : ' (' + derive.rowsPct.toFixed(1) + ' %)'
                                            }}
                                            @if (derive.added.length) {
                                                · colonnes ajoutées : {{ derive.added.join(', ') }}
                                            }
                                            @if (derive.removed.length) {
                                                · supprimées : {{ derive.removed.join(', ') }}
                                            }
                                            @if (derive.retyped.length) {
                                                · retypées : {{ derive.retyped.join(', ') }}
                                            }
                                        </span>
                                    } @else {
                                        <span class="discret">—</span>
                                    }
                                </td>
                                <td>
                                    @if (session.peutEditer()) {
                                        <button class="bouton petit" (click)="prendreInstantane(source)">Prendre un instantané</button>
                                    }
                                </td>
                            </tr>
                        } @empty {
                            <tr>
                                <td colspan="5" class="discret">Aucune source.</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }

        @if (outil() === 'contrat') {
            <div class="carte">
                <div class="formulaire-ligne" style="max-width: 640px">
                    <select class="champ" name="sourceContrat" [(ngModel)]="sourceContrat" (ngModelChange)="verification.set(null)">
                        <option value="">— source —</option>
                        @for (source of etats(); track source.id) {
                            <option [value]="source.nom">{{ source.nom }}</option>
                        }
                    </select>
                    @if (session.peutEditer()) {
                        <button class="bouton" (click)="genererContrat()" [disabled]="!sourceContrat" style="flex: 0 0 auto">
                            Générer depuis la structure actuelle
                        </button>
                    }
                    <button class="bouton principal" (click)="verifierContrat()" [disabled]="!contratCourant()" style="flex: 0 0 auto">
                        Vérifier
                    </button>
                </div>
                @if (contratCourant(); as contrat) {
                    <table class="tableau" style="margin-top: 10px; max-width: 640px">
                        <thead>
                            <tr>
                                <th>Colonne attendue</th>
                                <th>Type</th>
                                <th>Obligatoire (non vide)</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (colonne of contrat.cols; track colonne.name) {
                                <tr>
                                    <td>
                                        <code>{{ colonne.name }}</code>
                                    </td>
                                    <td>{{ colonne.type }}</td>
                                    <td>
                                        <input
                                            type="checkbox"
                                            [(ngModel)]="colonne.required"
                                            [name]="'obligatoire-' + colonne.name"
                                            [attr.name]="'obligatoire-' + colonne.name"
                                            (change)="enregistrerContrat(contrat)"
                                            [disabled]="!session.peutEditer()"
                                        />
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                } @else if (sourceContrat) {
                    <p class="discret" style="margin-top: 10px">
                        Aucun contrat pour cette source : générez-le depuis sa structure actuelle, puis cochez les colonnes obligatoires.
                    </p>
                }
                @if (verification(); as verification) {
                    <div class="resultat" [class.ok]="verification.conforme" [class.ko]="!verification.conforme">
                        {{ verification.conforme ? 'Conforme au contrat.' : 'Non conforme.' }}
                        @if (verification.missing.length) {
                            · colonnes manquantes : {{ verification.missing.join(', ') }}
                        }
                        @if (verification.extra.length) {
                            · colonnes en plus : {{ verification.extra.join(', ') }}
                        }
                        @if (verification.retyped.length) {
                            · retypées : {{ verification.retyped.join(', ') }}
                        }
                        @for (vide of verification.emptyRequired; track vide.col) {
                            · {{ vide.col }} : {{ vide.vides }} valeur(s) vide(s)
                        }
                    </div>
                }
            </div>
        }

        @if (outil() === 'delta') {
            <div class="carte">
                <p class="discret">
                    Figez les données d'une source, rechargez-la, puis comparez par clé : lignes ajoutées, supprimées, modifiées,
                    identiques.
                </p>
                <div class="formulaire-ligne" style="max-width: 720px">
                    <select class="champ" name="sourceDelta" [(ngModel)]="sourceDelta" (ngModelChange)="cleDelta = ''; delta.set(null)">
                        <option value="">— source —</option>
                        @for (source of etats(); track source.id) {
                            <option [value]="source.nom">{{ source.nom }}</option>
                        }
                    </select>
                    <select class="champ" name="cleDelta" [(ngModel)]="cleDelta">
                        <option value="">— colonne clé —</option>
                        @for (colonne of colonnesDe(sourceDelta); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    @if (session.peutEditer()) {
                        <button class="bouton" (click)="figer()" [disabled]="!sourceDelta" style="flex: 0 0 auto">Figer les données</button>
                    }
                    <button
                        class="bouton principal"
                        (click)="comparerDelta()"
                        [disabled]="!sourceDelta || !cleDelta"
                        style="flex: 0 0 auto"
                    >
                        Comparer
                    </button>
                </div>
                @if (etatDe(sourceDelta)?.donneesFigees; as figees) {
                    <p class="discret">Données figées le {{ formaterDate(dateDe(figees.ts)) }} ({{ figees.rows }} ligne(s)).</p>
                }
                @if (delta(); as delta) {
                    <div class="synthese">
                        <div class="tuile ok">
                            <div class="valeur">{{ delta.added }}</div>
                            <div class="discret">ajoutée(s)</div>
                        </div>
                        <div class="tuile ko">
                            <div class="valeur">{{ delta.removed }}</div>
                            <div class="discret">supprimée(s)</div>
                        </div>
                        <div class="tuile warn">
                            <div class="valeur">{{ delta.changed }}</div>
                            <div class="discret">modifiée(s) ({{ delta.colonnesComparees }} colonne(s) comparée(s))</div>
                        </div>
                        <div class="tuile">
                            <div class="valeur">{{ delta.same }}</div>
                            <div class="discret">identique(s)</div>
                        </div>
                    </div>
                }
            </div>
        }

        @if (outil() === 'reconciliation') {
            <div class="carte">
                <div class="formulaire-ligne" style="max-width: 900px">
                    <select class="champ" name="sourceA" [(ngModel)]="sourceA" (ngModelChange)="cleA = ''">
                        <option value="">— source amont —</option>
                        @for (source of etats(); track source.id) {
                            <option [value]="source.nom">{{ source.nom }}</option>
                        }
                    </select>
                    <select class="champ" name="cleA" [(ngModel)]="cleA">
                        <option value="">— clé —</option>
                        @for (colonne of colonnesDe(sourceA); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <select class="champ" name="sourceB" [(ngModel)]="sourceB" (ngModelChange)="cleB = ''">
                        <option value="">— source aval —</option>
                        @for (source of etats(); track source.id) {
                            <option [value]="source.nom">{{ source.nom }}</option>
                        }
                    </select>
                    <select class="champ" name="cleB" [(ngModel)]="cleB">
                        <option value="">— clé —</option>
                        @for (colonne of colonnesDe(sourceB); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <button
                        class="bouton principal"
                        (click)="reconcilier()"
                        [disabled]="!sourceA || !cleA || !sourceB || !cleB"
                        style="flex: 0 0 auto"
                    >
                        Réconcilier
                    </button>
                </div>
                @if (reconciliation(); as resultat) {
                    <div class="synthese">
                        <div class="tuile">
                            <div class="valeur">{{ resultat.ta }} / {{ resultat.tb }}</div>
                            <div class="discret">lignes amont / aval</div>
                        </div>
                        <div class="tuile ok">
                            <div class="valeur">{{ resultat.common }}</div>
                            <div class="discret">clés communes</div>
                        </div>
                        <div class="tuile ko">
                            <div class="valeur">{{ resultat.onlyA }}</div>
                            <div class="discret">seulement en amont</div>
                        </div>
                        <div class="tuile warn">
                            <div class="valeur">{{ resultat.onlyB }}</div>
                            <div class="discret">seulement en aval (orphelines)</div>
                        </div>
                    </div>
                }
            </div>
        }
    `,
    styles: `
        /* Sélecteur segmenté, comme dans la V13 : un fond teinté, et l'onglet actif en pastille posée. */
        .onglets {
            display: inline-flex;
            gap: 2px;
            margin-bottom: 14px;
            flex-wrap: wrap;
            background: color-mix(in srgb, var(--texte) 5%, transparent);
            border-radius: 9px;
            padding: 2px;
        }
        .onglets button {
            border: 0;
            background: none;
            padding: 6px 12px;
            border-radius: 7px;
            font: inherit;
            font-size: 12px;
            font-weight: 530;
            color: var(--texte-2);
            cursor: pointer;
            transition:
                background-color 0.16s var(--souple),
                color 0.16s var(--souple);
        }
        .onglets button.actif {
            background: var(--surface);
            color: var(--texte);
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
        }
        .probleme {
            color: var(--alerte);
            font-weight: 600;
        }
        .resultat {
            margin-top: 10px;
            font-weight: 600;
        }
        .resultat.ok {
            color: var(--succes);
        }
        .resultat.ko {
            color: var(--erreur);
        }
        .synthese {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }
        .tuile {
            border: 1px solid var(--bordure);
            border-radius: var(--rayon);
            padding: 10px;
            text-align: center;
        }
        .tuile .valeur {
            font-size: 24px;
            font-weight: 800;
        }
        .tuile.ok .valeur {
            color: var(--succes);
        }
        .tuile.warn .valeur {
            color: var(--alerte);
        }
        .tuile.ko .valeur {
            color: var(--erreur);
        }
    `
})
export class SurveillanceComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly formaterDate = formaterDate;
    readonly outil = signal<Outil>('moniteur');
    readonly etats = signal<EtatSurveillance[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly contratCourant = signal<Contrat | null>(null);
    readonly verification = signal<VerificationContrat | null>(null);
    readonly delta = signal<ResultatDelta | null>(null);
    readonly reconciliation = signal<ResultatReconciliationSources | null>(null);
    private sourceContratChoisie = '';
    sourceDelta = '';
    cleDelta = '';
    sourceA = '';
    cleA = '';
    sourceB = '';
    cleB = '';

    get sourceContrat(): string {
        return this.sourceContratChoisie;
    }
    set sourceContrat(nom: string) {
        this.sourceContratChoisie = nom;
        this.contratCourant.set(this.etatDe(nom)?.contrat ? structuredClone(this.etatDe(nom)!.contrat) : null);
    }

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [etats, sources] = await Promise.all([this.api.etatSurveillance(), this.api.sources()]);
            this.etats.set(etats);
            this.sources.set(sources);
            if (this.sourceContratChoisie) this.sourceContrat = this.sourceContratChoisie;
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    etatDe(nom: string): EtatSurveillance | undefined {
        return this.etats().find(source => source.nom === nom);
    }

    colonnesDe(nom: string): string[] {
        return this.sources().find(source => source.name === nom)?.headers || [];
    }

    dateDe(horodatage: number): string {
        return new Date(horodatage).toISOString();
    }

    texteFraicheur(source: EtatSurveillance): string {
        const fraicheur = source.fraicheur;
        const age =
            fraicheur.ageJours == null
                ? ''
                : fraicheur.ageJours < 1
                  ? ` (${Math.round(fraicheur.ageJours * 24)} h)`
                  : ` (${Math.round(fraicheur.ageJours)} j)`;
        if (fraicheur.status === 'none') return fraicheur.ageJours == null ? 'inconnue' : `fréquence non définie${age}`;
        return ({ ok: 'à jour', warn: 'à surveiller', bad: 'en retard' }[fraicheur.status] || fraicheur.status) + age;
    }

    async prendreInstantane(source: EtatSurveillance): Promise<void> {
        try {
            const resultat = await this.api.prendreInstantane(source.nom);
            this.notifications.succes(
                `Instantané de « ${source.nom} » pris : ${resultat.instantane.rows} ligne(s), ${resultat.instantane.schema.length} colonne(s).`
            );
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async genererContrat(): Promise<void> {
        try {
            this.contratCourant.set(await this.api.genererContrat(this.sourceContrat));
            this.verification.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async enregistrerContrat(contrat: Contrat): Promise<void> {
        try {
            await this.api.enregistrerContrat(this.sourceContrat, contrat);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async verifierContrat(): Promise<void> {
        try {
            this.verification.set(await this.api.verifierContrat(this.sourceContrat));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async figer(): Promise<void> {
        try {
            const figees = await this.api.figerDonnees(this.sourceDelta);
            this.notifications.succes(
                `Données de « ${this.sourceDelta} » figées (${figees.rows} ligne(s)) — rechargez la source puis comparez.`
            );
            this.delta.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async comparerDelta(): Promise<void> {
        try {
            this.delta.set(await this.api.calculerDelta(this.sourceDelta, this.cleDelta));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async reconcilier(): Promise<void> {
        try {
            this.reconciliation.set(await this.api.reconcilierSources(this.sourceA, this.cleA, this.sourceB, this.cleB));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
