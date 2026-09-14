/**
 * La fiche d'une information, en trois questions — reprise de la V13 de l'application classique.
 *
 * On décrit une donnée comme on l'expliquerait à un nouveau collègue :
 *   ① C'est quoi ?     le nom, la définition en langage courant, des exemples de valeurs ;
 *   ② D'où ça vient ?  la ou les colonnes du fichier qui portent la valeur ;
 *   ③ Qui s'en sert ?  les applications, processus et restitutions qui la consomment.
 * Le reste — confidentialité, mot du glossaire, responsable — est rangé sous « En dire plus » : ce sont des
 * réglages, pas des questions qu'on se pose en découvrant la donnée.
 *
 * Une jauge dit où en est la fiche et quelle question reste à remplir ; cliquer dessus amène à la bonne
 * section. Quand la définition manque, la fiche en propose une : celle déjà écrite ailleurs pour la même
 * information, ou à défaut une devinette d'après le nom. Rien n'est écrit sans un clic.
 */
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { Actif, AttributObjetMetier, ObjetMetier, OrigineInformation, Source, TermeGlossaire } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { CompletudeInformation, completudeInformation, definitionDejaEcrite, definitionDevinee } from './description-information';
import {
    NATURES_ORIGINE,
    NatureOrigine,
    REGLE_DE_CHOIX,
    dependantsDe,
    libelleOrigine,
    originesValides,
    refusDeLOrigine
} from './origines-information';

/** Nombre de valeurs réelles ramenées en exemple : de quoi reconnaître la donnée, pas de quoi la lister. */
const EXEMPLES = 3;

