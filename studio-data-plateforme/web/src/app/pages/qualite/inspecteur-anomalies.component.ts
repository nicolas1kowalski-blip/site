/**
 * Inspecteur d'anomalies (repris de l'application classique) : la liste des anomalies détectées par le profilage
 * (lignes identiques, lignes vides, espaces parasites ou multiples, bouche-trous, casses incohérentes, valeurs
 * aberrantes, valeurs vides), et pour chacune la possibilité de VOIR les lignes concernées, page par page, ou de
 * les exporter en CSV. Les filtres d'audit du profilage s'appliquent aux lignes affichées.
 */
import { Component, inject, input, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { Anomalie, FiltreAudit, PageLignes } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { telechargerCsv } from '../../coeur/telechargement';
import { PageLignesComponent, TAILLE_PAGE_LIGNES } from './page-lignes.component';

/** Au-delà de ce nombre de lignes, l'export s'arrête (le fichier resterait exploitable ; le serveur est ménagé). */
const LIGNES_EXPORTEES_MAXIMUM = 5000;

@Component({
    selector: 'app-inspecteur-anomalies',
    imports: [PageLignesComponent],
    template: `
        <div class="carte">
            <h2>Anomalies détectées</h2>
            @if (!anomalies().length) {
                <div class="vide">
                    Aucune anomalie : pas de ligne identique ni vide, pas d'espace parasite, de bouche-trous ni de casse incohérente.
                </div>
            } @else {
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Anomalie</th>
                            <th>Colonne</th>
                            <th>Lignes</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (anomalie of anomalies(); track anomalie.genre + anomalie.colonne) {
                            <tr [class.choisie]="estChoisie(anomalie)">
                                <td>{{ anomalie.libelle }}</td>
                                <td>
                                    <code>{{ anomalie.colonne }}</code>
                                </td>
                                <td>
                                    <span class="badge" [class.alerte]="anomalie.nombre > 0">{{ anomalie.nombre }}</span>
                                </td>
                                <td style="white-space: nowrap">
                                    <button class="bouton petit" (click)="voir(anomalie)" [disabled]="enCours()">Voir les lignes</button>
                                    <button class="bouton petit" (click)="exporter(anomalie)" [disabled]="enCours()">CSV</button>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>
        @if (page()) {
            <div class="carte">
                <app-page-lignes
                    [titre]="titrePage()"
                    [page]="page()"
                    [enCours]="enCours()"
                    (changerOffset)="charger($event)"
                    (exporter)="exporter(anomalieChoisie()!)"
                    (fermer)="fermer()"
                />
            </div>
        }
    `,
    styles: `
        tr.choisie td {
            background: color-mix(in srgb, var(--accent) 8%, transparent);
        }
    `
})
export class InspecteurAnomaliesComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sourceId = input.required<string>();
    readonly sourceNom = input('');
    readonly anomalies = input<Anomalie[]>([]);
    readonly filtres = input<FiltreAudit[]>([]);

    readonly anomalieChoisie = signal<Anomalie | null>(null);
    readonly page = signal<PageLignes | null>(null);
    readonly enCours = signal(false);

    estChoisie(anomalie: Anomalie): boolean {
        const choisie = this.anomalieChoisie();
        return !!choisie && choisie.genre === anomalie.genre && choisie.colonne === anomalie.colonne;
    }
    titrePage(): string {
        const anomalie = this.anomalieChoisie();
        return anomalie ? `${anomalie.libelle} — ${anomalie.colonne}` : 'Lignes';
    }
    fermer(): void {
        this.page.set(null);
        this.anomalieChoisie.set(null);
    }

    async voir(anomalie: Anomalie): Promise<void> {
        this.anomalieChoisie.set(anomalie);
        await this.charger(0);
    }
    async charger(offset: number): Promise<void> {
        const anomalie = this.anomalieChoisie();
        if (!anomalie) return;
        this.enCours.set(true);
        try {
            this.page.set(
                await this.api.lignesAnomalie(this.sourceId(), anomalie.genre, anomalie.colonne, Math.max(0, offset), this.filtres())
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Exporte toutes les lignes de l'anomalie (page après page, jusqu'au plafond). */
    async exporter(anomalie: Anomalie): Promise<void> {
        this.enCours.set(true);
        try {
            const lignes: unknown[][] = [];
            let colonnes: string[] = [];
            let offset = 0;
            let total = 0;
            do {
                const page = await this.api.lignesAnomalie(this.sourceId(), anomalie.genre, anomalie.colonne, offset, this.filtres());
                colonnes = page.colonnes;
                total = page.total;
                lignes.push(...page.lignes);
                offset += TAILLE_PAGE_LIGNES;
                if (!page.lignes.length) break;
            } while (offset < total && lignes.length < LIGNES_EXPORTEES_MAXIMUM);
            const nomFichier = `${this.sourceNom() || this.sourceId()} - ${anomalie.genre} - ${anomalie.colonne}.csv`.replace(
                /[\\/:*?"<>|()]/g,
                ''
            );
            telechargerCsv(nomFichier, colonnes, lignes);
            const complement = lignes.length < total ? ` (sur ${total})` : '';
            this.notifications.succes(`${lignes.length} ligne(s)${complement} exportée(s).`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
