/**
 * Coque de l'application : rail de navigation à gauche (les quatre phases de Studio Data plus
 * l'administration), en-tête avec le choix de l'espace de travail et l'utilisateur, zone de page, notifications.
 */
import { Component, HostListener, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { EtEnsuiteComponent } from '../composants/et-ensuite.component';
import { PaletteCommandesComponent } from '../composants/palette-commandes.component';
import { SansDonneesComponent } from '../composants/sans-donnees.component';
import { GROUPES_NAVIGATION, RACCOURCIS_ECRAN } from '../coeur/navigation';
import { NotificationsService } from '../coeur/notifications.service';
import { SessionService } from '../coeur/session.service';

/** Clé de stockage local de la densité choisie (préférence propre au navigateur). */
const CLE_DENSITE = 'studio-data.densite';

/** Délai pendant lequel la lettre qui suit « G » est comprise comme un raccourci d'écran. */
const DELAI_RACCOURCI_MS = 1200;

@Component({
    selector: 'app-coque',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, PaletteCommandesComponent, EtEnsuiteComponent, SansDonneesComponent],
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
                                    [routerLinkActiveOptions]="{ exact: lien.chemin === '/' || lien.chemin === '/qualite' }"
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
                                <!-- « selected » en plus de la valeur du select : sans lui, un changement d'espace
                                     laisserait la liste affichée sur sa première entrée. -->
                                <option [value]="espace.code" [selected]="espace.code === session.espaceCourant()?.code">
                                    {{ espace.nom }} ({{ espace.role }})
                                </option>
                            }
                        </select>
                    </label>
                    <span class="espace"></span>
                    <button
                        class="bouton petit recherche-globale"
                        type="button"
                        name="rechercheGlobale"
                        (click)="palette().basculer()"
                        title="Rechercher un écran, une action, une source ou une colonne (Ctrl+K)"
                    >
                        ⌕ Rechercher <span class="touche">Ctrl K</span>
                    </button>
                    <span class="densite" title="Densité de l'affichage : tableaux et cartes plus serrés ou plus aérés">
                        <button class="bouton petit" [class.actif]="!compact()" (click)="choisirDensite(false)">Confort</button>
                        <button class="bouton petit" [class.actif]="compact()" (click)="choisirDensite(true)">Compact</button>
                    </span>
                    <a routerLink="/compte" class="utilisateur"
                        >{{ session.utilisateur()?.nomAffiche }}
                        <span class="badge neutre">{{ session.utilisateur()?.roleGlobal }}</span></a
                    >
                    <button class="bouton petit" (click)="deconnecter()">Se déconnecter</button>
                </header>
                <main class="page"><app-sans-donnees /><router-outlet /><app-et-ensuite /></main>
                <app-palette-commandes />
            </div>
            <div class="notifications" aria-live="polite">
                @for (notification of notifications.visibles(); track notification.id) {
                    <div
                        class="notification"
                        [class]="'notification ' + notification.genre"
                        (click)="notifications.fermer(notification.id)"
                        title="Cliquer pour fermer"
                    >
                        <span class="espace">{{ notification.message }}</span>
                        <span class="fermer" aria-label="Fermer">✕</span>
                    </div>
                }
                @if (notifications.liste().length > 1) {
                    <button class="bouton petit tout-fermer" (click)="notifications.toutFermer()">Tout fermer</button>
                }
            </div>
        </div>
    `,
    styles: `
        .recherche-globale .touche {
            margin-left: 6px;
            padding: 1px 5px;
            border: 1px solid var(--bordure);
            border-radius: 4px;
            font-size: 10px;
            color: var(--texte-2);
        }

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
        .notification .fermer {
            color: var(--texte-2);
            font-size: 11px;
            margin-left: 10px;
        }
        .notification {
            display: flex;
            align-items: center;
        }
        .tout-fermer {
            align-self: flex-end;
        }
        .densite {
            display: inline-flex;
            gap: 2px;
        }
        .densite .bouton.actif {
            background: var(--accent-2);
            border-color: var(--accent);
            color: var(--accent);
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
    /** Densité compacte : tableaux, cartes et tuiles resserrés (classe « compact » posée sur le corps de la page). */
    readonly compact = signal(false);

    constructor() {
        let memorisee = '';
        try {
            memorisee = localStorage.getItem(CLE_DENSITE) || '';
        } catch {
            memorisee = '';
        }
        this.choisirDensite(memorisee === 'compact', false);
    }

    choisirDensite(compact: boolean, memoriser = true): void {
        this.compact.set(compact);
        document.body.classList.toggle('compact', compact);
        if (!memoriser) return;
        try {
            localStorage.setItem(CLE_DENSITE, compact ? 'compact' : 'confort');
        } catch {
            // Stockage local indisponible (navigation privée) : la préférence vaut pour la session seulement.
        }
    }

    readonly groupes = GROUPES_NAVIGATION;
    readonly palette = viewChild.required(PaletteCommandesComponent);
    /** Dernière touche « G » tapée : un raccourci « G puis une lettre » n'est valable qu'aussitôt après. */
    private attenteRaccourci = 0;

    /**
     * Raccourcis clavier de l'application : Ctrl+K (ou ⌘K) ouvre la recherche, puis « G » suivi d'une lettre
     * mène directement à un écran. Rien ne se déclenche pendant une saisie : on ne détourne jamais la frappe.
     */
    @HostListener('document:keydown', ['$event'])
    auClavier(evenement: KeyboardEvent): void {
        if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k') {
            evenement.preventDefault();
            this.palette().basculer();
            return;
        }
        if (evenement.ctrlKey || evenement.metaKey || evenement.altKey || this.saisieEnCours(evenement)) return;
        const touche = evenement.key.toLowerCase();
        if (touche === 'g') {
            this.attenteRaccourci = Date.now();
            return;
        }
        const chemin = RACCOURCIS_ECRAN[touche];
        if (chemin && Date.now() - this.attenteRaccourci < DELAI_RACCOURCI_MS) {
            this.attenteRaccourci = 0;
            this.routeur.navigate([chemin]);
        }
    }

    /** Vrai quand la frappe est destinée à un champ : le raccourci doit alors se taire. */
    private saisieEnCours(evenement: KeyboardEvent): boolean {
        const cible = evenement.target as HTMLElement | null;
        if (!cible) return false;
        return ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName) || cible.isContentEditable;
    }

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
