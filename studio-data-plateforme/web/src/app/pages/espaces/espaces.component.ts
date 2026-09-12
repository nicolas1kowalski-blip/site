/**
 * Espaces de travail : ceux auxquels l'utilisateur a accès, création (administrateur de la plateforme),
 * membres et rôles de l'espace sélectionné (administrateur de l'espace).
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Espace, Membre, RoleEspace } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-espaces',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Espaces et membres</h1>
                <p class="discret">Un espace = un jeu de sources, une gouvernance, une base DuckDB</p>
            </div>
        </div>
        <div class="disposition">
            <div>
                <div class="carte liste">
                    @for (espace of espaces(); track espace.code) {
                        <button class="element" [class.actif]="selection()?.code === espace.code" (click)="selectionner(espace)">
                            <b>{{ espace.nom }}</b
                            ><span class="discret">{{ espace.code }} · vous : {{ espace.role }}</span>
                        </button>
                    }
                </div>
                @if (session.estAdministrateurGlobal()) {
                    <form class="carte" (ngSubmit)="creer()">
                        <h3>Nouvel espace</h3>
                        <label class="etiquette">Code (minuscules, chiffres, tirets)</label>
                        <input class="champ" name="code" [(ngModel)]="nouveauCode" placeholder="finance" required />
                        <label class="etiquette" style="margin-top: 8px">Nom</label>
                        <input class="champ" name="nom" [(ngModel)]="nouveauNom" placeholder="Direction financière" required />
                        <button class="bouton principal" type="submit" style="margin-top: 10px">Créer</button>
                    </form>
                }
            </div>
            @if (selection(); as espace) {
                <div class="carte">
                    <h2>Membres de « {{ espace.nom }} »</h2>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Identifiant</th>
                                <th>Nom</th>
                                <th>Rôle</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (membre of membres(); track membre.utilisateurId) {
                                <tr>
                                    <td>
                                        <code>{{ membre.identifiant }}</code>
                                    </td>
                                    <td>
                                        {{ membre.nomAffiche }}
                                        @if (!membre.actif) {
                                            <span class="badge erreur">inactif</span>
                                        }
                                    </td>
                                    <td>
                                        @if (espace.role === 'administrateur') {
                                            <select class="champ" [value]="membre.role" (change)="changerRole(membre, $event)">
                                                @for (role of roles; track role) {
                                                    <option [value]="role">{{ role }}</option>
                                                }
                                            </select>
                                        } @else {
                                            <span class="badge">{{ membre.role }}</span>
                                        }
                                    </td>
                                    <td>
                                        @if (espace.role === 'administrateur') {
                                            <button class="bouton petit danger" (click)="retirer(membre)">Retirer</button>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    @if (espace.role === 'administrateur') {
                        <form class="formulaire-ligne" style="margin-top: 12px" (ngSubmit)="ajouter()">
                            <div>
                                <label class="etiquette">Identifiant de l'utilisateur</label
                                ><input class="champ" name="identifiant" [(ngModel)]="nouvelIdentifiant" required />
                            </div>
                            <div style="flex: 0 0 160px">
                                <label class="etiquette">Rôle</label
                                ><select class="champ" name="role" [(ngModel)]="nouveauRole">
                                    @for (role of roles; track role) {
                                        <option [value]="role">{{ role }}</option>
                                    }
                                </select>
                            </div>
                            <button class="bouton principal" type="submit" style="flex: 0">Ajouter</button>
                        </form>
                    }
                    <p class="discret" style="margin-top: 10px">
                        lecteur : consulte et interroge · editeur : dépose des sources, modifie la gouvernance · administrateur : gère les
                        membres et la remise à zéro.
                    </p>
                </div>
            } @else {
                <div class="carte vide">Sélectionnez un espace.</div>
            }
        </div>
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 14px;
            align-items: start;
        }
        .liste {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .element {
            text-align: left;
            border: 1px solid var(--bordure);
            background: var(--surface-2);
            border-radius: 8px;
            padding: 6px 8px;
            cursor: pointer;
            font: inherit;
            color: inherit;
            display: flex;
            flex-direction: column;
        }
        .element.actif {
            border-color: var(--accent);
            background: var(--accent-2);
        }
        @media (max-width: 800px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
    `
})
export class EspacesComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly espaces = signal<Espace[]>([]);
    readonly selection = signal<Espace | null>(null);
    readonly membres = signal<Membre[]>([]);
    readonly roles: RoleEspace[] = ['lecteur', 'editeur', 'administrateur'];
    nouveauCode = '';
    nouveauNom = '';
    nouvelIdentifiant = '';
    nouveauRole: RoleEspace = 'lecteur';

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.espaces.set(await this.api.espaces());
            const courant = this.espaces().find(espace => espace.code === this.session.espaceCourant()?.code) || this.espaces()[0];
            if (courant) await this.selectionner(courant);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async selectionner(espace: Espace): Promise<void> {
        this.selection.set(espace);
        try {
            this.membres.set(await this.api.membres(espace.code));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async creer(): Promise<void> {
        try {
            const espace = await this.api.creerEspace(this.nouveauCode.trim(), this.nouveauNom.trim());
            this.notifications.succes(`Espace « ${espace.nom} » créé.`);
            this.nouveauCode = '';
            this.nouveauNom = '';
            await this.session.charger();
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async ajouter(): Promise<void> {
        const espace = this.selection();
        if (!espace || !this.nouvelIdentifiant.trim()) return;
        try {
            this.membres.set(await this.api.definirMembre(espace.code, this.nouvelIdentifiant.trim(), this.nouveauRole));
            this.notifications.succes(`« ${this.nouvelIdentifiant} » ajouté(e) comme ${this.nouveauRole}.`);
            this.nouvelIdentifiant = '';
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async changerRole(membre: Membre, evenement: Event): Promise<void> {
        const espace = this.selection();
        if (!espace) return;
        const role = (evenement.target as HTMLSelectElement).value as RoleEspace;
        try {
            this.membres.set(await this.api.definirMembre(espace.code, membre.identifiant, role));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async retirer(membre: Membre): Promise<void> {
        const espace = this.selection();
        if (!espace || !confirm(`Retirer « ${membre.identifiant} » de l'espace ?`)) return;
        try {
            this.membres.set(await this.api.retirerMembre(espace.code, membre.identifiant));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
