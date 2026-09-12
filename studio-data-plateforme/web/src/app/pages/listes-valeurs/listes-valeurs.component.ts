/**
 * Listes de valeurs (référentiels de codes) : ce qu'un attribut a le droit de contenir.
 *   • en clair : codes saisis ligne à ligne (code ; libellé ; statut) ;
 *   • par source : une table chargée sert de référentiel (colonne code, libellé, statut, nom de liste).
 * Une liste se rattache à des attributs (table.colonne du dictionnaire) et contrôle une colonne à la demande :
 * les valeurs hors référentiel sont comptées et montrées.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { ControleListe, ListeValeurs, Source, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

/** Saisie en clair : une ligne = code ; libellé ; statut (même règle que le serveur). */
function analyserSaisie(texte: string): { code: string; label: string; status: string }[] {
    return texte
        .split('\n')
        .map(ligne => ligne.trim())
        .filter(Boolean)
        .map(ligne => {
            const parties = ligne.split(';').map(partie => partie.trim());
            return { code: parties[0] || '', label: parties[1] || '', status: parties[2] || '' };
        })
        .filter(valeur => valeur.code);
}

function texteSaisie(liste: ListeValeurs): string {
    return (liste.values || [])
        .map(valeur => [valeur.code, valeur.label, valeur.status].filter((partie, index) => index === 0 || partie).join(' ; '))
        .join('\n');
}

