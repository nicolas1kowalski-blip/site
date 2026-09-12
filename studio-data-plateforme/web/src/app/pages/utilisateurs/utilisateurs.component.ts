/** Administration des utilisateurs (administrateur de la plateforme) : liste, création, activation, rôle, mot de passe. */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { RoleGlobal, Utilisateur, formaterDate } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-utilisateurs',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Utilisateurs</h1>
                <p class="discret">{{ utilisateurs().length }} compte(s)</p>
            </div>
        </div>
        <form class="carte" (ngSubmit)="creer()">
            <h3>Nouvel utilisateur</h3>
            <div class="formulaire-ligne">
                <div>
                    <label class="etiquette">Identifiant</label
                    ><input class="champ" name="identifiant" [(ngModel)]="nouveau.identifiant" required />
                </div>
                <div>
                    <label class="etiquette">Nom affiché</label
                    ><input class="champ" name="nomAffiche" [(ngModel)]="nouveau.nomAffiche" required />
                </div>
                <div>
                    <label class="etiquette">Courriel</label><input class="champ" name="email" type="email" [(ngModel)]="nouveau.email" />
                </div>
                <div>
                    <label class="etiquette">Mot de passe (8 caractères min.)</label
                    ><input class="champ" name="motDePasse" type="password" [(ngModel)]="nouveau.motDePasse" required />
                </div>
                <div style="flex: 0 0 170px">
                    <label class="etiquette">Rôle</label
                    ><select class="champ" name="roleGlobal" [(ngModel)]="nouveau.roleGlobal">
                        <option value="utilisateur">utilisateur</option>
                        <option value="administrateur">administrateur</option>
                    </select>
                </div>
                <button class="bouton principal" type="submit" style="flex: 0">Créer</button>
            </div>
        </form>
        <div class="carte">
            <table class="tableau">
                <thead>
                    <tr>
                        <th>Identifiant</th>
                        <th>Nom</th>
                        <th>Courriel</th>
                        <th>Rôle</th>
                        <th>État</th>
                        <th>Créé le</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    @for (utilisateur of utilisateurs(); track utilisateur.id) {
                        <tr>
                            <td>
                                <code>{{ utilisateur.identifiant }}</code>
                            </td>
                            <td>{{ utilisateur.nomAffiche }}</td>
                            <td class="discret">{{ utilisateur.email || '—' }}</td>
                            <td>
                                <select
                                    class="champ"
                                    [value]="utilisateur.roleGlobal"
                                    (change)="changerRole(utilisateur, $event)"
                                    [disabled]="utilisateur.id === session.utilisateur()?.id"
                                >
                                    <option value="utilisateur">utilisateur</option>
                                    <option value="administrateur">administrateur</option>
                                </select>
                            </td>
                            <td>
                                <span class="badge" [class.succes]="utilisateur.actif" [class.erreur]="!utilisateur.actif">{{
                                    utilisateur.actif ? 'actif' : 'inactif'
                                }}</span>
                            </td>
                            <td class="discret">{{ formaterDate(utilisateur.creeLe) }}</td>
                            <td style="white-space: nowrap">
                                @if (utilisateur.id !== session.utilisateur()?.id) {
                                    <button class="bouton petit" (click)="basculerActif(utilisateur)">
                                        {{ utilisateur.actif ? 'Désactiver' : 'Réactiver' }}
                                    </button>
                                    <button class="bouton petit" (click)="reinitialiserMotDePasse(utilisateur)">Mot de passe</button>
                                    <button class="bouton petit danger" (click)="supprimer(utilisateur)">Supprimer</button>
                                }
                            </td>
                        </tr>
                    }
                </tbody>
            </table>
        </div>
    `
})
export class UtilisateursComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly utilisateurs = signal<Utilisateur[]>([]);
    readonly formaterDate = formaterDate;
    nouveau = { identifiant: '', nomAffiche: '', email: '', motDePasse: '', roleGlobal: 'utilisateur' as RoleGlobal };

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.utilisateurs.set(await this.api.utilisateurs());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async creer(): Promise<void> {
        try {
            const cree = await this.api.creerUtilisateur({ ...this.nouveau, email: this.nouveau.email || undefined });
            this.notifications.succes(`Utilisateur « ${cree.identifiant} » créé. Pensez à l'ajouter à un espace.`);
            this.nouveau = { identifiant: '', nomAffiche: '', email: '', motDePasse: '', roleGlobal: 'utilisateur' };
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async changerRole(utilisateur: Utilisateur, evenement: Event): Promise<void> {
        await this.modifier(utilisateur, { roleGlobal: (evenement.target as HTMLSelectElement).value as RoleGlobal });
    }

    async basculerActif(utilisateur: Utilisateur): Promise<void> {
        await this.modifier(utilisateur, { actif: !utilisateur.actif });
    }

    async reinitialiserMotDePasse(utilisateur: Utilisateur): Promise<void> {
        const motDePasse = prompt(`Nouveau mot de passe pour « ${utilisateur.identifiant} » (8 caractères minimum) :`);
        if (motDePasse) await this.modifier(utilisateur, { motDePasse });
    }

    async supprimer(utilisateur: Utilisateur): Promise<void> {
        if (!confirm(`Supprimer définitivement le compte « ${utilisateur.identifiant} » ?`)) return;
        try {
            await this.api.supprimerUtilisateur(utilisateur.id);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    private async modifier(
        utilisateur: Utilisateur,
        changements: Partial<{ roleGlobal: RoleGlobal; actif: boolean; motDePasse: string }>
    ): Promise<void> {
        try {
            await this.api.modifierUtilisateur(utilisateur.id, changements);
            this.notifications.succes(`« ${utilisateur.identifiant} » mis à jour.`);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
            await this.recharger();
        }
    }
}
