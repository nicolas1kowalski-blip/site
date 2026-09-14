/**
 * Lineage : trois lectures d'un même référentiel.
 *   • Carte des flux — applications, tables et objets métier reliés par des alimentations, lectures, écritures,
 *     compositions… ; dérivée des données (synchronisation) et complétée à la main ; chaque lien porte une clé,
 *     des attributs contrôlés, un SLA, et se réconcilie dans DuckDB (écarts entre source et cible) ;
 *   • Parcours d'un attribut — applications sources → colonnes techniques → attribut d'objet → consommateurs ;
 *   • Autour d'une table — tout ce qui est en amont et en aval d'une table dans la carte.
 * Le dessin est confié au composant graphe SVG (disposition en couches, déplacement, zoom).
 */
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { phraseDeParcours } from '../accueil/question-gouvernance';
import { GroupeReplie, estUnGroupe, grapheReplie, groupesDe } from '../../composants/repli-graphe';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import {
    AnalyseImpact,
    CarteFlux,
    Graphe,
    LienFlux,
    LienFluxEnrichi,
    NoeudFlux,
    NoeudFluxEnrichi,
    Actif,
    ObjetMetier,
    ParcoursObjet,
    PaireAttributs,
    Source,
    VocabulaireLineage,
    formaterDate,
    genererIdentifiant
} from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';
import { GrapheSvgComponent, LienDessine, NoeudDessine } from '../../composants/graphe-svg.component';

type Onglet = 'carte' | 'attribut' | 'table' | 'impact';

const COULEUR_ROLE: Record<string, { fond: string; bord: string }> = {
    app: { fond: '#e2e8f0', bord: '#334155' },
    object: { fond: '#dcfce7', bord: '#16a34a' },
    master: { fond: '#fef3c7', bord: '#d97706' },
    source: { fond: '#fef9c3', bord: '#ca8a04' },
    reference: { fond: '#dbeafe', bord: '#2563eb' },
    consumer: { fond: '#f1f5f9', bord: '#64748b' }
};
const COULEUR_SANTE: Record<string, string> = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626' };
const COULEUR_GENRE: Record<string, { fond: string; bord: string }> = {
    app: COULEUR_ROLE['app'],
    table: { fond: '#dbeafe', bord: '#2563eb' },
    colonne: { fond: '#eff6ff', bord: '#60a5fa' },
    attribut: COULEUR_ROLE['object'],
    objet: COULEUR_ROLE['object'],
    alerte: { fond: '#fef9c3', bord: '#ca8a04' }
};