@Component({
    selector: 'app-listes-valeurs',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Listes de valeurs</h1>
                <p class="discret">
                    Référentiels de codes : une colonne rattachée à une liste est contrôlée sur l'appartenance au référentiel.
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="ajouter()">Créer une liste</button>
            }
        </div>
        @if (!listes().length) {
            <div class="carte discret" style="text-align: center; padding: 40px">
                Aucune liste de valeurs. Saisissez vos codes en clair, ou désignez une table chargée qui sert de référentiel.
            </div>
        }
        @for (liste of listes(); track liste.id; let index = $index) {
            <div class="carte">
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Nom</label
                        ><input
                            class="champ"
                            [(ngModel)]="liste.name"
                            [name]="'liste-nom-' + index"
                            [attr.name]="'liste-nom-' + index"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Description</label
                        ><input
                            class="champ"
                            [(ngModel)]="liste.description"
                            [name]="'liste-description-' + index"
                            [attr.name]="'liste-description-' + index"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                    <div>
                        <label class="etiquette">Définie</label>
                        <select
                            class="champ"
                            [(ngModel)]="liste.kind"
                            [name]="'liste-genre-' + index"
                            [attr.name]="'liste-genre-' + index"
                            [disabled]="!session.peutEditer()"
                        >
                            <option value="inline">en clair (codes saisis)</option>
                            <option value="table">depuis une table de référence</option>
                        </select>
                    </div>
                    <div>
                        <label class="etiquette">Statut actif (facultatif)</label
                        ><input
                            class="champ"
                            [(ngModel)]="liste.activeStatus"
                            [name]="'liste-statut-actif-' + index"
                            placeholder="ex. A"
                            [disabled]="!session.peutEditer()"
                        />
                    </div>
                </div>
                @if (liste.kind === 'inline') {
                    <label class="etiquette" style="margin-top: 8px">Codes (une ligne = code ; libellé ; statut)</label>
                    <textarea
                        class="champ"
                        [ngModel]="saisies[liste.id]"
                        (ngModelChange)="definirSaisie(liste, $event)"
                        [name]="'liste-codes-' + index"
                        [attr.name]="'liste-codes-' + index"
                        [disabled]="!session.peutEditer()"
                    ></textarea>
                    <div class="discret">{{ liste.values.length }} code(s)</div>
                } @else {
                    <div class="formulaire-ligne" style="margin-top: 8px">
                        <div>
                            <label class="etiquette">Table de référence</label>
                            <select
                                class="champ"
                                [(ngModel)]="liste.srcTable"
                                (ngModelChange)="changerTable(liste)"
                                [name]="'liste-table-' + index"
                                [attr.name]="'liste-table-' + index"
                                [disabled]="!session.peutEditer()"
                            >
                                <option value="">— table —</option>
                                @for (source of sources(); track source.id) {
                                    <option [value]="source.name">{{ source.name }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="etiquette">Colonne code</label>
                            <select
                                class="champ"
                                [(ngModel)]="liste.colCode"
                                [name]="'liste-colonne-code-' + index"
                                [attr.name]="'liste-colonne-code-' + index"
                                [disabled]="!session.peutEditer()"
                            >
                                <option value="">— colonne —</option>
                                @for (colonne of colonnesDe(liste.srcTable); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="etiquette">Colonne libellé</label>
                            <select
                                class="champ"
                                [(ngModel)]="liste.colLabel"
                                [name]="'liste-colonne-libelle-' + index"
                                [disabled]="!session.peutEditer()"
                            >
                                <option value="">—</option>
                                @for (colonne of colonnesDe(liste.srcTable); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="etiquette">Colonne statut</label>
                            <select
                                class="champ"
                                [(ngModel)]="liste.colStatus"
                                [name]="'liste-colonne-statut-' + index"
                                [attr.name]="'liste-colonne-statut-' + index"
                                [disabled]="!session.peutEditer()"
                            >
                                <option value="">—</option>
                                @for (colonne of colonnesDe(liste.srcTable); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                        <div>
                            <label class="etiquette">Colonne « nom de la liste »</label>
                            <select
                                class="champ"
                                [(ngModel)]="liste.colList"
                                [name]="'liste-colonne-liste-' + index"
                                [disabled]="!session.peutEditer()"
                            >
                                <option value="">— (une seule liste) —</option>
                                @for (colonne of colonnesDe(liste.srcTable); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </div>
                        @if (liste.colList) {
                            <div>
                                <label class="etiquette">Valeur du nom de liste</label
                                ><input
                                    class="champ"
                                    [(ngModel)]="liste.listValue"
                                    [name]="'liste-valeur-liste-' + index"
                                    [disabled]="!session.peutEditer()"
                                />
                            </div>
                        }
                    </div>
                }
                <div class="entete-page" style="margin: 10px 0 0">
                    @if (session.peutEditer()) {
                        <button class="bouton principal petit" (click)="enregistrer(liste)">Enregistrer</button>
                    }
                    <button class="bouton petit" (click)="apercevoir(liste)">Voir les codes</button>
                    <select
                        class="champ"
                        style="width: auto"
                        [(ngModel)]="controleTable[liste.id]"
                        [name]="'controle-table-' + index"
                        [attr.name]="'controle-table-' + index"
                    >
                        <option value="">— table à contrôler —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                    <select
                        class="champ"
                        style="width: auto"
                        [(ngModel)]="controleColonne[liste.id]"
                        [name]="'controle-colonne-' + index"
                        [attr.name]="'controle-colonne-' + index"
                    >
                        <option value="">— colonne —</option>
                        @for (colonne of colonnesDe(controleTable[liste.id]); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <button class="bouton petit" (click)="controler(liste)" [disabled]="!controleColonne[liste.id]">
                        Contrôler la colonne
                    </button>
                    @if (session.peutEditer()) {
                        <button class="bouton petit" (click)="rattacher(liste)" [disabled]="!controleColonne[liste.id]">
                            Rattacher la colonne
                        </button>
                        <button class="bouton petit danger" (click)="supprimer(liste)">Supprimer la liste</button>
                    }
                </div>
                @if (apercus[liste.id]; as apercu) {
                    <div class="discret" style="margin-top: 8px">{{ apercu.total }} code(s) : {{ apercu.codes.join(', ') }}</div>
                }
                @if (controles[liste.id]; as controle) {
                    <div class="resultat-controle" [class.ok]="controle.horsListe === 0" [class.ko]="controle.horsListe > 0">
                        {{ controle.table }}.{{ controle.col }} : {{ controle.horsListe }} valeur(s) hors liste sur {{ controle.total }}
                        @if (controle.exemples.length) {
                            — ex. {{ exemplesTexte(controle) }}
                        }
                    </div>
                }
                @if (liste.utilisations?.length) {
                    <div class="puces" style="margin-top: 8px">
                        <span class="discret">Attributs rattachés :</span>
                        @for (utilisation of liste.utilisations; track utilisation.table + utilisation.col) {
                            <span class="puce"
                                >{{ utilisation.table }}.{{ utilisation.col }}
                                @if (session.peutEditer()) {
                                    <a (click)="detacher(liste, utilisation)">✕</a>
                                }
                            </span>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: `
        .carte + .carte {
            margin-top: 14px;
        }
        .resultat-controle {
            margin-top: 8px;
            font-weight: 600;
        }
        .resultat-controle.ok {
            color: var(--succes);
        }
        .resultat-controle.ko {
            color: var(--erreur);
        }
        .puce {
            display: inline-block;
            font-size: 11px;
            padding: 2px 6px;
            margin: 0 4px 4px 0;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            background: var(--surface-2);
        }
        .puce a {
            cursor: pointer;
            margin-left: 4px;
            color: var(--erreur);
        }
    `
})
export class ListesValeursComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly listes = signal<ListeValeurs[]>([]);
    readonly sources = signal<Source[]>([]);
    saisies: Record<string, string> = {};
    apercus: Record<string, { codes: string[]; total: number }> = {};
    controles: Record<string, ControleListe> = {};
    controleTable: Record<string, string> = {};
    controleColonne: Record<string, string> = {};

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [listes, sources] = await Promise.all([this.api.listesValeurs(), this.api.sources()]);
            this.listes.set(listes);
            for (const liste of listes) this.saisies[liste.id] = texteSaisie(liste);
            this.sources.set(sources);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ajouter(): void {
        const liste: ListeValeurs = {
            id: genererIdentifiant('vl'),
            name: 'Nouvelle liste',
            description: '',
            kind: 'inline',
            values: [],
            srcTable: '',
            colCode: '',
            colLabel: '',
            colStatus: '',
            colList: '',
            listValue: '',
            activeStatus: '',
            utilisations: []
        };
        this.saisies[liste.id] = '';
        this.listes.update(courantes => [...courantes, liste]);
    }

    definirSaisie(liste: ListeValeurs, texte: string): void {
        this.saisies[liste.id] = texte;
        liste.values = analyserSaisie(texte);
    }

    changerTable(liste: ListeValeurs): void {
        liste.colCode = liste.colLabel = liste.colStatus = liste.colList = liste.listValue = '';
    }

    colonnesDe(nomSource: string | undefined): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    exemplesTexte(controle: ControleListe): string {
        return controle.exemples.map(exemple => `${exemple.valeur} (×${exemple.nombre})`).join(', ');
    }

    async enregistrer(liste: ListeValeurs): Promise<void> {
        try {
            const { id, utilisations, ...corps } = liste;
            await this.api.enregistrerListeValeurs(id, corps);
            this.notifications.succes(
                `Liste « ${liste.name} » enregistrée${utilisations?.length ? ` (${utilisations.length} attribut(s) rattaché(s))` : ''}.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async apercevoir(liste: ListeValeurs): Promise<void> {
        try {
            this.apercus[liste.id] = await this.api.apercuListeValeurs(liste.id);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async controler(liste: ListeValeurs): Promise<void> {
        try {
            this.controles[liste.id] = await this.api.controlerListeValeurs(
                liste.id,
                this.controleTable[liste.id],
                this.controleColonne[liste.id]
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async rattacher(liste: ListeValeurs): Promise<void> {
        try {
            const resultat = await this.api.rattacherListeValeurs(liste.id, this.controleTable[liste.id], this.controleColonne[liste.id]);
            liste.utilisations = resultat.utilisations;
            this.notifications.succes(`${this.controleTable[liste.id]}.${this.controleColonne[liste.id]} rattaché à « ${liste.name} ».`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async detacher(liste: ListeValeurs, utilisation: { table: string; col: string }): Promise<void> {
        try {
            liste.utilisations = (await this.api.detacherListeValeurs(liste.id, utilisation.table, utilisation.col)).utilisations;
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(liste: ListeValeurs): Promise<void> {
        const rattaches = liste.utilisations?.length || 0;
        if (
            !confirm(
                `Supprimer la liste « ${liste.name} » ?${rattaches ? `\n\n${rattaches} attribut(s) y sont rattachés — ils ne seront plus contrôlés.` : ''}`
            )
        )
            return;
        try {
            await this.api.supprimerListeValeurs(liste.id);
        } catch {
            // Liste jamais enregistrée : elle n'existe pas côté serveur.
        }
        this.listes.update(courantes => courantes.filter(candidat => candidat.id !== liste.id));
    }
}
