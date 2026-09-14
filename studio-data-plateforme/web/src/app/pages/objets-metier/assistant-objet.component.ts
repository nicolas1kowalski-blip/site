/**
 * L'assistant de création d'un objet métier — l'écran des trois étapes de la V11.
 *
 * On avance avec « Suivant › », on revient avec « ‹ Précédent », et l'objet n'est créé qu'au dernier clic.
 * Les règles (ce qui manque pour avancer, les informations que la saisie décrit, l'objet final) sont dans
 * ./assistant-objet.ts, testées à part.
 */
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjetMetier, Source, genererIdentifiant } from '../../coeur/modeles';
import {
    ETAPES_ASSISTANT,
    SaisieAssistant,
    informationsDeLaSaisie,
    objetDeLaSaisie,
    recapitulatifDeLaSaisie,
    refusDeLEtape,
    saisieVide
} from './assistant-objet';

/** Les statuts d'une fiche, du brouillon à la validation — les mêmes que dans la fiche complète. */
const STATUTS = ['Brouillon', 'À valider', 'Validé'];

@Component({
    selector: 'app-assistant-objet',
    imports: [FormsModule],
    template: `
        <div class="carte assistant">
            <div class="entete-page" style="margin: 0 0 8px">
                <div class="espace">
                    <h2>Nouvel objet métier</h2>
                    <p class="discret">Étape {{ etape() + 1 }} / 3 — {{ etapes[etape()] }}</p>
                </div>
                <button class="bouton petit" type="button" name="fermerAssistant" (click)="fermer.emit()">Fermer</button>
            </div>
            <div class="jalons">
                @for (titre of etapes; track titre; let rang = $index) {
                    <span [class.faite]="rang <= etape()"></span>
                }
            </div>

            @if (etape() === 0) {
                <div class="ligne-champs">
                    <label class="champ-libelle">
                        <span class="etiquette">Nom de l'objet</span>
                        <input class="champ" name="assistantNom" [(ngModel)]="saisie.nom" placeholder="ex. Client, Facture, Site…" />
                        <span class="discret">Un nom au singulier, tel que le métier le dit.</span>
                    </label>
                    <label class="champ-libelle">
                        <span class="etiquette">Domaine métier</span>
                        <input class="champ" name="assistantDomaine" [(ngModel)]="saisie.domaine" [attr.list]="'assistant-domaines'" />
                        <datalist id="assistant-domaines">
                            @for (domaine of domaines(); track domaine) {
                                <option [value]="domaine"></option>
                            }
                        </datalist>
                        <span class="discret">Le domaine dit à qui la donnée se rattache.</span>
                    </label>
                </div>
                <label class="champ-libelle">
                    <span class="etiquette">Définition (facultatif)</span>
                    <textarea
                        class="champ"
                        name="assistantDefinition"
                        rows="2"
                        [(ngModel)]="saisie.definition"
                        placeholder="Ce qu'est cet objet pour le métier, en une phrase."
                    ></textarea>
                </label>
            } @else if (etape() === 1) {
                <label class="champ-libelle">
                    <span class="etiquette">Fichier de départ</span>
                    <select class="champ" name="assistantTable" [(ngModel)]="saisie.table" (ngModelChange)="changerDeFichier($event)">
                        <option value="">— sans fichier : j'écris les informations —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                    <span class="discret">
                        Le fichier ne sert qu'à démarrer : les informations restent renommables, et d'autres sources peuvent être rattachées
                        ensuite.
                    </span>
                </label>
                @if (saisie.table) {
                    <div class="entete-page" style="margin: 10px 0 4px">
                        <span class="etiquette espace">
                            Colonnes qui deviennent des informations ({{ saisie.colonnes.length }} / {{ colonnes().length }})
                        </span>
                        <button class="bouton petit" type="button" name="toutesColonnes" (click)="toutesLesColonnes()">Tout</button>
                        <button class="bouton petit" type="button" name="aucuneColonne" (click)="saisie.colonnes = []">Aucune</button>
                    </div>
                    <div class="puces">
                        @for (colonne of colonnes(); track colonne) {
                            <label class="puce" [class.retenue]="saisie.colonnes.includes(colonne)">
                                <input
                                    type="checkbox"
                                    [checked]="saisie.colonnes.includes(colonne)"
                                    [attr.name]="'colonne-' + colonne"
                                    (change)="basculerColonne(colonne)"
                                />
                                {{ colonne }}
                            </label>
                        }
                    </div>
                } @else {
                    <label class="champ-libelle">
                        <span class="etiquette">Informations, une par ligne</span>
                        <textarea
                            class="champ"
                            name="assistantLibres"
                            rows="6"
                            [(ngModel)]="saisie.libres"
                            placeholder="Numéro client&#10;Raison sociale&#10;Adresse électronique"
                        ></textarea>
                    </label>
                }
            } @else {
                <div class="ligne-champs">
                    <label class="champ-libelle">
                        <span class="etiquette">Responsable</span>
                        <input
                            class="champ"
                            name="assistantResponsable"
                            [(ngModel)]="saisie.responsable"
                            placeholder="Personne ou direction"
                        />
                        <span class="discret">Celui qui répond de la définition et de la qualité de cet objet.</span>
                    </label>
                    <label class="champ-libelle">
                        <span class="etiquette">Statut</span>
                        <select class="champ" name="assistantStatut" [(ngModel)]="saisie.statut">
                            @for (statut of statuts; track statut) {
                                <option [value]="statut">{{ statut }}</option>
                            }
                        </select>
                    </label>
                </div>
                <div class="etiquette">Récapitulatif</div>
                <p class="recapitulatif">{{ recapitulatif() }}</p>
            }

            <div class="entete-page" style="margin: 12px 0 0">
                <span class="discret espace">{{ refus() }}</span>
                <button class="bouton" type="button" name="etapePrecedente" [disabled]="etape() === 0" (click)="reculer()">
                    ‹ Précédent
                </button>
                @if (etape() < 2) {
                    <button class="bouton principal" type="button" name="etapeSuivante" (click)="avancer()">Suivant ›</button>
                } @else {
                    <button class="bouton principal" type="button" name="creerObjetAssistant" (click)="creer()">✓ Créer l'objet</button>
                }
            </div>
        </div>
    `,
    styles: `
        .assistant h2 {
            margin: 0;
        }
        .assistant p {
            margin: 4px 0 0;
        }
        .jalons {
            display: flex;
            gap: 6px;
            margin-bottom: 14px;
        }
        .jalons span {
            flex: 1;
            height: 4px;
            border-radius: 999px;
            background: var(--surface-2);
        }
        .jalons span.faite {
            background: var(--accent);
        }
        .champ-libelle {
            display: block;
            margin-bottom: 10px;
        }
        .puce.retenue {
            border-color: var(--accent);
            color: var(--accent);
        }
        .recapitulatif {
            font-weight: 600;
        }
    `
})
export class AssistantObjetComponent {
    readonly sources = input<Source[]>([]);
    readonly domaines = input<string[]>([]);
    readonly creerObjet = output<ObjetMetier>();
    readonly fermer = output<void>();

