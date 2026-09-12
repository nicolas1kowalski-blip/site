/**
 * Modèle de données : les liens entre sources (clé étrangère → clé primaire), partagés avec l'application
 * classique. Trois façons d'agir : lire les liens existants, en ajouter un à la main (table et colonne de
 * chaque côté), ou laisser le serveur en proposer d'après le contenu des colonnes.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { PropositionLien, Relation, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-modele',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Modèle de données</h1>
                <p class="discret">
                    {{ relations().length }} lien(s) entre {{ sources().length }} source(s) — utilisés par l'extraction pour joindre les
                    tables
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton" (click)="detecter()" [disabled]="detectionEnCours()">
                    {{ detectionEnCours() ? 'Analyse…' : 'Détecter les liens' }}
                </button>
            }
        </div>

        @if (propositions().length) {
            <div class="carte">
                <h2>Liens proposés d'après le contenu</h2>
                <p class="discret">
                    Une colonne de même nom, unique dans la table cible, et dont les valeurs de la table source s'y retrouvent (couverture ≥
                    80 %).
                </p>
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Source (côté N)</th>
                            <th>Cible (côté 1)</th>
                            <th>Couverture</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (
                            proposition of propositions();
                            track proposition.sourceTable + proposition.sourceCol + proposition.targetTable
                        ) {
                            <tr>
                                <td>
                                    <b>{{ proposition.sourceTable }}</b
                                    >.<code>{{ proposition.sourceCol }}</code>
                                </td>
                                <td>
                                    <b>{{ proposition.targetTable }}</b
                                    >.<code>{{ proposition.targetCol }}</code>
                                </td>
                                <td>
                                    <span class="badge succes">{{ (proposition.couverture * 100).toFixed(0) }} %</span>
                                    <span class="discret">sur {{ proposition.valeursSource }} valeur(s)</span>
                                </td>
                                <td><button class="bouton petit principal" (click)="accepter(proposition)">Ajouter</button></td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        } @else if (detectionFaite()) {
            <div class="carte discret">Aucun nouveau lien détecté d'après le contenu.</div>
        }

        <div class="carte">
            <h2>Liens du modèle</h2>
            @if (relations().length === 0) {
                <div class="vide">Aucun lien. Ajoutez-en un ci-dessous ou lancez la détection.</div>
            } @else {
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Source (côté N)</th>
                            <th>Colonne</th>
                            <th></th>
                            <th>Cible (côté 1)</th>
                            <th>Colonne</th>
                            <th>Cardinalité</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (relation of relations(); track relation.id) {
                            <tr [class.orphelin]="!relation.sourceId || !relation.targetId">
                                <td>
                                    <b>{{ relation.sourceTable }}</b>
                                </td>
                                <td>
                                    <code>{{ relation.sourceCol }}</code>
                                </td>
                                <td>→</td>
                                <td>
                                    <b>{{ relation.targetTable }}</b>
                                </td>
                                <td>
                                    <code>{{ relation.targetCol }}</code>
                                </td>
                                <td>
                                    <span class="badge neutre">{{ relation.cardinality || 'N-1' }}</span>
                                    @if (!relation.sourceId || !relation.targetId) {
                                        <span class="badge alerte" title="Une des deux sources n'est pas chargée dans cet espace"
                                            >source absente</span
                                        >
                                    }
                                </td>
                                <td>
                                    @if (session.peutEditer()) {
                                        <button class="bouton petit danger" (click)="supprimer(relation)">Supprimer</button>
                                    }
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>

        @if (session.peutEditer()) {
            <form class="carte" (ngSubmit)="ajouter()">
                <h2>Ajouter un lien</h2>
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Table source (côté N, ex. commandes)</label>
                        <select
                            class="champ"
                            name="sourceTable"
                            [(ngModel)]="nouveau.sourceTable"
                            (ngModelChange)="nouveau.sourceCol = ''"
                            required
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Colonne source</label>
                        <select class="champ" name="sourceCol" [(ngModel)]="nouveau.sourceCol" required>
                            <option value="">—</option>
                            @for (colonne of colonnesDe(nouveau.sourceTable); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Table cible (côté 1, ex. clients)</label>
                        <select
                            class="champ"
                            name="targetTable"
                            [(ngModel)]="nouveau.targetTable"
                            (ngModelChange)="nouveau.targetCol = ''"
                            required
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Colonne cible</label>
                        <select class="champ" name="targetCol" [(ngModel)]="nouveau.targetCol" required>
                            <option value="">—</option>
                            @for (colonne of colonnesDe(nouveau.targetTable); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div style="flex: 0 0 120px">
                        <label class="etiquette">Cardinalité</label>
                        <select class="champ" name="cardinality" [(ngModel)]="nouveau.cardinality">
                            <option value="N-1">N-1</option>
                            <option value="1-1">1-1</option>
                            <option value="1-N">1-N</option>
                            <option value="N-N">N-N</option>
                        </select>
                    </div>
                    <button class="bouton principal" type="submit" style="flex: 0" [disabled]="!formulaireComplet()">Ajouter</button>
                </div>
            </form>
        }
    `,
    styles: `
        .orphelin td {
            opacity: 0.6;
        }
    `
})
export class ModeleComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = signal<Source[]>([]);
    readonly relations = signal<Relation[]>([]);
    readonly propositions = signal<PropositionLien[]>([]);
    readonly detectionEnCours = signal(false);
    readonly detectionFaite = signal(false);
    nouveau = { sourceTable: '', sourceCol: '', targetTable: '', targetCol: '', cardinality: 'N-1' };
    readonly formulaireComplet = computed(() => true);

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [sources, relations] = await Promise.all([this.api.sources(), this.api.relations()]);
            this.sources.set(sources);
            this.relations.set(relations);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    async detecter(): Promise<void> {
        this.detectionEnCours.set(true);
        try {
            this.propositions.set(await this.api.detecterRelations());
            this.detectionFaite.set(true);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.detectionEnCours.set(false);
        }
    }

    async accepter(proposition: PropositionLien): Promise<void> {
        await this.enregistrer({
            sourceTable: proposition.sourceTable,
            sourceCol: proposition.sourceCol,
            targetTable: proposition.targetTable,
            targetCol: proposition.targetCol,
            cardinality: proposition.cardinality
        });
        this.propositions.update(liste => liste.filter(candidat => candidat !== proposition));
    }

    async ajouter(): Promise<void> {
        const { sourceTable, sourceCol, targetTable, targetCol } = this.nouveau;
        if (!sourceTable || !sourceCol || !targetTable || !targetCol) {
            this.notifications.erreur('Choisissez une table et une colonne de chaque côté.');
            return;
        }
        if (sourceTable === targetTable) {
            this.notifications.erreur('Un lien relie deux tables différentes.');
            return;
        }
        await this.enregistrer({ ...this.nouveau });
        this.nouveau = { sourceTable: '', sourceCol: '', targetTable: '', targetCol: '', cardinality: 'N-1' };
    }

    private async enregistrer(relation: Omit<Relation, 'id' | 'sourceId' | 'targetId'>): Promise<void> {
        try {
            const resultat = await this.api.ajouterRelation(relation);
            this.relations.set(resultat.relations);
            this.notifications[resultat.ajoute ? 'succes' : 'info'](
                resultat.ajoute
                    ? `Lien ${relation.sourceTable}.${relation.sourceCol} → ${relation.targetTable}.${relation.targetCol} ajouté.`
                    : 'Ce lien existe déjà.'
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(relation: Relation): Promise<void> {
        if (!confirm(`Supprimer le lien ${relation.sourceTable}.${relation.sourceCol} → ${relation.targetTable}.${relation.targetCol} ?`))
            return;
        try {
            this.relations.set(await this.api.supprimerRelation(relation.id));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
