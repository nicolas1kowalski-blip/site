/** Journal d'audit de l'espace courant : qui a fait quoi, quand. */
import { JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { EntreeJournal, formaterDate } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';

@Component({
    selector: 'app-journal',
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Journal</h1>
                <p class="discret">Les 200 dernières actions de l'espace</p>
            </div>
            <button class="bouton" (click)="recharger()">Actualiser</button>
        </div>
        <div class="carte">
            @if (entrees().length === 0) {
                <div class="vide">Aucune action consignée.</div>
            } @else {
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Auteur</th>
                            <th>Action</th>
                            <th>Cible</th>
                            <th>Détails</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (entree of entrees(); track entree.id) {
                            <tr>
                                <td class="discret" style="white-space: nowrap">{{ formaterDate(entree.horodatage) }}</td>
                                <td>{{ entree.auteur }}</td>
                                <td>
                                    <code>{{ entree.action }}</code>
                                </td>
                                <td>{{ entree.cible || '—' }}</td>
                                <td class="discret">{{ entree.details ? (entree.details | json) : '' }}</td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>
    `,
    imports: [JsonPipe]
})
export class JournalComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly entrees = signal<EntreeJournal[]>([]);
    readonly formaterDate = formaterDate;

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.entrees.set(await this.api.journal(200));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
