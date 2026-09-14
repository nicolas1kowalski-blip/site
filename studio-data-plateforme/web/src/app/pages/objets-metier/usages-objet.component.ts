/**
 * Qui se sert de quelle information — l'onglet « Usages » de la fiche d'un objet métier (V13).
 *
 * Deux façons de répondre à la même question, parce qu'elles ne servent pas au même moment :
 *   • **par application** : on choisit une application, on coche d'un geste ce qu'elle utilise. C'est la
 *     vue de la personne qui vient déclarer son application, et elle reste lisible à cinquante applications ;
 *   • **matrice complète** : toutes les informations en lignes, tous les actifs en colonnes. C'est la vue
 *     de la personne qui veut voir les trous — ce que personne ne lit, et ce qui a sa propre source.
 *
 * L'objet est modifié sur place : le composant le reçoit et écrit dedans par des méthodes, jamais par des
 * valeurs calculées — une valeur calculée qui modifie ce qu'elle lit ne s'arrêterait jamais.
 */
import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Actif, AttributObjetMetier, ObjetMetier } from '../../coeur/modeles';
import {
    LigneDUsage,
    VUES_DES_USAGES,
    autresUsages,
    bilanDesUsages,
    compteDesUsages,
    lignesDUsage,
    poserLUsage,
    poserLUsagePourToutes,
    sourceDifferente,
    utiliseePar,
    vueDouverture
} from './usages-objet';

/** Le pictogramme de chaque genre d'actif, comme partout ailleurs dans l'application. */
const PICTOGRAMME_GENRE: Record<string, string> = { app: '🖥', process: '⚙️', report: '📊' };

