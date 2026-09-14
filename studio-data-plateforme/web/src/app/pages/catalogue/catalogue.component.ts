/**
 * Catalogue de données : recherche d'abord, facettes vivantes (type, domaine, sensibilité, propriétaire),
 * cartes avec signaux de confiance (qualité, sensibilité, validation), fiche en panneau latéral et lien vers
 * l'écran où l'élément se modifie. Couche « métier » par défaut ; « tout » montre aussi tables et colonnes.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { EntreeCatalogue, FiltresCatalogue, ResultatCatalogue, TypeCatalogue } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';

const NOMS_FACETTES: Record<'type' | 'domaine' | 'sensibilite' | 'proprietaire', string> = {
    type: 'Type',
    domaine: 'Domaine',
    sensibilite: 'Confidentialité',
    proprietaire: 'Propriétaire'
};
const LIBELLES_SENSIBILITE: Record<string, string> = {
    perso: 'données personnelles',
    conf: 'confidentiel',
    non: 'non sensible',
    '': 'non renseignée'
};

@Component({
    selector: 'app-catalogue',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Catalogue</h1>
                <p class="discret">
                    Tout ce que l'espace décrit, trouvable en une recherche : objets métier, termes, applications, tables, colonnes…
                </p>
            </div>
            <input
                class="champ recherche"
                name="recherche"
                placeholder="Rechercher (client, facture, email…)"
                [(ngModel)]="filtres.q"
                (ngModelChange)="planifierRecherche()"
            />
            <label class="case"
                ><input type="checkbox" name="couche" [checked]="filtres.couche === 'tout'" (change)="basculerCouche()" /> tout (tables,
                colonnes, vues)</label
            >
        </div>
        <div class="disposition">
            <aside class="carte facettes">
                @for (nom of nomsFacettes; track nom) {
                    <div class="facette">
                        <div class="titre-facette">{{ libelleFacette(nom) }}</div>
                        @for (facette of resultat()?.facettes?.[nom] || []; track facette.valeur) {
                            <label class="case">
                                <input
                                    type="checkbox"
                                    [checked]="estCoche(nom, facette.valeur)"
                                    (change)="basculerFacette(nom, facette.valeur)"
                                />
                                {{ libelleValeur(nom, facette.valeur) }} <span class="discret">{{ facette.nombre }}</span>
                            </label>
                        } @empty {
                            <div class="discret">—</div>
                        }
                    </div>
                }
                @if (aDesFiltres()) {
                    <button class="bouton petit" (click)="effacerFiltres()">Effacer les filtres</button>
                }
            </aside>
            <div>
                @if (resultat(); as resultat) {
                    <p class="discret">
                        {{ resultat.resultats.length }} résultat(s) sur {{ resultat.total }} élément(s)
                        @if (resultat.techniquesMasquees) {
                            · {{ resultat.techniquesMasquees }} donnée(s) technique(s) masquée(s) —
                            <a class="lien" (click)="basculerCouche()">tout afficher</a>
                        }
                    </p>
                    <div class="cartes">
                        @for (entree of resultat.resultats; track entree.type + entree.id) {
                            <button
                                class="carte entree"
                                [class.actif]="ouverte()?.id === entree.id && ouverte()?.type === entree.type"
                                (click)="ouverte.set(entree)"
                            >
                                <div class="ligne-titre">
                                    <span class="badge neutre">{{ resultat.types[entree.type] }}</span>
                                    <strong>{{ entree.titre }}</strong>
                                    <span class="discret">{{ entree.sousTitre }}</span>
                                </div>
                                <div class="description">{{ entree.description || 'Sans description.' }}</div>
                                <div class="signaux">
                                    @if (entree.domaine && entree.domaine !== '—') {
                                        <span class="puce">{{ entree.domaine }}</span>
                                    }
                                    @if (entree.proprietaire) {
                                        <span class="puce">{{ entree.proprietaire }}</span>
                                    }
                                    @if (entree.qualite != null) {
                                        <span
                                            class="badge"
                                            [class.succes]="entree.qualite >= 90"
                                            [class.alerte]="entree.qualite >= 70 && entree.qualite < 90"
                                            [class.erreur]="entree.qualite < 70"
                                            >qualité {{ entree.qualite }} %</span
                                        >
                                    }
                                    @if (entree.sensibilite === 'perso') {
                                        <span class="badge erreur">données personnelles</span>
                                    } @else if (entree.sensibilite === 'conf') {
                                        <span class="badge alerte">confidentiel</span>
                                    }
                                    @if (entree.validation === 'ok') {
                                        <span class="badge succes">validé</span>
                                    } @else if (entree.validation === 'pending') {
                                        <span class="badge alerte">à valider</span>
                                    }
                                </div>
                            </button>
                        } @empty {
                            <div class="carte discret" style="text-align: center; padding: 30px">Aucun résultat.</div>
                        }
                    </div>
                }
            </div>
            @if (ouverte(); as entree) {
                <aside class="carte fiche">
                    <div class="entete-page" style="margin: 0 0 8px">
                        <h2 class="espace">{{ entree.titre }}</h2>
                        <button class="bouton petit" (click)="ouverte.set(null)">Fermer</button>
                    </div>
                    <div class="discret">{{ resultat()?.types?.[entree.type] }} · {{ entree.sousTitre }}</div>
                    <p>{{ entree.description || 'Sans description.' }}</p>
                    <dl>
                        <dt>Domaine</dt>
                        <dd>{{ entree.domaine }}</dd>
                        <dt>Propriétaire</dt>
                        <dd>{{ entree.proprietaire || '—' }}</dd>
                        <dt>Qualité</dt>
                        <dd>{{ entree.qualite == null ? 'non mesurée' : entree.qualite + ' %' }}</dd>
                        <dt title="Terme technique : sensibilité">Confidentialité</dt>
                        <dd>{{ libelleValeur('sensibilite', entree.sensibilite || '') }}</dd>
                        <dt>Étiquettes</dt>
                        <dd>{{ entree.etiquettes.join(', ') || '—' }}</dd>
                        @if (entree.motsCles.length) {
                            <dt>Liens</dt>
                            <dd>{{ entree.motsCles.join(', ') }}</dd>
                        }
                    </dl>
                    <button class="bouton principal" (click)="ouvrirEcran(entree)">Ouvrir dans l'écran dédié</button>
                </aside>
            }
        </div>
    `,
    styles: `
        .recherche {
            width: 360px;
            max-width: 100%;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        .disposition {
            display: grid;
            grid-template-columns: 220px minmax(0, 1fr) auto;
            gap: 14px;
            align-items: start;
        }
        @media (max-width: 1000px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
        .facette {
            margin-bottom: 12px;
        }
        .titre-facette {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--texte-2);
            margin-bottom: 4px;
        }
        .cartes {
            display: grid;
            gap: 10px;
        }
        .entree {
            text-align: left;
            cursor: pointer;
            font: inherit;
            color: inherit;
        }
        .entree.actif {
            border-color: var(--accent);
        }
        .ligne-titre {
            display: flex;
            gap: 8px;
            align-items: baseline;
            flex-wrap: wrap;
        }
        .description {
            font-size: 13px;
            margin: 4px 0;
        }
        .signaux {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .puce {
            font-size: 11px;
            padding: 2px 6px;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            background: var(--surface-2);
        }
        .fiche {
            width: 300px;
        }
        .fiche dt {
            font-size: 11px;
            color: var(--texte-2);
            margin-top: 6px;
        }
        .fiche dd {
            margin: 0;
        }
        .lien {
            color: var(--accent);
            cursor: pointer;
            text-decoration: underline;
        }
    `
})
export class CatalogueComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly routeur = inject(Router);
    readonly resultat = signal<ResultatCatalogue | null>(null);
    readonly ouverte = signal<EntreeCatalogue | null>(null);
    readonly nomsFacettes = Object.keys(NOMS_FACETTES) as (keyof typeof NOMS_FACETTES)[];
    filtres: FiltresCatalogue = { q: '', type: [], domaine: [], sensibilite: [], proprietaire: [], couche: 'metier' };
    private minuterie: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        void this.rechercher();
    }

    async rechercher(): Promise<void> {
        try {
            this.resultat.set(await this.api.catalogue(this.filtres));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** La recherche part 250 ms après la dernière frappe. */
    planifierRecherche(): void {
        if (this.minuterie) clearTimeout(this.minuterie);
        this.minuterie = setTimeout(() => void this.rechercher(), 250);
    }

    libelleFacette(nom: keyof typeof NOMS_FACETTES): string {
        return NOMS_FACETTES[nom];
    }

    libelleValeur(nom: string, valeur: string): string {
        if (nom === 'type') return this.resultat()?.types[valeur as TypeCatalogue] || valeur;
        if (nom === 'sensibilite') return LIBELLES_SENSIBILITE[valeur] ?? valeur;
        return valeur || '—';
    }

    estCoche(nom: keyof typeof NOMS_FACETTES, valeur: string): boolean {
        return (this.filtres[nom] || []).includes(valeur);
    }

    basculerFacette(nom: keyof typeof NOMS_FACETTES, valeur: string): void {
        const liste = this.filtres[nom] || [];
        this.filtres[nom] = liste.includes(valeur) ? liste.filter(candidat => candidat !== valeur) : [...liste, valeur];
        void this.rechercher();
    }

    basculerCouche(): void {
        this.filtres.couche = this.filtres.couche === 'tout' ? 'metier' : 'tout';
        void this.rechercher();
    }

    aDesFiltres(): boolean {
        return this.nomsFacettes.some(nom => (this.filtres[nom] || []).length > 0);
    }

    effacerFiltres(): void {
        for (const nom of this.nomsFacettes) this.filtres[nom] = [];
        void this.rechercher();
    }

    ouvrirEcran(entree: EntreeCatalogue): void {
        void this.routeur.navigateByUrl(entree.lien);
    }
}