@Component({
    selector: 'app-fiche-information',
    imports: [FormsModule, RouterLink],
    template: `
        <div class="fiche-information">
            <div class="entete-page" style="margin: 0 0 8px">
                <b class="espace">Fiche de « {{ attribut().name }} »</b>
                <!-- V13 : de la fiche d'une information, on va voir son parcours d'un clic. -->
                <a
                    class="bouton petit"
                    name="parcoursInformation"
                    title="D'où vient cette information, et où elle va"
                    [routerLink]="'/lineage'"
                    [queryParams]="{ objet: objet().id, information: attribut().id }"
                >
                    🔎 Parcours
                </a>
                <button class="bouton petit" type="button" name="fermerFiche" (click)="fermer.emit()">Fermer</button>
            </div>

            <!-- La jauge : où on en est, et la prochaine question -->
            <div class="jauge" [class.complete]="completude().score === 100" [class.debut]="completude().score < 50">
                <span
                    >Fiche complète à <b>{{ completude().score }} %</b></span
                >
                <span class="barre"><i [style.width.%]="completude().score"></i></span>
                @if (completude().prochaine; as prochaine) {
                    <button class="lien-question" type="button" [title]="prochaine.conseil" (click)="section.set(prochaine.section)">
                        Prochaine question : {{ prochaine.question }} →
                    </button>
                } @else {
                    <span class="tout-y-est">✓ tout y est</span>
                }
            </div>

            <!-- Définition proposée, tant qu'il n'y en a pas -->
            @if (definitionProposee(); as proposition) {
                <div class="proposition">
                    <b>Définition proposée</b> ({{ proposition.origine }}) : « {{ proposition.texte }} »
                    @if (peutEditer()) {
                        <button class="bouton petit" type="button" name="utiliserDefinition" (click)="utiliser(proposition.texte)">
                            Utiliser
                        </button>
                    }
                </div>
            }

            <!-- ① C'est quoi ? -->
            <section class="question" [class.visee]="section() === 1">
                <div class="tete"><span class="numero">1</span><b>C'est quoi ?</b></div>
                <p class="discret">Le nom, la définition en langage courant, des exemples de valeurs.</p>
                <label class="etiquette">Nom de l'information</label>
                <input class="champ" name="fiche-nom" [(ngModel)]="attribut().name" [disabled]="!peutEditer()" />
                <label class="etiquette">Définition</label>
                <textarea
                    class="champ"
                    name="fiche-definition"
                    rows="2"
                    [(ngModel)]="attribut().definition"
                    [disabled]="!peutEditer()"
                    placeholder="Expliquez-la comme à un nouveau collègue."
                ></textarea>
                <label class="etiquette">Exemples de valeurs</label>
                <div class="ligne-champs">
                    <input
                        class="champ espace"
                        name="fiche-exemples"
                        [(ngModel)]="attribut().examples"
                        [disabled]="!peutEditer()"
                        placeholder="ex. Paris ; Lyon ; Lille"
                    />
                    @if (peutEditer()) {
                        <button
                            class="bouton petit"
                            type="button"
                            name="chercherExemples"
                            [disabled]="!premiereColonne() || enCours()"
                            title="Aller chercher des valeurs réelles dans le fichier"
                            (click)="chercherDesExemples()"
                        >
                            Chercher dans le fichier
                        </button>
                    }
                </div>
            </section>

            <!-- ② D'où ça vient ? -->
            <section class="question" [class.visee]="section() === 2">
                <div class="tete"><span class="numero">2</span><b>D'où ça vient ?</b></div>
                <p class="discret" title="Terme technique : mapping">La colonne du fichier qui porte réellement la valeur.</p>
                @if (attribut().mappings.length) {
                    <div class="puces">
                        @for (correspondance of attribut().mappings; track $index; let index = $index) {
                            <span class="puce"
                                >{{ correspondance.table }}.{{ correspondance.col }}
                                @if (peutEditer()) {
                                    <a (click)="attribut().mappings.splice(index, 1)">✕</a>
                                }
                            </span>
                        }
                    </div>
                } @else {
                    <div class="vide">Pas encore de colonne : on ne sait pas d'où vient cette information.</div>
                }
                @if (peutEditer()) {
                    <div class="ligne-champs">
                        <select class="champ" name="fiche-table" [(ngModel)]="table">
                            <option value="">— fichier —</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                        <select class="champ" name="fiche-colonne" [(ngModel)]="colonne">
                            <option value="">— colonne —</option>
                            @for (entete of colonnesDuFichier(); track entete) {
                                <option [value]="entete">{{ entete }}</option>
                            }
                        </select>
                        <button class="bouton petit" type="button" name="ajouterColonneFichier" (click)="ajouterColonne()">
                            + Colonne
                        </button>
                    </div>
                }

                <!-- V12.6 : une information vient parfois d'une autre information, décrite ailleurs. -->
                <div class="titre-bloc">Provient d'un autre objet métier</div>
                @if (origines().length) {
                    <div class="puces">
                        @for (origine of origines(); track $index; let index = $index) {
                            <span class="puce">
                                <span class="badge neutre">{{ natures[origine.kind].libelle }}</span>
                                {{ libelle(origine) }}
                                @if (origine.rule) {
                                    <span class="discret">— {{ origine.rule }}</span>
                                }
                                @if (peutEditer()) {
                                    <a (click)="retirerOrigine(index)">✕</a>
                                }
                            </span>
                        }
                    </div>
                }
                @if (peutEditer()) {
                    <details class="guide-natures" [open]="!origines().length">
                        <summary>Quelle nature choisir ? Copie, dérivé ou agrégé</summary>
                        <div class="natures">
                            @for (nature of naturesListe; track nature.cle) {
                                <div class="nature">
                                    <b>{{ nature.libelle }}</b>
                                    <span class="discret">{{ nature.forme }}</span>
                                    <p>{{ nature.explication }}</p>
                                    <em class="discret">Ex. {{ nature.exemple }}</em>
                                </div>
                            }
                        </div>
                        <p class="discret">{{ regleDeChoix }}</p>
                    </details>
                    <div class="ligne-champs">
                        <select class="champ" name="origine-objet" [(ngModel)]="origineObjet" (ngModelChange)="origineInformation = ''">
                            <option value="">— objet d'origine —</option>
                            @for (autre of autresObjets(); track autre.id) {
                                <option [value]="autre.id">{{ autre.name }}</option>
                            }
                        </select>
                        <select class="champ" name="origine-information" [(ngModel)]="origineInformation">
                            <option value="">— information —</option>
                            @for (candidate of informationsDe(origineObjet); track candidate.id) {
                                <option [value]="candidate.id">{{ candidate.name }}</option>
                            }
                        </select>
                        <select class="champ petit" name="origine-nature" [(ngModel)]="origineNature">
                            @for (nature of naturesListe; track nature.cle) {
                                <option [value]="nature.cle">{{ nature.libelle }}</option>
                            }
                        </select>
                        <input class="champ" name="origine-regle" [(ngModel)]="origineRegle" placeholder="la règle, en clair" />
                        <button class="bouton petit" type="button" name="ajouterOrigine" (click)="ajouterOrigine()">+ Origine</button>
                    </div>
                }
                @if (reutilisePar().length) {
                    <div class="discret">
                        Réutilisé par :
                        @for (dependant of reutilisePar(); track $index) {
                            <span class="puce">{{ dependant.objet.name }} › {{ dependant.information.name }}</span>
                        }
                    </div>
                }
            </section>

            <!-- ③ Qui s'en sert ? -->
            <section class="question" [class.visee]="section() === 3">
                <div class="tete"><span class="numero">3</span><b>Qui s'en sert ?</b></div>
                <p class="discret">Applications, processus et restitutions qui utilisent cette information.</p>
                @if (actifs().length) {
                    <div class="cases">
                        @for (actif of actifs(); track actif.id) {
                            <label class="case">
                                <input
                                    type="checkbox"
                                    [checked]="attribut().usedBy.includes(actif.id)"
                                    (change)="basculerUsage(actif.id)"
                                    [disabled]="!peutEditer()"
                                />
                                {{ actif.name }}
                            </label>
                        }
                    </div>
                } @else {
                    <div class="vide">Aucune application déclarée : décrivez-en dans « Applications & restitutions ».</div>
                }
            </section>

            <details class="en-dire-plus">
                <summary>En dire plus — confidentialité, mot du métier, responsable</summary>
                <div class="grille deux">
                    <div>
                        <label class="etiquette" title="Terme technique : sensibilité">Confidentialité</label>
                        <select class="champ" name="fiche-confidentialite" [(ngModel)]="attribut().sensitivity" [disabled]="!peutEditer()">
                            <option value="">—</option>
                            <option>Public</option>
                            <option>Interne</option>
                            <option>Sensible</option>
                            <option>Personnel (RGPD)</option>
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Mot du métier (glossaire)</label>
                        <select class="champ" name="fiche-terme" [(ngModel)]="attribut().term" [disabled]="!peutEditer()">
                            <option value="">—</option>
                            @for (terme of termes(); track terme.id) {
                                <option [value]="terme.term">{{ terme.term }}</option>
                            }
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Responsable de cette information</label>
                        <input
                            class="champ"
                            name="fiche-responsable"
                            [(ngModel)]="attribut().owner"
                            [disabled]="!peutEditer()"
                            placeholder="à défaut, le responsable de l'objet"
                        />
                    </div>
                </div>
            </details>
        </div>
    `,
    styles: `
        .fiche-information {
            border: 1px solid var(--bordure);
            border-radius: 10px;
            padding: 12px;
            margin-top: 10px;
            display: grid;
            gap: 10px;
        }
        .jauge {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            font-size: 12px;
        }
        .jauge .barre {
            flex: 1;
            min-width: 120px;
            height: 8px;
            border-radius: 999px;
            background: var(--surface-2);
            overflow: hidden;
        }
        .jauge .barre i {
            display: block;
            height: 100%;
            background: var(--accent);
        }
        .jauge.complete .barre i {
            background: var(--succes);
        }
        .jauge.debut .barre i {
            background: var(--alerte);
        }
        .tout-y-est {
            color: var(--succes);
            font-weight: 700;
        }
        .lien-question {
            border: 0;
            background: none;
            color: var(--accent);
            font: inherit;
            font-weight: 700;
            cursor: pointer;
            padding: 0;
        }
        .proposition {
            background: var(--surface-2);
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 12.5px;
        }
        .question {
            border-top: 1px solid var(--bordure);
            padding-top: 10px;
            display: grid;
            gap: 6px;
        }
        .question.visee {
            background: color-mix(in srgb, var(--accent) 7%, transparent);
            border-radius: 8px;
            padding: 10px;
        }
        .question .tete {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .numero {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--accent);
            color: #fff;
            font-weight: 800;
            font-size: 12px;
        }
        .question p {
            margin: 0;
        }
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .guide-natures summary {
            cursor: pointer;
            font-weight: 700;
            font-size: 12.5px;
        }
        .natures {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin: 8px 0;
        }
        .nature {
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 8px 10px;
            display: grid;
            gap: 2px;
        }
        .nature p {
            margin: 2px 0;
            font-size: 12px;
        }
        .titre-bloc {
            font-weight: 700;
            font-size: 12.5px;
            margin-top: 6px;
        }
        .en-dire-plus summary {
            cursor: pointer;
            font-weight: 700;
            font-size: 12.5px;
        }
    `
})
export class FicheInformationComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly session = inject(SessionService);

    readonly attribut = input.required<AttributObjetMetier>();
    readonly objet = input.required<ObjetMetier>();
    /** Tous les objets de l'espace : une définition déjà écrite ailleurs vaut mieux qu'une devinette. */
    readonly objets = input<ObjetMetier[]>([]);
    readonly sources = input<Source[]>([]);
    readonly actifs = input<Actif[]>([]);
    readonly termes = input<TermeGlossaire[]>([]);
    readonly fermer = output<void>();

    /** Section mise en avant quand on suit « prochaine question ». */
    readonly section = signal(0);
    readonly enCours = signal(false);
    table = '';
    colonne = '';

    readonly natures = NATURES_ORIGINE;
    readonly naturesListe = Object.entries(NATURES_ORIGINE).map(([cle, nature]) => ({ cle: cle as NatureOrigine, ...nature }));
    readonly regleDeChoix = REGLE_DE_CHOIX;
    origineObjet = '';
    origineInformation = '';
    origineNature: NatureOrigine = 'copie';
    origineRegle = '';

    /**
     * Ces valeurs ne sont pas des `computed` : la fiche travaille sur l'objet que l'écran lui confie et le
     * modifie en place (une colonne retirée, une origine ajoutée). Un signal ne verrait pas ces changements,
     * puisque la référence ne bouge pas ; une méthode, elle, est relue à chaque affichage.
     */
    origines(): OrigineInformation[] {
        return originesValides(this.objets(), this.attribut());
    }
    reutilisePar(): { objet: ObjetMetier; information: AttributObjetMetier }[] {
        return dependantsDe(this.objets(), this.objet().id, this.attribut().id);
    }
    autresObjets(): ObjetMetier[] {
        return this.objets().filter(candidat => candidat.id !== this.objet().id);
    }
    completude(): CompletudeInformation {
        return completudeInformation(this.attribut(), this.origines().length > 0);
    }
    colonnesDuFichier(): string[] {
        return this.sources().find(source => source.name === this.table)?.headers || [];
    }
    premiereColonne(): { table: string; col: string } | null {
        return this.attribut().mappings[0] || null;
    }

    peutEditer(): boolean {
        return this.session.peutEditer();
    }

    /** La définition qu'on propose tant qu'aucune n'est écrite : reprise d'ailleurs, sinon devinée. */
    definitionProposee(): { texte: string; origine: string } | null {
        const attribut = this.attribut();
        if ((attribut.definition || '').trim()) return null;
        const ailleurs = definitionDejaEcrite(this.objets(), attribut.name, this.objet().id);
        if (ailleurs)
            return {
                texte: ailleurs.attribut.definition || '',
                origine: `déjà écrite pour « ${ailleurs.objet.name} › ${ailleurs.attribut.name} »`
            };
        const devinee = definitionDevinee(attribut.name, this.objet().name);
        return devinee ? { texte: devinee, origine: "devinée d'après le nom" } : null;
    }

    informationsDe(objetId: string): AttributObjetMetier[] {
        return this.objets().find(candidat => candidat.id === objetId)?.elements || [];
    }
    libelle(origine: OrigineInformation): string {
        return libelleOrigine(this.objets(), origine);
    }

    /** Déclarer une origine : on refuse les boucles avant d'écrire, pas après. */
    ajouterOrigine(): void {
        const origine: OrigineInformation = {
            boId: this.origineObjet,
            elId: this.origineInformation,
            kind: this.origineNature,
            rule: this.origineRegle.trim()
        };
        const refus = refusDeLOrigine(this.objets(), this.attribut(), this.objet().id, origine);
        if (refus) {
            this.notifications.erreur(refus);
            return;
        }
        const attribut = this.attribut();
        attribut.origins = [...(attribut.origins || []), origine];
        this.origineInformation = '';
        this.origineRegle = '';
        this.notifications.succes(
            `Origine déclarée : « ${this.libelle(origine)} » (${NATURES_ORIGINE[origine.kind].libelle.toLowerCase()}). ` +
                "Le parcours de la donnée remonte maintenant jusqu'à cet objet."
        );
    }
    retirerOrigine(index: number): void {
        const attribut = this.attribut();
        attribut.origins = (attribut.origins || []).filter((_, position) => position !== index);
    }

    utiliser(texte: string): void {
        this.attribut().definition = texte;
    }
    basculerUsage(identifiant: string): void {
        const usages = this.attribut().usedBy;
        const position = usages.indexOf(identifiant);
        if (position >= 0) usages.splice(position, 1);
        else usages.push(identifiant);
    }
    ajouterColonne(): void {
        if (!this.table || !this.colonne) return;
        const correspondances = this.attribut().mappings;
        if (!correspondances.some(candidat => candidat.table === this.table && candidat.col === this.colonne))
            correspondances.push({ table: this.table, col: this.colonne });
        this.colonne = '';
    }

    /** Des exemples réels valent mieux qu'une description : on lit les valeurs les plus fréquentes du fichier. */
    async chercherDesExemples(): Promise<void> {
        const correspondance = this.premiereColonne();
        if (!correspondance) return;
        const source = this.sources().find(candidat => candidat.name === correspondance.table);
        if (!source) {
            this.notifications.erreur(`Le fichier « ${correspondance.table} » n'est plus chargé.`);
            return;
        }
        this.enCours.set(true);
        try {
            const valeurs = await this.api.valeursColonne(String(source.id), correspondance.col);
            const retenues = valeurs.slice(0, EXEMPLES).map(suggestion => suggestion.valeur);
            if (!retenues.length) {
                this.notifications.info('Cette colonne ne contient aucune valeur renseignée.');
                return;
            }
            this.attribut().examples = retenues.join(' ; ');
            this.notifications.succes(`${retenues.length} exemple(s) repris du fichier.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
