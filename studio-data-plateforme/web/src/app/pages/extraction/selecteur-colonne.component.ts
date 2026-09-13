/**
 * Choisir une colonne dans l'extraction : la table, le chemin par lequel on l'atteint (« via ») et la colonne.
 *
 * Le sélecteur « via » n'apparaît que lorsqu'il y a vraiment un choix à faire, c'est-à-dire quand la table est
 * reliée à la table de départ de plusieurs façons. C'est ce qui permet de ramener côte à côte le nom du
 * souscripteur et celui du bénéficiaire, qui vivent pourtant dans la même table.
 *
 * Le composant est utilisé partout où l'on désigne une colonne : ajout d'une colonne en sortie, filtre, critère
 * d'une mesure, colonne mesurée, assistants de colonnes avancées.
 */
import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Source } from '../../coeur/modeles';
import { Chemin, cleChemin, libelleChemin } from './chemins';

@Component({
    selector: 'app-selecteur-colonne',
    imports: [FormsModule],
    template: `
        <select
            class="champ petit"
            [ngModel]="tableId()"
            (ngModelChange)="changerTable($event)"
            [name]="identifiant() + '_table'"
            [attr.name]="identifiant() + '_table'"
            title="Table"
        >
            @for (table of tables(); track table.id) {
                <option [value]="table.id">{{ table.nom }}</option>
            }
        </select>
        @if (cheminsDeLaTable().length > 1) {
            <select
                class="champ petit via"
                [ngModel]="route()"
                (ngModelChange)="route.set($event)"
                [name]="identifiant() + '_via'"
                [attr.name]="identifiant() + '_via'"
                title="Par quel lien atteindre cette table"
            >
                @for (chemin of cheminsDeLaTable(); track cleChemin(chemin)) {
                    <option [value]="cleChemin(chemin)">via {{ libelle(chemin) }}</option>
                }
            </select>
        }
        @if (avecColonne()) {
            <select
                class="champ petit"
                [ngModel]="nomColonne()"
                (ngModelChange)="nomColonne.set($event)"
                [name]="identifiant() + '_colonne'"
                [attr.name]="identifiant() + '_colonne'"
                title="Colonne"
            >
                @for (colonne of colonnes(); track colonne) {
                    <option [value]="colonne">{{ colonne }}</option>
                }
            </select>
        }
    `,
    styles: `
        :host {
            display: contents;
        }
        .via {
            max-width: 220px;
            color: var(--texte-2);
        }
    `
})
export class SelecteurColonneComponent {
    /** Toutes les sources de l'espace : le composant y lit les noms et les colonnes. */
    readonly sources = input.required<Source[]>();
    /** Chemins possibles vers chaque table atteignable, dans l'ordre du plus court au plus long. */
    readonly chemins = input.required<Map<string, Chemin[]>>();
    /** Faux pour désigner seulement une table (le « nombre de lignes » d'une mesure n'a pas de colonne). */
    readonly avecColonne = input(true);
    /** Préfixe des attributs `name` des champs : il doit être unique dans le formulaire de la page. */
    readonly identifiant = input('colonne');
    /** Lien retenu par défaut pour chaque table, décidé dans le bandeau « Quel lien utiliser ? ». */
    readonly routesParDefaut = input<Record<string, string>>({});

    readonly tableId = model('');
    readonly route = model('');
    readonly nomColonne = model('');

    readonly cleChemin = cleChemin;

    /** Les tables atteignables, la table de départ en tête puis les autres par ordre alphabétique. */
    readonly tables = computed(() => {
        const atteignables = [...this.chemins().keys()];
        const nommees = atteignables.map(id => ({ id, nom: this.nomDe(id), depart: (this.chemins().get(id) || [])[0]?.length === 0 }));
        return nommees.sort((premier, second) =>
            premier.depart !== second.depart ? Number(second.depart) - Number(premier.depart) : premier.nom.localeCompare(second.nom, 'fr')
        );
    });
    readonly cheminsDeLaTable = computed(() => this.chemins().get(this.tableId()) || []);
    readonly colonnes = computed(() => this.sources().find(source => source.id === this.tableId())?.headers || []);

    nomDe(tableId: string): string {
        return this.sources().find(source => source.id === tableId)?.name || tableId;
    }
    libelle(chemin: Chemin): string {
        return libelleChemin(chemin, tableId => this.nomDe(tableId));
    }

    /** Changer de table reprend le lien par défaut (ou le plus court) et la première colonne. */
    changerTable(tableId: string): void {
        const chemins = this.chemins().get(tableId) || [];
        const defaut = this.routesParDefaut()[tableId];
        this.tableId.set(tableId);
        this.route.set(chemins.some(chemin => cleChemin(chemin) === defaut) ? defaut : cleChemin(chemins[0] || []));
        this.nomColonne.set(this.sources().find(source => source.id === tableId)?.headers?.[0] || '');
    }
}
