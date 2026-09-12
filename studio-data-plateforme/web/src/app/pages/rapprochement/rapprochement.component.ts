/**
 * Rapprochement inter-sources (record linkage) : paires candidates entre deux sources sur une clé de blocage,
 * notées par similarité pondérée ; acceptation automatique au-dessus d'un seuil, revue entre les deux seuils,
 * décisions conservées ; production du golden record (A enrichie de B) et de la table des liens.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { PaireCandidate, Rapprochement, Source, VocabulaireExploitation, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-rapprochement',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Rapprochement</h1>
                <p class="discret">Retrouver la même entité dans deux sources sans identifiant commun, puis produire un golden record.</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="ajouter()">Nouveau rapprochement</button>
            }
        </div>
        @for (rapprochement of rapprochements(); track rapprochement.id; let index = $index) {
            <div class="carte">
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Nom</label
                        ><input
                            class="champ"
                            [(ngModel)]="rapprochement.name"
                            [name]="'rapprochement-nom-' + index"
                            [attr.name]="'rapprochement-nom-' + index"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Source A</label>
                        <select
                            class="champ"
                            [(ngModel)]="rapprochement.a"
                            (ngModelChange)="rapprochement.blockA = ''"
                            [name]="'rapprochement-a-' + index"
                            [attr.name]="'rapprochement-a-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— source —</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Source B</label>
                        <select
                            class="champ"
                            [(ngModel)]="rapprochement.b"
                            (ngModelChange)="rapprochement.blockB = ''"
                            [name]="'rapprochement-b-' + index"
                            [attr.name]="'rapprochement-b-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— source —</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Clé de blocage A</label>
                        <select
                            class="champ"
                            [(ngModel)]="rapprochement.blockA"
                            [name]="'rapprochement-blocage-a-' + index"
                            [attr.name]="'rapprochement-blocage-a-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— colonne —</option>
                            @for (colonne of colonnesDe(rapprochement.a); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Clé de blocage B</label>
                        <select
                            class="champ"
                            [(ngModel)]="rapprochement.blockB"
                            [name]="'rapprochement-blocage-b-' + index"
                            [attr.name]="'rapprochement-blocage-b-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— colonne —</option>
                            @for (colonne of colonnesDe(rapprochement.b); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Seuil automatique</label
                        ><input
                            class="champ"
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            [(ngModel)]="rapprochement.thAuto"
                            [name]="'rapprochement-seuil-auto-' + index"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Seuil de revue</label
                        ><input
                            class="champ"
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            [(ngModel)]="rapprochement.thReview"
                            [name]="'rapprochement-seuil-revue-' + index"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                </div>
                <label class="etiquette" style="margin-top: 8px">Comparaisons (colonne A, colonne B, méthode, poids)</label>
                @for (comparaison of rapprochement.compares; track $index; let indexComparaison = $index) {
                    <div class="formulaire-ligne" style="max-width: 760px">
                        <select
                            class="champ"
                            [(ngModel)]="comparaison.colA"
                            [name]="'comparaison-a-' + index + '-' + indexComparaison"
                            [attr.name]="'comparaison-a-' + index + '-' + indexComparaison"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— colonne A —</option>
                            @for (colonne of colonnesDe(rapprochement.a); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                        <select
                            class="champ"
                            [(ngModel)]="comparaison.colB"
                            [name]="'comparaison-b-' + index + '-' + indexComparaison"
                            [attr.name]="'comparaison-b-' + index + '-' + indexComparaison"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="">— colonne B —</option>
                            @for (colonne of colonnesDe(rapprochement.b); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                        <select
                            class="champ"
                            [(ngModel)]="comparaison.method"
                            [name]="'comparaison-methode-' + index + '-' + indexComparaison"
                            [disabled]="!session.peutEditer()"
                        >
                            @for (methode of methodes(); track methode.cle) {
                                <option [value]="methode.cle">{{ methode.libelle }}</option>
                            }
                        </select>
                        <input
                            class="champ"
                            type="number"
                            min="0.1"
                            step="0.1"
                            [(ngModel)]="comparaison.weight"
                            [name]="'comparaison-poids-' + index + '-' + indexComparaison"
                            style="flex: 0 1 80px"
                            [disabled]="!session.peutEditer()"
                        />
                        @if (session.peutEditer()) {
                            <button
                                class="bouton petit danger"
                                (click)="rapprochement.compares.splice(indexComparaison, 1)"
                                style="flex: 0 0 auto"
                            >
                                ✕
                            </button>
                        }
                    </div>
                }
                <div class="entete-page" style="margin: 8px 0 0">
                    @if (session.peutEditer()) {
                        <button class="bouton petit" (click)="rapprochement.compares.push({ colA: '', colB: '', method: 'jw', weight: 1 })">
                            + comparaison
                        </button>
                        <button class="bouton principal petit" (click)="enregistrer(rapprochement)">Enregistrer</button>
                    }
                    <button class="bouton petit" (click)="executer(rapprochement)" [disabled]="enCours()">Générer les paires</button>
                    @if (session.peutEditer() && paires[rapprochement.id]) {
                        <button class="bouton petit" (click)="produireGolden(rapprochement)" [disabled]="enCours()">
                            Produire le golden record
                        </button>
                    }
                    @if (session.peutEditer()) {
                        <button class="bouton petit danger" (click)="supprimer(rapprochement)">Supprimer</button>
                    }
                </div>
                @if (paires[rapprochement.id]; as liste) {
                    <p class="discret" style="margin-top: 8px">
                        {{ liste.length }} paire(s) candidate(s) — {{ compter(liste, 'auto') }} automatique(s),
                        {{ compter(liste, 'review') }} à revoir, {{ compter(liste, 'ok') }} validée(s),
                        {{ compter(liste, 'ko') }} refusée(s).
                    </p>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Ligne A</th>
                                <th>Ligne B</th>
                                <th>Score</th>
                                <th>Statut</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (paire of liste; track paire.key) {
                                <tr>
                                    <td>{{ paire.da }}</td>
                                    <td>{{ paire.db }}</td>
                                    <td>{{ (paire.s * 100).toFixed(1) }} %</td>
                                    <td>
                                        <span
                                            class="badge"
                                            [class.succes]="paire.st === 'auto' || paire.st === 'ok'"
                                            [class.alerte]="paire.st === 'review'"
                                            [class.erreur]="paire.st === 'ko'"
                                        >
                                            {{ { auto: 'automatique', review: 'à revoir', ok: 'validée', ko: 'refusée' }[paire.st] }}
                                        </span>
                                    </td>
                                    <td>
                                        @if (session.peutEditer()) {
                                            <button class="bouton petit" (click)="decider(rapprochement, paire, 'ok')">
                                                ✔ même entité
                                            </button>
                                            <button class="bouton petit" (click)="decider(rapprochement, paire, 'ko')">✕ différente</button>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                }
            </div>
        } @empty {
            <div class="carte discret" style="text-align: center; padding: 40px">
                Aucun rapprochement. Choisissez deux sources, une clé de blocage et les colonnes à comparer.
            </div>
        }
    `,
    styles: `
        .carte + .carte {
            margin-top: 14px;
        }
    `
})
export class RapprochementComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly rapprochements = signal<Rapprochement[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireExploitation | null>(null);
    readonly enCours = signal(false);
    paires: Record<string, PaireCandidate[]> = {};
    readonly methodes = computed(() => Object.entries(this.vocabulaire()?.methodes || {}).map(([cle, libelle]) => ({ cle, libelle })));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [rapprochements, sources, vocabulaire] = await Promise.all([
                this.api.rapprochements(),
                this.api.sources(),
                this.vocabulaire() ?? this.api.vocabulaireExploitation()
            ]);
            this.rapprochements.set(
                rapprochements.map(rapprochement => ({
                    ...rapprochement,
                    compares: rapprochement.compares || [],
                    decisions: rapprochement.decisions || {},
                    thAuto: rapprochement.thAuto ?? 0.92,
                    thReview: rapprochement.thReview ?? 0.75
                }))
            );
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ajouter(): void {
        this.rapprochements.update(liste => [
            ...liste,
            {
                id: genererIdentifiant('lk'),
                name: 'Nouveau rapprochement',
                a: '',
                b: '',
                blockA: '',
                blockB: '',
                compares: [],
                thAuto: 0.92,
                thReview: 0.75,
                decisions: {}
            }
        ]);
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    compter(liste: PaireCandidate[], statut: PaireCandidate['st']): number {
        return liste.filter(paire => paire.st === statut).length;
    }

    async enregistrer(rapprochement: Rapprochement): Promise<void> {
        try {
            const { id, ...corps } = rapprochement;
            await this.api.enregistrerRapprochement(id, corps);
            this.notifications.succes(`Rapprochement « ${rapprochement.name} » enregistré.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async executer(rapprochement: Rapprochement): Promise<void> {
        this.enCours.set(true);
        try {
            if (this.session.peutEditer()) await this.enregistrer(rapprochement);
            const liste = await this.api.executerRapprochement(rapprochement.id);
            this.paires[rapprochement.id] = liste;
            this.notifications.succes(
                `${liste.length} paire(s) candidate(s) — ${this.compter(liste, 'auto')} automatique(s), ${this.compter(liste, 'review')} à revoir.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async decider(rapprochement: Rapprochement, paire: PaireCandidate, decision: 'ok' | 'ko'): Promise<void> {
        try {
            const enregistre = await this.api.deciderPaire(rapprochement.id, paire.key, decision);
            rapprochement.decisions = enregistre.decisions;
            paire.st = decision;
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async produireGolden(rapprochement: Rapprochement): Promise<void> {
        this.enCours.set(true);
        try {
            const resultat = await this.api.produireGolden(rapprochement.id);
            this.notifications.succes(
                `Golden record « ${resultat.golden} » (${resultat.fusions} fusion(s)) et correspondances « ${resultat.liens} » produits — visibles dans les sources.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async supprimer(rapprochement: Rapprochement): Promise<void> {
        if (!confirm(`Supprimer le rapprochement « ${rapprochement.name} » ?`)) return;
        try {
            await this.api.supprimerRapprochement(rapprochement.id);
        } catch {
            // Rapprochement jamais enregistré : rien côté serveur.
        }
        this.rapprochements.update(liste => liste.filter(candidat => candidat.id !== rapprochement.id));
    }
}