@Component({
    selector: 'app-usages-objet',
    imports: [FormsModule],
    template: `
        @if (!actifs().length) {
            <div class="vide">
                Déclarez d'abord des applications et des processus dans <b>Applications &amp; processus</b> : c'est d'eux que l'on dit
                qu'ils se servent d'une information.
            </div>
        } @else if (!lignes().length) {
            <div class="vide">Aucune information — décrivez d'abord ce que contient l'objet.</div>
        } @else {
            <div class="entete-page" style="margin: 0 0 10px">
                <div class="onglets espace">
                    @for (vue of vues; track vue.cle) {
                        <button
                            type="button"
                            [class.actif]="vueActive() === vue.cle"
                            [attr.name]="'vue-' + vue.cle"
                            (click)="vueActive.set(vue.cle)"
                        >
                            {{ vue.libelle }}
                        </button>
                    }
                </div>
                @if (bilan().sansUsage) {
                    <span class="badge alerte" title="Une information que personne ne lit est soit inutile, soit mal connue">
                        😴 {{ bilan().sansUsage }} information(s) sans usage
                    </span>
                } @else {
                    <span class="badge succes">✔ toutes les informations ont un usage</span>
                }
                @if (bilan().sourcesPropres) {
                    <span class="badge alerte" title="Ces informations viennent d'une autre application que celle qui produit l'objet">
                        ≠ {{ bilan().sourcesPropres }} source(s) spécifique(s)
                    </span>
                }
            </div>

            <!-- ---- par application : on choisit, puis on coche ---- -->
            @if (vueActive() === 'application') {
                <div class="ligne-champs" style="margin-bottom: 10px">
                    <select class="champ" name="actifChoisi" [ngModel]="actifChoisi()" (ngModelChange)="actifChoisi.set($event)">
                        @for (actif of actifs(); track actif.id) {
                            <option [value]="actif.id">{{ pictogramme(actif) }} {{ actif.name }}</option>
                        }
                    </select>
                    <span class="badge">{{ compte() }}</span>
                    @if (modifiable()) {
                        <button class="bouton petit" type="button" name="cocherTout" (click)="poserPourToutes(true)">✔ Tout cocher</button>
                        <button class="bouton petit" type="button" name="decocherTout" (click)="poserPourToutes(false)">
                            ✕ Tout décocher
                        </button>
                    }
                </div>
                <div class="defilement-x">
                    <table class="tableau">
                        <thead>
                            <tr>
                                <th style="width: 40px"></th>
                                <th>Information</th>
                                <th>Autres usages déclarés</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (ligne of lignes(); track ligne.information.id; let rang = $index) {
                                <tr [class.sans-usage]="!(ligne.information.usedBy || []).length">
                                    <td>
                                        <input
                                            type="checkbox"
                                            [checked]="coche(ligne)"
                                            [attr.name]="'usage-' + rang"
                                            [disabled]="!modifiable()"
                                            [attr.aria-label]="ligne.information.name + ' utilisée par ' + nomDuChoisi()"
                                            (change)="basculer(ligne, $any($event.target).checked)"
                                        />
                                    </td>
                                    <td>
                                        <b>{{ ligne.information.name }}</b>
                                        @if (ligne.variante) {
                                            <span class="discret">◆ {{ ligne.variante }}</span>
                                        }
                                        @if (!(ligne.information.usedBy || []).length) {
                                            <span title="Aucun usage déclaré">😴</span>
                                        }
                                    </td>
                                    <td>
                                        @for (autre of autres(ligne); track autre.id) {
                                            <span class="puce">{{ pictogramme(autre) }} {{ autre.name }}</span>
                                        } @empty {
                                            <span class="discret">—</span>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <p class="discret">
                    Choisissez une application, puis cochez d'un geste les informations qu'elle utilise — bien plus rapide que la matrice
                    quand les applications sont nombreuses.
                </p>
            }

            <!-- ---- matrice complète : toutes les informations, tous les actifs ---- -->
            @if (vueActive() === 'matrice') {
                <div class="defilement-x">
                    <table class="tableau matrice">
                        <thead>
                            <tr>
                                <th>Information</th>
                                <th title="Application d'où vient cette information, si elle diffère de celle de l'objet">Source</th>
                                @for (actif of actifs(); track actif.id; let colonne = $index) {
                                    <th class="colonne-actif">
                                        <div>{{ pictogramme(actif) }}</div>
                                        <div>{{ actif.name }}</div>
                                        @if (modifiable()) {
                                            <div>
                                                <button
                                                    class="lien-case"
                                                    type="button"
                                                    title="Tout cocher"
                                                    [attr.name]="'cocherColonne-' + colonne"
                                                    (click)="poserPourToutes(true, actif.id)"
                                                >
                                                    ✔
                                                </button>
                                                <button
                                                    class="lien-case"
                                                    type="button"
                                                    title="Tout décocher"
                                                    [attr.name]="'decocherColonne-' + colonne"
                                                    (click)="poserPourToutes(false, actif.id)"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        }
                                    </th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (ligne of lignes(); track ligne.information.id; let rang = $index) {
                                <tr [class.sans-usage]="!(ligne.information.usedBy || []).length">
                                    <td style="white-space: nowrap">
                                        <b>{{ ligne.information.name }}</b>
                                        @if (ligne.variante) {
                                            <div class="discret">◆ {{ ligne.variante }}</div>
                                        }
                                    </td>
                                    <td>
                                        <select
                                            class="champ"
                                            [class.propre]="sourcePropre(ligne)"
                                            [ngModel]="sourceDe(ligne)"
                                            [name]="'source-' + rang"
                                            [attr.name]="'source-' + rang"
                                            [disabled]="!modifiable()"
                                            (ngModelChange)="poserLaSource(ligne, $event)"
                                        >
                                            <option value="">{{ libelleDeLaSourceDeLObjet() }}</option>
                                            @for (application of applications(); track application.id) {
                                                <option [value]="application.id">{{ application.name }}</option>
                                            }
                                        </select>
                                    </td>
                                    @for (actif of actifs(); track actif.id; let colonne = $index) {
                                        <td style="text-align: center">
                                            <input
                                                type="checkbox"
                                                [checked]="cocheSur(ligne, actif.id)"
                                                [attr.name]="'case-' + rang + '-' + colonne"
                                                [disabled]="!modifiable()"
                                                [title]="ligne.information.name + ' utilisée par ' + actif.name"
                                                (change)="basculerSur(ligne, actif.id, $any($event.target).checked)"
                                            />
                                        </td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <p class="discret">
                    Cochez les applications 🖥 et processus ⚙️ qui <b>utilisent</b> chaque information · la colonne « Source » dit d'où vient
                    l'information quand ce n'est pas l'application qui produit l'objet.
                </p>
            }
        }
    `,
    styles: `
        /* Sélecteur segmenté, comme partout ailleurs. */
        .onglets {
            display: inline-flex;
            gap: 2px;
            flex-wrap: wrap;
            background: color-mix(in srgb, var(--texte) 5%, transparent);
            border-radius: 9px;
            padding: 2px;
        }
        .onglets button {
            border: 0;
            background: none;
            padding: 6px 12px;
            border-radius: 7px;
            font: inherit;
            font-size: 12px;
            font-weight: 530;
            color: var(--texte-2);
            cursor: pointer;
        }
        .onglets button.actif {
            background: var(--surface);
            color: var(--texte);
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
        }
        /* Une information que personne ne lit : teintée, pour qu'elle saute aux yeux sans crier. */
        tr.sans-usage td {
            background: color-mix(in srgb, var(--alerte) 8%, transparent);
        }
        .matrice .colonne-actif {
            text-align: center;
            min-width: 76px;
            font-size: 11px;
            line-height: 1.25;
        }
        .lien-case {
            border: 0;
            background: none;
            cursor: pointer;
            font-size: 11px;
            padding: 0 3px;
            color: var(--texte-2);
        }
        .lien-case:hover {
            color: var(--accent);
        }
        /* Une source différente de celle de l'objet se voit dans le champ lui-même. */
        .champ.propre {
            border-color: var(--alerte);
            font-weight: 600;
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
        p.discret {
            margin: 8px 0 0;
        }
    `
})
export class UsagesObjetComponent {
    /** L'objet dont on déclare les usages ; il est modifié sur place. */
    readonly objet = input.required<ObjetMetier>();
    readonly actifs = input.required<Actif[]>();
    readonly modifiable = input(true);

