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
import { CibleDeFiche, FicheDuCatalogue, LigneDeFiche, ReferentielDeFiche, ficheDuCatalogue } from './fiche-catalogue';
import { NotificationsService } from '../../coeur/notifications.service';
import { couleurDeResponsable, initialesDe } from '../../coeur/pastille-personne';
import {
    allureDe,
    cartesLimitees,
    classeDeQualite,
    fraicheurLisible,
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
                <p class="text-[12px] text-slate-500 mt-0.5 mb-3">
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
                                        (click)="ouvrirLaFiche(entree)"
                                        (keydown.enter)="ouvrirLaFiche(entree)"
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
            </div>

            <!--
                La fiche, en panneau latéral — reprise de la V13. Elle répond dans l'ordre aux questions que
                l'on se pose : à quoi ça sert, qui en répond, d'où ça vient, qui s'en sert. Chaque ligne est
                cliquable et ouvre la fiche de ce qu'elle nomme : c'est ce qui fait qu'on circule dans le
                catalogue au lieu d'y retomber toujours au même endroit.
            -->
            @if (ouverte(); as entree) {
                @let fiche = ficheOuverte();
                <div class="tiroir-fiche" name="ficheDuCatalogue">
                    <div class="entete-tiroir">
                        <span class="cat-tico" [style.background]="allure(entree.type).couleur" aria-hidden="true">
                            {{ allure(entree.type).pictogramme }}
                        </span>
                        <div class="min-w-0 flex-1">
                            <div class="font-black text-[15px] text-slate-800 truncate">{{ entree.titre }}</div>
                            <div class="text-[11px] text-slate-500">{{ fiche.sousTitre }}</div>
                        </div>
                        <button type="button" name="fermerLaFiche" class="bouton petit" (click)="fermerLaFiche()">Fermer</button>
                    </div>

                    <div class="corps-tiroir">
                        <!-- D'où l'on vient : le retour, puis les trois dernières fiches visitées. -->
                        @if (fichePrecedente(); as precedente) {
                            <div class="cat-nav" name="navigationDesFiches">
                                <button
                                    type="button"
                                    class="cat-back"
                                    title="Revenir à la fiche précédente"
                                    (click)="revenirALaFichePrecedente()"
                                >
                                    ← {{ precedente.titre }}
                                </button>
                                <span class="fil">
                                    @for (visitee of filDesFiches(); track visitee.type + visitee.id; let dernier = $last) {
                                        @if (dernier) {
                                            <b>{{ visitee.titre }}</b>
                                        } @else {
                                            <button type="button" (click)="ouvrirLaFiche(visitee)">{{ visitee.titre }}</button> ›
                                        }
                                    }
                                </span>
                            </div>
                        }

                        <!-- Les signaux de confiance, d'abord : c'est la première chose que l'on cherche. -->
                        <div class="section-fiche">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                @if (entree.qualite !== null) {
                                    <span class="qual" [class]="'qual ' + classeQualite(entree.qualite)"
                                        >◆ Qualité {{ entree.qualite }}/100</span
                                    >
                                }
                                @if (libelleConfidentialite(entree.sensibilite); as confidentialite) {
                                    <span class="cat-sens" [class]="'cat-sens sens-' + entree.sensibilite">{{ confidentialite }}</span>
                                }
                                @if (libelleValidation(entree.validation); as validation) {
                                    <span class="cat-val" [class]="'cat-val val-' + entree.validation">{{ validation }}</span>
                                }
                            </div>
                        </div>

                        <div class="section-fiche">
                            <h4>À quoi ça sert</h4>
                            <div class="encadre" [class.absent]="fiche.aQuoiCaSertAbsent" name="aQuoiCaSert">{{ fiche.aQuoiCaSert }}</div>
                        </div>

                        <div class="section-fiche">
                            <h4>Fiche d'identité</h4>
                            <div class="cellules" name="ficheDidentite">
                                @for (champ of fiche.identite; track champ.cle) {
                                    <div class="cellule">
                                        <div class="cle">{{ champ.cle }}</div>
                                        <div class="valeur">{{ champ.valeur }}</div>
                                    </div>
                                }
                            </div>
                        </div>

                        <div class="section-fiche">
                            <h4>Traçabilité (lineage)</h4>
                            <div class="flex items-center gap-2 text-center text-[12px]" name="tracabilite">
                                <div class="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2">
                                    <div class="text-base font-black">{{ fiche.tracabilite.amont }}</div>
                                    <div class="text-[10px] text-slate-400">source(s) amont</div>
                                </div>
                                <span class="text-slate-300" aria-hidden="true">→</span>
                                <div class="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg py-2">
                                    <div class="text-[12px] font-black text-emerald-700 truncate px-1">{{ entree.titre }}</div>
                                    <div class="text-[10px] text-slate-400">cet actif</div>
                                </div>
                                <span class="text-slate-300" aria-hidden="true">→</span>
                                <div class="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2">
                                    <div class="text-base font-black">{{ fiche.tracabilite.aval }}</div>
                                    <div class="text-[10px] text-slate-400">usage(s) aval</div>
                                </div>
                            </div>
                        </div>

                        <!-- Puis ce qui dépend de ce que l'on regarde : appartenance, provenance, usages, chaîne… -->
                        @for (section of fiche.sections; track section.titre) {
                            <div class="section-fiche">
                                <h4>{{ section.titre }}</h4>
                                @if (section.genre === 'champs') {
                                    <div class="cellules">
                                        @for (champ of section.champs; track champ.cle) {
                                            <div class="cellule">
                                                <div class="cle">{{ champ.cle }}</div>
                                                <div class="valeur">{{ champ.valeur }}</div>
                                            </div>
                                        }
                                    </div>
                                } @else {
                                    @for (ligne of section.lignes; track ligne.libelle + ligne.precision) {
                                        <button
                                            type="button"
                                            class="ligne-fiche"
                                            [class.inerte]="!ligne.cible"
                                            [disabled]="!ligne.cible"
                                            (click)="suivreLaLigne(ligne)"
                                        >
                                            <span class="min-w-0">
                                                <span class="nom">{{ ligne.pictogramme }} {{ ligne.libelle }}</span>
                                                <span class="precision">{{ ligne.precision }}</span>
                                            </span>
                                            @if (ligne.cible) {
                                                <span class="ml-auto text-slate-300">›</span>
                                            }
                                        </button>
                                    } @empty {
                                        <p class="text-[11.5px] text-slate-400 italic">{{ section.siVide }}</p>
                                    }
                                }
                            </div>
                        }
                    </div>

                    <div class="pied-tiroir">
                        @for (action of fiche.actions; track action.cle) {
                            <button
                                type="button"
                                class="bouton-action"
                                [class]="action.cle === 'utiliser' ? 'bouton-action principale' : 'bouton-action'"
                                [attr.name]="'action-' + action.cle"
                                (click)="lancerLAction(action.cle, entree)"
                            >
                                {{ action.libelle }}
                            </button>
                        }
                    </div>
                </div>
            }
        </div>
    `,

    styles: `
        /*
            Le bandeau du catalogue. Le classique le dessinait sombre à l'origine ; son thème actuel le
            repeint en clair (02-styles-theme-v7.css : « les dégradés de leur époque »). C'est cette
            version-là que l'on reprend — celle que l'on voit réellement à l'écran.
        */
        .cat-hero {
            background: var(--surface);
            color: var(--texte);
            border: 1px solid var(--bordure);
            border-radius: 18px;
            padding: 26px 28px;
            margin-bottom: 16px;
        }
        .cat-bigsearch {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--surface);
            border: 1px solid var(--bordure);
            border-radius: 11px;
            padding: 11px 15px;
            box-shadow: 0 2px 10px rgb(15 23 42 / 0.06);
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
            background: var(--surface-2);
            border: 1px solid var(--bordure);
            color: var(--texte-2);
            border-radius: 20px;
            padding: 3px 11px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
        }
        .cat-ex:hover {
            background: var(--accent-2);
        }
        .cat-hs {
            display: flex;
            flex-direction: column;
            font-size: 10.5px;
            color: var(--texte-2);
        }
        .cat-hs b {
            font-size: 17px;
            color: var(--texte);
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
        /* Le panneau latéral de la fiche : fixe à droite, il défile seul et garde ses actions sous la main. */
        .tiroir-fiche {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 430px;
            max-width: 92vw;
            background: var(--surface);
            border-left: 1px solid var(--bordure);
            box-shadow: -8px 0 28px rgb(15 23 42 / 0.12);
            display: flex;
            flex-direction: column;
            z-index: 40;
        }
        .entete-tiroir {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            border-bottom: 1px solid var(--bordure);
        }
        .corps-tiroir {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 12px 16px;
        }
        .pied-tiroir {
            display: flex;
            gap: 8px;
            padding: 10px 16px;
            border-top: 1px solid var(--bordure);
            background: var(--surface-2);
        }
        .bouton-action {
            flex: 1;
            border: 1px solid var(--bordure);
            background: var(--surface);
            border-radius: 8px;
            padding: 8px 6px;
            font-size: 11.5px;
            font-weight: 700;
            color: var(--texte-2);
            cursor: pointer;
        }
        .bouton-action.principale {
            background: #059669;
            border-color: #059669;
            color: #fff;
        }
        /* D'où l'on vient : le retour, et les trois dernières fiches visitées. */
        .cat-nav {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 10px;
        }
        .cat-back {
            font-size: 11.5px;
            font-weight: 700;
            color: #4338ca;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
        }
        .cat-nav .fil {
            font-size: 10.5px;
            color: var(--texte-2);
        }
        .cat-nav .fil button {
            background: none;
            border: none;
            padding: 0;
            font: inherit;
            color: #4338ca;
            cursor: pointer;
        }
        .section-fiche {
            margin-bottom: 14px;
        }
        .section-fiche h4 {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-weight: 800;
            color: var(--texte-2);
            margin: 0 0 6px;
        }
        .encadre {
            font-size: 12.5px;
            background: var(--surface-2);
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 10px 12px;
        }
        .encadre.absent {
            color: var(--texte-2);
            font-style: italic;
        }
        .cellules {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }
        .cellule {
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 6px 8px;
        }
        .cellule .cle {
            font-size: 9.5px;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--texte-2);
        }
        .cellule .valeur {
            font-size: 12.5px;
        }
        /* Une ligne qui mène à une autre fiche : c'est ce qui rend le catalogue parcourable. */
        .ligne-fiche {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1px solid var(--bordure);
            border-radius: 8px;
            padding: 7px 10px;
            margin-bottom: 6px;
            background: var(--surface);
            text-align: left;
            font: inherit;
            cursor: pointer;
        }
        .ligne-fiche:hover:not(.inerte) {
            background: var(--surface-2);
        }
        .ligne-fiche.inerte {
            cursor: default;
        }
        .ligne-fiche .nom {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: var(--texte);
        }
        .ligne-fiche .precision {
            display: block;
            font-size: 10px;
            color: var(--texte-2);
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
    /**
     * Les fiches déjà ouvertes, dans l'ordre de visite : la dernière est celle qui s'affiche. C'est ce qui
     * donne le « ← retour » et le fil des trois dernières — on suit un lien sans perdre son chemin.
     */
    private readonly visitees = signal<EntreeCatalogue[]>([]);
    /** Tout ce que la fiche va chercher ailleurs, lu une seule fois à la première ouverture. */
    private readonly referentiel = signal<ReferentielDeFiche | null>(null);
    private referentielCharge = false;
    /** L'index complet de l'espace : il permet d'ouvrir une fiche que la recherche en cours ne montre pas. */
    private readonly indexComplet = signal<EntreeCatalogue[]>([]);
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
    /** La fiche du résultat ouvert, recomposée à chaque fois que le référentiel ou la sélection change. */
    readonly ficheOuverte = computed<FicheDuCatalogue>(() => {
        const entree = this.ouverte();
        const referentiel = this.referentiel();
        const vide: ReferentielDeFiche = {
            objets: [],
            termes: [],
            actifs: [],
            sources: [],
            fiches: {},
            liensDuParcours: [],
            volumetrie: [],
            voisins: []
        };
        return ficheDuCatalogue(entree as EntreeCatalogue, referentiel || vide);
    });
    /** La fiche d'où l'on vient, quand on a suivi un lien. */
    readonly fichePrecedente = computed(() => {
        const visitees = this.visitees();
        return visitees.length > 1 ? visitees[visitees.length - 2] : null;
    });
    /** Les trois dernières fiches visitées : le chemin parcouru, en un coup d'œil. */
    readonly filDesFiches = computed(() => this.visitees().slice(-3));

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

    // ---- la fiche en panneau latéral (V13) ----

    /**
     * Ouvre une fiche et la pose sur le chemin parcouru. Rouvrir une fiche déjà visitée ne l'empile pas
     * deux fois : on revient dessus, le chemin se raccourcit.
     */
    ouvrirLaFiche(entree: EntreeCatalogue): void {
        this.ouverte.set(entree);
        this.visitees.update(visitees => {
            const deja = visitees.findIndex(visitee => visitee.type === entree.type && visitee.id === entree.id);
            if (deja >= 0) return visitees.slice(0, deja + 1);
            return [...visitees, entree].slice(-30);
        });
        void this.chargerCeQuilFautPourLaFiche();
    }

    fermerLaFiche(): void {
        this.ouverte.set(null);
        this.visitees.set([]);
    }

    revenirALaFichePrecedente(): void {
        const precedente = this.fichePrecedente();
        if (!precedente) return;
        this.visitees.update(visitees => visitees.slice(0, -1));
        this.ouverte.set(precedente);
    }

    /**
     * Suit une ligne de la fiche : on ouvre ce qu'elle nomme. On le cherche d'abord dans les résultats
     * affichés, puis dans l'index complet de l'espace — sans quoi un lien vers un objet que la recherche
     * en cours ne montre pas resterait mort.
     */
    suivreLaLigne(ligne: LigneDeFiche): void {
        if (!ligne.cible) return;
        const trouvee = this.chercherDansLIndex(ligne.cible);
        if (trouvee) return this.ouvrirLaFiche(trouvee);
        this.notifications.erreur(`« ${ligne.libelle} » n'est plus dans le catalogue de cet espace.`);
    }

    private chercherDansLIndex(cible: CibleDeFiche): EntreeCatalogue | null {
        const correspond = (candidat: EntreeCatalogue) => candidat.type === cible.type && candidat.id === cible.id;
        return this.resultat()?.resultats.find(correspond) || this.indexComplet().find(correspond) || null;
    }

    /** Ce que la fiche va chercher ailleurs : la gouvernance, le parcours de la donnée, les volumes. */
    private async chargerCeQuilFautPourLaFiche(): Promise<void> {
        if (this.referentielCharge) return;
        this.referentielCharge = true;
        try {
            const [objets, termes, actifs, sources, fiches, carte, cockpit, tout] = await Promise.all([
                this.api.objetsMetier(),
                this.api.glossaire(),
                this.api.actifs(),
                this.api.sources(),
                this.api.dictionnaire(),
                this.api.carteFlux(),
                this.api.cockpit(),
                this.api.catalogue({ couche: 'tout' })
            ]);
            const nomDuNoeud = new Map(carte.noeuds.map(noeud => [noeud.id, String(noeud.tableName || noeud.name || '')]));
            this.referentiel.set({
                objets,
                termes,
                actifs,
                sources,
                fiches,
                liensDuParcours: carte.liens.map(lien => ({
                    de: nomDuNoeud.get(lien.source) || '',
                    vers: nomDuNoeud.get(lien.target) || ''
                })),
                volumetrie: cockpit.volumetrie,
                voisins: tout.resultats
            });
            this.indexComplet.set(tout.resultats);
        } catch (erreur) {
            this.referentielCharge = false;
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Les trois boutons du pied, chacun vers l'écran qui prolonge ce que la fiche montre. */
    lancerLAction(action: 'lineage' | 'objet' | 'utiliser', entree: EntreeCatalogue): void {
        if (action === 'lineage') {
            const lien = lienDuParcours(entree);
            return void this.routeur.navigateByUrl(lien || '/lineage');
        }
        if (action === 'objet') {
            const objet = entree.type === 'bo' ? entree.id : entree.id.split('.')[0];
            return void this.routeur.navigateByUrl(`/objets-metier?objet=${encodeURIComponent(objet)}`);
        }
        // « Utiliser cette donnée » : on ouvre les lignes quand il y a une table derrière, l'écran dédié sinon.
        const table = this.tableDeLEntree(entree);
        void this.routeur.navigateByUrl(table ? `/navigateur?table=${encodeURIComponent(table)}` : entree.lien);
    }

    /** La table derrière un résultat, quand il y en a une : c'est elle que l'on va explorer. */
    private tableDeLEntree(entree: EntreeCatalogue): string {
        const referentiel = this.referentiel();
        if (!referentiel) return '';
        if (entree.type === 'table' || entree.type === 'view')
            return referentiel.sources.find(source => source.id === entree.id)?.name || '';
        if (entree.type === 'column') return entree.sousTitre.replace(/^dans /, '');
        const objet = referentiel.objets.find(candidat => candidat.id === entree.id.split('.')[0]);
        if (!objet) return '';
        return (objet.sources.find(source => source.role === 'maitre') || objet.sources[0])?.table || '';
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
