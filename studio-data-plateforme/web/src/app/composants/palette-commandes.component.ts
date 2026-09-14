/**
 * Palette de commandes (Ctrl+K) — reprise de l'application classique.
 *
 * On tape ce que l'on cherche, la palette propose tout ce qui porte ce nom : les écrans des quatre phases,
 * les actions (charger un fichier, lancer un audit, sauvegarder…), les sources de l'espace et leurs colonnes.
 * Entrée ouvre le résultat retenu ; les flèches le déplacent ; Échap referme.
 *
 * Les sources et colonnes sont chargées à la première ouverture, puis gardées : la palette doit répondre
 * instantanément à la frappe.
 */
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientApiService } from '../coeur/client-api.service';
import { Source } from '../coeur/modeles';
import { ACTIONS_RAPIDES, tousLesEcrans } from '../coeur/navigation';
import { SessionService } from '../coeur/session.service';

/** Une proposition de la palette : ce qu'on affiche, et où cela mène. */
export type Proposition = {
    genre: 'écran' | 'action' | 'source' | 'colonne';
    icone: string;
    libelle: string;
    precision: string;
    chemin: string;
    parametres?: Record<string, string>;
};

/** Nombre de propositions affichées : au-delà, la liste cesse d'aider. */
const PROPOSITIONS_MAXIMUM = 12;

