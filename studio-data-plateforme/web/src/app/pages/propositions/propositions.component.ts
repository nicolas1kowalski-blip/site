/**
 * Propositions à valider : les modifications proposées par les membres (définition, propriétaire, description…)
 * sont listées ici, regroupées par domaine ; un éditeur les accepte (la valeur est appliquée) ou les refuse ;
 * l'auteur peut retirer la sienne. Les décisions passées restent consultables.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { Actif, ObjetMetier, Personne, Proposition, TermeGlossaire, formaterDate } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { correspondALIdentite } from '../personnes/roles-personnes';
import { SessionService } from '../../coeur/session.service';
import {
    GroupeDePropositions,
    decidablesDuGroupe,
    etatDuToutValider,
    peutDecider,
    pouvoirDeDecider,
    regrouperLesPropositions
} from './groupes-propositions';

@Component({
    selector: 'app-propositions',
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Propositions à valider</h1>
                <p class="discret">{{ enAttente().length }} en attente — un éditeur valide ou refuse ; la valeur validée est appliquée.</p>
            </div>
        </div>
        <!--
            V13 : les propositions n'arrivent pas une par une — quelqu'un relit une fiche entière et
            corrige cinq définitions d'un coup. On les regroupe donc par ce qu'elles visent, et l'on peut
            trancher pour tout le groupe. La validation revient au responsable du domaine, pas à n'importe
            quel éditeur : sans cela, valider ne voudrait rien dire.
        -->
        @for (groupe of parCible(); track groupe.cle; let rang = $index) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 4px">
                    <h2 class="espace" style="margin: 0">{{ groupe.libelle }}</h2>
                    <span class="discret">{{ groupe.propositions.length }} en attente</span>
                    @if (session.peutEditer()) {
                        @let tout = etatDuToutValider(groupe);
                        <button
                            class="bouton petit"
                            type="button"
                            [attr.name]="'toutValider-' + rang"
                            [disabled]="!tout.possible || enCours()"
                            [title]="tout.raison"
                            (click)="toutValider(groupe)"
                        >
                            {{ tout.libelle }}
                        </button>
                        @if (tout.raison) {
                            <span class="discret">{{ tout.raison }}</span>
                        }
                    }
                </div>
                @for (proposition of groupe.propositions; track proposition.id) {
                    <div class="proposition">
                        <div class="espace">
                            <div class="libelle">{{ proposition.label }}</div>
                            <div class="valeurs">
                                <span class="avant">{{ proposition.before || 'vide' }}</span> →
                                <strong>{{ proposition.after || 'vide' }}</strong>
                            </div>
                            <div class="discret">
                                proposé par {{ proposition.byName || proposition.by }} le {{ formaterDate(proposition.at) }} · domaine
                                {{ proposition.domain || '—' }}
                            </div>
                        </div>
                        @if (session.peutEditer() && peutDecider(proposition)) {
                            <button class="bouton principal petit" (click)="accepter(proposition)">Valider</button>
                            <button class="bouton petit danger" (click)="refuser(proposition)">Refuser</button>
                        } @else if (session.peutEditer()) {
                            <span class="discret" title="Seul le responsable du domaine peut trancher">
                                à décider par le responsable de « {{ proposition.domain || 'sans domaine' }} »
                            </span>
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
    readonly personnes = signal<Personne[]>([]);
    readonly enCours = signal(false);
    /** Les noms réels des cibles : une proposition doit se lire sans jamais montrer d'identifiant interne. */
    readonly nomsConnus = signal<Record<string, string>>({});

    readonly parCible = computed(() => regrouperLesPropositions(this.enAttente(), this.nomsConnus()));
    /** Ce que la personne connectée a le droit de trancher : ses domaines, ou tout si elle administre. */
    readonly pouvoir = computed(() =>
        pouvoirDeDecider(
            this.personnes(),
            { email: this.session.utilisateur()?.email || '', nom: this.session.utilisateur()?.nomAffiche || '' },
            this.session.estAdministrateurGlobal(),
            correspondALIdentite
        )
    );

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [propositions, personnes, objets, termes, actifs] = await Promise.all([
                this.api.propositions(),
                this.api.personnes(),
                this.api.objetsMetier(),
                this.api.glossaire(),
                this.api.actifs()
            ]);
            this.propositions.set(propositions);
            this.personnes.set(personnes);
            this.nomsConnus.set(this.nommerLesCibles(objets, termes, actifs));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Un identifiant ne dit rien à personne : on garde, pour chacun, le nom sous lequel on le connaît. */
    private nommerLesCibles(objets: ObjetMetier[], termes: TermeGlossaire[], actifs: Actif[]): Record<string, string> {
        const noms: Record<string, string> = {};
        for (const objet of objets) noms[objet.id] = objet.name;
        for (const terme of termes) noms[terme.id] = terme.term;
        for (const actif of actifs) noms[actif.id] = actif.name;
        return noms;
    }

    peutDecider(proposition: Proposition): boolean {
        return peutDecider(proposition, this.pouvoir());
    }

    etatDuToutValider(groupe: GroupeDePropositions): { possible: boolean; libelle: string; raison: string } {
        return etatDuToutValider(groupe, this.pouvoir());
    }

    /**
     * Valide d'un geste toutes les propositions du groupe que l'on a le droit de trancher. Une par une
     * côté serveur : chacune applique sa valeur, et un refus isolé n'emporte pas les autres.
     */
    async toutValider(groupe: GroupeDePropositions): Promise<void> {
        const aValider = decidablesDuGroupe(groupe, this.pouvoir());
        if (!aValider.length) return;
        this.enCours.set(true);
        let validees = 0;
        try {
            for (const proposition of aValider) {
                await this.api.accepterProposition(proposition.id);
                validees++;
            }
            this.notifications.succes(`${validees} proposition(s) validées et appliquées sur « ${groupe.libelle} ».`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
            await this.recharger();
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
