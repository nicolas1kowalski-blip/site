/**
 * Fil d'Ariane et navigation Précédent / Suivant — repris de la V11 de l'application classique.
 *
 * Trois repères que l'on attend de toute application où l'on circule beaucoup :
 *   • **où je suis** : la famille de l'écran et son nom, la famille étant cliquable vers son premier écran ;
 *   • **d'où je viens** : Précédent et Suivant (Alt+← / Alt+→), sur l'historique de l'application seule ;
 *   • **où j'étais** : les derniers écrans visités, à un clic.
 *
 * L'historique est tenu ici et non par le navigateur : on veut revenir sur ses pas dans l'application, sans
 * repasser par la page de connexion ni par un écran d'un autre onglet.
 *
 * Posé une seule fois dans la coque, au-dessus de la route affichée.
 */
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { GROUPES_NAVIGATION, Lien, cheminNormalise } from '../coeur/navigation';

/** Nombre d'écrans gardés en mémoire : de quoi revenir sur ses pas, pas de quoi tenir un journal. */
export const ECRANS_RETENUS = 20;
/** Écrans récents montrés : les derniers, sans celui où l'on est. */
export const RECENTS_MONTRES = 4;

/** L'écran courant, situé dans le menu : sa famille et son nom. */
export function situerEcran(chemin: string): { famille: string; lien: Lien; premierDeLaFamille: string } | null {
    for (const groupe of GROUPES_NAVIGATION) {
        const lien = groupe.liens.find(candidat => candidat.chemin === chemin);
        if (lien) return { famille: groupe.titre, lien, premierDeLaFamille: groupe.liens[0].chemin };
    }
    return null;
}

@Component({
    selector: 'app-fil-ariane',
    imports: [RouterLink],
    template: `
        <nav class="fil-ariane" aria-label="Fil d'Ariane">
            <button
                class="bouton petit"
                type="button"
                name="precedent"
                title="Écran précédent (Alt + ←)"
                [disabled]="!peutReculer()"
                (click)="reculer()"
            >
                ‹
            </button>
            <button
                class="bouton petit"
                type="button"
                name="suivant"
                title="Écran suivant (Alt + →)"
                [disabled]="!peutAvancer()"
                (click)="avancer()"
            >
                ›
            </button>
            @if (situation(); as situation) {
                <a class="famille" [routerLink]="situation.premierDeLaFamille">{{ situation.famille }}</a>
                <span class="separateur">›</span>
                <span class="courant">{{ situation.lien.icone }} {{ situation.lien.libelle }}</span>
            }
            @if (recents().length) {
                <span class="espace"></span>
                <span class="discret">Récemment :</span>
                @for (recent of recents(); track recent.chemin) {
                    <a class="recent" [routerLink]="recent.chemin">{{ recent.libelle }}</a>
                }
            }
        </nav>
    `,
    styles: `
        .fil-ariane {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            font-size: 12.5px;
            margin-bottom: 10px;
        }
        .famille {
            color: var(--texte-2);
            text-decoration: none;
        }
        .famille:hover {
            color: var(--accent);
        }
        .separateur {
            color: var(--texte-2);
        }
        .courant {
            font-weight: 700;
        }
        .recent {
            color: var(--accent);
            text-decoration: none;
        }
    `
})
export class FilArianeComponent {
    private readonly routeur = inject(Router);
    /** Les écrans traversés, du plus ancien au plus récent. */
    private readonly historique = signal<string[]>([]);
    /** Où l'on se trouve dans cet historique : reculer ne l'efface pas, il déplace ce curseur. */
    private readonly position = signal(-1);
    /** Vrai le temps d'une navigation déclenchée par Précédent / Suivant : elle ne doit pas s'empiler. */
    private enTrainDeRevenir = false;

    readonly chemin = signal('/');
    readonly situation = computed(() => situerEcran(this.chemin()));

    constructor() {
        this.enregistrer(this.routeur.url);
        this.routeur.events.subscribe(evenement => {
            if (evenement instanceof NavigationEnd) this.enregistrer(evenement.urlAfterRedirects);
        });
    }

    peutReculer(): boolean {
        return this.position() > 0;
    }
    peutAvancer(): boolean {
        return this.position() < this.historique().length - 1;
    }
    reculer(): void {
        if (this.peutReculer()) this.allerA(this.position() - 1);
    }
    avancer(): void {
        if (this.peutAvancer()) this.allerA(this.position() + 1);
    }

    /** Les écrans visités avant celui-ci, les plus récents d'abord, sans doublon. */
    readonly recents = computed(() => {
        const vus = new Set<string>([this.chemin()]);
        const recents: Lien[] = [];
        for (let rang = this.position() - 1; rang >= 0 && recents.length < RECENTS_MONTRES; rang -= 1) {
            const chemin = this.historique()[rang];
            if (vus.has(chemin)) continue;
            vus.add(chemin);
            const situation = situerEcran(chemin);
            if (situation) recents.push(situation.lien);
        }
        return recents;
    });

    /** Alt + ← et Alt + → : les mêmes que dans un navigateur, mais sur l'historique de l'application. */
    @HostListener('document:keydown', ['$event'])
    auClavier(evenement: KeyboardEvent): void {
        if (!evenement.altKey || evenement.ctrlKey || evenement.metaKey) return;
        if (evenement.key === 'ArrowLeft') {
            evenement.preventDefault();
            this.reculer();
        } else if (evenement.key === 'ArrowRight') {
            evenement.preventDefault();
            this.avancer();
        }
    }

    private allerA(position: number): void {
        this.enTrainDeRevenir = true;
        this.position.set(position);
        void this.routeur.navigateByUrl(this.historique()[position]);
    }

    /** Une navigation ordinaire coupe la suite de l'historique : on repart de là. */
    private enregistrer(adresse: string): void {
        const chemin = cheminNormalise(adresse);
        this.chemin.set(chemin);
        if (this.enTrainDeRevenir) {
            this.enTrainDeRevenir = false;
            return;
        }
        if (this.historique()[this.position()] === chemin) return;
        const gardes = this.historique().slice(0, this.position() + 1);
        const historique = [...gardes, chemin].slice(-ECRANS_RETENUS);
        this.historique.set(historique);
        this.position.set(historique.length - 1);
    }
}
