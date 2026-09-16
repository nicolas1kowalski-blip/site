/**
 * Codification : rattacher à chaque ligne d'une liste reçue le code d'un référentiel.
 *
 * On reçoit une liste d'équipements — des libellés écrits à la main, une famille. À côté, une nomenclature en
 * arbre dont le niveau le plus fin porte le code du type d'équipement. L'écran empile des règles, de la plus
 * sûre à la plus souple, et la première qui répond gagne : le code déjà fourni, la table de correspondance,
 * les règles de mots-clés, puis la ressemblance du libellé — en restant dans la bonne branche de l'arbre.
 *
 * Les cas douteux passent par la revue, où un clic tranche ; et cette décision descend dans la table de
 * correspondance, de sorte qu'à la livraison suivante ce libellé-là est codé tout seul.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PleinEcranComponent } from '../../composants/plein-ecran.component';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    CasARevoir,
    Codification,
    PropositionDeCodification,
    ResultatCodification,
    Source,
    VocabulaireCodification,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import {
    ComparaisonCodification,
    EXIGENCES,
    RegleCodification,
    SynonymeCodification,
    allureDuScore,
    allureDuStatut,
    motsSaisis,
    phraseDeLOrigine,
    exigenceDesSeuils,
    phraseDeLaComparaison,
    phraseDeLaRegle,
    phraseDuSynonyme,
    prochaineAction,
    saisieDesMots,
    scoreLisible,
    suggestionsApresCodification
} from './regles-codification';

/** Une codification toute neuve, avec les seuils qui vont bien pour des libellés d'équipements. */
function codificationNeuve(): Codification {
    return {
        id: genererIdentifiant('cd_'),
        nom: 'Nouvelle codification',
        source: '',
        colonneLibelle: '',
        colonneCodeExistant: '',
        nomenclature: '',
        colonneCode: '',
        colonneLibelleRef: '',
        niveaux: [],
        comparaisons: [],
        synonymes: [],
        restreindreSource: '',
        restreindreNomenclature: '',
        regles: [],
        correspondances: [],
        seuilAuto: 0.99,
        seuilRevoir: 0.45,
        methode: 'mots',
        decisions: {}
    };
}

