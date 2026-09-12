/**
 * Comparateur : deux sources rapprochées sur une clé (simple ou composite), colonne par colonne. Le résultat
 * (statut de chaque ligne, valeurs des deux côtés) est calculé par le serveur et devient une source
 * « Comparaison A vs B » que l'on peut explorer et exporter comme n'importe quelle table.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { ParametresComparaison, ResultatComparaison, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

/** Nom de colonne comparable entre sources : minuscules, sans accents ni ponctuation. */
function nomComparable(nom: string): string {
    return nom
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

@Component({
    selector: 'app-comparateur',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Comparateur</h1>
                <p class="discret">Deux sources, une clé : lignes identiques, différentes, manquantes d'un côté — colonne par colonne.</p>
            </div>
        </div>
        <div class="carte">
            <div class="formulaire-ligne">
                <div>
                    <label class="etiquette">Fichier A</label>
                    <select class="champ" name="tableA" [(ngModel)]="parametres.tableA" (ngModelChange)="reinitialiserColonnes()">
                        <option value="">— source —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Fichier B</label>
                    <select class="champ" name="tableB" [(ngModel)]="parametres.tableB" (ngModelChange)="reinitialiserColonnes()">
                        <option value="">— source —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                </div>
                <label class="case"
                    ><input type="checkbox" name="ignorerCasse" [(ngModel)]="parametres.ignorerCasse" /> ignorer la casse</label
                >
                <label class="case"
                    ><input type="checkbox" name="ignorerEspaces" [(ngModel)]="parametres.ignorerEspaces" /> ignorer les espaces</label
                >
            </div>

            <h3>Clé d'identification (A ↔ B)</h3>
            @for (cle of parametres.cles; track $index; let index = $index) {
                <div class="formulaire-ligne" style="max-width: 640px">
                    <select
                        class="champ"
                        [(ngModel)]="cle.colA"
                        (ngModelChange)="proposerColonneB(cle)"
                        [name]="'cle-a-' + index"
                        [attr.name]="'cle-a-' + index"
                    >
                        <option value="">— colonne A —</option>
                        @for (colonne of colonnesDe(parametres.tableA); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <select class="champ" [(ngModel)]="cle.colB" [name]="'cle-b-' + index" [attr.name]="'cle-b-' + index">
                        <option value="">— colonne B —</option>
                        @for (colonne of colonnesDe(parametres.tableB); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <button
                        class="bouton petit danger"
                        (click)="parametres.cles.splice(index, 1)"
                        [disabled]="parametres.cles.length === 1"
                        style="flex: 0 0 auto"
                    >
                        ✕
                    </button>
                </div>
            }
            <button class="bouton petit" (click)="parametres.cles.push({ colA: '', colB: '' })">+ partie de clé (clé composite)</button>

            <h3>Colonnes à comparer <span class="discret">(sans correspondance, seule la présence des clés est comparée)</span></h3>
            @for (correspondance of parametres.correspondances; track $index; let index = $index) {
                <div class="formulaire-ligne" style="max-width: 640px">
                    <select
                        class="champ"
                        [(ngModel)]="correspondance.colA"
                        (ngModelChange)="proposerColonneB(correspondance)"
                        [name]="'colonne-a-' + index"
                        [attr.name]="'colonne-a-' + index"
                    >
                        <option value="">— colonne A —</option>
                        @for (colonne of colonnesDe(parametres.tableA); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <select
                        class="champ"
                        [(ngModel)]="correspondance.colB"
                        [name]="'colonne-b-' + index"
                        [attr.name]="'colonne-b-' + index"
                    >
                        <option value="">— colonne B —</option>
                        @for (colonne of colonnesDe(parametres.tableB); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <button class="bouton petit danger" (click)="parametres.correspondances.splice(index, 1)" style="flex: 0 0 auto">
                        ✕
                    </button>
                </div>
            }
            <div class="entete-page" style="margin: 8px 0 0">
                <button class="bouton petit" (click)="parametres.correspondances.push({ colA: '', colB: '' })">+ colonne à comparer</button>
                <button class="bouton petit" (click)="proposerToutesLesColonnes()" [disabled]="!parametres.tableA || !parametres.tableB">
                    Proposer les colonnes de même nom
                </button>
                @if (session.peutEditer()) {
                    <button
                        class="bouton principal"
                        (click)="comparer()"
                        [disabled]="enCours() || !parametres.tableA || !parametres.tableB"
                    >
                        {{ enCours() ? 'Comparaison…' : 'Comparer' }}
                    </button>
                }
            </div>
        </div>

        @if (resultat(); as resultat) {
            <div class="carte">
                <h2>{{ resultat.nom }}</h2>
                <div class="synthese">
                    <div class="tuile">
                        <div class="valeur">{{ resultat.total }}</div>
                        <div class="discret">{{ seulementCles() ? 'clés évaluées (union)' : 'lignes évaluées (A)' }}</div>
                    </div>
                    <div class="tuile ok">
                        <div class="valeur">{{ resultat.identiques }}</div>
                        <div class="discret">{{ seulementCles() ? 'présentes des deux côtés' : '100 % identiques' }}</div>
                    </div>
                    @if (!seulementCles()) {
                        <div class="tuile warn">
                            <div class="valeur">{{ resultat.differentes }}</div>
                            <div class="discret">avec différences</div>
                        </div>
                    }
                    <div class="tuile ko">
                        <div class="valeur">{{ resultat.manquantesB }}</div>
                        <div class="discret">en plus dans A (absentes de B)</div>
                    </div>
                    <div class="tuile ko">
                        <div class="valeur">{{ resultat.manquantesA }}</div>
                        <div class="discret">en plus dans B (absentes de A)</div>
                    </div>
                </div>
                <p class="discret">
                    Le détail complet est disponible dans les sources sous « {{ resultat.nom }} » (explorateur SQL, extraction, export CSV).
                </p>
                <div class="defilement-x">
                    <table class="tableau">
                        <thead>
                            <tr>
                                @for (colonne of resultat.colonnes; track colonne) {
                                    <th>{{ colonne }}</th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (ligne of resultat.apercu; track $index) {
                                <tr>
                                    @for (valeur of ligne; track $index) {
                                        <td>{{ valeur ?? '' }}</td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }
    `,
    styles: `
        h3 {
            margin: 14px 0 6px;
            font-size: 14px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            flex: 0 0 auto;
        }
        .synthese {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 10px;
            margin-bottom: 10px;
        }
        .tuile {
            border: 1px solid var(--bordure);
            border-radius: var(--rayon);
            padding: 10px;
            text-align: center;
        }
        .tuile .valeur {
            font-size: 26px;
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
export class ComparateurComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly sources = signal<Source[]>([]);
    readonly resultat = signal<ResultatComparaison | null>(null);
    readonly enCours = signal(false);
    parametres: ParametresComparaison = {
        tableA: '',
        tableB: '',
        cles: [{ colA: '', colB: '' }],
        correspondances: [],
        ignorerCasse: true,
        ignorerEspaces: true
    };

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.sources.set(await this.api.sources());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    reinitialiserColonnes(): void {
        this.parametres.cles = [{ colA: '', colB: '' }];
        this.parametres.correspondances = [];
        this.resultat.set(null);
    }

    /** Confort : la colonne de même nom côté B est proposée d'emblée. */
    proposerColonneB(couple: { colA: string; colB: string }): void {
        if (couple.colB || !couple.colA) return;
        couple.colB = this.colonnesDe(this.parametres.tableB).find(colonne => nomComparable(colonne) === nomComparable(couple.colA)) || '';
    }

    proposerToutesLesColonnes(): void {
        const colonnesB = this.colonnesDe(this.parametres.tableB);
        const clesA = new Set(this.parametres.cles.map(cle => cle.colA));
        this.parametres.correspondances = this.colonnesDe(this.parametres.tableA)
            .filter(colonne => !clesA.has(colonne))
            .map(colonne => ({ colA: colonne, colB: colonnesB.find(candidat => nomComparable(candidat) === nomComparable(colonne)) || '' }))
            .filter(correspondance => correspondance.colB);
    }

    seulementCles(): boolean {
        return this.parametres.correspondances.filter(correspondance => correspondance.colA && correspondance.colB).length === 0;
    }

    async comparer(): Promise<void> {
        const cles = this.parametres.cles.filter(cle => cle.colA && cle.colB);
        if (!cles.length) return this.notifications.erreur('Choisissez au moins une colonne de clé de chaque côté.');
        this.enCours.set(true);
        try {
            this.resultat.set(
                await this.api.comparer({
                    ...this.parametres,
                    cles,
                    correspondances: this.parametres.correspondances.filter(correspondance => correspondance.colA && correspondance.colB)
                })
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
