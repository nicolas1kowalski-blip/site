/**
 * Coque de l'application : rail de navigation à gauche (les quatre phases de Studio Data plus
 * l'administration), en-tête avec le choix de l'espace de travail et l'utilisateur, zone de page, notifications.
 */
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NotificationsService } from '../coeur/notifications.service';
import { SessionService } from '../coeur/session.service';

type Lien = { chemin: string; libelle: string; icone: string; administrateur?: boolean };

@Component({
    selector: 'app-coque',
    imports: [RouterOutlet, RouterLink, RouterLinkActive],
    template: `
        <div class="coque">
            <aside class="rail">
                <div class="marque"><span class="logo">SD</span><span>Studio Data</span></div>
                @for (groupe of groupes; track groupe.titre) {
                    <div class="groupe">
                        <div class="groupe-titre">{{ groupe.titre }}</div>
                        @for (lien of groupe.liens; track lien.chemin) {
                            @if (!lien.administrateur || session.estAdministrateurGlobal()) {
                                <a
                                    [routerLink]="lien.chemin"
                                    routerLinkActive="actif"
                                    [routerLinkActiveOptions]="{ exact: lien.chemin === '/' }"
                                >
                                    <span class="icone">{{ lien.icone }}</span
                                    >{{ lien.libelle }}
                                </a>
                            }
                        }
                    </div>
                }
            </aside>
            <div class="principal">
                <header class="entete">
                    <label class="selection-espace">
                        <span class="discret">Espace</span>
                        <select
                            class="champ"
                            [value]="session.espaceCourant()?.code || ''"
                            (change)="changerEspace($event)"
                            [disabled]="session.espaces().length === 0"
                        >
                            @if (session.espaces().length === 0) {
                                <option value="">Aucun espace</option>
                            }
                            @for (espace of session.espaces(); track espace.code) {
                                <option [value]="espace.code">{{ espace.nom }} ({{ espace.role }})</option>
                            }
                        </select>
                    </label>
                    <span class="espace"></span>
                    <a routerLink="/compte" class="utilisateur"
                        >{{ session.utilisateur()?.nomAffiche }}
                        <span class="badge neutre">{{ session.utilisateur()?.roleGlobal }}</span></a
                    >
                    <button class="bouton petit" (click)="deconnecter()">Se déconnecter</button>
                </header>
                <main class="page"><router-outlet /></main>
            </div>
            <div class="notifications" aria-live="polite">
                @for (notification of notifications.liste(); track notification.id) {
                    <div
                        class="notification"
                        [class]="'notification ' + notification.genre"
                        (click)="notifications.fermer(notification.id)"
                    >
                        {{ notification.message }}
                    </div>
                }
            </div>
        </div>
    `,
    styles: `
        .coque {
            display: grid;
            grid-template-columns: 230px 1fr;
            min-height: 100vh;
        }
        .rail {
            background: var(--rail);
            color: var(--rail-texte);
            padding: 14px 10px;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .marque {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #fff;
            font-weight: 800;
            padding: 4px 8px;
        }
        .logo {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            background: var(--accent);
            display: grid;
            place-items: center;
            font-size: 12px;
        }
        .groupe-titre {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            opacity: 0.6;
            padding: 0 8px 4px;
        }
        .rail a {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 8px;
            border-radius: 8px;
            color: inherit;
            text-decoration: none;
            font-weight: 600;
        }
        .rail a:hover {
            background: rgba(255, 255, 255, 0.06);
        }
        .rail a.actif {
            background: var(--accent);
            color: #fff;
        }
        .icone {
            width: 20px;
            text-align: center;
        }
        .principal {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .entete {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 20px;
            background: var(--surface);
            border-bottom: 1px solid var(--bordure);
        }
        .selection-espace {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .selection-espace select {
            width: auto;
            min-width: 200px;
        }
        .utilisateur {
            color: inherit;
            text-decoration: none;
            font-weight: 600;
        }
        .page {
            padding: 20px;
            flex: 1;
            min-width: 0;
        }
        .notifications {
            position: fixed;
            right: 16px;
            bottom: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 50;
        }
        .notification {
            padding: 10px 14px;
            border-radius: 8px;
            background: var(--surface);
            border-left: 4px solid var(--accent);
            box-shadow: var(--ombre);
            max-width: 420px;
            cursor: pointer;
        }
        .notification.succes {
            border-color: var(--succes);
        }
        .notification.erreur {
            border-color: var(--erreur);
        }
        @media (max-width: 800px) {
            .coque {
                grid-template-columns: 1fr;
            }
            .rail {
                flex-direction: row;
                flex-wrap: wrap;
            }
        }
    `
})
export class CoqueComponent {
    readonly session = inject(SessionService);
    readonly notifications = inject(NotificationsService);
    private readonly routeur = inject(Router);

    readonly groupes: { titre: string; liens: Lien[] }[] = [
        {
            titre: 'Données',
            liens: [
                { chemin: '/', libelle: 'Accueil', icone: '⌂' },
                { chemin: '/sources', libelle: 'Sources', icone: '▤' },
                { chemin: '/modele', libelle: 'Modèle de données', icone: '⇄' }
            ]
        },
        {
            titre: 'Exploitation',
            liens: [
                { chemin: '/extraction', libelle: 'Extraction', icone: '⤓' },
                { chemin: '/explorateur', libelle: 'Explorateur SQL', icone: '⌕' }
            ]
        },
        {
            titre: 'Gouvernance',
            liens: [
                { chemin: '/glossaire', libelle: 'Glossaire', icone: '✎' },
                { chemin: '/dictionnaire', libelle: 'Dictionnaire', icone: '☰' },
                { chemin: '/journal', libelle: 'Journal', icone: '⏱' }
            ]
        },
        { titre: 'Application complète', liens: [{ chemin: '/classique', libelle: 'Tous les écrans (classique)', icone: '⧉' }] },
        {
            titre: 'Administration',
            liens: [
                { chemin: '/espaces', libelle: 'Espaces et membres', icone: '⬚' },
                { chemin: '/utilisateurs', libelle: 'Utilisateurs', icone: '☺', administrateur: true }
            ]
        }
    ];

    async changerEspace(evenement: Event): Promise<void> {
        const code = (evenement.target as HTMLSelectElement).value;
        if (!code) return;
        try {
            await this.session.changerEspace(code);
            this.notifications.info(`Espace de travail : ${this.session.espaceCourant()?.nom}`);
            // Les pages relisent leurs données à l'ouverture : on recharge la route courante.
            const url = this.routeur.url;
            await this.routeur.navigateByUrl('/', { skipLocationChange: true });
            await this.routeur.navigateByUrl(url);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async deconnecter(): Promise<void> {
        await this.session.deconnecter();
        await this.routeur.navigate(['/connexion']);
    }
}
