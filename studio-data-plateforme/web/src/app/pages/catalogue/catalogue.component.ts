/**
 * Catalogue de données — repris point pour point de la V13.
 *
 * C'est l'écran où l'on arrive quand on ne sait pas encore ce que l'on cherche : un bandeau qui dit ce que
 * l'espace contient et à quel point il est décrit, une grande barre de recherche avec quelques pistes
 * toutes prêtes, puis des facettes à gauche et des cartes à droite. Rien ne s'y écrit : c'est un écran de
 * consultation de bout en bout, et chaque carte mène à l'écran où l'élément se modifie.
 *
 * Deux couches de lecture : « 🏛 Métier » par défaut (objets, applications, processus, termes, règles) et
 * « ▦ Tout », qui ajoute les tables, colonnes et vues issues des sources. Quand la vue métier masque des
 * données techniques, elle le dit et propose de les montrer — plutôt que de laisser croire qu'il n'y a rien.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { libelleDuParcours, lienDuParcours } from '../../coeur/lien-parcours';
import { EntreeCatalogue, FiltresCatalogue, ResultatCatalogue, TriCatalogue, TypeCatalogue } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import {
    allureDe,
    cartesLimitees,
    classeDeQualite,
    couleurDeResponsable,
    fraicheurLisible,
    initialesDe,
    libelleDeConfidentialite,
    libelleDeValidation,
    surtitreDe
} from './cartes-catalogue';

/** Les quatre familles de facettes, dans l'ordre du classique. */
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
/** Les quatre ordres de tri proposés, comme dans le classique. */
const TRIS: { cle: TriCatalogue; libelle: string }[] = [
    { cle: 'pertinence', libelle: 'Pertinence' },
    { cle: 'qualite', libelle: 'Qualité' },
    { cle: 'fraicheur', libelle: 'Fraîcheur' },
    { cle: 'alpha', libelle: 'A → Z' }
];

