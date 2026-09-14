/**
 * « ✨ Décrire un objet sans partir de zéro » — repris de la V13 de l'application classique.
 *
 * Devant une page blanche, personne ne sait quoi écrire. On propose donc, et l'utilisateur corrige :
 *   • **à partir d'un fichier chargé** : le nom de l'objet est déduit du nom du fichier, une information par
 *     colonne, un nom lisible pour chacune, une définition devinée, et des exemples de valeurs réelles ;
 *   • **à partir d'un modèle** (Client, Contrat, Produit, Fournisseur, Facture, Salarié, Sinistre) : les
 *     informations du modèle, rattachées aux colonnes qui leur ressemblent dans les fichiers déjà chargés.
 *
 * On décoche ce qui ne parle pas, on corrige les noms et les définitions : rien n'est créé avant « Créer ».
 *
 * Le calcul des propositions est dans ./description-information.ts (fonctions pures, testées à part).
 */
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { ObjetMetier, Source, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { MODELES_OBJET, PropositionObjet, propositionDepuisFichier, propositionDepuisModele } from './description-information';

/** Nombre de valeurs réelles ramenées par colonne : de quoi reconnaître la donnée d'un coup d'œil. */
const EXEMPLES = 3;

@Component({
    selector: 'app-proposition-objet',
    imports: [FormsModule],
    template: `
        <div class="carte proposition">
            @if (!proposition()) {
                <div class="entete-page" style="margin: 0 0 8px">
                    <div class="espace">
                        <h2>✨ Décrire un objet sans partir de zéro</h2>
                        <p class="discret">
                            L'application propose l'objet, ses informations, des définitions et des exemples. Vous validez ou corrigez.
                        </p>
                    </div>
                    <button class="bouton petit" type="button" name="annulerProposition" (click)="fermer.emit()">Fermer</button>
                </div>
                <div class="etiquette">À partir d'un fichier chargé</div>
                @if (sources().length) {
                    <div class="choix">
                        @for (source of sources(); track source.id) {
                            <button class="bouton" type="button" (click)="partirDuFichier(source)">
                                ▦ {{ source.name }} <span class="discret">· {{ (source.headers || []).length }} colonnes</span>
                            </button>
                        }
                    </div>
                } @else {
                    <p class="discret">Aucun fichier chargé — chargez un CSV ou un Excel dans Sources, ou partez d'un modèle.</p>
                }
                <div class="etiquette">À partir d'un modèle</div>
                <div class="choix">
                    @for (modele of modeles; track modele) {
                        <button class="bouton" type="button" [attr.name]="'modele-' + modele" (click)="partirDuModele(modele)">
                            🏛️ {{ modele }}
                        </button>
                    }
                </div>
            } @else {
                <div class="entete-page" style="margin: 0 0 8px">
                    <div class="espace">
                        <h2>✨ Proposition : l'objet « {{ proposition()!.nom }} »</h2>
                        <p class="discret">{{ provenance() }} Décochez ce qui ne vous parle pas, corrigez les noms et définitions.</p>
                    </div>
                    <button class="bouton petit" type="button" name="revenirChoix" (click)="proposition.set(null)">Changer</button>
                </div>
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Nom de l'objet</label>
                        <input class="champ" name="proposition-nom" [(ngModel)]="proposition()!.nom" />
                    </div>
                    <div>
                        <label class="etiquette">Domaine métier</label>
                        <input class="champ" name="proposition-domaine" [(ngModel)]="proposition()!.domaine" placeholder="ex. Ventes" />
                    </div>
                </div>
                <div class="defilement-x">
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th></th>
                                <th title="Terme technique : attribut">Information</th>
                                <th>Définition proposée</th>
                                <th title="Terme technique : mapping">Colonne du fichier</th>
                                <th>Exemples</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (information of proposition()!.informations; track $index; let index = $index) {
                                <tr>
                                    <td>
                                        <input
                                            type="checkbox"
                                            [(ngModel)]="information.retenue"
                                            [name]="'retenue-' + index"
                                            [attr.name]="'retenue-' + index"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            class="champ"
                                            [(ngModel)]="information.nom"
                                            [name]="'proposition-nom-' + index"
                                            [attr.name]="'proposition-nom-' + index"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            class="champ"
                                            [(ngModel)]="information.definition"
                                            [name]="'proposition-definition-' + index"
                                            [attr.name]="'proposition-definition-' + index"
                                            placeholder="à écrire plus tard"
                                        />
                                    </td>
                                    <td class="discret">
                                        {{ information.colonne ? information.table + '.' + information.colonne : '—' }}
                                    </td>
                                    <td class="discret">{{ exemples()[information.colonne] || '' }}</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="entete-page" style="margin: 8px 0 0">
                    <span class="discret espace">
                        {{ nombreDefinies() }} définition(s) proposée(s) sur {{ proposition()!.informations.length }} — tout reste
                        modifiable dans la fiche.
                    </span>
                    <button class="bouton" type="button" name="annulerProposition" (click)="fermer.emit()">Annuler</button>
                    <button class="bouton principal" type="button" name="creerObjetPropose" (click)="creer()">Créer l'objet</button>
                </div>
            }
        </div>
    `,
    styles: `
        .proposition .choix {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 6px 0 12px;
        }
        .proposition h2 {
            margin: 0;
        }
        .proposition p {
            margin: 4px 0 0;
        }
    `
})
export class PropositionObjetComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sources = input<Source[]>([]);
    /** Les objets déjà décrits : on refuse d'en créer un deuxième du même nom. */
    readonly objets = input<ObjetMetier[]>([]);
    readonly creerObjet = output<ObjetMetier>();
    readonly fermer = output<void>();

    readonly modeles = Object.keys(MODELES_OBJET);
    readonly proposition = signal<PropositionObjet | null>(null);
    /** Exemples de valeurs par colonne, lus dans le fichier d'origine. */
    readonly exemples = signal<Record<string, string>>({});
    private fichier: Source | null = null;

    readonly nombreDefinies = computed(() => (this.proposition()?.informations || []).filter(information => information.definition).length);

    provenance(): string {
        if (this.fichier) return `Déduit du fichier « ${this.fichier.name} ».`;
        const reconnues = (this.proposition()?.informations || []).filter(information => information.colonne).length;
        return reconnues ? `Modèle, ${reconnues} colonne(s) reconnue(s) dans vos fichiers.` : 'Modèle prêt à l’emploi.';
    }

    async partirDuFichier(source: Source): Promise<void> {
        this.fichier = source;
        this.proposition.set(propositionDepuisFichier({ name: source.name, headers: source.headers, theme: source.theme as string }));
        await this.chargerLesExemples(source);
    }
    partirDuModele(cle: string): void {
        this.fichier = null;
        this.exemples.set({});
        this.proposition.set(
            propositionDepuisModele(
                cle,
                this.sources().map(source => ({ name: source.name, headers: source.headers }))
            )
        );
    }

    /** Des valeurs réelles valent mieux qu'une définition : on lit les plus fréquentes de chaque colonne. */
    private async chargerLesExemples(source: Source): Promise<void> {
        const colonnes = source.headers || [];
        try {
            const lues = await Promise.all(
                colonnes.map(colonne =>
                    this.api
                        .valeursColonne(String(source.id), colonne)
                        .then(
                            valeurs =>
                                [
                                    colonne,
                                    valeurs
                                        .slice(0, EXEMPLES)
                                        .map(valeur => valeur.valeur)
                                        .join(' ; ')
                                ] as const
                        )
                        .catch(() => [colonne, ''] as const)
                )
            );
            this.exemples.set(Object.fromEntries(lues));
        } catch {
            // Les exemples sont un confort : la proposition reste utilisable sans eux.
            this.exemples.set({});
        }
    }

    /** Rien n'est créé avant ce clic : on assemble alors l'objet et on le confie à l'écran. */
    creer(): void {
        const proposition = this.proposition();
        if (!proposition) return;
        const nom = proposition.nom.trim();
        if (!nom) {
            this.notifications.erreur("Donnez un nom à l'objet.");
            return;
        }
        if (this.objets().some(candidat => candidat.name.toLowerCase() === nom.toLowerCase())) {
            this.notifications.erreur(`Un objet « ${nom} » existe déjà.`);
            return;
        }
        const retenues = proposition.informations.filter(information => information.retenue && information.nom.trim());
        this.creerObjet.emit({
            id: genererIdentifiant('bo'),
            name: nom,
            definition: '',
            domain: proposition.domaine,
            globalOwner: '',
            contributors: [],
            status: 'Brouillon',
            sources: this.fichier ? [{ table: this.fichier.name, role: 'maitre' }] : [],
            elements: retenues.map(information => ({
                id: genererIdentifiant('be'),
                name: information.nom.trim(),
                definition: information.definition.trim(),
                owner: '',
                mappings: information.colonne ? [{ table: information.table, col: information.colonne }] : [],
                examples: this.exemples()[information.colonne] || '',
                usedBy: []
            })),
            producedBy: [],
            consumedBy: [],
            references: []
        });
    }
}