    readonly vues = VUES_DES_USAGES;
    readonly vueActive = signal('');
    /** L'application ou le processus que l'on est en train de déclarer, dans la vue « par application ». */
    readonly actifChoisi = signal('');

    /**
     * Les lignes suivent l'objet, mais leur contenu est modifié sur place : la valeur calculée ne sert
     * qu'à retrouver la liste, jamais à décider de ce qui est coché.
     */
    readonly lignes = computed<LigneDUsage[]>(() => lignesDUsage(this.objet()));
    readonly applications = computed(() => this.actifs().filter(actif => actif.kind === 'app'));

    constructor() {
        // La vue d'ouverture et l'actif choisi dépendent de ce que l'on reçoit : ni l'un ni l'autre n'est
        // connu à la construction, d'où ces valeurs posées à la première lecture.
        queueMicrotask(() => {
            if (!this.vueActive()) this.vueActive.set(vueDouverture(this.actifs().length));
            if (!this.actifChoisi() && this.actifs().length) this.actifChoisi.set(this.actifs()[0].id);
        });
    }

    pictogramme(actif: Actif): string {
        return PICTOGRAMME_GENRE[actif.kind] || '•';
    }

    nomDuChoisi(): string {
        return this.actifs().find(actif => actif.id === this.actifChoisi())?.name || '';
    }

    compte(): string {
        return compteDesUsages(this.lignes(), this.actifChoisi());
    }

    bilan(): { sansUsage: number; sourcesPropres: number } {
        return bilanDesUsages(this.lignes(), this.sourceDeLObjet());
    }

    coche(ligne: LigneDUsage): boolean {
        return utiliseePar(ligne.information, this.actifChoisi());
    }
    cocheSur(ligne: LigneDUsage, actifId: string): boolean {
        return utiliseePar(ligne.information, actifId);
    }

    basculer(ligne: LigneDUsage, utilise: boolean): void {
        poserLUsage(ligne.information, this.actifChoisi(), utilise);
    }
    basculerSur(ligne: LigneDUsage, actifId: string, utilise: boolean): void {
        poserLUsage(ligne.information, actifId, utilise);
    }

    poserPourToutes(utilise: boolean, actifId = this.actifChoisi()): void {
        poserLUsagePourToutes(this.lignes(), actifId, utilise);
    }

    autres(ligne: LigneDUsage): Actif[] {
        return autresUsages(ligne.information, this.actifChoisi(), this.actifs());
    }

    /** L'application qui produit l'objet : c'est à elle que l'on compare la source de chaque information. */
    sourceDeLObjet(): string {
        return (this.objet().producedBy || [])[0] || '';
    }

    libelleDeLaSourceDeLObjet(): string {
        const nom = this.actifs().find(actif => actif.id === this.sourceDeLObjet())?.name;
        return nom ? `= objet (${nom})` : "(celle de l'objet)";
    }

    sourceDe(ligne: LigneDUsage): string {
        return String(ligne.information['sourceApp'] || '');
    }

    poserLaSource(ligne: LigneDUsage, application: string): void {
        (ligne.information as AttributObjetMetier)['sourceApp'] = application;
    }

    sourcePropre(ligne: LigneDUsage): boolean {
        return sourceDifferente(ligne.information, this.sourceDeLObjet());
    }
}