@Component({
    selector: 'app-lineage',
    imports: [FormsModule, GrapheSvgComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Parcours de la donnée</h1>
                <p class="discret">D'où vient la donnée, où va-t-elle, et est-elle cohérente en chemin.</p>
            </div>
        </div>
        <div class="onglets">
            <button [class.actif]="onglet() === 'carte'" (click)="onglet.set('carte')">Carte des flux</button>
            <button [class.actif]="onglet() === 'attribut'" (click)="onglet.set('attribut')">Parcours d'un attribut</button>
            <button [class.actif]="onglet() === 'table'" (click)="onglet.set('table')">Autour d'une table</button>
            <button [class.actif]="onglet() === 'impact'" (click)="onglet.set('impact')">Analyse d'impact</button>
        </div>

        <!-- ---- analyse d'impact ---- -->
        @if (onglet() === 'impact') {
            <div class="carte">
                <p class="discret">
                    Quels processus sont touchés si cette table (ou cette colonne) change : directement, via le lineage (tables construites
                    en aval), via les relations du modèle de données (tables jointes).
                </p>
                <div class="formulaire-ligne" style="max-width: 640px">
                    <select class="champ" name="tableImpact" [(ngModel)]="tableImpact" (ngModelChange)="colonneImpact = ''">
                        <option value="">— table —</option>
                        @for (source of sources(); track source.id) {
                            <option [value]="source.name">{{ source.name }}</option>
                        }
                    </select>
                    <select class="champ" name="colonneImpact" [(ngModel)]="colonneImpact">
                        <option value="">Toute la table</option>
                        @for (colonne of colonnesDeSource(tableImpact); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <button class="bouton principal" (click)="analyserImpact()" [disabled]="!tableImpact" style="flex: 0 0 auto">
                        Analyser
                    </button>
                </div>
                @if (impact(); as impact) {
                    @if (!impact.direct.length && !impact.viaLineage.length && !impact.viaRelations.length) {
                        <p class="discret" style="margin-top: 10px">
                            Aucun processus déclaré n'utilise cette donnée (écran Applications & processus).
                        </p>
                    }
                    @for (bloc of blocsImpact(impact); track bloc.titre) {
                        @if (bloc.actifs.length) {
                            <h3>{{ bloc.titre }}</h3>
                            <ul class="impact">
                                @for (actif of bloc.actifs; track actif.id) {
                                    <li>
                                        <strong>{{ actif.name }}</strong>
                                        @if (actif.criticality) {
                                            <span class="badge neutre">{{ actif.criticality }}</span>
                                        }
                                        <span class="discret">{{ actif.owner }}</span>
                                    </li>
                                }
                            </ul>
                        }
                    }
                }
            </div>
        }

        <!-- ---- carte des flux ---- -->
        @if (onglet() === 'carte') {
            <div class="carte">
                <div class="entete-page" style="margin: 0">
                    @if (session.peutEditer()) {
                        <button class="bouton principal" (click)="synchroniser()" [disabled]="enCours()">
                            Synchroniser depuis les données
                        </button>
                        <button class="bouton" (click)="nouveauNoeud()">Nouveau nœud</button>
                        <button class="bouton" (click)="nouveauLien()">Nouveau lien</button>
                    }
                    <label class="case">
                        <input
                            type="checkbox"
                            [ngModel]="carte()?.flux?.showObjects"
                            (ngModelChange)="definirOption('showObjects', $event)"
                            name="showObjects"
                            [disabled]="!session.peutEditer()"
                        />
                        objets métier
                    </label>
                    <label class="case"
                        >seuil de distorsion
                        <input
                            class="champ"
                            type="number"
                            style="width: 70px"
                            [ngModel]="carte()?.flux?.threshold"
                            (change)="definirOption('threshold', +$any($event.target).value)"
                            name="seuil"
                            [disabled]="!session.peutEditer()"
                        />
                        %</label
                    >
                    <button class="bouton petit" (click)="graphe()?.ajuster()">Ajuster</button>
                    <span class="discret">{{ carte()?.noeuds?.length || 0 }} nœud(s) · {{ carte()?.liens?.length || 0 }} lien(s)</span>
                </div>
                <div class="legende">
                    @for (role of roles(); track role.cle) {
                        <span
                            class="pastille"
                            [style.background]="couleurRole(role.cle).fond"
                            [style.border-color]="couleurRole(role.cle).bord"
                            >{{ role.libelle }}</span
                        >
                    }
                    <span class="discret">— liens : vert sain, orange à surveiller, rouge en défaut (fraîcheur ou distorsion)</span>
                </div>
                @if (carte()?.controles?.length) {
                    <ul class="controles">
                        @for (controle of carte()!.controles; track $index) {
                            <li [class.erreur]="controle.severite === 'error'">{{ controle.message }}</li>
                        }
                    </ul>
                }
            </div>
            <div class="disposition">
                <div>
                    @if (noeudsCarte().length) {
                        <app-graphe-svg
                            nomImage="lineage-carte-des-flux"
                            [noeuds]="noeudsCarte()"
                            [liens]="liensCarte()"
                            [hauteur]="560"
                            (noeudChoisi)="choisirNoeud($event.id)"
                            (lienChoisi)="choisirLien($event.id!)"
                        />
                    } @else {
                        <div class="carte discret" style="text-align: center; padding: 40px">
                            Carte vide. Synchronisez depuis les données (tables conçues, applications, objets métier) ou ajoutez un nœud.
                        </div>
                    }
                </div>
                <div>
                    @if (noeudChoisi(); as noeud) {
                        <div class="carte">
                            <div class="entete-page" style="margin: 0 0 8px">
                                <h2 class="espace">{{ noeud.name }}</h2>
                                <span class="badge">{{ libelleRole(noeud.role) }}</span>
                                <button class="bouton petit" (click)="noeudChoisi.set(null)">Fermer</button>
                            </div>
                            <div class="discret">
                                {{ noeud.derived ? 'dérivé des données' : 'ajouté à la main' }}
                                @if (noeud.tableName) {
                                    · table {{ noeud.tableName }}
                                }
                                · fraîcheur {{ texteFraicheur(noeud.fraicheur) }}
                            </div>
                            @if (session.peutEditer()) {
                                <div class="formulaire-ligne" style="margin-top: 8px">
                                    <div>
                                        <label class="etiquette">Nom</label
                                        ><input class="champ" name="noeud-nom" [(ngModel)]="noeud.name" />
                                    </div>
                                    <div>
                                        <label class="etiquette">Origine (système amont)</label
                                        ><input class="champ" name="noeud-origine" [(ngModel)]="noeud.origine" />
                                    </div>
                                    <div>
                                        <label class="etiquette">Domaine</label
                                        ><input class="champ" name="noeud-domaine" [(ngModel)]="noeud.domain" />
                                    </div>
                                </div>
                                <div class="entete-page" style="margin: 8px 0 0">
                                    <button class="bouton principal petit" (click)="enregistrerNoeud(noeud)">Enregistrer</button>
                                    <button class="bouton petit danger" (click)="supprimerNoeud(noeud)">Supprimer</button>
                                </div>
                            }
                        </div>
                    }
                    @if (lienChoisi(); as lien) {
                        <div class="carte">
                            <div class="entete-page" style="margin: 0 0 8px">
                                <h2 class="espace">{{ nomNoeud(lien.source) }} → {{ nomNoeud(lien.target) }}</h2>
                                <span
                                    class="badge"
                                    [class.succes]="lien.sante === 'ok'"
                                    [class.alerte]="lien.sante === 'warn'"
                                    [class.erreur]="lien.sante === 'bad'"
                                    >{{ libelleRelation(lien.type) }}</span
                                >
                                <button class="bouton petit" (click)="lienChoisi.set(null)">Fermer</button>
                            </div>
                            <div class="discret">
                                fraîcheur {{ texteFraicheur(lien.fraicheur) }} · distorsion
                                {{
                                    lien.lastRun
                                        ? lien.lastRun.rate.toFixed(1) +
                                          ' % (' +
                                          lien.lastRun.distAny +
                                          ' ligne(s) en écart sur ' +
                                          lien.lastRun.rows +
                                          ', ' +
                                          lien.lastRun.missing +
                                          ' clé(s) manquante(s), le ' +
                                          formaterDate(dateDe(lien.lastRun.at)) +
                                          ')'
                                        : 'non mesurée'
                                }}
                            </div>
                            @if (lien.type === 'feeds' || lien.type === 'consolidates') {
                                <div class="formulaire-ligne" style="margin-top: 8px">
                                    <div>
                                        <label class="etiquette">Clé source</label>
                                        <select
                                            class="champ"
                                            name="lien-cle-source"
                                            [(ngModel)]="lien.srcKey"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            <option value="">—</option>
                                            @for (colonne of colonnesDuNoeud(lien.source); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">Clé cible</label>
                                        <select
                                            class="champ"
                                            name="lien-cle-cible"
                                            [(ngModel)]="lien.tgtKey"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            <option value="">—</option>
                                            @for (colonne of colonnesDuNoeud(lien.target); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                    </div>
                                    <div>
                                        <label class="etiquette">SLA (heures)</label
                                        ><input
                                            class="champ"
                                            type="number"
                                            name="lien-sla"
                                            [(ngModel)]="lien.slaHours"
                                            [disabled]="!session.peutEditer()"
                                        />
                                    </div>
                                    <div>
                                        <label class="etiquette">Nature</label>
                                        <select
                                            class="champ"
                                            name="lien-nature"
                                            [(ngModel)]="lien.nature"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            @for (nature of natures(); track nature.cle) {
                                                <option [value]="nature.cle">{{ nature.libelle }}</option>
                                            }
                                        </select>
                                    </div>
                                </div>
                                <label class="etiquette" style="margin-top: 8px"
                                    >Attributs contrôlés (colonne source → colonne cible, transformation attendue)</label
                                >
                                @for (paire of lien.attrPairs || []; track paire.id; let index = $index) {
                                    <div class="formulaire-ligne paire">
                                        <select
                                            class="champ"
                                            [(ngModel)]="paire.src"
                                            [name]="'paire-source-' + index"
                                            [attr.name]="'paire-source-' + index"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            <option value="">— source —</option>
                                            @for (colonne of colonnesDuNoeud(lien.source); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                        <select
                                            class="champ"
                                            [(ngModel)]="paire.tgt"
                                            [name]="'paire-cible-' + index"
                                            [attr.name]="'paire-cible-' + index"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            <option value="">— cible —</option>
                                            @for (colonne of colonnesDuNoeud(lien.target); track colonne) {
                                                <option [value]="colonne">{{ colonne }}</option>
                                            }
                                        </select>
                                        <select
                                            class="champ"
                                            [ngModel]="transformationDe(paire)"
                                            (ngModelChange)="definirTransformation(paire, $event)"
                                            [name]="'paire-transformation-' + index"
                                            [disabled]="!session.peutEditer()"
                                        >
                                            <option value="none">aucune</option>
                                            @for (scalaire of scalaires(); track scalaire.cle) {
                                                <option [value]="'scalar:' + scalaire.cle">{{ scalaire.libelle }}</option>
                                            }
                                            @for (agregat of agregats(); track agregat.cle) {
                                                <option [value]="'agg:' + agregat.cle">agrégat : {{ agregat.libelle }}</option>
                                            }
                                        </select>
                                        @if (paire.xform?.op === 'round' || paire.xform?.op === 'factor') {
                                            <input
                                                class="champ"
                                                [(ngModel)]="paire.xform!.param"
                                                [name]="'paire-parametre-' + index"
                                                placeholder="paramètre"
                                                style="flex: 0 1 90px"
                                                [disabled]="!session.peutEditer()"
                                            />
                                        }
                                        @if (session.peutEditer()) {
                                            <button
                                                class="bouton petit danger"
                                                (click)="lien.attrPairs!.splice(index, 1)"
                                                style="flex: 0 0 auto"
                                            >
                                                ✕
                                            </button>
                                        }
                                    </div>
                                }
                                @if (session.peutEditer()) {
                                    <div class="entete-page" style="margin: 8px 0 0">
                                        <button class="bouton petit" (click)="ajouterPaire(lien)">+ attribut contrôlé</button>
                                        <button class="bouton principal petit" (click)="enregistrerLien(lien)">Enregistrer</button>
                                        <button class="bouton petit" (click)="reconcilier(lien)" [disabled]="enCours()">Réconcilier</button>
                                        <button class="bouton petit danger" (click)="supprimerLien(lien)">Supprimer</button>
                                    </div>
                                }
                                @if (lien.lastRun?.pairs?.length) {
                                    <table class="tableau" style="margin-top: 8px">
                                        <thead>
                                            <tr>
                                                <th title="Terme technique : attribut">Information</th>
                                                <th>Écarts</th>
                                                <th>Exemples (clé : source ≠ cible)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (resultat of lien.lastRun!.pairs; track resultat.src) {
                                                <tr>
                                                    <td>{{ resultat.src }} → {{ resultat.tgt }}</td>
                                                    <td>{{ resultat.dist }} ({{ resultat.rate.toFixed(1) }} %)</td>
                                                    <td class="discret">{{ exemplesTexte(resultat.samples) }}</td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                }
                            } @else if (session.peutEditer()) {
                                <div class="entete-page" style="margin: 8px 0 0">
                                    <button class="bouton petit danger" (click)="supprimerLien(lien)">Supprimer</button>
                                </div>
                            }
                        </div>
                    }
                    @if (brouillonNoeud(); as noeud) {
                        <div class="carte">
                            <h2>Nouveau nœud</h2>
                            <div class="formulaire-ligne">
                                <div>
                                    <label class="etiquette">Nom</label
                                    ><input class="champ" name="nouveau-noeud-nom" [(ngModel)]="noeud.name" />
                                </div>
                                <div>
                                    <label class="etiquette">Nature</label>
                                    <select class="champ" name="nouveau-noeud-genre" [(ngModel)]="noeud.kind">
                                        <option value="table">table</option>
                                        <option value="app">application</option>
                                        <option value="object">objet métier</option>
                                    </select>
                                </div>
                                @if (noeud.kind === 'table') {
                                    <div>
                                        <label class="etiquette">Source chargée (facultatif)</label>
                                        <select class="champ" name="nouveau-noeud-table" [(ngModel)]="noeud.tableName">
                                            <option value="">—</option>
                                            @for (source of sources(); track source.id) {
                                                <option [value]="source.name">{{ source.name }}</option>
                                            }
                                        </select>
                                    </div>
                                }
                            </div>
                            <div class="entete-page" style="margin: 8px 0 0">
                                <button class="bouton principal petit" (click)="enregistrerNoeud(noeud)">Créer</button>
                                <button class="bouton petit" (click)="brouillonNoeud.set(null)">Annuler</button>
                            </div>
                        </div>
                    }
                    @if (brouillonLien(); as lien) {
                        <div class="carte">
                            <h2>Nouveau lien</h2>
                            <div class="formulaire-ligne">
                                <div>
                                    <label class="etiquette">De</label>
                                    <select class="champ" name="nouveau-lien-source" [(ngModel)]="lien.source">
                                        @for (noeud of carte()?.noeuds || []; track noeud.id) {
                                            <option [value]="noeud.id">{{ noeud.name }}</option>
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label class="etiquette">Vers</label>
                                    <select class="champ" name="nouveau-lien-cible" [(ngModel)]="lien.target">
                                        @for (noeud of carte()?.noeuds || []; track noeud.id) {
                                            <option [value]="noeud.id">{{ noeud.name }}</option>
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label class="etiquette">Nature</label>
                                    <select class="champ" name="nouveau-lien-relation" [(ngModel)]="lien.rel">
                                        @for (relation of relations(); track relation.cle) {
                                            <option [value]="relation.cle">{{ relation.libelle }}</option>
                                        }
                                    </select>
                                </div>
                            </div>
                            <div class="entete-page" style="margin: 8px 0 0">
                                <button class="bouton principal petit" (click)="enregistrerLien(lien)">Créer</button>
                                <button class="bouton petit" (click)="brouillonLien.set(null)">Annuler</button>
                            </div>
                        </div>
                    }
                </div>
            </div>
        }

        <!-- ---- parcours d'un attribut ---- -->
        @if (onglet() === 'attribut') {
            <div class="carte">
                <div class="formulaire-ligne" style="max-width: 640px">
                    <select class="champ" name="objet" [(ngModel)]="objetId" (ngModelChange)="changerObjet()">
                        <option value="">— objet métier —</option>
                        @for (objet of objets(); track objet.id) {
                            <option [value]="objet.id">{{ objet.name }}</option>
                        }
                    </select>
                    <select class="champ" name="attribut" [(ngModel)]="attributId" (ngModelChange)="chargerParcours()">
                        <option value="">— tout l'objet —</option>
                        @for (attribut of attributsDe(objetId); track attribut.id) {
                            <option [value]="attribut.id">{{ attribut.name }}</option>
                        }
                    </select>
                </div>
                @if (phraseParcours(); as phrase) {
                    <!-- V13 : le parcours en une phrase, avant le graphe — on lit avant de regarder. -->
                    <p class="phrase-parcours">{{ phrase }}</p>
                }
                @if (grapheAffiche(); as graphe) {
                    <!-- V12.8 : ce qui se répète est regroupé, et s'ouvre d'un clic. -->
                    @if (groupes().length) {
                        <div class="ligne-champs">
                            <span class="discret">Trop d'éléments du même type : ils sont regroupés.</span>
                            <button class="bouton petit" type="button" name="toutDevelopper" (click)="toutDevelopper()">
                                Tout développer
                            </button>
                            <button class="bouton petit" type="button" name="reduire" (click)="reduire()">Réduire</button>
                        </div>
                    }
                    <app-graphe-svg
                        style="display: block; margin-top: 10px"
                        [noeuds]="noeudsGraphe(graphe)"
                        [liens]="graphe.liens"
                        [hauteur]="420"
                        (noeudChoisi)="ouvrirGroupe($event)"
                    />
                } @else {
                    <p class="discret">
                        Choisissez un objet métier : tout ce qui l'alimente et tout ce qui s'en sert apparaît, une flèche par élément.
                        Choisissez ensuite une information pour suivre son parcours à elle.
                    </p>
                }
                @if (synthese(); as synthese) {
                    <!-- V12.7 : la synthèse, en clair, au-dessus du graphe qu'on ne lit pas toujours. -->
                    <div class="synthese-parcours">
                        <b>Synthèse</b>
                        <div class="compteurs">
                            @for (compteur of compteurs(synthese.amont); track compteur.libelle) {
                                <span class="badge neutre">amont : {{ compteur.nombre }} {{ compteur.libelle }}</span>
                            }
                            @for (compteur of compteurs(synthese.aval); track compteur.libelle) {
                                <span class="badge">aval : {{ compteur.nombre }} {{ compteur.libelle }}</span>
                            }
                        </div>
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Sens</th>
                                    <th>Type</th>
                                    <th>Nom</th>
                                    <th>Rôle</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (element of synthese.elements; track $index) {
                                    <tr>
                                        <td>{{ element.sens }}</td>
                                        <td>{{ element.type }}</td>
                                        <td>
                                            <b>{{ element.nom }}</b>
                                        </td>
                                        <td class="discret">{{ element.role }}</td>
                                    </tr>
                                } @empty {
                                    <tr>
                                        <td colspan="4" class="discret">Rien n'est encore relié à cet objet.</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                }
            </div>
        }

        <!-- ---- autour d'une table ---- -->
        @if (onglet() === 'table') {
            <div class="carte">
                <select class="champ" style="max-width: 320px" name="table" [(ngModel)]="nomTable" (ngModelChange)="chargerLineageTable()">
                    <option value="">— table —</option>
                    @for (source of sources(); track source.id) {
                        <option [value]="source.name">{{ source.name }}</option>
                    }
                </select>
                @if (grapheTable(); as graphe) {
                    @if (graphe.noeuds.length) {
                        <app-graphe-svg
                            style="display: block; margin-top: 10px"
                            [noeuds]="noeudsGraphe(graphe)"
                            [liens]="graphe.liens"
                            [hauteur]="420"
                        />
                    } @else {
                        <p class="discret" style="margin-top: 10px">
                            Cette table n'est pas encore sur la carte des flux : synchronisez-la ou ajoutez-la comme nœud.
                        </p>
                    }
                }
            </div>
        }
    `,
    styles: `
        .synthese-parcours {
            margin-top: 12px;
            border-top: 1px solid var(--bordure);
            padding-top: 10px;
        }
        .synthese-parcours .compteurs {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 6px 0 8px;
        }
        .phrase-parcours {
            margin: 10px 0 0;
            font-size: 13px;
            padding: 8px 10px;
            border-radius: 8px;
            background: var(--surface-2);
        }
        .onglets {
            display: flex;
            gap: 4px;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--bordure);
        }
        .onglets button {
            border: 0;
            background: none;
            padding: 8px 12px;
            font: inherit;
            font-weight: 600;
            color: var(--texte-2);
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        .onglets button.actif {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }
        .disposition {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 380px;
            gap: 14px;
            margin-top: 14px;
            align-items: start;
        }
        @media (max-width: 1100px) {
            .disposition {
                grid-template-columns: 1fr;
            }
        }
        .legende {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            margin-top: 8px;
            font-size: 12px;
        }
        .pastille {
            padding: 2px 8px;
            border: 1.5px solid;
            border-radius: 6px;
            color: #1e293b;
        }
        .controles {
            margin: 8px 0 0;
            padding-left: 18px;
            color: var(--alerte);
            font-size: 12px;
        }
        .controles .erreur {
            color: var(--erreur);
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
        .paire {
            margin-top: 4px;
        }
        .paire .champ {
            min-width: 100px;
        }
        h3 {
            margin: 12px 0 4px;
            font-size: 14px;
        }
        .impact {
            margin: 0;
            padding-left: 18px;
        }
        .impact li {
            display: flex;
            gap: 8px;
            align-items: center;
        }
    `
})
export class LineageComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly formaterDate = formaterDate;
    readonly graphe = viewChild(GrapheSvgComponent);

    readonly onglet = signal<Onglet>('carte');
    readonly carte = signal<CarteFlux | null>(null);
    readonly sources = signal<Source[]>([]);
    readonly objets = signal<ObjetMetier[]>([]);
    /** Applications, processus et restitutions : ils nomment les extrémités du parcours en une phrase. */
    readonly actifs = signal<Actif[]>([]);
    readonly vocabulaire = signal<VocabulaireLineage | null>(null);
    readonly noeudChoisi = signal<NoeudFluxEnrichi | null>(null);
    readonly lienChoisi = signal<LienFluxEnrichi | null>(null);
    readonly brouillonNoeud = signal<(Partial<NoeudFlux> & { name: string }) | null>(null);
    readonly brouillonLien = signal<(Partial<LienFlux> & { source: string; target: string }) | null>(null);
    readonly grapheAttribut = signal<Graphe | null>(null);
    /** Parcours de l'objet entier : le graphe et sa synthèse (V12.7). */
    readonly parcours = signal<ParcoursObjet | null>(null);
    /** Groupes repliés que l'utilisateur a ouverts (V12.8). */
    readonly groupesOuverts = signal<Set<string>>(new Set());

    /** Le parcours en une phrase (V13) : d'où vient l'information choisie, et ce qui s'en sert. */
    phraseParcours(): string {
        const objet = this.objets().find(candidat => candidat.id === this.objetId);
        if (!objet || !this.grapheAttribut()) return '';
        const information = (objet.elements || []).find(candidat => candidat.id === this.attributId);
        if (!information) return '';
        return phraseDeParcours(`${objet.name} › ${information.name}`, objet, this.actifs(), information);
    }

    readonly grapheTable = signal<Graphe | null>(null);
    readonly impact = signal<AnalyseImpact | null>(null);
    tableImpact = '';
    colonneImpact = '';
    readonly enCours = signal(false);
    objetId = '';
    attributId = '';
    nomTable = '';

    readonly roles = computed(() => Object.entries(this.vocabulaire()?.roles || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly relations = computed(() => Object.entries(this.vocabulaire()?.relations || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly natures = computed(() => Object.entries(this.vocabulaire()?.natures || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly scalaires = computed(() =>
        Object.entries(this.vocabulaire()?.scalaires || {})
            .filter(([cle]) => cle !== 'none')
            .map(([cle, libelle]) => ({ cle, libelle }))
    );
    readonly agregats = computed(() => Object.entries(this.vocabulaire()?.agregats || {}).map(([cle, libelle]) => ({ cle, libelle })));
    readonly noeudsCarte = computed<NoeudDessine[]>(() =>
        (this.carte()?.noeuds || []).map(noeud => ({
            id: noeud.id,
            titre: noeud.name,
            detail: `${this.libelleRole(noeud.role)}${noeud.origine ? ' · ' + noeud.origine : ''}`,
            couleur: this.couleurRole(noeud.role).fond,
            bordure: this.couleurRole(noeud.role).bord,
            selectionne: noeud.id === this.noeudChoisi()?.id
        }))
    );
    readonly liensCarte = computed<LienDessine[]>(() =>
        (this.carte()?.liens || []).map(lien => ({
            id: lien.id,
            source: lien.source,
            target: lien.target,
            libelle: this.libelleRelation(lien.type),
            couleur: COULEUR_SANTE[lien.sante],
            pointille: lien.type !== 'feeds' && lien.type !== 'consolidates',
            epaisseur: lien.id === this.lienChoisi()?.id ? 3 : 1.5
        }))
    );

    constructor() {
        // Lien « Lineage » de l'écran Sources : /lineage?table=nom ouvre directement « Autour d'une table ».
        const parametres = inject(ActivatedRoute).snapshot.queryParamMap;
        // Depuis l'accueil de la gouvernance : /lineage?objet=identifiant ouvre le parcours de cet objet.
        const objetDemande = parametres.get('objet');
        if (objetDemande) {
            this.objetId = objetDemande;
            this.onglet.set('attribut');
        }
        const tableDemandee = parametres.get('table');
        if (tableDemandee) {
            this.nomTable = tableDemandee;
            this.onglet.set('table');
            void this.chargerLineageTable();
        }
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [carte, sources, objets, actifs, vocabulaire] = await Promise.all([
                this.api.carteFlux(),
                this.api.sources(),
                this.api.objetsMetier(),
                this.api.actifs(),
                this.vocabulaire() ?? this.api.vocabulaireLineage()
            ]);
            this.carte.set(carte);
            this.sources.set(sources);
            this.objets.set(objets);
            this.actifs.set(actifs);
            this.vocabulaire.set(vocabulaire);
            if (this.noeudChoisi()) this.choisirNoeud(this.noeudChoisi()!.id);
            if (this.lienChoisi()) this.choisirLien(this.lienChoisi()!.id);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    // ---- carte ----
    async synchroniser(): Promise<void> {
        this.enCours.set(true);
        try {
            const bilan = await this.api.synchroniserFlux();
            const parties = [
                bilan.noeudsAjoutes ? `${bilan.noeudsAjoutes} nœud(s) ajouté(s)` : '',
                bilan.liensAjoutes ? `${bilan.liensAjoutes} lien(s) ajouté(s)` : '',
                bilan.liensRetires ? `${bilan.liensRetires} lien(s) obsolète(s) retiré(s)` : '',
                bilan.noeudsRetires ? `${bilan.noeudsRetires} nœud(s) orphelin(s) retiré(s)` : '',
                bilan.originesRenseignees ? `${bilan.originesRenseignees} origine(s) renseignée(s)` : ''
            ].filter(Boolean);
            this.notifications.succes(
                parties.length ? `Synchronisé depuis les données : ${parties.join(', ')}.` : 'La carte est déjà à jour.'
            );
            await this.recharger();
            setTimeout(() => this.graphe()?.ajuster());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async definirOption(option: 'showObjects' | 'threshold', valeur: boolean | number): Promise<void> {
        try {
            await this.api.definirOptionsFlux({ [option]: valeur });
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    choisirNoeud(id: string): void {
        const noeud = this.carte()?.noeuds.find(candidat => candidat.id === id);
        this.lienChoisi.set(null);
        this.noeudChoisi.set(noeud ? structuredClone(noeud) : null);
    }

    choisirLien(id: string): void {
        const lien = this.carte()?.liens.find(candidat => candidat.id === id);
        this.noeudChoisi.set(null);
        this.lienChoisi.set(lien ? structuredClone({ ...lien, attrPairs: lien.attrPairs || [], nature: lien.nature || 'recopie' }) : null);
    }

    nouveauNoeud(): void {
        this.brouillonNoeud.set({ name: '', kind: 'table', tableName: '' });
    }

    nouveauLien(): void {
        const noeuds = this.carte()?.noeuds || [];
        this.brouillonLien.set({ source: noeuds[0]?.id || '', target: noeuds[1]?.id || '', rel: 'feeds' });
    }

    async enregistrerNoeud(noeud: Partial<NoeudFlux> & { name: string }): Promise<void> {
        if (!noeud.name.trim()) return this.notifications.erreur('Donnez un nom au nœud.');
        try {
            const { id, ...corps } = noeud;
            const identifiant = id || genererIdentifiant('ln');
            await this.api.enregistrerNoeudFlux(identifiant, { ...corps, name: noeud.name, tableName: noeud.tableName || undefined });
            this.brouillonNoeud.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimerNoeud(noeud: NoeudFlux): Promise<void> {
        if (!confirm(`Retirer « ${noeud.name} » de la carte (et ses liens) ?`)) return;
        try {
            await this.api.supprimerNoeudFlux(noeud.id);
            this.noeudChoisi.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async enregistrerLien(lien: Partial<LienFlux> & { source: string; target: string }): Promise<void> {
        try {
            const { id, ...corps } = lien;
            const enregistre = await this.api.enregistrerLienFlux(id || genererIdentifiant('le'), corps);
            this.brouillonLien.set(null);
            await this.recharger();
            this.choisirLien(enregistre.id);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimerLien(lien: LienFlux): Promise<void> {
        try {
            await this.api.supprimerLienFlux(lien.id);
            this.lienChoisi.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async reconcilier(lien: LienFluxEnrichi): Promise<void> {
        this.enCours.set(true);
        try {
            const { id, ...corps } = lien;
            await this.api.enregistrerLienFlux(id, corps);
            const resultat = await this.api.reconcilierLien(id);
            this.notifications.succes(
                `Contrôle : ${resultat.distAny} ligne(s) avec écart sur ${resultat.rows}, ${resultat.missing} clé(s) manquante(s) en aval.`
            );
            await this.recharger();
            this.choisirLien(id);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    ajouterPaire(lien: LienFlux): void {
        (lien.attrPairs = lien.attrPairs || []).push({ id: genererIdentifiant('ap'), src: '', tgt: '', xform: { kind: 'none' } });
    }

    transformationDe(paire: PaireAttributs): string {
        const transformation = paire.xform;
        if (!transformation || transformation.kind === 'none') return 'none';
        return transformation.kind === 'agg' ? 'agg:' + (transformation.fn || 'sum') : 'scalar:' + (transformation.op || 'none');
    }

    definirTransformation(paire: PaireAttributs, valeur: string): void {
        if (valeur === 'none') paire.xform = { kind: 'none' };
        else if (valeur.startsWith('agg:')) paire.xform = { kind: 'agg', fn: valeur.slice(4) };
        else paire.xform = { kind: 'scalar', op: valeur.slice(7), param: paire.xform?.param || '' };
    }

    // ---- analyse d'impact ----
    colonnesDeSource(nomSource: string): string[] {
        return this.sources().find(source => source.name === nomSource)?.headers || [];
    }

    async analyserImpact(): Promise<void> {
        try {
            this.impact.set(await this.api.analyseImpact(this.tableImpact, this.colonneImpact || undefined));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    blocsImpact(impact: AnalyseImpact): { titre: string; actifs: AnalyseImpact['direct'] }[] {
        return [
            { titre: 'Impact direct (utilise cette donnée)', actifs: impact.direct },
            { titre: `Via le lineage (tables alimentées : ${impact.downstream.join(', ') || '—'})`, actifs: impact.viaLineage },
            {
                titre: `Via les relations du modèle de données (tables jointes : ${impact.related.join(', ') || '—'})`,
                actifs: impact.viaRelations
            }
        ];
    }

    // ---- parcours et table ----
    attributsDe(objetId: string): { id: string; name: string }[] {
        return this.objets().find(objet => objet.id === objetId)?.elements || [];
    }

    /** Changer d'objet repart de son parcours à lui : on regarde l'ensemble avant d'entrer dans le détail. */
    changerObjet(): void {
        this.attributId = '';
        this.grapheAttribut.set(null);
        this.groupesOuverts.set(new Set());
        void this.chargerParcours();
    }

    /**
     * Sans information choisie, on montre le parcours de l'objet entier (V12.7) ; avec une information, le
     * sien. Les deux vues sont dessinées par le même graphe.
     */
    async chargerParcours(): Promise<void> {
        if (!this.objetId) return;
        try {
            if (this.attributId) {
                this.parcours.set(null);
                this.grapheAttribut.set(await this.api.parcoursAttribut(this.objetId, this.attributId));
                return;
            }
            const parcours = await this.api.parcoursObjet(this.objetId);
            this.parcours.set(parcours);
            this.grapheAttribut.set(parcours.graphe);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** La synthèse n'existe que pour le parcours d'un objet entier. */
    synthese(): ParcoursObjet['synthese'] | null {
        return this.attributId ? null : this.parcours()?.synthese || null;
    }
    /** Les compteurs d'un côté, sans les zéros : on ne montre pas ce qu'il n'y a pas. */
    compteurs(cote: Record<string, number>): { libelle: string; nombre: number }[] {
        return Object.entries(cote)
            .map(entree => ({ libelle: entree[0], nombre: entree[1] }))
            .filter(compteur => compteur.nombre > 0);
    }

    /** Le graphe tel qu'on le montre : replié tant que l'utilisateur n'a pas ouvert les groupes (V12.8). */
    grapheAffiche(): Graphe | null {
        const graphe = this.grapheAttribut();
        if (!graphe) return null;
        const replie = grapheReplie(graphe, this.centreDuParcours(), this.groupesOuverts());
        return { noeuds: replie.noeuds as Graphe['noeuds'], liens: replie.liens };
    }
    /** Les groupes que ce parcours mérite — calculés à la demande, jamais stockés. */
    groupes(): GroupeReplie[] {
        const graphe = this.grapheAttribut();
        return graphe ? groupesDe(graphe, this.centreDuParcours()) : [];
    }
    /** Le nœud autour duquel le parcours est construit : l'objet, ou l'information choisie. */
    private centreDuParcours(): string {
        return this.attributId ? 'attr:' + this.attributId : 'bo:' + this.objetId;
    }
    /** Un clic sur une case regroupée l'ouvre ; sur une autre case, il ne se passe rien ici. */
    ouvrirGroupe(noeud: { id: string }): void {
        if (!estUnGroupe(noeud.id)) return;
        this.groupesOuverts.update(ouverts => new Set([...ouverts, noeud.id]));
    }
    toutDevelopper(): void {
        this.groupesOuverts.set(new Set(this.groupes().map(groupe => groupe.id)));
    }
    reduire(): void {
        this.groupesOuverts.set(new Set());
    }

    async chargerLineageTable(): Promise<void> {
        if (!this.nomTable) return;
        try {
            this.grapheTable.set(await this.api.lineageTable(this.nomTable));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    noeudsGraphe(graphe: Graphe): NoeudDessine[] {
        return graphe.noeuds.map(noeud => ({
            id: noeud.id,
            titre: noeud.titre,
            detail: noeud.detail,
            couleur: COULEUR_GENRE[noeud.genre].fond,
            bordure: COULEUR_GENRE[noeud.genre].bord
        }));
    }

    // ---- aides d'affichage ----
    couleurRole(role: string): { fond: string; bord: string } {
        return COULEUR_ROLE[role] || COULEUR_ROLE['consumer'];
    }

    libelleRole(role: string): string {
        return this.vocabulaire()?.roles[role] || role;
    }

    libelleRelation(relation: string): string {
        return this.vocabulaire()?.relations[relation] || relation;
    }

    nomNoeud(id: string): string {
        return this.carte()?.noeuds.find(noeud => noeud.id === id)?.name || id;
    }

    colonnesDuNoeud(id: string): string[] {
        const noeud = this.carte()?.noeuds.find(candidat => candidat.id === id);
        return this.sources().find(source => source.name === noeud?.tableName)?.headers || [];
    }

    texteFraicheur(fraicheur: { status: string; ageJours?: number; herite?: boolean }): string {
        if (fraicheur.status === 'none') return 'inconnue';
        const age =
            fraicheur.ageJours == null
                ? ''
                : fraicheur.ageJours < 1
                  ? `${Math.round(fraicheur.ageJours * 24)} h`
                  : `${Math.round(fraicheur.ageJours)} j`;
        const libelle = { ok: 'à jour', warn: 'à surveiller', bad: 'en retard' }[fraicheur.status] || fraicheur.status;
        return `${libelle}${age ? ' (' + age + ')' : ''}${fraicheur.herite ? ' héritée' : ''}`;
    }

    exemplesTexte(exemples: string[][]): string {
        return exemples.map(([cle, source, cible]) => `${cle} : ${source} ≠ ${cible}`).join(' · ');
    }

    dateDe(horodatage: number): string {
        return new Date(horodatage).toISOString();
    }
}
