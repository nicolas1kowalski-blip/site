/**
 * Coque de l'application : rail de navigation à gauche (les quatre phases de Studio Data plus
 * l'administration), en-tête avec le choix de l'espace de travail et l'utilisateur, zone de page, notifications.
 */
import { Component, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { EtEnsuiteComponent } from '../composants/et-ensuite.component';
import { AideEcranComponent } from '../composants/aide-ecran.component';
import { AideGeneraleComponent } from '../composants/aide-generale.component';
import { FilArianeComponent } from '../composants/fil-ariane.component';
import { PaletteCommandesComponent } from '../composants/palette-commandes.component';
import { PresentationComponent } from '../composants/presentation.component';
import { SansDonneesComponent } from '../composants/sans-donnees.component';
import { AnnulationService } from '../coeur/annulation.service';
import { GROUPES_NAVIGATION, RACCOURCIS_ECRAN } from '../coeur/navigation';
import { NotificationsService } from '../coeur/notifications.service';
import { SessionService } from '../coeur/session.service';

/** Clé de stockage local de la densité choisie (préférence propre au navigateur). */
const CLE_DENSITE = 'studio-data.densite';

/** Délai pendant lequel la lettre qui suit « G » est comprise comme un raccourci d'écran. */
const DELAI_RACCOURCI_MS = 1200;

@Component({
    selector: 'app-coque',
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        PaletteCommandesComponent,
        EtEnsuiteComponent,
        SansDonneesComponent,
        AideEcranComponent,
        FilArianeComponent,
        AideGeneraleComponent,
        PresentationComponent
    ],
    template: `
        <div class="coque">
            <aside class="rail">
                <div class="marque"><span class="logo">SD</span><span>Studio Data</span></div>
                @for (groupe of groupes; track groupe.titre) {
                    <div class="groupe">
                        <div class="groupe-titre">{{ groupe.titre }}</div>
                        @for (lien of groupe.liens; track lien.chemin; let rang = $index) {
                            <!-- V13 : à l'intérieur de la gouvernance, les écrans sont rangés par famille. -->
                            @if (lien.famille && lien.famille !== groupe.liens[rang - 1]?.famille) {
                                <div class="famille-titre">{{ lien.famille }}</div>
                            }
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
                    <!--
                        V13 : « Import en masse » n'est pas un écran du menu mais une action du panneau de
                        gouvernance — elle n'apparaît donc que sur les écrans de gouvernance.
                    -->
                    @if (surLaGouvernance()) {
                        <a
                            class="bouton petit"
                            name="importEnMasse"
                            [routerLink]="'/import-gouvernance'"
                            title="Importer en masse définitions, propriétaires, termes… depuis un fichier"
                        >
                            ⬆ Import en masse
                        </a>
                    }
                    <button
                        class="bouton petit recherche-globale"
                        type="button"
                        name="rechercheGlobale"
                        (click)="palette().basculer()"
                        title="Rechercher un écran, une action, une source ou une colonne (Ctrl+K)"
                    >
                        ⌕ Rechercher <span class="touche">Ctrl K</span>
                    </button>
                    <app-aide-generale />
                    <app-presentation />
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
                <main class="page"><app-fil-ariane /><app-aide-ecran /><app-sans-donnees /><router-outlet /><app-et-ensuite /></main>
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
                        @if (notification.action; as action) {
                            <!-- Le clic sur le bouton ne doit pas être compris comme « fermer la notification ». -->
                            <button
                                class="bouton petit"
                                type="button"
                                name="annuler"
                                (click)="$event.stopPropagation(); action.faire(); notifications.fermer(notification.id)"
                            >
                                {{ action.libelle }}
                            </button>
                        }
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
            grid-template-columns: 262px 1fr;
            min-height: 100vh;
        }
        /* Le rail : une barre latérale posée, sélection en pastille pleine. */
        .rail {
            background: var(--rail);
            color: var(--rail-texte);
            padding: 12px 10px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            border-right: 1px solid rgba(255, 255, 255, 0.05);
        }
        .marque {
            display: flex;
            align-items: center;
            gap: 9px;
            color: #fff;
            font-size: 15px;
            font-weight: 600;
            letter-spacing: -0.019em;
            padding: 8px 6px 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .logo {
            width: 32px;
            height: 32px;
            border-radius: 10px;
            background: var(--accent);
            display: grid;
            place-items: center;
            font-size: 12px;
            font-weight: 640;
        }
        /* L'intertitre d'une famille : plus discret que celui d'un groupe, et légèrement en retrait. */
        .famille-titre {
            font-size: 9.5px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            opacity: 0.32;
            font-weight: 600;
            padding: 7px 11px 3px 22px;
        }
        .groupe-titre {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.055em;
            opacity: 0.4;
            font-weight: 500;
            padding: 0 11px 5px;
        }
        .rail a {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 7px 11px;
            border-radius: 9px;
            color: inherit;
            text-decoration: none;
            font-size: 12.5px;
            font-weight: 450;
            letter-spacing: -0.006em;
            transition:
                background-color 0.16s var(--souple),
                color 0.16s var(--souple);
        }
        .rail a:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #fff;
        }
        .rail a.actif {
            background: var(--accent);
            color: #fff;
            font-weight: 530;
            box-shadow: 0 1px 6px color-mix(in srgb, var(--accent) 45%, transparent);
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
        /* La barre du haut : translucide et floutée, elle laisse deviner le contenu qui passe dessous. */
        .entete {
            position: sticky;
            top: 0;
            z-index: 30;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 26px;
            background: color-mix(in srgb, var(--surface) 72%, transparent);
            backdrop-filter: saturate(180%) blur(20px);
            -webkit-backdrop-filter: saturate(180%) blur(20px);
            border-bottom: 1px solid var(--filet);
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
            padding: 26px 26px 64px;
            flex: 1;
            min-width: 0;
            max-width: 1440px;
            width: 100%;
            margin: 0 auto;
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
            padding: 12px 16px;
            border-radius: var(--rayon);
            background: var(--surface);
            border-left: 3px solid var(--accent);
            box-shadow: var(--ombre-haute);
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
        .densite {
            background: color-mix(in srgb, var(--texte) 5%, transparent);
            border-radius: 9px;
            padding: 2px;
        }
        .densite .bouton {
            box-shadow: none;
            font-size: 12px;
        }
        .densite .bouton.actif {
            background: var(--surface);
            color: var(--texte);
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
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
    readonly annulation = inject(AnnulationService);
    private readonly routeur = inject(Router);
    /** Densité compacte : tableaux, cartes et tuiles resserrés (classe « compact » posée sur le corps de la page). */
    readonly compact = signal(false);

    constructor() {
        // L'adresse courante décide des actions de l'en-tête : on la suit à chaque navigation aboutie.
        this.cheminCourant.set(this.routeur.url.split('?')[0]);
        this.routeur.events.subscribe(evenement => {
            if (evenement instanceof NavigationEnd) this.cheminCourant.set(evenement.urlAfterRedirects.split('?')[0]);
        });
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
    /** Les adresses des écrans de gouvernance : c'est là, et seulement là, qu'on offre l'import en masse. */
    private readonly cheminsDeLaGouvernance = new Set(
        (GROUPES_NAVIGATION.find(groupe => groupe.titre === 'Gouvernance')?.liens || []).map(lien => lien.chemin)
    );
    /** L'adresse courante, suivie au fil de la navigation : elle décide des actions offertes dans l'en-tête. */
    readonly cheminCourant = signal('');
    readonly surLaGouvernance = computed(() => this.cheminsDeLaGouvernance.has(this.cheminCourant()));
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
        // Ctrl+Z défait la dernière modification du référentiel — sauf dans un champ, où c'est au navigateur
        // d'annuler la frappe : on ne détourne jamais une touche pendant une saisie.
        if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'z' && !this.saisieEnCours(evenement)) {
            evenement.preventDefault();
            void this.annulation.annuler();
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
            // Les gestes retenus visaient le référentiel de l'espace précédent : ils n'ont plus de sens ici.
            this.annulation.oublierTout();
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
