/**
 * Sensibilité des données : classification de chaque colonne (public, interne, confidentiel, données
 * personnelles), niveau proposé automatiquement (dictionnaire, nom de colonne), action d'anonymisation par
 * niveau, et détection des données personnelles (RGPD) sur les sources chargées.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Classification, ColonneClassee, ColonnePersonnelle, NiveauSensibilite } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-sensibilite',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Sensibilité</h1>
                <p class="discret">Classifiez chaque colonne ; le niveau proposé vient du dictionnaire et du nom de la colonne.</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="detecter()" [disabled]="enCours()">
                    {{ enCours() ? 'Analyse…' : 'Détecter les données personnelles (RGPD)' }}
                </button>
            }
        </div>

        @if (detectees(); as detectees) {
            <div class="carte" [class.alerte-carte]="detectees.length > 0">
                @if (detectees.length) {
                    <strong>{{ detectees.length }} colonne(s) à caractère personnel détectée(s)</strong> — sensibilité « Personnel (RGPD) »
                    pré-remplie dans le dictionnaire :
                    @for (colonne of detectees; track colonne.table + colonne.col) {
                        <span class="puce" [title]="colonne.motif">{{ colonne.table }}.{{ colonne.col }}</span>
                    }
                } @else {
                    Aucune donnée personnelle évidente détectée.
                }
            </div>
        }

        @if (classification(); as classification) {
            <div class="carte">
                <h2>Action d'anonymisation par niveau</h2>
                <div class="formulaire-ligne">
                    @for (niveau of niveaux(); track niveau.cle) {
                        <div>
                            <label class="etiquette">{{ niveau.libelle }}</label>
                            <select
                                class="champ"
                                [ngModel]="classification.actions[niveau.cle]"
                                (ngModelChange)="definirAction(niveau.cle, $event)"
                                [name]="'action-' + niveau.cle"
                                [attr.name]="'action-' + niveau.cle"
                                [disabled]="!session.peutEditer()"
                            >
                                @for (action of actions(); track action.cle) {
                                    <option [value]="action.cle">{{ action.libelle }}</option>
                                }
                            </select>
                        </div>
                    }
                </div>
            </div>
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2 class="espace">Classification des colonnes</h2>
                    <input class="champ" style="width: 220px" placeholder="Filtrer…" [(ngModel)]="filtre" name="filtre" />
                    <span class="badge">{{ nombreClassees() }} / {{ classification.colonnes.length }} classée(s)</span>
                </div>
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Table</th>
                            <th>Colonne</th>
                            <th>Sensibilité (dictionnaire)</th>
                            <th>Niveau proposé</th>
                            <th>Niveau retenu</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (colonne of colonnesFiltrees(); track colonne.table + colonne.col) {
                            <tr>
                                <td>{{ colonne.table }}</td>
                                <td>
                                    <code>{{ colonne.col }}</code>
                                </td>
                                <td class="discret">{{ colonne.sensibilite || '—' }}</td>
                                <td>
                                    <span class="badge" [class]="'badge niveau-' + colonne.niveauPropose">{{
                                        classification.niveaux[colonne.niveauPropose]
                                    }}</span>
                                </td>
                                <td>
                                    <select
                                        class="champ"
                                        [ngModel]="colonne.niveau"
                                        (ngModelChange)="definirNiveau(colonne, $event)"
                                        [name]="'niveau-' + colonne.table + '-' + colonne.col"
                                        [attr.name]="'niveau-' + colonne.table + '-' + colonne.col"
                                        [disabled]="!session.peutEditer()"
                                    >
                                        <option value="">(proposé)</option>
                                        @for (niveau of niveaux(); track niveau.cle) {
                                            <option [value]="niveau.cle">{{ niveau.libelle }}</option>
                                        }
                                    </select>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }
    `,
    styles: `
        .alerte-carte {
            border-color: var(--alerte);
        }
        .puce {
            display: inline-block;
            font-size: 11px;
            padding: 2px 6px;
            margin: 0 4px 4px 0;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            background: var(--surface-2);
        }
        .niveau-personnel {
            background: color-mix(in srgb, var(--erreur) 15%, transparent);
            color: var(--erreur);
        }
        .niveau-confidentiel {
            background: color-mix(in srgb, var(--alerte) 18%, transparent);
            color: var(--alerte);
        }
        .niveau-public {
            background: color-mix(in srgb, var(--succes) 15%, transparent);
            color: var(--succes);
        }
    `
})
export class SensibiliteComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly classification = signal<Classification | null>(null);
    readonly detectees = signal<ColonnePersonnelle[] | null>(null);
    readonly enCours = signal(false);
    readonly filtre$ = signal('');
    filtre = '';

    readonly niveaux = computed(() =>
        Object.entries(this.classification()?.niveaux || {}).map(([cle, libelle]) => ({ cle: cle as NiveauSensibilite, libelle }))
    );
    readonly actions = computed(() =>
        Object.entries(this.classification()?.actionsPossibles || {}).map(([cle, libelle]) => ({ cle, libelle }))
    );
    readonly colonnesFiltrees = computed(() => {
        const texte = this.filtre$().trim().toLowerCase();
        return (this.classification()?.colonnes || []).filter(
            colonne => !texte || `${colonne.table}.${colonne.col}`.toLowerCase().includes(texte)
        );
    });
    readonly nombreClassees = computed(() => (this.classification()?.colonnes || []).filter(colonne => colonne.niveau).length);

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.classification.set(await this.api.classification());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async definirNiveau(colonne: ColonneClassee, niveau: NiveauSensibilite): Promise<void> {
        try {
            await this.api.definirNiveauSensibilite(colonne.table, colonne.col, niveau);
            colonne.niveau = niveau;
            this.classification.update(courante => (courante ? { ...courante } : courante));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async definirAction(niveau: string, action: string): Promise<void> {
        try {
            const actions = await this.api.definirActionsSensibilite({ [niveau]: action });
            this.classification.update(courante => (courante ? { ...courante, actions } : courante));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async detecter(): Promise<void> {
        this.enCours.set(true);
        try {
            this.detectees.set(await this.api.detecterDonneesPersonnelles());
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
