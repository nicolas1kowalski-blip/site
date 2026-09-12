/** Accueil : état du serveur, volumes de l'espace courant, sources récentes et dernières actions du journal. */
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { EntreeJournal, Sante, Source, formaterDate, formaterOctets } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-accueil',
    imports: [RouterLink],
    template: `
        <div class="entete-page">
            <div>
                <h1>Bienvenue dans Studio Data</h1>
                <p class="discret">
                    Espace « {{ session.espaceCourant()?.nom || 'aucun' }} » · vous êtes {{ session.roleDansEspace() || 'sans rôle' }}
                </p>
            </div>
        </div>
        @if (!session.espaceCourant()) {
            <div class="carte vide">Vous n'appartenez à aucun espace de travail. Demandez à un administrateur de vous y ajouter.</div>
        } @else {
            <div class="kpis">
                <div class="kpi">
                    <b>{{ sources().length }}</b
                    ><span>source(s)</span>
                </div>
                <div class="kpi">
                    <b>{{ formaterOctets(sante()?.octetsFichiers) }}</b
                    ><span>de fichiers sur le serveur</span>
                </div>
                <div class="kpi">
                    <b>{{ sante()?.duckdb || '…' }}</b
                    ><span>moteur DuckDB</span>
                </div>
                <div class="kpi">
                    <b>{{ sante()?.baseReferentielle?.pilote || '…' }}</b
                    ><span>base référentielle</span>
                </div>
                <div class="kpi">
                    <b>{{ sante()?.requetesExecutees ?? '…' }}</b
                    ><span>requêtes exécutées</span>
                </div>
            </div>
            <div class="grille" style="margin-top: 14px">
                <div class="carte">
                    <h2>Sources récentes</h2>
                    @if (sources().length === 0) {
                        <p class="discret">Aucune source. <a routerLink="/sources">Déposer un fichier</a>.</p>
                    }
                    <table class="tableau">
                        <tbody>
                            @for (source of sources().slice(0, 8); track source.id) {
                                <tr>
                                    <td>
                                        <b>{{ source.name }}</b>
                                    </td>
                                    <td class="discret">{{ source.headers.length }} colonne(s)</td>
                                    <td>
                                        <span class="badge neutre">{{ source.storage }}</span>
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="carte">
                    <h2>Dernières actions</h2>
                    @if (journal().length === 0) {
                        <p class="discret">Rien pour l'instant.</p>
                    }
                    <table class="tableau">
                        <tbody>
                            @for (entree of journal(); track entree.id) {
                                <tr>
                                    <td class="discret">{{ formaterDate(entree.horodatage) }}</td>
                                    <td>{{ entree.auteur }}</td>
                                    <td>
                                        <code>{{ entree.action }}</code> {{ entree.cible || '' }}
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }
    `
})
export class AccueilComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sante = signal<Sante | null>(null);
    readonly sources = signal<Source[]>([]);
    readonly journal = signal<EntreeJournal[]>([]);
    readonly formaterOctets = formaterOctets;
    readonly formaterDate = formaterDate;

    constructor() {
        this.charger();
    }

    private async charger(): Promise<void> {
        try {
            this.sante.set(await this.api.sante());
            if (!this.session.espaceCourant()) return;
            const [sources, journal] = await Promise.all([this.api.sources(), this.api.journal(8)]);
            this.sources.set(sources);
            this.journal.set(journal);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
