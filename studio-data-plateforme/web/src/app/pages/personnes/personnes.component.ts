/**
 * Personnes, rôles et domaines métier : qui est propriétaire, contributeur ou lecteur de quel domaine.
 * Les domaines déclarés ici sont proposés partout (objets, actifs, termes) ; ceux cités ailleurs apparaissent aussi.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Personne, RolePersonne, VocabulaireGouvernance, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-personnes',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Personnes & rôles</h1>
                <p class="discret">Propriétaires (valident), contributeurs (proposent), lecteurs — par domaine métier.</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="ajouterPersonne()">Nouvelle personne</button>
            }
        </div>

        <div class="carte">
            <h2>Domaines métier</h2>
            <div class="puces">
                @for (domaine of domaines(); track domaine) {
                    <span class="puce"
                        >{{ domaine }}
                        @if (session.peutEditer()) {
                            <a (click)="retirerDomaine(domaine)" title="Retirer de la liste déclarée">✕</a>
                        }
                    </span>
                } @empty {
                    <span class="discret">Aucun domaine.</span>
                }
            </div>
            @if (session.peutEditer()) {
                <form class="formulaire-ligne" style="margin-top: 8px; max-width: 420px" (ngSubmit)="ajouterDomaine()">
                    <input class="champ" name="nouveauDomaine" [(ngModel)]="nouveauDomaine" placeholder="Nouveau domaine…" />
                    <button class="bouton" type="submit" style="flex: 0 0 auto" [disabled]="!nouveauDomaine.trim()">Ajouter</button>
                </form>
            }
        </div>

        <div class="grille">
            @for (personne of personnes(); track personne.id; let index = $index) {
                <div class="carte">
                    <div class="formulaire-ligne">
                        <input
                            class="champ"
                            [(ngModel)]="personne.name"
                            [name]="'personne-nom-' + index"
                            [attr.name]="'personne-nom-' + index"
                            placeholder="Nom"
                            [disabled]="!session.peutEditer()"
                        />
                        <input
                            class="champ"
                            [(ngModel)]="personne.email"
                            [name]="'personne-email-' + index"
                            [attr.name]="'personne-email-' + index"
                            placeholder="email"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <label class="etiquette" style="margin-top: 8px">Rôles</label>
                    @for (role of personne.roles; track $index; let indexRole = $index) {
                        <div class="ligne-role">
                            <span class="badge neutre">{{ libelleRole(role.role) }}</span>
                            <span>{{ role.domain || 'tous les domaines' }}</span>
                            @if (session.peutEditer()) {
                                <a class="retirer" (click)="personne.roles.splice(indexRole, 1)">✕</a>
                            }
                        </div>
                    } @empty {
                        <div class="discret">Aucun rôle.</div>
                    }
                    @if (session.peutEditer()) {
                        <div class="formulaire-ligne" style="margin-top: 6px">
                            <select
                                class="champ"
                                [(ngModel)]="nouveauRole[personne.id]"
                                [name]="'personne-role-' + index"
                                [attr.name]="'personne-role-' + index"
                            >
                                @for (role of roles(); track role.cle) {
                                    <option [value]="role.cle">{{ role.libelle }}</option>
                                }
                            </select>
                            <select
                                class="champ"
                                [(ngModel)]="nouveauDomaineRole[personne.id]"
                                [name]="'personne-domaine-' + index"
                                [attr.name]="'personne-domaine-' + index"
                            >
                                <option value="">tous les domaines</option>
                                @for (domaine of domaines(); track domaine) {
                                    <option [value]="domaine">{{ domaine }}</option>
                                }
                            </select>
                            <button class="bouton petit" (click)="ajouterRole(personne)" style="flex: 0 0 auto">+ rôle</button>
                        </div>
                        <div class="entete-page" style="margin: 10px 0 0">
                            <button class="bouton principal petit" (click)="enregistrer(personne)">Enregistrer</button>
                            <button class="bouton petit danger" (click)="supprimer(personne)">Supprimer</button>
                        </div>
                    }
                </div>
            } @empty {
                <div class="carte discret" style="text-align: center; padding: 30px">Aucune personne déclarée.</div>
            }
        </div>
    `,
    styles: `
        .carte + .grille {
            margin-top: 14px;
        }
        .puce {
            display: inline-block;
            font-size: 12px;
            padding: 2px 8px;
            margin: 0 4px 4px 0;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            background: var(--surface-2);
        }
        .puce a,
        .retirer {
            cursor: pointer;
            margin-left: 6px;
            color: var(--erreur);
        }
        .ligne-role {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            padding: 2px 0;
        }
    `
})
export class PersonnesComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly personnes = signal<Personne[]>([]);
    readonly domaines = signal<string[]>([]);
    readonly vocabulaire = signal<VocabulaireGouvernance | null>(null);
    nouveauDomaine = '';
    nouveauRole: Record<string, RolePersonne> = {};
    nouveauDomaineRole: Record<string, string> = {};

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [personnes, domaines, vocabulaire] = await Promise.all([
                this.api.personnes(),
                this.api.domaines(),
                this.vocabulaire() ?? this.api.vocabulaireGouvernance()
            ]);
            this.personnes.set(personnes.map(personne => ({ ...personne, email: personne.email || '', roles: personne.roles || [] })));
            this.domaines.set(domaines);
            this.vocabulaire.set(vocabulaire);
            for (const personne of personnes) {
                this.nouveauRole[personne.id] = this.nouveauRole[personne.id] || 'contrib';
                this.nouveauDomaineRole[personne.id] = this.nouveauDomaineRole[personne.id] || '';
            }
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    roles(): { cle: RolePersonne; libelle: string }[] {
        return Object.entries(this.vocabulaire()?.rolesPersonne || {}).map(([cle, libelle]) => ({ cle: cle as RolePersonne, libelle }));
    }

    libelleRole(role: RolePersonne): string {
        return this.vocabulaire()?.rolesPersonne[role] || role;
    }

    ajouterPersonne(): void {
        const personne: Personne = { id: genererIdentifiant('pe'), name: 'Nouvelle personne', email: '', roles: [] };
        this.nouveauRole[personne.id] = 'contrib';
        this.nouveauDomaineRole[personne.id] = '';
        this.personnes.update(liste => [...liste, personne]);
    }

    ajouterRole(personne: Personne): void {
        const role = this.nouveauRole[personne.id] || 'contrib';
        const domain = this.nouveauDomaineRole[personne.id] || '';
        if (!personne.roles.some(candidat => candidat.domain === domain && candidat.role === role)) personne.roles.push({ domain, role });
    }

    async enregistrer(personne: Personne): Promise<void> {
        try {
            const { id, ...corps } = personne;
            await this.api.enregistrerPersonne(id, corps);
            this.notifications.succes(`« ${personne.name} » enregistré(e).`);
            this.domaines.set(await this.api.domaines());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(personne: Personne): Promise<void> {
        if (!confirm(`Supprimer « ${personne.name} » ?`)) return;
        try {
            await this.api.supprimerPersonne(personne.id);
        } catch {
            // Personne jamais enregistrée : rien côté serveur.
        }
        this.personnes.update(liste => liste.filter(candidat => candidat.id !== personne.id));
    }

    async ajouterDomaine(): Promise<void> {
        const nom = this.nouveauDomaine.trim();
        if (!nom) return;
        try {
            this.domaines.set(await this.api.ajouterDomaine(nom));
            this.nouveauDomaine = '';
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async retirerDomaine(nom: string): Promise<void> {
        try {
            this.domaines.set(await this.api.retirerDomaine(nom));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
