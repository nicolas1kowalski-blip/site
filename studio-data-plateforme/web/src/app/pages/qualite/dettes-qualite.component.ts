/**
 * Dettes qualité (reprises de l'application classique) : pour chaque règle en échec, un « coût » = nombre d'échecs ×
 * poids de la criticité (bloquante 3, majeure 2, mineure 1 — les poids viennent du vocabulaire du serveur). Les
 * règles sont classées par coût décroissant pour montrer où l'effort de correction rapporte le plus.
 * Calcul purement local à partir des derniers résultats des règles.
 */
import { Component, computed, input } from '@angular/core';
import { Criticite, RegleQualite } from '../../coeur/modeles';
import { cibleDeLaRegle } from './description-regle';

export type DetteQualite = { regle: RegleQualite; poids: number; echecs: number; cout: number; part: number };

/** Classe les règles en échec par coût décroissant (échecs × poids de la criticité). */
export function dettesDesRegles(regles: RegleQualite[], poidsCriticites: Partial<Record<Criticite, number>>): DetteQualite[] {
    const dettes = regles
        .filter(regle => regle.dernierResultat && regle.dernierResultat.echecs > 0)
        .map(regle => {
            const poids = poidsCriticites[regle.criticite] ?? 1;
            const echecs = regle.dernierResultat!.echecs;
            return { regle, poids, echecs, cout: echecs * poids, part: 0 };
        })
        .sort((gauche, droite) => droite.cout - gauche.cout);
    const total = dettes.reduce((somme, dette) => somme + dette.cout, 0);
    return dettes.map(dette => ({ ...dette, part: total ? dette.cout / total : 0 }));
}

@Component({
    selector: 'app-dettes-qualite',
    template: `
        <div class="carte">
            <div class="entete-page" style="margin: 0 0 8px">
                <h2 style="margin: 0">Dettes qualité</h2>
                <span class="badge" [class.succes]="!dettes().length" [class.erreur]="dettes().length">coût total {{ coutTotal() }}</span>
                <span class="discret">coût = échecs × poids de la criticité ; les règles sont classées par coût décroissant.</span>
            </div>
            @if (!dettes().length) {
                <div class="vide">Aucune dette : toutes les règles exécutées sont respectées.</div>
            } @else {
                <table class="tableau dettes">
                    <thead>
                        <tr>
                            <th>Règle</th>
                            <th>Cible</th>
                            <th>Criticité</th>
                            <th>Échecs</th>
                            <th>Coût</th>
                            <th>Part de la dette</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (dette of dettes(); track dette.regle.id) {
                            <tr>
                                <td>
                                    <b>{{ dette.regle.nom }}</b>
                                </td>
                                <td>
                                    <code>{{ cibleDeLaRegle(dette.regle) }}</code>
                                </td>
                                <td>
                                    <span
                                        class="badge"
                                        [class.erreur]="dette.regle.criticite === 'bloquante'"
                                        [class.alerte]="dette.regle.criticite === 'majeure'"
                                        [class.neutre]="dette.regle.criticite === 'mineure'"
                                        >{{ dette.regle.criticite }} ×{{ dette.poids }}</span
                                    >
                                </td>
                                <td>{{ dette.echecs }}</td>
                                <td>
                                    <b>{{ dette.cout }}</b>
                                </td>
                                <td>
                                    <div class="barre-progression" style="width: 140px; display: inline-block; vertical-align: middle">
                                        <div [style.width.%]="100 * dette.part" style="background: var(--erreur)"></div>
                                    </div>
                                    <span class="discret">{{ (100 * dette.part).toFixed(0) }} %</span>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>
    `
})
export class DettesQualiteComponent {
    readonly regles = input<RegleQualite[]>([]);
    readonly poidsCriticites = input<Partial<Record<Criticite, number>>>({});
    readonly dettes = computed(() => dettesDesRegles(this.regles(), this.poidsCriticites()));
    readonly coutTotal = computed(() => this.dettes().reduce((somme, dette) => somme + dette.cout, 0));
    readonly cibleDeLaRegle = cibleDeLaRegle;
}