    readonly etapes = ETAPES_ASSISTANT;
    readonly statuts = STATUTS;
    readonly etape = signal(0);
    /** La saisie est un objet ordinaire : les champs du formulaire y écrivent directement. */
    saisie: SaisieAssistant = saisieVide();
    /** Ce qui manque pour avancer ; ne s'affiche qu'après un clic sur « Suivant ». */
    readonly refus = signal('');

    readonly colonnes = computed(() => this.sources().find(source => source.name === this.saisie.table)?.headers || []);

    /** Un nouveau fichier : toutes ses colonnes sont retenues d'emblée, on décoche ensuite. */
    changerDeFichier(nom: string): void {
        this.saisie.table = nom;
        this.saisie.colonnes = nom ? [...(this.sources().find(source => source.name === nom)?.headers || [])] : [];
    }

    /** Toutes les colonnes du fichier deviennent des informations ; on décoche ensuite ce qui ne sert pas. */
    toutesLesColonnes(): void {
        this.saisie.colonnes = [...this.colonnes()];
    }

    basculerColonne(colonne: string): void {
        this.saisie.colonnes = this.saisie.colonnes.includes(colonne)
            ? this.saisie.colonnes.filter(retenue => retenue !== colonne)
            : [...this.saisie.colonnes, colonne];
    }

    recapitulatif(): string {
        return recapitulatifDeLaSaisie(this.saisie);
    }

    avancer(): void {
        const refus = refusDeLEtape(this.saisie, this.etape());
        this.refus.set(refus);
        if (refus) return;
        this.etape.update(etape => Math.min(2, etape + 1));
    }

    reculer(): void {
        this.refus.set('');
        this.etape.update(etape => Math.max(0, etape - 1));
    }

    /** Rien n'a été créé avant ce clic : on assemble l'objet et on le confie à l'écran. */
    creer(): void {
        for (const etape of [0, 1]) {
            const refus = refusDeLEtape(this.saisie, etape);
            if (refus) {
                this.etape.set(etape);
                this.refus.set(refus);
                return;
            }
        }
        this.creerObjet.emit(objetDeLaSaisie(this.saisie, genererIdentifiant));
    }

    /** Le nombre d'informations que la saisie décrit : sert à l'écran qui annonce le résultat. */
    nombreDInformations(): number {
        return informationsDeLaSaisie(this.saisie).length;
    }
}