@Component({
    selector: 'app-codification',
    imports: [FormsModule, PleinEcranComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Codification</h1>
                <p class="discret">
                    Vous recevez une liste — des équipements, des articles — dont les libellés sont écrits à la main. Vous avez à côté un
                    référentiel qui donne le vrai code de chaque type. Cet écran retrouve ce code, ligne à ligne, et vous montre ce dont il
                    n'est pas sûr.
                </p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton" type="button" name="voirUnExemple" (click)="installerLExemple()">👁 Voir un exemple</button>
                <button class="bouton principal" type="button" name="nouvelleCodification" (click)="creer()">
                    + Nouvelle codification
                </button>
            }
        </div>

        @if (montre().length) {
            <div class="carte exemple" name="ceQueLExempleMontre">
                <h2>Ce que cet exemple vous montre</h2>
                <ul>
                    @for (ligne of montre(); track ligne) {
                        <li>{{ ligne }}</li>
                    }
                </ul>
                <div class="ligne-outils">
                    <button class="bouton" type="button" name="poserLesVariantesDeLExemple" (click)="poserLesVariantesDeLExemple()">
                        Déclarer les variantes proposées, et recoder
                    </button>
                    <button class="bouton" type="button" name="fermerLExemple" (click)="montre.set([])">Fermer</button>
                </div>
            </div>
        }

        <div class="carte">
            <div class="ligne-outils">
                <select class="champ" name="codificationChoisie" [ngModel]="choisieId()" (ngModelChange)="choisir($event)">
                    <option value="">— choisir une codification —</option>
                    @for (codification of codifications(); track codification.id) {
                        <option [value]="codification.id">{{ codification.nom }}</option>
                    }
                </select>
                @if (choisie(); as codification) {
                    <input class="champ" name="nomCodification" [(ngModel)]="codification.nom" placeholder="Nom" />
                    @if (session.peutEditer()) {
                        <button class="bouton" type="button" name="enregistrerCodification" (click)="enregistrer()">Enregistrer</button>
                        <button class="bouton danger" type="button" name="supprimerCodification" (click)="supprimer()">Supprimer</button>
                    }
                }
            </div>
            <p class="discret" name="prochaineAction">{{ prochaine() }}</p>
        </div>

        @if (choisie(); as codification) {
            <!-- ① On ne demande que les deux tables : tout le reste se lit dans les données. -->
            <div class="carte">
                <h2>① Quelles données ?</h2>
                <div class="grille-reglages">
                    <label>
                        La liste à coder
                        <select
                            class="champ"
                            name="sourceCodification"
                            [ngModel]="codification.source"
                            (ngModelChange)="choisirLaSource($event)"
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </label>
                    <label>
                        La nomenclature de référence
                        <select
                            class="champ"
                            name="nomenclatureCodification"
                            [ngModel]="codification.nomenclature"
                            (ngModelChange)="choisirLaNomenclature($event)"
                        >
                            <option value="">—</option>
                            @for (source of sources(); track source.id) {
                                <option [value]="source.name">{{ source.name }}</option>
                            }
                        </select>
                    </label>
                </div>
                @if (proposition(); as proposition) {
                    <div class="proposition" name="propositionDevinee">
                        <p class="titre-proposition">Voilà ce que j'ai compris de vos deux tables :</p>
                        <ul>
                            @for (raison of proposition.raisons; track raison) {
                                <li>{{ raison }}</li>
                            }
                        </ul>
                        <p class="discret">Tout se change sous « Affiner », plus bas.</p>
                    </div>
                }
                <div class="ligne-outils">
                    <label class="exigence">
                        Exigence
                        <select class="champ" name="exigence" [ngModel]="exigence()" (ngModelChange)="choisirLExigence($event)">
                            @for (choix of exigences; track choix.cle) {
                                <option [value]="choix.cle">{{ choix.libelle }}</option>
                            }
                            @if (exigence() === 'surmesure') {
                                <option value="surmesure">Sur mesure</option>
                            }
                        </select>
                    </label>
                    <span class="discret" name="explicationExigence">{{ explicationDeLExigence() }}</span>
                </div>
                <div class="ligne-outils">
                    <button class="bouton principal grand" type="button" name="coder" (click)="coder()" [disabled]="enCours() || !prete()">
                        {{ enCours() ? 'Codification…' : '▶ Coder la liste' }}
                    </button>
                    @if (!prete()) {
                        <span class="discret">Choisissez les deux tables pour commencer.</span>
                    }
                </div>
            </div>

            <!-- Les réglages fins : repliés tant qu'on n'en a pas besoin. -->
            <details class="affiner" name="affiner" [open]="affinerOuvert()">
                <summary>Affiner — colonnes, niveaux de l'arbre, ce que l'on compare, variantes, règles</summary>
                <section class="reglage-fin">
                    <h3>Les colonnes, les niveaux de l'arbre et la branche</h3>
                    <div class="grille-reglages">
                        <label>
                            Colonne du libellé
                            <select class="champ" name="colonneLibelle" [(ngModel)]="codification.colonneLibelle">
                                <option value="">—</option>
                                @for (colonne of colonnesDe(codification.source); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </label>
                        <label>
                            Code déjà fourni (facultatif)
                            <select class="champ" name="colonneCodeExistant" [(ngModel)]="codification.colonneCodeExistant">
                                <option value="">— aucun —</option>
                                @for (colonne of colonnesDe(codification.source); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </label>
                        <label>
                            Colonne du code
                            <select class="champ" name="colonneCode" [(ngModel)]="codification.colonneCode">
                                <option value="">—</option>
                                @for (colonne of colonnesDe(codification.nomenclature); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </label>
                        <label>
                            Colonne du libellé de référence
                            <select class="champ" name="colonneLibelleRef" [(ngModel)]="codification.colonneLibelleRef">
                                <option value="">—</option>
                                @for (colonne of colonnesDe(codification.nomenclature); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </label>
                    </div>
                    <h3>Les niveaux de l'arbre, du plus haut au plus fin</h3>
                    <p class="discret">Famille, système, sous-système… c'est ce chemin qui accompagnera chaque code trouvé.</p>
                    <div class="ligne-outils">
                        @for (niveau of codification.niveaux; track niveau; let rang = $index) {
                            <span class="badge">{{ niveau }} <a (click)="retirerNiveau(rang)" title="Retirer ce niveau">✕</a></span>
                        }
                        <select class="champ" name="niveauAAjouter" [(ngModel)]="niveauAAjouter">
                            <option value="">+ niveau…</option>
                            @for (colonne of colonnesDe(codification.nomenclature); track colonne) {
                                <option [value]="colonne">{{ colonne }}</option>
                            }
                        </select>
                        <button class="bouton petit" type="button" name="ajouterNiveau" (click)="ajouterNiveau()">Ajouter</button>
                    </div>
                    <h3>Chercher dans la bonne branche</h3>
                    <p class="discret">
                        Quand la famille est déjà connue dans la liste, on ne cherche que dans sa branche de l'arbre : c'est ce qui empêche
                        de coder une vanne en pompe parce que les libellés se ressemblent.
                    </p>
                    <div class="grille-reglages">
                        <label>
                            Colonne de la liste
                            <select class="champ" name="restreindreSource" [(ngModel)]="codification.restreindreSource">
                                <option value="">— ne pas restreindre —</option>
                                @for (colonne of colonnesDe(codification.source); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </label>
                        <label>
                            doit correspondre à
                            <select class="champ" name="restreindreNomenclature" [(ngModel)]="codification.restreindreNomenclature">
                                <option value="">—</option>
                                @for (colonne of colonnesDe(codification.nomenclature); track colonne) {
                                    <option [value]="colonne">{{ colonne }}</option>
                                }
                            </select>
                        </label>
                        <label>
                            Ressemblance des libellés
                            <select class="champ" name="methodeCodification" [(ngModel)]="codification.methode">
                                @for (methode of methodes(); track methode[0]) {
                                    <option [value]="methode[0]">{{ methode[1] }}</option>
                                }
                            </select>
                        </label>
                        <label>
                            Coder d'office au-dessus de
                            <input
                                class="champ"
                                type="number"
                                min="0"
                                max="1"
                                step="0.01"
                                name="seuilAuto"
                                [(ngModel)]="codification.seuilAuto"
                            />
                        </label>
                        <label>
                            Proposer à la revue au-dessus de
                            <input
                                class="champ"
                                type="number"
                                min="0"
                                max="1"
                                step="0.01"
                                name="seuilRevoir"
                                [(ngModel)]="codification.seuilRevoir"
                            />
                        </label>
                    </div>
                </section>
                <section class="reglage-fin">
                    <h3>② Ce que l'on compare</h3>
                    <p class="discret">
                        Par défaut, le libellé de la liste contre le libellé de la nomenclature. Mais le rapprochement peut porter sur un
                        tout autre attribut — une désignation technique contre un libellé de codification, une marque contre un fabricant —
                        et sur plusieurs à la fois : le score est alors leur moyenne pondérée.
                    </p>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Colonne de la liste</th>
                                <th>Colonne de la nomenclature</th>
                                <th>Poids</th>
                                <th>Mesure</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (comparaison of codification.comparaisons; track comparaison.id; let rang = $index) {
                                <tr [attr.name]="'comparaison-' + comparaison.id">
                                    <td>
                                        <select
                                            class="champ petit"
                                            [(ngModel)]="comparaison.colonneSource"
                                            [attr.name]="'cmpSource-' + comparaison.id"
                                        >
                                            <option value="">—</option>
                                            @for (colonne of colonnesDe(codification.source); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            class="champ petit"
                                            [(ngModel)]="comparaison.colonneNomenclature"
                                            [attr.name]="'cmpNomenclature-' + comparaison.id"
                                        >
                                            <option value="">—</option>
                                            @for (colonne of colonnesDe(codification.nomenclature); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td>
                                        <input
                                            class="champ petit"
                                            type="number"
                                            min="0.1"
                                            max="10"
                                            step="0.5"
                                            [(ngModel)]="comparaison.poids"
                                            [attr.name]="'cmpPoids-' + comparaison.id"
                                        />
                                    </td>
                                    <td>
                                        <select
                                            class="champ petit"
                                            [(ngModel)]="comparaison.methode"
                                            [attr.name]="'cmpMethode-' + comparaison.id"
                                        >
                                            <option value="">celle de la codification</option>
                                            @for (methode of methodes(); track methode[0]) {
                                                <option [value]="methode[0]">{{ methode[1] }}</option>
                                            }
                                        </select>
                                        <div class="discret" [attr.name]="'phraseComparaison-' + comparaison.id">
                                            {{ phraseDeLaComparaison(comparaison, vocabulaire()?.methodes || {}) }}
                                        </div>
                                    </td>
                                    <td class="actions">
                                        <button
                                            class="bouton petit danger"
                                            type="button"
                                            (click)="retirerLaComparaison(rang)"
                                            title="Retirer"
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="5" class="discret">
                                        Rien de déclaré : on compare « {{ codification.colonneLibelle || 'le libellé' }} » à «
                                        {{ codification.colonneLibelleRef || 'le libellé du type' }} ».
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    <button class="bouton" type="button" name="ajouterComparaison" (click)="ajouterUneComparaison()">+ Comparaison</button>
                </section>

                <section class="reglage-fin">
                    <h3>③ Les mots qui en valent d'autres</h3>
                    <p class="discret">
                        Le jargon du site ne ressemble pas toujours à la nomenclature. Déclarez ici qu'une motopompe est une pompe, qu'une
                        électrovanne est une vanne, que « centrif » veut dire « centrifuge » : les variantes sont ramenées au mot retenu des
                        deux côtés avant de comparer. Les règles de mots-clés, elles, restent littérales — on les a écrites exprès sur un
                        mot précis.
                    </p>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th>Mot retenu</th>
                                <th>Autres façons de l'écrire</th>
                                <th>Même mal écrit</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (synonyme of codification.synonymes; track synonyme.id; let rang = $index) {
                                <tr [attr.name]="'synonyme-' + synonyme.id">
                                    <td>
                                        <input class="champ petit" [(ngModel)]="synonyme.motRetenu" [attr.name]="'retenu-' + synonyme.id" />
                                    </td>
                                    <td>
                                        <input
                                            class="champ"
                                            [ngModel]="saisieDesMots(synonyme.variantes)"
                                            (ngModelChange)="synonyme.variantes = motsSaisis($event)"
                                            [attr.name]="'variantes-' + synonyme.id"
                                            placeholder="motopompe ; groupe motopompe"
                                        />
                                        <div class="discret" [attr.name]="'phraseSynonyme-' + synonyme.id">
                                            {{ phraseDuSynonyme(synonyme) }}
                                        </div>
                                    </td>
                                    <td><input type="checkbox" [(ngModel)]="synonyme.proche" [attr.name]="'proche-' + synonyme.id" /></td>
                                    <td class="actions">
                                        <button class="bouton petit danger" type="button" (click)="retirerLeSynonyme(rang)" title="Retirer">
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="4" class="discret">
                                        Aucun synonyme : les libellés sont comparés tels qu'ils sont écrits.
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    <button class="bouton" type="button" name="ajouterSynonyme" (click)="ajouterUnSynonyme()">+ Synonyme</button>
                </section>

                <section class="reglage-fin">
                    <h3>④ Les règles, de la plus sûre à la plus souple</h3>
                    <p class="discret">
                        La première qui répond gagne. Le code déjà fourni passe avant tout, puis la table de correspondance ({{
                            codification.correspondances.length
                        }}
                        libellé(s) appris), puis ces règles, puis la ressemblance.
                    </p>
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th></th>
                                <th>La règle, en français</th>
                                <th>Code</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (regle of codification.regles; track regle.id; let rang = $index) {
                                <tr [attr.name]="'regle-' + regle.id">
                                    <td><input type="checkbox" [(ngModel)]="regle.actif" [attr.name]="'actif-' + regle.id" /></td>
                                    <td>
                                        <div class="phrase-regle" [attr.name]="'phraseRegle-' + regle.id">
                                            {{ phraseDeLaRegle(regle, codification.colonneLibelle) }}
                                        </div>
                                        <div class="ligne-outils">
                                            <select class="champ petit" [(ngModel)]="regle.type" [attr.name]="'type-' + regle.id">
                                                @for (type of typesDeRegle(); track type[0]) {
                                                    <option [value]="type[0]">{{ type[1] }}</option>
                                                }
                                            </select>
                                            <select class="champ petit" [(ngModel)]="regle.colonne" [attr.name]="'colonne-' + regle.id">
                                                <option value="">le libellé</option>
                                                @for (colonne of colonnesDe(codification.source); track colonne) {
                                                    <option [value]="colonne">{{ colonne }}</option>
                                                }
                                            </select>
                                            @if (regle.type === 'motscles') {
                                                <input
                                                    class="champ"
                                                    [ngModel]="saisieDesMots(regle.contient)"
                                                    (ngModelChange)="regle.contient = motsSaisis($event)"
                                                    [attr.name]="'contient-' + regle.id"
                                                    placeholder="contient : pompe ; centrifuge"
                                                />
                                                <label class="case">
                                                    <input type="checkbox" [(ngModel)]="regle.ou" [attr.name]="'ou-' + regle.id" /> un seul
                                                    suffit
                                                </label>
                                                <input
                                                    class="champ"
                                                    [ngModel]="saisieDesMots(regle.sauf)"
                                                    (ngModelChange)="regle.sauf = motsSaisis($event)"
                                                    [attr.name]="'sauf-' + regle.id"
                                                    placeholder="mais pas : vide"
                                                />
                                            } @else {
                                                <input
                                                    class="champ"
                                                    [(ngModel)]="regle.motif"
                                                    [attr.name]="'motif-' + regle.id"
                                                    placeholder="expression régulière"
                                                />
                                            }
                                        </div>
                                    </td>
                                    <td>
                                        <input class="champ petit" [(ngModel)]="regle.code" [attr.name]="'code-' + regle.id" />
                                    </td>
                                    <td class="actions">
                                        <button class="bouton petit" type="button" (click)="monterLaRegle(rang)" title="Monter">↑</button>
                                        <button class="bouton petit danger" type="button" (click)="retirerLaRegle(rang)" title="Retirer">
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="4" class="discret">
                                        Aucune règle : seules la correspondance et la ressemblance joueront.
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                    <button class="bouton" type="button" name="ajouterRegle" (click)="ajouterUneRegle()">+ Règle</button>
                </section>
            </details>
        }

        @if (resultat(); as resultat) {
            <div class="carte">
                <h2>⑤ Le résultat</h2>
                <div class="kpis">
                    <div class="kpi">
                        <span>Codées d'office</span><b class="succes" name="compteOffice">{{ resultat.bilan.office }}</b>
                    </div>
                    <div class="kpi">
                        <span>À revoir</span><b class="alerte" name="compteRevoir">{{ resultat.bilan.revoir }}</b>
                    </div>
                    <div class="kpi">
                        <span>Non trouvées</span><b name="compteAbsent">{{ resultat.bilan.absent }}</b>
                    </div>
                    <div class="kpi">
                        <span>Couverture</span><b name="couverture">{{ scoreLisible(resultat.bilan.couverture) }}</b>
                    </div>
                </div>
                <p class="discret" name="phraseBilan">{{ resultat.bilan.phrase }}</p>
                <div class="carte resultat">
                    <app-plein-ecran />
                    <table class="tableau">
                        <thead>
                            <tr>
                                @for (colonne of resultat.colonnes; track colonne) {
                                    <th>{{ enTete(colonne) }}</th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (ligne of resultat.lignes; track $index) {
                                <tr class="ligne-codee">
                                    @for (cellule of ligne; track $index; let colonne = $index) {
                                        <td [class]="classeDeLaCellule(resultat.colonnes[colonne], cellule)">
                                            {{ celluleLisible(resultat.colonnes[colonne], cellule) }}
                                        </td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }

        @if (suggestions().length) {
            <div class="carte suggestions" name="suggestions">
                <h2>Ce qui reste à faire</h2>
                @for (suggestion of suggestions(); track suggestion.titre) {
                    <div class="suggestion">
                        <b>{{ suggestion.titre }}</b>
                        <p class="discret">{{ suggestion.explication }}</p>
                        <button
                            class="bouton petit"
                            type="button"
                            [attr.name]="'ouvrir-' + suggestion.section"
                            (click)="affinerOuvert.set(true)"
                        >
                            Ouvrir le réglage
                        </button>
                    </div>
                }
            </div>
        }

        @if (casARevoir().length) {
            <div class="carte">
                <h2>⑥ À revoir — {{ casARevoir().length }} cas</h2>
                <p class="discret">
                    Chaque décision descend dans la table de correspondance : à la prochaine livraison, ce libellé sera codé tout seul.
                </p>
                @for (cas of casARevoir(); track cas.rang) {
                    <div class="cas-a-revoir" [attr.name]="'cas-' + cas.rang">
                        <div class="libelle-lu">{{ cas.libelle }}</div>
                        <div class="candidats">
                            @for (candidat of cas.candidats; track candidat.code) {
                                <button
                                    class="candidat"
                                    type="button"
                                    [attr.name]="'choisir-' + cas.rang + '-' + candidat.code"
                                    [disabled]="!session.peutEditer()"
                                    (click)="trancher(cas, candidat.code)"
                                >
                                    <b>{{ candidat.code }}</b>
                                    <span class="chemin">{{ candidat.chemin }}</span>
                                    <span class="badge" [class]="allureDuScore(candidat.score, seuilAuto())">
                                        {{ scoreLisible(candidat.score) }}
                                    </span>
                                </button>
                            }
                            <button
                                class="bouton petit"
                                type="button"
                                [attr.name]="'aucun-' + cas.rang"
                                [disabled]="!session.peutEditer()"
                                (click)="trancher(cas, '')"
                            >
                                aucun ne convient
                            </button>
                        </div>
                    </div>
                }
            </div>
        }
    `,
    styles: `
        .grille-reglages {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
            gap: 10px;
            margin: 10px 0;
        }
        .grille-reglages label {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 12px;
            font-weight: 600;
            color: var(--texte-2);
        }
        .proposition {
            border-left: 3px solid var(--accent, #4f46e5);
            background: var(--fond-2);
            border-radius: 8px;
            padding: 8px 12px;
            margin: 10px 0;
            font-size: 12.5px;
        }
        .proposition .titre-proposition {
            font-weight: 700;
            margin: 0 0 4px;
        }
        .proposition ul {
            margin: 0;
            padding-left: 18px;
        }
        .proposition li {
            margin: 2px 0;
            color: var(--texte-2);
        }
        .exigence {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 600;
            color: var(--texte-2);
        }
        .bouton.grand {
            font-size: 15px;
            padding: 8px 20px;
        }
        .affiner {
            margin: 12px 0;
            border: 1px solid var(--bordure);
            border-radius: 12px;
            background: var(--fond);
            padding: 0 14px;
        }
        .affiner > summary {
            cursor: pointer;
            font-weight: 700;
            padding: 12px 0;
            color: var(--texte-2);
        }
        .affiner .reglage-fin {
            border-top: 1px solid var(--bordure);
            padding: 10px 0 14px;
        }
        .affiner .reglage-fin h3 {
            font-size: 14px;
            margin: 0 0 6px;
        }
        .exemple ul,
        .suggestions .suggestion {
            font-size: 12.5px;
        }
        .exemple li {
            margin: 3px 0;
            color: var(--texte-2);
        }
        .suggestions .suggestion {
            border-top: 1px solid var(--bordure);
            padding: 8px 0;
        }
        .suggestions .suggestion p {
            margin: 2px 0 6px;
        }
        .phrase-regle {
            font-weight: 600;
            margin-bottom: 4px;
        }
        .cas-a-revoir {
            border-top: 1px solid var(--bordure);
            padding: 10px 0;
        }
        .libelle-lu {
            font-weight: 700;
            margin-bottom: 6px;
        }
        .candidats {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .candidat {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            border: 1px solid var(--bordure);
            border-radius: 8px;
            background: var(--fond-2);
            padding: 6px 10px;
            cursor: pointer;
            text-align: left;
        }
        .candidat:hover:not(:disabled) {
            border-color: var(--accent);
        }
        .candidat .chemin {
            font-size: 11px;
            color: var(--texte-2);
        }
        td.statut-office {
            color: var(--succes, #16a34a);
            font-weight: 600;
        }
        td.statut-revoir {
            color: var(--alerte, #d97706);
            font-weight: 600;
        }
    `
})
export class CodificationComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);

    readonly codifications = signal<Codification[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly vocabulaire = signal<VocabulaireCodification | null>(null);
    readonly choisieId = signal('');
    readonly resultat = signal<ResultatCodification | null>(null);
    readonly casARevoir = signal<CasARevoir[]>([]);
    readonly enCours = signal(false);
    /** Ce que l'application a compris des deux tables, avec ses raisons ; effacé dès qu'on change de table. */
    readonly proposition = signal<PropositionDeCodification | null>(null);
    /** Ce que l'exemple installé montre, ligne par ligne ; vide quand on n'a pas demandé l'exemple. */
    readonly montre = signal<string[]>([]);
    /** Les réglages fins sont repliés tant qu'on n'en a pas besoin. */
    readonly affinerOuvert = signal(false);
    readonly exigences = EXIGENCES;
    niveauAAjouter = '';

    readonly choisie = computed(() => this.codifications().find(candidate => candidate.id === this.choisieId()) || null);
    readonly seuilAuto = computed(() => this.choisie()?.seuilAuto ?? 0.99);
    readonly prochaine = computed(() => prochaineAction(this.resultat()?.bilan || null));
    /** Prête quand on a dit quelles sont les deux tables : le reste a été deviné. */
    readonly prete = computed(() => Boolean(this.choisie()?.source && this.choisie()?.nomenclature));
    readonly exigence = computed(() => exigenceDesSeuils(this.choisie()?.seuilAuto ?? 0.99, this.choisie()?.seuilRevoir ?? 0.45));
    readonly suggestions = computed(() => suggestionsApresCodification(this.resultat()?.bilan || null));
    readonly typesDeRegle = computed(() => Object.entries(this.vocabulaire()?.typesDeRegle || {}));
    readonly methodes = computed(() => Object.entries(this.vocabulaire()?.methodes || {}));

    readonly phraseDeLaRegle = phraseDeLaRegle;
    readonly phraseDuSynonyme = phraseDuSynonyme;
    readonly phraseDeLaComparaison = phraseDeLaComparaison;
    readonly motsSaisis = motsSaisis;
    readonly saisieDesMots = saisieDesMots;
    readonly scoreLisible = scoreLisible;
    readonly allureDuScore = allureDuScore;

    constructor() {
        void this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [codifications, sources, vocabulaire] = await Promise.all([
                this.api.codifications(),
                this.api.sources(),
                this.api.vocabulaireCodification()
            ]);
            this.codifications.set(codifications);
            this.sources.set(sources);
            this.vocabulaire.set(vocabulaire);
            if (!this.choisieId() && codifications.length) this.choisieId.set(codifications[0].id);
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }

    colonnesDe(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }
    choisir(id: string): void {
        this.choisieId.set(id);
        this.resultat.set(null);
        this.casARevoir.set([]);
        this.proposition.set(null);
        this.montre.set([]);
        // Une codification qu'on ouvre repart de la vue simple : les réglages fins se redemandent.
        this.affinerOuvert.set(false);
    }
    /**
     * Les codifications sont des objets que l'écran modifie en place. Il ne suffit pas de renouveler le
     * tableau : une valeur calculée qui rend le MÊME objet est jugée inchangée, et ne prévient pas ceux qui en
     * dépendent — le bouton « Coder » resterait grisé alors que les deux tables sont choisies. On renouvelle
     * donc aussi l'objet, pour que le changement se propage vraiment.
     */
    private signalerLeChangement(): void {
        const ouverte = this.choisieId();
        this.codifications.set(this.codifications().map(candidate => (candidate.id === ouverte ? { ...candidate } : candidate)));
    }

    /** L'explication de l'exigence choisie, en clair sous la liste déroulante. */
    explicationDeLExigence(): string {
        const trouvee = EXIGENCES.find(exigence => exigence.cle === this.exigence());
        return trouvee ? trouvee.explication : 'Seuils réglés à la main, sous « Affiner ».';
    }
    /** Applique une exigence : c'est elle qui pose les deux seuils, pour n'avoir pas à les comprendre. */
    choisirLExigence(cle: string): void {
        const codification = this.choisie();
        const exigence = EXIGENCES.find(candidate => candidate.cle === cle);
        if (!codification || !exigence) return;
        codification.seuilAuto = exigence.seuilAuto;
        codification.seuilRevoir = exigence.seuilRevoir;
        this.signalerLeChangement();
    }
    choisirLaSource(nomSource: string): void {
        const codification = this.choisie();
        if (!codification) return;
        codification.source = nomSource;
        this.signalerLeChangement();
        void this.devinerLeReste();
    }
    choisirLaNomenclature(nomSource: string): void {
        const codification = this.choisie();
        if (!codification) return;
        codification.nomenclature = nomSource;
        this.signalerLeChangement();
        void this.devinerLeReste();
    }
    /**
     * Dès que les deux tables sont connues, l'application propose le reste : quelle colonne porte le libellé,
     * laquelle le code, les niveaux de l'arbre, la branche. On ne demande rien tant qu'on peut deviner.
     */
    private async devinerLeReste(): Promise<void> {
        const codification = this.choisie();
        this.proposition.set(null);
        this.resultat.set(null);
        this.casARevoir.set([]);
        if (!codification?.source || !codification.nomenclature) return;
        try {
            const proposition = await this.api.devinerCodification(codification.source, codification.nomenclature);
            this.proposition.set(proposition);
            codification.colonneLibelle = proposition.colonneLibelle;
            codification.colonneCodeExistant = proposition.colonneCodeExistant;
            codification.colonneCode = proposition.colonneCode;
            codification.colonneLibelleRef = proposition.colonneLibelleRef;
            codification.niveaux = proposition.niveaux;
            codification.restreindreSource = proposition.restreindreSource;
            codification.restreindreNomenclature = proposition.restreindreNomenclature;
            this.signalerLeChangement();
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }

    /** Installe l'exemple et le code aussitôt : on voit le module fonctionner avant d'y toucher. */
    async installerLExemple(): Promise<void> {
        try {
            const pose = await this.api.installerLExempleDeCodification();
            this.codifications.set(await this.api.codifications());
            this.sources.set(await this.api.sources());
            this.choisir(pose.codification.id);
            this.montre.set(pose.montre);
            await this.coder();
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }
    /** Déclare les variantes que l'exemple propose, et recode : on voit ce qu'elles changent. */
    async poserLesVariantesDeLExemple(): Promise<void> {
        const codification = this.choisie();
        if (!codification) return;
        try {
            codification.synonymes = await this.api.synonymesDeLExempleDeCodification();
            this.affinerOuvert.set(true);
            await this.coder();
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }

    creer(): void {
        const codification = codificationNeuve();
        this.codifications.set([...this.codifications(), codification]);
        this.choisir(codification.id);
    }
    ajouterNiveau(): void {
        const codification = this.choisie();
        if (!codification || !this.niveauAAjouter || codification.niveaux.includes(this.niveauAAjouter)) return;
        codification.niveaux = [...codification.niveaux, this.niveauAAjouter];
        this.niveauAAjouter = '';
    }
    retirerNiveau(rang: number): void {
        const codification = this.choisie();
        if (codification) codification.niveaux = codification.niveaux.filter((_niveau, position) => position !== rang);
    }
    ajouterUneComparaison(): void {
        const codification = this.choisie();
        if (!codification) return;
        const comparaison: ComparaisonCodification = {
            id: genererIdentifiant('cp_'),
            colonneSource: codification.colonneLibelle,
            colonneNomenclature: codification.colonneLibelleRef,
            poids: 1,
            methode: ''
        };
        codification.comparaisons = [...(codification.comparaisons || []), comparaison];
    }
    retirerLaComparaison(rang: number): void {
        const codification = this.choisie();
        if (codification) codification.comparaisons = codification.comparaisons.filter((_comparaison, position) => position !== rang);
    }
    ajouterUnSynonyme(): void {
        const codification = this.choisie();
        if (!codification) return;
        const synonyme: SynonymeCodification = { id: genererIdentifiant('sy_'), motRetenu: '', variantes: [], proche: false };
        codification.synonymes = [...(codification.synonymes || []), synonyme];
    }
    retirerLeSynonyme(rang: number): void {
        const codification = this.choisie();
        if (codification) codification.synonymes = codification.synonymes.filter((_synonyme, position) => position !== rang);
    }
    ajouterUneRegle(): void {
        const codification = this.choisie();
        if (!codification) return;
        const regle: RegleCodification = {
            id: genererIdentifiant('rg_'),
            actif: true,
            code: '',
            colonne: '',
            type: 'motscles',
            contient: [],
            ou: false,
            sauf: [],
            motif: ''
        };
        codification.regles = [...codification.regles, regle];
    }
    monterLaRegle(rang: number): void {
        const codification = this.choisie();
        if (!codification || rang <= 0) return;
        const regles = [...codification.regles];
        [regles[rang - 1], regles[rang]] = [regles[rang], regles[rang - 1]];
        codification.regles = regles;
    }
    retirerLaRegle(rang: number): void {
        const codification = this.choisie();
        if (codification) codification.regles = codification.regles.filter((_regle, position) => position !== rang);
    }

    async enregistrer(): Promise<void> {
        const codification = this.choisie();
        if (!codification) return;
        try {
            await this.api.enregistrerCodification(codification);
            this.notifications.succes(`Codification « ${codification.nom} » enregistrée.`);
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }
    async supprimer(): Promise<void> {
        const codification = this.choisie();
        if (!codification || !confirm(`Supprimer la codification « ${codification.nom} » ?`)) return;
        try {
            await this.api.supprimerCodification(codification.id);
            this.codifications.set(this.codifications().filter(candidate => candidate.id !== codification.id));
            this.choisir(this.codifications()[0]?.id || '');
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }

    /** Enregistre puis code : la codification exécutée est toujours celle que l'on voit à l'écran. */
    async coder(): Promise<void> {
        const codification = this.choisie();
        if (!codification) return;
        this.enCours.set(true);
        try {
            if (this.session.peutEditer()) await this.api.enregistrerCodification(codification);
            this.resultat.set(await this.api.executerCodification(codification.id));
            this.casARevoir.set(await this.api.revueCodification(codification.id));
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        } finally {
            this.enCours.set(false);
        }
    }

    /** Tranche un cas : la ligne reçoit son code, le libellé entre dans la table de correspondance, on recode. */
    async trancher(cas: CasARevoir, code: string): Promise<void> {
        const codification = this.choisie();
        if (!codification) return;
        try {
            const apres = await this.api.deciderCodification(codification.id, { rang: cas.rang, code, libelle: cas.libelle });
            this.codifications.set(this.codifications().map(candidate => (candidate.id === apres.id ? apres : candidate)));
            this.notifications.succes(code ? `« ${cas.libelle} » → ${code}, retenu pour les prochaines fois.` : 'Cas laissé sans code.');
            await this.coder();
        } catch (erreur) {
            this.notifications.erreur(String(erreur));
        }
    }

    /** L'en-tête d'une colonne technique, dit en clair. */
    enTete(colonne: string): string {
        const noms: Record<string, string> = {
            __code: 'Code trouvé',
            __origine: 'Par quoi',
            __score: 'Confiance',
            __statut: 'Statut',
            __chemin: "Chemin dans l'arbre"
        };
        return noms[colonne] || colonne;
    }
    /** La valeur d'une cellule, traduite quand elle est technique. */
    celluleLisible(colonne: string, valeur: unknown): string {
        if (valeur === null || valeur === undefined) return '';
        if (colonne === '__statut') return allureDuStatut(String(valeur)).libelle;
        if (colonne === '__origine') return phraseDeLOrigine(String(valeur), this.choisie()?.regles || []);
        if (colonne === '__score') return scoreLisible(Number(valeur));
        return String(valeur);
    }
    /** La couleur d'une cellule de statut : l'œil trie avant de lire. */
    classeDeLaCellule(colonne: string, valeur: unknown): string {
        return colonne === '__statut' ? 'statut-' + String(valeur) : '';
    }
}
