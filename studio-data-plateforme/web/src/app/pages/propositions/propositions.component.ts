/**
 * Propositions à valider : les modifications proposées par les membres (définition, propriétaire, description…)
 * sont listées ici, regroupées par domaine ; un éditeur les accepte (la valeur est appliquée) ou les refuse ;
 * l'auteur peut retirer la sienne. Les décisions passées restent consultables.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { Proposition, formaterDate } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-propositions',
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Propositions à valider</h1>
                <p class="discret">{{ enAttente().length }} en attente — un éditeur valide ou refuse ; la valeur validée est appliquée.</p>
            </div>
        </div>
        @for (groupe of parDomaine(); track groupe.domaine) {
            <div class="carte">
                <h2>{{ groupe.domaine }}</h2>
                @for (proposition of groupe.propositions; track proposition.id) {
                    <div class="proposition">
                        <div class="espace">
                            <div class="libelle">{{ proposition.label }}</div>
                            <div class="valeurs">
                                <span class="avant">{{ proposition.before || 'vide' }}</span> →
                                <strong>{{ proposition.after || 'vide' }}</strong>
                            </div>
                            <div class="discret">
                                proposé par {{ proposition.byName || proposition.by }} le {{ formaterDate(proposition.at) }}
                            </div>
                        </div>
                        @if (session.peutEditer()) {
                            <button class="bouton principal petit" (click)="accepter(proposition)">Valider</button>
                            <button class="bouton petit danger" (click)="refuser(proposition)">Refuser</button>
                        }
                        @if (proposition.by === session.utilisateur()?.identifiant || session.peutEditer()) {
                            <button class="bouton petit" (click)="retirer(proposition)">Retirer</button>
                        }
                    </div>
                }
            </div>
        } @empty {
            <div class="carte discret" style="text-align: center; padding: 30px">Rien à valider.</div>
        }
        @if (decidees().length) {
            <div class="carte">
                <h2>Décisions passées</h2>
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Proposition</th>
                            <th>Valeur</th>
                            <th>Décision</th>
                            <th>Par</th>
                            <th>Le</th>
                            <th>Commentaire</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (proposition of decidees(); track proposition.id) {
                            <tr>
                                <td>{{ proposition.label }}</td>
                                <td>{{ proposition.after }}</td>
                                <td>
                                    <span
                                        class="badge"
                                        [class.succes]="proposition.status === 'accepted'"
                                        [class.erreur]="proposition.status === 'rejected'"
                                    >
                                        {{ proposition.status === 'accepted' ? 'validée' : 'refusée' }}
                                    </span>
                                </td>
                                <td>{{ proposition.decidedBy }}</td>
                                <td class="discret">{{ formaterDate(proposition.decidedAt) }}</td>
                                <td class="discret">{{ proposition.comment }}</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }
    `,
    styles: `
        .proposition {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
            border-top: 1px solid var(--bordure);
        }
        .libelle {
            font-weight: 700;
        }
        .valeurs {
            font-size: 13px;
        }
        .avant {
            color: var(--texte-2);
            text-decoration: line-through;
        }
    `
})
export class PropositionsComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly formaterDate = formaterDate;
    readonly propositions = signal<Proposition[]>([]);
    readonly enAttente = computed(() => this.propositions().filter(proposition => proposition.status === 'pending'));
    readonly decidees = computed(() => this.propositions().filter(proposition => proposition.status !== 'pending'));
    readonly parDomaine = computed(() => {
        const groupes = new Map<string, Proposition[]>();
        for (const proposition of this.enAttente()) {
            const domaine = proposition.domain || 'Sans domaine';
            if (!groupes.has(domaine)) groupes.set(domaine, []);
            groupes.get(domaine)!.push(proposition);
        }
        return [...groupes].map(([domaine, propositions]) => ({ domaine, propositions }));
    });

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.propositions.set(await this.api.propositions());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async accepter(proposition: Proposition): Promise<void> {
        try {
            await this.api.accepterProposition(proposition.id);
            this.notifications.succes('Proposition validée et appliquée.');
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async refuser(proposition: Proposition): Promise<void> {
        const motif = prompt('Motif du refus (facultatif) :') ?? '';
        try {
            await this.api.refuserProposition(proposition.id, motif);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async retirer(proposition: Proposition): Promise<void> {
        try {
            await this.api.retirerProposition(proposition.id);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