/** Normalise pour comparer sans se soucier de la casse ni des accents. */
export function normaliser(texte: string): string {
    return texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Les propositions qui contiennent la recherche, écrans et actions d'abord. */
export function filtrerPropositions(propositions: Proposition[], recherche: string, maximum = PROPOSITIONS_MAXIMUM): Proposition[] {
    const cherchee = normaliser(recherche.trim());
    if (!cherchee) return propositions.filter(proposition => proposition.genre !== 'colonne').slice(0, maximum);
    const rang = { écran: 0, action: 1, source: 2, colonne: 3 };
    return propositions
        .filter(proposition => normaliser(proposition.libelle + ' ' + proposition.precision).includes(cherchee))
        .sort((premiere, seconde) => {
            const parGenre = rang[premiere.genre] - rang[seconde.genre];
            if (parGenre !== 0) return parGenre;
            // À genre égal, ce qui commence par la recherche passe devant.
            const debut = (proposition: Proposition) => (normaliser(proposition.libelle).startsWith(cherchee) ? 0 : 1);
            return debut(premiere) - debut(seconde);
        })
        .slice(0, maximum);
}

@Component({
    selector: 'app-palette-commandes',
    imports: [FormsModule],
    template: `
        @if (ouverte()) {
            <div class="voile" (click)="fermer()">
                <div class="palette" (click)="$event.stopPropagation()">
                    <input
                        #champRecherche
                        class="champ recherche"
                        [ngModel]="recherche()"
                        (ngModelChange)="chercher($event)"
                        (keydown)="auClavier($event)"
                        name="rechercheGlobale"
                        placeholder="Écran, action, source, colonne…"
                        autocomplete="off"
                    />
                    @if (!propositions().length) {
                        <p class="discret vide-palette">Rien de ce nom. Essayez « audit », « extraire », « clients »…</p>
                    }
                    <ul class="resultats">
                        @for (proposition of propositions(); track proposition.chemin + proposition.libelle; let index = $index) {
                            <li [class.retenu]="index === retenu()" (mouseenter)="retenu.set(index)" (click)="ouvrir(proposition)">
                                <span class="icone">{{ proposition.icone }}</span>
                                <span class="libelle">{{ proposition.libelle }}</span>
                                <span class="discret precision">{{ proposition.precision }}</span>
                            </li>
                        }
                    </ul>
                    <div class="pied discret">↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer</div>
                </div>
            </div>
        }
    `,
    styles: `
        .voile {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.35);
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding-top: 12vh;
            z-index: 50;
        }
        .palette {
            width: min(640px, 92vw);
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 12px;
            box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
            overflow: hidden;
        }
        .recherche {
            width: 100%;
            border: 0;
            border-bottom: 1px solid var(--bordure);
            border-radius: 0;
            padding: 14px 16px;
            font-size: 15px;
        }
        .recherche:focus {
            outline: none;
        }
        .resultats {
            list-style: none;
            margin: 0;
            padding: 4px;
            max-height: 50vh;
            overflow: auto;
        }
        .resultats li {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 7px 12px;
            border-radius: 8px;
            cursor: pointer;
        }
        .resultats li.retenu {
            background: color-mix(in srgb, var(--accent) 14%, transparent);
        }
        .libelle {
            font-weight: 600;
        }
        .precision {
            margin-left: auto;
            font-size: 11px;
        }
        .vide-palette {
            padding: 14px 16px;
            margin: 0;
        }
        .pied {
            padding: 8px 16px;
            border-top: 1px solid var(--bordure);
            font-size: 11px;
        }
    `
})
export class PaletteCommandesComponent {
    private readonly api = inject(ClientApiService);
    private readonly routeur = inject(Router);
    private readonly session = inject(SessionService);
    private readonly champRecherche = viewChild<ElementRef<HTMLInputElement>>('champRecherche');

    readonly ouverte = signal(false);
    readonly recherche = signal('');
    readonly retenu = signal(0);
    private readonly sources = signal<Source[]>([]);
    private chargees = false;

    /** Tout ce que la palette sait proposer : écrans, actions, sources, colonnes. */
    private readonly catalogue = computed<Proposition[]>(() => {
        const ecrans: Proposition[] = tousLesEcrans()
            .filter(entree => !entree.lien.administrateur || this.session.estAdministrateurGlobal())
            .map(entree => ({
                genre: 'écran',
                icone: entree.lien.icone,
                libelle: entree.lien.libelle,
                precision: entree.groupe,
                chemin: entree.lien.chemin
            }));
        const actions: Proposition[] = ACTIONS_RAPIDES.map(action => ({
            genre: 'action',
            icone: action.icone,
            libelle: action.libelle,
            precision: 'action',
            chemin: action.chemin,
            parametres: action.parametres
        }));
        const tables: Proposition[] = this.sources().map(source => ({
            genre: 'source',
            icone: source.temporaire ? '⏳' : '▤',
            libelle: source.name,
            precision: source.temporaire ? 'jeu temporaire' : `${source.headers?.length || 0} colonne(s)`,
            chemin: '/navigateur',
            parametres: { source: source.id }
        }));
        const colonnes: Proposition[] = this.sources().flatMap(source =>
            (source.headers || []).map(colonne => ({
                genre: 'colonne' as const,
                icone: '·',
                libelle: colonne,
                precision: source.name,
                chemin: '/navigateur',
                parametres: { source: source.id, colonne }
            }))
        );
        return [...ecrans, ...actions, ...tables, ...colonnes];
    });

    readonly propositions = computed(() => filtrerPropositions(this.catalogue(), this.recherche()));

    /** Ouvre la palette, charge les sources la première fois et place le curseur dans le champ. */
    async basculer(): Promise<void> {
        if (this.ouverte()) return this.fermer();
        this.ouverte.set(true);
        this.recherche.set('');
        this.retenu.set(0);
        setTimeout(() => this.champRecherche()?.nativeElement.focus(), 0);
        if (this.chargees) return;
        this.chargees = true;
        try {
            this.sources.set(await this.api.sourcesEtJeux());
        } catch {
            this.sources.set([]);
        }
    }
    fermer(): void {
        this.ouverte.set(false);
    }
    chercher(texte: string): void {
        this.recherche.set(texte);
        this.retenu.set(0);
    }

    auClavier(evenement: KeyboardEvent): void {
        const dernier = this.propositions().length - 1;
        if (evenement.key === 'Escape') this.fermer();
        else if (evenement.key === 'ArrowDown') this.retenu.update(position => Math.min(position + 1, dernier));
        else if (evenement.key === 'ArrowUp') this.retenu.update(position => Math.max(position - 1, 0));
        else if (evenement.key === 'Enter') {
            const proposition = this.propositions()[this.retenu()];
            if (proposition) this.ouvrir(proposition);
        } else return;
        evenement.preventDefault();
    }

    ouvrir(proposition: Proposition): void {
        this.fermer();
        this.routeur.navigate([proposition.chemin], proposition.parametres ? { queryParams: proposition.parametres } : {});
    }
}