@Component({
    selector: 'app-catalogue',
    imports: [FormsModule],
    template: `
        <div class="ecran-v13">
            <!-- Le bandeau : ce qu'est le catalogue, la recherche, quelques pistes, et quatre chiffres. -->
            <div class="cat-hero">
                <h2 class="text-lg font-black flex items-center gap-2 m-0">🔎 Catalogue de données</h2>
                <p class="text-[12px] text-slate-300 mt-0.5 mb-3">
                    Trouvez la donnée dont vous avez besoin, vérifiez si vous pouvez lui faire confiance, comprenez comment l'utiliser.
                </p>
                <div class="cat-bigsearch">
                    <span class="text-lg text-slate-400" aria-hidden="true">🔍</span>
                    <input
                        name="recherche"
                        [(ngModel)]="filtres.q"
                        (ngModelChange)="planifierRecherche()"
                        placeholder="Rechercher une table, une donnée, un domaine, un propriétaire…"
                        aria-label="Rechercher dans le catalogue"
                    />
                    <span class="text-[11px] text-slate-400 border-l border-slate-200 pl-3 whitespace-nowrap hidden sm:inline">
                        {{ filtres.couche === 'tout' ? 'dans tout le catalogue' : 'vue métier' }}
                    </span>
                </div>
                @if (resultat(); as resultat) {
                    <div class="flex items-center gap-2 mt-2.5 flex-wrap" name="exemplesDeRecherche">
                        <span class="text-[11px] text-slate-400">Essayez :</span>
                        @for (exemple of resultat.exemples; track exemple) {
                            <button type="button" class="cat-ex" (click)="chercher(exemple)">{{ exemple }}</button>
                        }
                    </div>
                    <div class="flex gap-7 mt-3.5 flex-wrap" name="chiffresDuCatalogue">
                        <span class="cat-hs"
                            ><b>{{ resultat.statistiques.actifs }}</b
                            >actifs catalogués</span
                        >
                        <span class="cat-hs"
                            ><b>{{ resultat.statistiques.domaines }}</b
                            >domaines métier</span
                        >
                        <span class="cat-hs"
                            ><b>{{ resultat.statistiques.sourcesDocumentees }} %</b>sources documentées</span
                        >
                        <span class="cat-hs"
                            ><b>{{ resultat.statistiques.validesParUnResponsable }} %</b>validés par un responsable</span
                        >
                    </div>
                }
            </div>

            <div class="flex gap-4 items-start">
                <!-- Les facettes : chacune dit combien de résultats elle ajouterait. -->
                <div class="w-[220px] shrink-0 bg-white border border-slate-200 rounded-xl p-3 sticky top-4 max-h-[70vh] overflow-auto">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[11px] font-black uppercase tracking-wide text-slate-400">Affiner</span>
                        @if (aDesFiltres() || filtres.q) {
                            <button
                                type="button"
                                name="effacerFiltres"
                                class="text-[11px] font-bold text-blue-600"
                                (click)="effacerFiltres()"
                            >
                                Tout effacer
                            </button>
                        }
                    </div>
                    @for (nom of nomsFacettes; track nom) {
                        @let valeurs = resultat()?.facettes?.[nom] || [];
                        @if (valeurs.length) {
                            <div class="border-b border-slate-100 pb-3 mb-3">
                                <div class="text-[10px] uppercase font-black tracking-wide text-slate-400 mb-1.5">
                                    {{ libelleFacette(nom) }}
                                </div>
                                @for (facette of valeurs; track facette.valeur) {
                                    @let coche = estCoche(nom, facette.valeur);
                                    <button
                                        type="button"
                                        class="cat-fitem"
                                        [class.on]="coche"
                                        role="checkbox"
                                        [attr.aria-checked]="coche"
                                        (click)="basculerFacette(nom, facette.valeur)"
                                    >
                                        <span
                                            class="w-3.5 h-3.5 rounded border text-[9px] flex items-center justify-center"
                                            [class]="
                                                coche
                                                    ? 'w-3.5 h-3.5 rounded border text-[9px] flex items-center justify-center bg-emerald-600 border-emerald-600 text-white'
                                                    : 'w-3.5 h-3.5 rounded border text-[9px] flex items-center justify-center border-slate-300 bg-white'
                                            "
                                            >{{ coche ? '✓' : '' }}</span
                                        >
                                        <span class="truncate">{{ libelleValeur(nom, facette.valeur) }}</span>
                                        <span class="cnt">{{ facette.nombre }}</span>
                                    </button>
                                }
                            </div>
                        }
                    } @empty {
                        <p class="text-[11px] text-slate-300 italic">Chargez des sources pour peupler le catalogue.</p>
                    }
                </div>

                <div class="flex-1 min-w-0">
                    @if (resultat(); as resultat) {
                        @let limite = cartes(resultat.resultats);
                        <div class="flex items-center gap-2 mb-2.5 flex-wrap">
                            <span class="text-[13px] font-bold" name="nombreDeResultats">
                                <b class="text-emerald-600">{{ resultat.resultats.length }}</b> résultat(s)
                            </span>
                            @if (filtres.couche !== 'tout' && resultat.techniquesMasquees) {
                                <button
                                    type="button"
                                    name="montrerLesTechniques"
                                    class="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-100"
                                    title="Afficher aussi les tables, colonnes et vues issues des sources"
                                    (click)="choisirLaCouche('tout')"
                                >
                                    + {{ resultat.techniquesMasquees }} donnée(s) technique(s) masquée(s)
                                </button>
                            }
                            <!-- Les filtres posés, rappelés un par un : on les retire d'un clic. -->
                            @for (filtreActif of filtresActifs(); track filtreArrete(filtreActif)) {
                                <button
                                    type="button"
                                    class="achip-ux"
                                    [attr.aria-label]="'Retirer le filtre ' + libelleValeur(filtreActif.nom, filtreActif.valeur)"
                                    (click)="basculerFacette(filtreActif.nom, filtreActif.valeur)"
                                >
                                    {{ libelleValeur(filtreActif.nom, filtreActif.valeur) }} ✕
                                </button>
                            }
                            <span class="flex-grow"></span>
                            <div class="seg-ux" role="group" aria-label="Couche du catalogue">
                                <button
                                    type="button"
                                    name="coucheMetier"
                                    [class.on]="filtres.couche !== 'tout'"
                                    (click)="choisirLaCouche('metier')"
                                >
                                    🏛 Métier
                                </button>
                                <button
                                    type="button"
                                    name="coucheTout"
                                    [class.on]="filtres.couche === 'tout'"
                                    (click)="choisirLaCouche('tout')"
                                >
                                    ▦ Tout
                                </button>
                            </div>
                            <label class="text-[11px] text-slate-400" for="triDuCatalogue">Trier</label>
                            <select
                                id="triDuCatalogue"
                                name="triDuCatalogue"
                                class="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white"
                                [(ngModel)]="filtres.tri"
                                (ngModelChange)="rechercher()"
                                aria-label="Tri des résultats"
                            >
                                @for (tri of tris; track tri.cle) {
                                    <option [value]="tri.cle">{{ tri.libelle }}</option>
                                }
                            </select>
                            <div class="seg-ux" role="group" aria-label="Affichage">
                                <button
                                    type="button"
                                    name="vueListe"
                                    [class.on]="grille() === false"
                                    (click)="grille.set(false)"
                                    aria-label="Vue liste"
                                >
                                    ▤
                                </button>
                                <button
                                    type="button"
                                    name="vueGrille"
                                    [class.on]="grille()"
                                    (click)="grille.set(true)"
                                    aria-label="Vue grille"
                                >
                                    ▦
                                </button>
                            </div>
                        </div>

                        @if (limite.visibles.length) {
                            <div
                                class="grid gap-3"
                                [class]="grille() ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3 grid-cols-1'"
                                name="cartesDuCatalogue"
                            >
                                @for (entree of limite.visibles; track entree.type + entree.id) {
                                    <div
                                        class="cat-card"
                                        tabindex="0"
                                        role="button"
                                        [attr.aria-label]="'Fiche de ' + entree.titre"
                                        (click)="ouverte.set(entree)"
                                        (keydown.enter)="ouverte.set(entree)"
                                    >
                                        <div class="flex items-start gap-3">
                                            <span class="cat-tico" [style.background]="allure(entree.type).couleur" aria-hidden="true">
                                                {{ allure(entree.type).pictogramme }}
                                            </span>
                                            <div class="min-w-0 flex-1">
                                                <div class="text-[10px] font-black uppercase tracking-wide text-slate-400">
                                                    {{ surtitre(entree) }}
                                                </div>
                                                <div class="font-bold text-[14px] text-slate-800 truncate">{{ entree.titre }}</div>
                                                @if (entree.sousTitre) {
                                                    <div class="text-[11px] text-slate-400">{{ entree.sousTitre }}</div>
                                                }
                                            </div>
                                        </div>
                                        @if (entree.description) {
                                            <div class="text-[12px] text-slate-500 mt-2 leading-snug deux-lignes">
                                                {{ entree.description }}
                                            </div>
                                        } @else {
                                            <div class="text-[11px] text-slate-300 italic mt-2">
                                                Pas encore documenté — complétez le dictionnaire ou importez en masse.
                                            </div>
                                        }
                                        <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
                                            @if (entree.qualite !== null) {
                                                <span class="qual" [class]="'qual ' + classeQualite(entree.qualite)"
                                                    >◆ {{ entree.qualite }}/100</span
                                                >
                                            }
                                            @if (libelleConfidentialite(entree.sensibilite); as confidentialite) {
                                                <span class="cat-sens" [class]="'cat-sens sens-' + entree.sensibilite">{{
                                                    confidentialite
                                                }}</span>
                                            }
                                            @if (libelleValidation(entree.validation); as validation) {
                                                <span class="cat-val" [class]="'cat-val val-' + entree.validation">{{ validation }}</span>
                                            }
                                            @if (entree.proprietaire) {
                                                <span class="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                                                    <span class="cat-oav" [style.background]="couleurResponsable(entree.proprietaire)">
                                                        {{ initiales(entree.proprietaire) }}
                                                    </span>
                                                    {{ entree.proprietaire }}
                                                </span>
                                            }
                                            @if (fraicheur(entree.fraicheur); as quand) {
                                                <span class="text-[10.5px] text-slate-400">{{ quand }}</span>
                                            }
                                            @for (etiquette of entree.etiquettes.slice(0, 3); track etiquette) {
                                                <span class="cat-tag">#{{ etiquette }}</span>
                                            }
                                        </div>
                                    </div>
                                }
                            </div>
                            @if (limite.restantes) {
                                <p class="text-[11px] text-slate-400 italic mt-2">
                                    … {{ limite.restantes }} autre(s) — précisez la recherche.
                                </p>
                            }
                        } @else if (filtres.couche !== 'tout' && resultat.techniquesMasquees) {
                            <!-- Rien côté métier, mais des données techniques correspondent : on le dit plutôt que « aucun résultat ». -->
                            <div class="empty-v13" name="videMaisTechniques">
                                <div class="text-[34px]">🏛</div>
                                <div class="text-[14.5px] font-black text-slate-800 mt-2 mb-1">
                                    Rien côté métier — mais {{ resultat.techniquesMasquees }} donnée(s) technique(s) correspondent
                                </div>
                                <p class="text-[12px] text-slate-500 max-w-[520px] mx-auto">
                                    La vue métier ne montre que les objets, applications, processus, termes et règles. Les tables et
                                    colonnes issues des sources sont masquées par défaut.
                                </p>
                                <button type="button" class="bouton principal mt-3" (click)="choisirLaCouche('tout')">
                                    Afficher les données techniques
                                </button>
                            </div>
                        } @else {
                            <div class="empty-v13" name="aucunResultat">
                                <div class="text-[34px]">🔍</div>
                                <div class="text-[14.5px] font-black text-slate-800 mt-2 mb-1">Aucun actif ne correspond</div>
                                <p class="text-[12px] text-slate-500 max-w-[520px] mx-auto">
                                    Essayez d'élargir vos filtres ou une autre recherche — ou chargez des sources et documentez-les pour
                                    peupler le catalogue.
                                </p>
                                @if (aDesFiltres() || filtres.q) {
                                    <button type="button" class="bouton mt-3" (click)="effacerFiltres()">Tout effacer</button>
                                }
                            </div>
                        }
                    }
                </div>

                <!-- La fiche du résultat choisi : ce qu'on en sait, et où aller pour en faire quelque chose. -->
                @if (ouverte(); as entree) {
                    <aside class="carte fiche">
                        <div class="entete-page" style="margin: 0 0 8px">
                            <h2 class="espace">{{ entree.titre }}</h2>
                            <button class="bouton petit" (click)="ouverte.set(null)">Fermer</button>
                        </div>
                        <div class="discret">{{ allure(entree.type).libelle }} · {{ entree.sousTitre }}</div>
                        <p>{{ entree.description || 'Sans description.' }}</p>
                        <dl>
                            <dt>Domaine</dt>
                            <dd>{{ entree.domaine }}</dd>
                            <dt>Propriétaire</dt>
                            <dd>{{ entree.proprietaire || '—' }}</dd>
                            <dt>Qualité</dt>
                            <dd>{{ entree.qualite === null ? 'non mesurée' : entree.qualite + ' %' }}</dd>
                            <dt title="Terme technique : sensibilité">Confidentialité</dt>
                            <dd>{{ libelleValeur('sensibilite', entree.sensibilite || '') }}</dd>
                            <dt>Dernier rafraîchissement</dt>
                            <dd>{{ fraicheur(entree.fraicheur) || '—' }}</dd>
                            <dt>Étiquettes</dt>
                            <dd>{{ entree.etiquettes.join(', ') || '—' }}</dd>
                            @if (entree.motsCles.length) {
                                <dt>Liens</dt>
                                <dd>{{ entree.motsCles.join(', ') }}</dd>
                            }
                        </dl>
                        <div class="ligne-champs">
                            <button class="bouton principal" (click)="ouvrirEcran(entree)">Ouvrir dans l'écran dédié</button>
                            <!-- V13 : on va au parcours depuis ce que l'on regarde, pas seulement par le menu. -->
                            @if (lienParcours(entree); as lien) {
                                <button class="bouton" name="parcoursDepuisCatalogue" (click)="ouvrirParcours(lien)">
                                    {{ libelleParcours(entree.type) }}
                                </button>
                            }
                        </div>
                    </aside>
                }
            </div>
        </div>
    `,
    styles: `
        /* Le bandeau sombre du catalogue, repris tel quel du classique. */
        .cat-hero {
            background: linear-gradient(135deg, #0f172a, #1e3a5f);
            color: #fff;
            border-radius: 12px;
            padding: 18px 20px;
            margin-bottom: 16px;
        }
        .cat-bigsearch {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #fff;
            border-radius: 11px;
            padding: 11px 15px;
            box-shadow: 0 10px 30px rgb(15 23 42 / 0.25);
            max-width: 720px;
        }
        .cat-bigsearch input {
            flex: 1;
            border: none;
            outline: none;
            font-size: 14px;
            color: #0f172a;
            background: none;
        }
        .cat-ex {
            background: rgb(255 255 255 / 0.1);
            border: 1px solid rgb(255 255 255 / 0.2);
            color: #e2e8f0;
            border-radius: 20px;
            padding: 3px 11px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
        }
        .cat-ex:hover {
            background: rgb(255 255 255 / 0.22);
        }
        .cat-hs {
            display: flex;
            flex-direction: column;
            font-size: 10.5px;
            color: #93a4bd;
        }
        .cat-hs b {
            font-size: 17px;
            color: #fff;
            font-weight: 800;
        }
        /* Une facette cochable, avec son compteur aligné à droite. */
        .cat-fitem {
            display: flex;
            align-items: center;
            gap: 7px;
            width: 100%;
            text-align: left;
            padding: 4px 6px;
            border-radius: 7px;
            font-size: 12px;
            color: #0f172a;
            cursor: pointer;
        }
        .cat-fitem:hover {
            background: #f8fafc;
        }
        .cat-fitem.on {
            background: #f0fdf4;
        }
        .cat-fitem .cnt {
            margin-left: auto;
            font-size: 10.5px;
            color: #94a3b8;
            background: #f1f5f9;
            border-radius: 10px;
            padding: 1px 7px;
        }
        .cat-fitem.on .cnt {
            background: #dcfce7;
            color: #166534;
        }
        /* Un filtre posé, que l'on retire d'un clic. */
        .achip-ux {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            color: #166534;
            border-radius: 20px;
            padding: 3px 10px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
        }
        /* Les bascules à deux ou trois positions (couche, affichage). */
        .seg-ux {
            display: inline-flex;
            background: #fff;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            overflow: hidden;
        }
        .seg-ux button {
            padding: 5px 10px;
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
            background: none;
            border: none;
            cursor: pointer;
        }
        .seg-ux button.on {
            background: #0f172a;
            color: #fff;
        }
        /* La carte d'un résultat. */
        .cat-card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 13px 15px;
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            cursor: pointer;
            transition: 0.1s;
        }
        .cat-card:hover {
            border-color: #a7f3d0;
            box-shadow: 0 4px 16px rgb(5 150 105 / 0.12);
            transform: translateY(-1px);
        }
        .cat-tico {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
            color: #fff;
        }
        /* Une description tenue sur deux lignes : les cartes gardent la même hauteur. */
        .deux-lignes {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .qual {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 20px;
            white-space: nowrap;
        }
        .qualite-bonne {
            background: #dcfce7;
            color: #166534;
        }
        .qualite-moyenne {
            background: #fef3c7;
            color: #92400e;
        }
        .qualite-mauvaise {
            background: #fee2e2;
            color: #991b1b;
        }
        .cat-sens {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10.5px;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 20px;
        }
        .sens-perso {
            background: #fdf2f8;
            color: #be185d;
            border: 1px solid #fbcfe8;
        }
        .sens-conf {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        .sens-non {
            background: #f1f5f9;
            color: #64748b;
            border: 1px solid #e2e8f0;
        }
        .cat-val {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10.5px;
            font-weight: 700;
        }
        .val-ok {
            color: #059669;
        }
        .val-pending {
            color: #d97706;
        }
        .cat-oav {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            color: #fff;
            font-size: 9px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            vertical-align: middle;
        }
        .cat-tag {
            font-size: 10px;
            color: #2563eb;
            background: #eff6ff;
            border: 1px solid #dbeafe;
            border-radius: 6px;
            padding: 2px 7px;
        }
        /* L'écran vide : un pictogramme, ce qui se passe, et quoi faire. */
        .empty-v13 {
            text-align: center;
            background: #fff;
            border: 1px dashed #cbd5e1;
            border-radius: 12px;
            padding: 34px 20px;
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
    `
})
export class CatalogueComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly routeur = inject(Router);
    readonly resultat = signal<ResultatCatalogue | null>(null);
    readonly ouverte = signal<EntreeCatalogue | null>(null);
    /** Vrai en vue grille (deux colonnes), faux en vue liste — comme la bascule ▤ / ▦ du classique. */
    readonly grille = signal(false);
    readonly nomsFacettes = Object.keys(NOMS_FACETTES) as (keyof typeof NOMS_FACETTES)[];
    readonly tris = TRIS;
    filtres: FiltresCatalogue = {
        q: '',
        type: [],
        domaine: [],
        sensibilite: [],
        proprietaire: [],
        couche: 'metier',
        tri: 'pertinence'
    };
    private minuterie: ReturnType<typeof setTimeout> | null = null;
    /** Les filtres posés, à plat, pour les rappeler un par un au-dessus des résultats. */
    private readonly filtresPoses = signal<{ nom: keyof typeof NOMS_FACETTES; valeur: string }[]>([]);
    readonly filtresActifs = computed(() => this.filtresPoses());

    /** Rappels des fonctions pures utilisées par le gabarit. */
    readonly allure = allureDe;
    readonly surtitre = surtitreDe;
    readonly initiales = initialesDe;
    readonly couleurResponsable = couleurDeResponsable;
    readonly classeQualite = classeDeQualite;
    readonly libelleConfidentialite = libelleDeConfidentialite;
    readonly libelleValidation = libelleDeValidation;
    readonly cartes = cartesLimitees;

    constructor() {
        void this.rechercher();
    }

    async rechercher(): Promise<void> {
        try {
            this.resultat.set(await this.api.catalogue(this.filtres));
            this.filtresPoses.set(this.nomsFacettes.flatMap(nom => (this.filtres[nom] || []).map(valeur => ({ nom, valeur }))));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** La recherche part 250 ms après la dernière frappe. */
    planifierRecherche(): void {
        if (this.minuterie) clearTimeout(this.minuterie);
        this.minuterie = setTimeout(() => void this.rechercher(), 250);
    }

    /** Une piste toute prête du bandeau : elle remplace la recherche en cours. */
    chercher(texte: string): void {
        this.filtres.q = texte;
        void this.rechercher();
    }

    /** L'identité d'un filtre posé, pour que la liste ne se redessine pas entièrement à chaque frappe. */
    filtreArrete(filtre: { nom: string; valeur: string }): string {
        return filtre.nom + '=' + filtre.valeur;
    }

    /** La date du dernier rafraîchissement, écrite à la française. */
    fraicheur(quand: number | null): string {
        return fraicheurLisible(quand, millisecondes => new Date(millisecondes).toLocaleDateString('fr-FR'));
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

    /** La couche de lecture : « métier » seul, ou « tout » avec les tables, colonnes et vues. */
    choisirLaCouche(couche: 'metier' | 'tout'): void {
        if (this.filtres.couche === couche) return;
        this.filtres.couche = couche;
        void this.rechercher();
    }

    aDesFiltres(): boolean {
        return this.nomsFacettes.some(nom => (this.filtres[nom] || []).length > 0);
    }

    /** Efface la recherche et tous les filtres : on repart de la vue complète. */
    effacerFiltres(): void {
        for (const nom of this.nomsFacettes) this.filtres[nom] = [];
        this.filtres.q = '';
        void this.rechercher();
    }

    ouvrirEcran(entree: EntreeCatalogue): void {
        void this.routeur.navigateByUrl(entree.lien);
    }

    /** Le parcours de la donnée, ouvert sur ce que la fiche décrit ; vide quand la fiche n'a pas de parcours. */
    lienParcours(entree: EntreeCatalogue): string {
        return lienDuParcours(entree);
    }
    libelleParcours(type: string): string {
        return libelleDuParcours(type);
    }
    ouvrirParcours(lien: string): void {
        void this.routeur.navigateByUrl(lien);
    }
}
