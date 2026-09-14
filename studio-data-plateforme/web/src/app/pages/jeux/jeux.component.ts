/**
 * ⏳ Jeux temporaires — le plan de travail de la session.
 *
 * Un jeu temporaire est un tableau gardé pour l'espace de travail : le résultat d'une extraction, un fichier
 * reçu, les anomalies d'un audit, les écarts d'une comparaison. Il s'utilise partout — comparer, auditer,
 * analyser, extraire — mais il n'est ni une source, ni dans le modèle de données, ni dans les sauvegardes.
 *
 * Cet écran les liste et permet, pour chacun : le renommer, l'ouvrir dans un autre écran, l'exporter en CSV,
 * le promouvoir en source quand il mérite de rester, ou le supprimer.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { JeuTemporaire, OrigineJeu } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

/** Les écrans où un jeu se travaille, avec l'adresse à ouvrir. */
const DESTINATIONS: { chemin: string; libelle: string }[] = [
    { chemin: '/extraction', libelle: 'Extraire' },
    { chemin: '/qualite', libelle: 'Qualité & Audit' },
    { chemin: '/comparateur', libelle: 'Comparer' },
    { chemin: '/statistiques', libelle: 'Statistiques' },
    { chemin: '/navigateur', libelle: 'Explorer' },
    { chemin: '/explorateur-360', libelle: 'Explorateur 360°' }
];

@Component({
    selector: 'app-jeux',
    imports: [FormsModule, RouterLink],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>⏳ Jeux temporaires</h1>
                <p class="discret">
                    Des tableaux gardés pour votre plan de travail : résultat d'une extraction, fichier reçu, anomalies d'un audit, écarts
                    d'une comparaison. Utilisables partout, mais ni sources, ni modèle, ni sauvegardes.
                </p>
            </div>
            <button class="bouton" type="button" name="rafraichir" (click)="charger()">Actualiser</button>
        </div>

        @if (!jeux().length) {
            <div class="carte vide">
                Aucun jeu pour l'instant. Depuis <a routerLink="/extraction">Extraire</a>, le bouton « ⏳ Garder comme jeu temporaire » met
                le résultat de côté sans créer de source.
            </div>
        } @else {
            <div class="carte">
                <div class="defilement-x">
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Nom</th>
                                <th>Origine</th>
                                <th class="droite">Lignes</th>
                                <th class="droite">Colonnes</th>
                                <th>Créé le</th>
                                <th>Utiliser dans</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (jeu of jeux(); track jeu.id) {
                                <tr>
                                    <td>
                                        <b>{{ jeu.nom }}</b>
                                    </td>
                                    <td>
                                        <span class="badge neutre">{{ libelleOrigine(jeu.origine) }}</span>
                                    </td>
                                    <td class="droite">{{ jeu.lignes.toLocaleString('fr-FR') }}</td>
                                    <td class="droite" [title]="jeu.colonnes.join(', ')">{{ jeu.colonnes.length }}</td>
                                    <td class="discret">{{ dateLisible(jeu.creeLe) }}</td>
                                    <td>
                                        <select
                                            class="champ petit"
                                            [ngModel]="''"
                                            (ngModelChange)="ouvrirDans(jeu, $event)"
                                            [name]="'ouvrir_' + jeu.id"
                                            [attr.name]="'ouvrir_' + jeu.id"
                                        >
                                            <option value="">choisir un écran…</option>
                                            @for (destination of destinations; track destination.chemin) {
                                                <option [value]="destination.chemin">{{ destination.libelle }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td class="droite actions">
                                        <button class="bouton petit" type="button" (click)="exporter(jeu)">CSV</button>
                                        @if (session.peutEditer()) {
                                            <button class="bouton petit" type="button" (click)="renommer(jeu)">Renommer</button>
                                            <button class="bouton petit" type="button" (click)="promouvoir(jeu)">
                                                Promouvoir en source
                                            </button>
                                            <button class="bouton petit danger" type="button" (click)="supprimer(jeu)">✕</button>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }
    `,
    styles: `
        .droite {
            text-align: right;
        }
        .actions {
            white-space: nowrap;
        }
        .actions .bouton + .bouton {
            margin-left: 4px;
        }
        .champ.petit {
            padding: 4px 6px;
            font-size: 12px;
            width: auto;
        }
    `
})
export class JeuxComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly routeur = inject(Router);

    readonly jeux = signal<JeuTemporaire[]>([]);
    readonly origines = signal<Record<string, string>>({});
    readonly destinations = DESTINATIONS;
    readonly total = computed(() => this.jeux().reduce((somme, jeu) => somme + jeu.lignes, 0));

    constructor() {
        this.charger();
    }

    async charger(): Promise<void> {
        try {
            this.jeux.set(await this.api.jeux());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    libelleOrigine(origine: OrigineJeu): string {
        return (
            {
                extraction: "résultat d'une extraction",
                fichier: 'fichier reçu',
                anomalies: "anomalies d'un audit",
                ecarts: "écarts d'une comparaison",
                requete: 'résultat d’une requête'
            }[origine] || origine
        );
    }
    dateLisible(iso: string): string {
        return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
    }

    /** Ouvre l'écran demandé en lui passant le jeu : chaque écran sait présélectionner la table reçue. */
    ouvrirDans(jeu: JeuTemporaire, chemin: string): void {
        if (chemin) this.routeur.navigate([chemin], { queryParams: { source: jeu.id } });
    }

    async renommer(jeu: JeuTemporaire): Promise<void> {
        const nom = prompt('Nouveau nom du jeu :', jeu.nom);
        if (!nom || nom === jeu.nom) return;
        await this.agir(async () => {
            await this.api.renommerJeu(jeu.id, nom);
            this.notifications.succes(`Jeu renommé « ${nom} ».`);
        });
    }

    async promouvoir(jeu: JeuTemporaire): Promise<void> {
        const nom = prompt('Nom de la source à créer :', jeu.nom);
        if (!nom) return;
        await this.agir(async () => {
            await this.api.promouvoirJeu(jeu.id, nom);
            this.notifications.succes(`« ${nom} » est désormais une source de l'espace.`);
        });
    }

    async supprimer(jeu: JeuTemporaire): Promise<void> {
        if (!confirm(`Supprimer le jeu « ${jeu.nom} » ? Son contenu sera perdu.`)) return;
        await this.agir(async () => {
            await this.api.supprimerJeu(jeu.id);
            this.notifications.succes(`Jeu « ${jeu.nom} » supprimé.`);
        });
    }

    async exporter(jeu: JeuTemporaire): Promise<void> {
        try {
            const blob = await this.api.exporterJeuCsv(jeu.id);
            const lien = document.createElement('a');
            lien.href = URL.createObjectURL(blob);
            lien.download = jeu.nom.replace(/[^\w.-]+/g, '_') + '.csv';
            lien.click();
            URL.revokeObjectURL(lien.href);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    private async agir(action: () => Promise<void>): Promise<void> {
        try {
            await action();
            await this.charger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
