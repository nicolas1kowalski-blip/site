/**
 * Audit d'un objet métier (repris de l'application classique) : à partir d'un objet de la gouvernance, le serveur
 * profile sa table maître (avec un périmètre facultatif), exécute les règles des tables de son périmètre et vérifie
 * la cardinalité 1–1 de chaque facette (chaque ligne maître doit avoir exactement une ligne dans la table de la
 * facette). L'écran choisit l'objet, pose les filtres, affiche et exporte le résultat.
 */
import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { AuditObjet, FiltreAudit, ObjetMetier, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { telechargerJson } from '../../coeur/telechargement';
import { cibleDeLaRegle } from './description-regle';
import { FiltresAuditComponent } from './filtres-audit.component';
import { InspecteurAnomaliesComponent } from './inspecteur-anomalies.component';

@Component({
    selector: 'app-audit-objet',
    imports: [FormsModule, FiltresAuditComponent, InspecteurAnomaliesComponent],
    template: `
        <div class="carte">
            <div class="entete-page" style="margin: 0">
                <div class="espace">
                    <h2>Audit d'un objet métier</h2>
                    <p class="discret">
                        Profil de la table maître, règles de qualité du périmètre de l'objet, cardinalité de ses facettes.
                    </p>
                </div>
                <select
                    class="champ"
                    style="width: auto; min-width: 200px"
                    name="objet"
                    [(ngModel)]="objetId"
                    (ngModelChange)="audit.set(null)"
                >
                    <option value="">Choisir un objet métier…</option>
                    @for (objet of objets(); track objet.id) {
                        <option [value]="objet.id">{{ objet.name }}</option>
                    }
                </select>
                <button class="bouton principal" type="button" (click)="auditer()" [disabled]="!objetId || enCours()">
                    {{ enCours() ? 'Audit…' : "Auditer l'objet" }}
                </button>
            </div>
            @if (objetChoisi(); as objet) {
                <div style="margin-top: 10px">
                    <span class="discret">Table maître : </span><code>{{ tableMaitreDe(objet) || '(aucune)' }}</code>
                    @if (!objets().length) {
                        <span class="discret">Aucun objet métier : créez-en un dans Gouvernance › Objets métier.</span>
                    }
                </div>
                <div style="margin-top: 8px">
                    <app-filtres-audit [colonnes]="colonnesMaitre()" prefixe="objet" [(filtres)]="filtres" />
                </div>
            }
        </div>

        @if (audit(); as audit) {
            <div class="carte">
                <div class="entete-page" style="margin: 0">
                    <h2>{{ audit.objet.name }} — table maître {{ audit.tableMaitre }}</h2>
                    <span class="badge neutre">{{ audit.profil.lignes }} ligne(s)</span>
                    <span
                        class="badge"
                        [class.succes]="audit.profil.completudeMoyenne >= 0.95"
                        [class.alerte]="audit.profil.completudeMoyenne < 0.95"
                        >complétude moyenne {{ pourcent(audit.profil.completudeMoyenne) }}</span
                    >
                    <span class="badge" [class.succes]="audit.profil.doublonsExacts === 0" [class.erreur]="audit.profil.doublonsExacts > 0"
                        >{{ audit.profil.doublonsExacts }} doublon(s) exact(s)</span
                    >
                    <span
                        class="badge"
                        [class.succes]="(audit.regles.score ?? 100) >= 90"
                        [class.alerte]="(audit.regles.score ?? 100) < 90 && (audit.regles.score ?? 100) >= 70"
                        [class.erreur]="(audit.regles.score ?? 100) < 70"
                        >score {{ audit.regles.score ?? '—' }} / 100 ({{ audit.regles.regles.length }} règle(s))</span
                    >
                    <span class="espace"></span>
                    <button class="bouton petit" type="button" (click)="exporter()">Exporter (JSON)</button>
                </div>
            </div>
            <div class="carte">
                <h2>Facettes (cardinalité 1–1 avec la table maître)</h2>
                @if (!audit.facettes.length) {
                    <div class="vide">Cet objet n'a pas de facette (structure) déclarée.</div>
                } @else {
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Facette</th>
                                <th>Table</th>
                                <th>Lignes maître</th>
                                <th>Sans ligne</th>
                                <th>Plusieurs lignes</th>
                                <th>Exemples</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (facette of audit.facettes; track facette.nom) {
                                <tr>
                                    <td>
                                        <b>{{ facette.nom }}</b>
                                    </td>
                                    <td>
                                        <code>{{ facette.table }}</code>
                                    </td>
                                    @if (facette.erreur) {
                                        <td colspan="4">
                                            <span class="badge erreur">{{ facette.erreur }}</span>
                                        </td>
                                    } @else {
                                        <td>{{ facette.total }}</td>
                                        <td>
                                            <span
                                                class="badge"
                                                [class.succes]="facette.sansLigne === 0"
                                                [class.alerte]="facette.sansLigne > 0"
                                                >{{ facette.sansLigne }}</span
                                            >
                                        </td>
                                        <td>
                                            <span
                                                class="badge"
                                                [class.succes]="facette.plusieurs === 0"
                                                [class.erreur]="facette.plusieurs > 0"
                                                >{{ facette.plusieurs }}</span
                                            >
                                        </td>
                                        <td class="discret">{{ facette.exemples.join(' · ') }}</td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                }
            </div>
            @if (audit.regles.regles.length) {
                <div class="carte">
                    <h2>Règles du périmètre</h2>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Règle</th>
                                <th>Colonne</th>
                                <th>Criticité</th>
                                <th>Résultat</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (regle of audit.regles.regles; track regle.id) {
                                <tr>
                                    <td>
                                        <b>{{ regle.nom }}</b>
                                    </td>
                                    <td>
                                        <code>{{ cibleDeLaRegle(regle) }}</code>
                                    </td>
                                    <td>{{ regle.criticite }}</td>
                                    <td>
                                        @if (regle.resultat; as resultat) {
                                            <span class="badge" [class.succes]="resultat.echecs === 0" [class.erreur]="resultat.echecs > 0"
                                                >{{ resultat.echecs }} échec(s) / {{ resultat.total }}</span
                                            >
                                        } @else {
                                            <span class="badge erreur">{{ regle.erreur }}</span>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
            <app-inspecteur-anomalies
                [sourceId]="audit.profil.sourceId"
                [sourceNom]="audit.tableMaitre"
                [anomalies]="audit.profil.anomalies || []"
                [filtres]="filtres"
            />
        }
    `
})
export class AuditObjetComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly objets = input<ObjetMetier[]>([]);
    readonly sources = input<Source[]>([]);

    readonly cibleDeLaRegle = cibleDeLaRegle;
    objetId = '';
    filtres: FiltreAudit[] = [];
    readonly audit = signal<AuditObjet | null>(null);
    readonly enCours = signal(false);

    objetChoisi(): ObjetMetier | null {
        return this.objets().find(objet => objet.id === this.objetId) || null;
    }
    tableMaitreDe(objet: ObjetMetier): string {
        return (objet.sources.find(source => source.role === 'maitre') || objet.sources[0])?.table || '';
    }
    colonnesMaitre(): string[] {
        const objet = this.objetChoisi();
        const nomTable = objet ? this.tableMaitreDe(objet) : '';
        return this.sources().find(source => source.name === nomTable)?.headers || [];
    }
    pourcent(valeur: number): string {
        return (100 * valeur).toFixed(1) + ' %';
    }

    async auditer(): Promise<void> {
        this.enCours.set(true);
        try {
            this.audit.set(await this.api.auditerObjet(this.objetId, this.filtres));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
    exporter(): void {
        const audit = this.audit();
        if (audit) telechargerJson(`audit ${audit.objet.name}.json`, audit);
    }
}
