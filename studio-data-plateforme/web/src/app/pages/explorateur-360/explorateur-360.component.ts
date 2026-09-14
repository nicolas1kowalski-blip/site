/**
 * Explorateur 360° : on part d'une valeur (un client, une commande…) et on suit les liens du modèle de données
 * de table en table. Chaque ligne est un nœud du graphe ; « Étendre » ajoute ses lignes liées ; le panneau de
 * droite montre le détail de la ligne choisie. Les colonnes affichées sur les nœuds se choisissent par table.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Ligne360, Source } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { GrapheSvgComponent, LienDessine, NoeudDessine } from '../../composants/graphe-svg.component';

type NoeudLigne = { id: string; table: string; ligne: Ligne360; etendu: boolean };

/** Identifiant stable d'une ligne : la table et le contenu de la ligne. */
function identifiantLigne(table: string, ligne: Ligne360): string {
    return table + '¦' + JSON.stringify(ligne);
}

@Component({
    selector: 'app-explorateur-360',
    imports: [FormsModule, GrapheSvgComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Explorateur 360°</h1>
                <p class="discret">Partez d'une valeur et suivez les liens du modèle : chaque ligne trouvée mène à ses lignes liées.</p>
            </div>
        </div>
        <div class="carte">
            <div class="formulaire-ligne">
                <div>
                    <label class="etiquette">Table de départ</label>
                    <select class="champ" name="table" [(ngModel)]="table" (ngModelChange)="colonne = ''">
                        <option value="">— table —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Colonne</label>
                    <select class="champ" name="colonne" [(ngModel)]="colonne">
                        <option value="">— colonne —</option>
                        @for (nom of colonnesDe(table); track nom) {
                            <option [value]="nom">{{ nom }}</option>
                        }
                    </select>
                </div>
                <div>
                    <label class="etiquette">Valeur recherchée</label>
                    <input class="champ" name="valeur" [(ngModel)]="valeur" placeholder="ex : 12345 ou Dupont" (keyup.enter)="explorer()" />
                </div>
                <div style="align-self: flex-end">
                    <button class="bouton principal" (click)="explorer()" [disabled]="enCours() || !table || !colonne || !valeur.trim()">
                        {{ enCours() ? 'Recherche…' : 'Explorer' }}
                    </button>
                </div>
            </div>
        </div>
        @if (noeuds().length) {
            <div class="disposition">
                <div class="carte">
                    <div class="entete-page" style="margin-bottom: 6px">
                        <span class="discret espace"
                            >{{ noeuds().length }} ligne(s) · {{ liens().length }} lien(s) · cliquer une ligne pour son détail</span
                        >
                        <input class="champ" name="filtre" [(ngModel)]="filtre" placeholder="Filtrer les nœuds…" style="width: 200px" />
                        <button class="bouton petit" (click)="etendreTout()" [disabled]="enCours()">Étendre tout</button>
                    </div>
                    <app-graphe-svg
                        [noeuds]="noeudsDessines()"
                        [liens]="liensDessines()"
                        [hauteur]="520"
                        (noeudChoisi)="choisir($event.id)"
                    />
                </div>
                <aside class="carte detail">
                    @if (choisi(); as noeud) {
                        <div class="entete-page" style="margin-bottom: 6px">
                            <h2 class="espace">{{ noeud.table }}</h2>
                            <button class="bouton petit principal" (click)="etendre(noeud)" [disabled]="enCours() || noeud.etendu">
                                {{ noeud.etendu ? 'Étendu' : 'Étendre' }}
                            </button>
                        </div>
                        <dl>
                            @for (champ of champs(noeud.ligne); track champ[0]) {
                                <dt>{{ champ[0] }}</dt>
                                <dd>{{ champ[1] || '(vide)' }}</dd>
                            }
                        </dl>
                        <h3>Colonnes affichées sur les nœuds « {{ noeud.table }} »</h3>
                        <div class="cases">
                            @for (nom of colonnesDe(noeud.table); track nom) {
                                <label class="case">
                                    <input
                                        type="checkbox"
                                        [checked]="estAffichee(noeud.table, nom)"
                                        (change)="basculerAffichage(noeud.table, nom)"
                                    />
                                    {{ nom }}
                                </label>
                            }
                        </div>
                    } @else {
                        <p class="discret">Cliquez sur une ligne du graphe pour voir son contenu et l'étendre.</p>
                    }
                </aside>
            </div>
        }
    `,
    styles: `
        .disposition {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 320px;
            gap: 14px;
            align-items: start;
        }
        @media (max-width: 900px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
        .detail dt {
            font-size: 11px;
            color: var(--texte-2);
            margin-top: 6px;
            text-transform: uppercase;
        }
        .detail dd {
            margin: 0;
            word-break: break-word;
        }
        .detail h3 {
            font-size: 12px;
            margin: 14px 0 6px;
        }
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 4px 10px;
        }
        .case {
            font-size: 12px;
            display: flex;
            gap: 4px;
            align-items: center;
        }
    `
})
export class Explorateur360Component {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly sources = signal<Source[]>([]);
    readonly noeuds = signal<NoeudLigne[]>([]);
    readonly liens = signal<LienDessine[]>([]);
    readonly choisiId = signal<string | null>(null);
    readonly enCours = signal(false);
    /** Colonnes montrées sur les nœuds, par table (sinon la première valeur non vide). */
    readonly colonnesAffichees = signal<Record<string, string[]>>({});
    table = '';
    colonne = '';
    valeur = '';
    filtre = '';

    readonly choisi = computed(() => this.noeuds().find(noeud => noeud.id === this.choisiId()) || null);
    readonly noeudsDessines = computed<NoeudDessine[]>(() => {
        const terme = this.filtre.trim().toLowerCase();
        return this.noeuds()
            .filter(
                noeud =>
                    !terme ||
                    Object.values(noeud.ligne).some(valeur =>
                        String(valeur ?? '')
                            .toLowerCase()
                            .includes(terme)
                    )
            )
            .map(noeud => ({
                id: noeud.id,
                // Même pictogramme que dans le classique : une case de l'explorateur est une ligne de fichier.
                titre: '📄 ' + noeud.table,
                detail: this.libelle(noeud),
                couleur: noeud.etendu ? 'var(--accent-fond)' : undefined,
                selectionne: noeud.id === this.choisiId()
            }));
    });
    readonly liensDessines = computed<LienDessine[]>(() => {
        const visibles = new Set(this.noeudsDessines().map(noeud => noeud.id));
        return this.liens().filter(lien => visibles.has(lien.source) && visibles.has(lien.target));
    });

    constructor() {
        void this.charger();
    }

    private async charger(): Promise<void> {
        try {
            this.sources.set(await this.api.sourcesEtJeux());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    colonnesDe(table: string): string[] {
        return this.sources().find(source => source.name === table)?.headers || [];
    }

    champs(ligne: Ligne360): [string, string][] {
        return Object.entries(ligne).map(([nom, valeur]) => [nom, String(valeur ?? '')]);
    }

    estAffichee(table: string, nom: string): boolean {
        return (this.colonnesAffichees()[table] || []).includes(nom);
    }

    basculerAffichage(table: string, nom: string): void {
        this.colonnesAffichees.update(actuel => {
            const liste = actuel[table] || [];
            return { ...actuel, [table]: liste.includes(nom) ? liste.filter(candidat => candidat !== nom) : [...liste, nom] };
        });
    }

    /** Texte d'un nœud : les colonnes choisies pour sa table, sinon la première valeur non vide. */
    private libelle(noeud: NoeudLigne): string {
        const colonnes = this.colonnesAffichees()[noeud.table] || [];
        if (colonnes.length) return colonnes.map(nom => `${nom}: ${noeud.ligne[nom] ?? ''}`).join(' | ');
        const premiere = Object.values(noeud.ligne).find(valeur => String(valeur ?? '').trim());
        return String(premiere ?? '').slice(0, 40);
    }

    choisir(id: string): void {
        this.choisiId.set(id);
    }

    /** Ajoute une ligne au graphe si elle n'y est pas déjà ; renvoie son identifiant. */
    private ajouterNoeud(table: string, ligne: Ligne360): string {
        const id = identifiantLigne(table, ligne);
        if (!this.noeuds().some(noeud => noeud.id === id)) this.noeuds.update(liste => [...liste, { id, table, ligne, etendu: false }]);
        return id;
    }

    private ajouterLien(source: string, target: string, libelle: string): void {
        if (
            this.liens().some(
                lien => (lien.source === source && lien.target === target) || (lien.source === target && lien.target === source)
            )
        )
            return;
        this.liens.update(liste => [...liste, { id: source + '→' + target, source, target, libelle }]);
    }

    async explorer(): Promise<void> {
        this.enCours.set(true);
        try {
            const lignes = await this.api.rechercher360(this.table, this.colonne, this.valeur);
            if (!lignes.length) {
                this.notifications.erreur('Aucune ligne ne porte cette valeur.');
                return;
            }
            this.noeuds.set([]);
            this.liens.set([]);
            this.choisiId.set(null);
            const departs = lignes.map(ligne => ({ id: this.ajouterNoeud(this.table, ligne), table: this.table, ligne, etendu: false }));
            for (const depart of departs) await this.etendre(this.noeuds().find(noeud => noeud.id === depart.id)!);
            this.choisiId.set(departs[0].id);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Ajoute au graphe les lignes liées à un nœud par les relations du modèle. */
    async etendre(noeud: NoeudLigne): Promise<void> {
        if (noeud.etendu) return;
        this.enCours.set(true);
        try {
            for (const voisins of await this.api.voisins360(noeud.table, noeud.ligne))
                for (const ligne of voisins.lignes) this.ajouterLien(noeud.id, this.ajouterNoeud(voisins.table, ligne), voisins.libelle);
            this.noeuds.update(liste => liste.map(candidat => (candidat.id === noeud.id ? { ...candidat, etendu: true } : candidat)));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async etendreTout(): Promise<void> {
        for (const noeud of this.noeuds()
            .filter(candidat => !candidat.etendu)
            .slice(0, 30))
            await this.etendre(noeud);
    }
}
