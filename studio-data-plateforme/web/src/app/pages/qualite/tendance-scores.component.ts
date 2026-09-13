/**
 * Tendance & comparaison des scores (reprises de l'application classique) : chaque exécution des règles laisse un
 * audit « règles » qui mémorise le score de la source et le résultat de chaque règle. Ce composant trace ces scores
 * dans le temps (barres) et compare deux exécutions au choix, règle par règle : échecs avant, échecs après, écart,
 * règles apparues ou disparues. Calcul local à partir des audits déjà chargés par la page.
 */
import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditQualite, RegleDansAudit, formaterDate } from '../../coeur/modeles';

/** Une exécution des règles telle qu'elle est mémorisée dans l'historique. */
export type PhotographieScore = { id: string; date: string; score: number | null; regles: RegleDansAudit[] };

export type ComparaisonRegle = {
    nom: string;
    avant: number | null;
    apres: number | null;
    ecart: number;
    tendance: 'amelioration' | 'degradation' | 'stable' | 'nouvelle' | 'disparue';
};

/** Extrait les photographies de score des audits « règles », de la plus ancienne à la plus récente. */
export function photographiesDesAudits(audits: AuditQualite[]): PhotographieScore[] {
    return audits
        .filter(audit => audit.genre === 'regles')
        .map(audit => {
            const detail = (audit.detail || {}) as { regles?: RegleDansAudit[] };
            const score = audit.resume['score'];
            return {
                id: audit.id,
                date: audit.lanceLe,
                score: score === null || score === undefined ? null : Number(score),
                regles: detail.regles || []
            };
        })
        .sort((gauche, droite) => gauche.date.localeCompare(droite.date));
}

/** Compare deux photographies règle par règle (par nom de règle). */
export function comparerPhotographies(avant: PhotographieScore, apres: PhotographieScore): ComparaisonRegle[] {
    const noms = new Set([...avant.regles.map(regle => regle.nom), ...apres.regles.map(regle => regle.nom)]);
    return [...noms]
        .map(nom => {
            const regleAvant = avant.regles.find(regle => regle.nom === nom);
            const regleApres = apres.regles.find(regle => regle.nom === nom);
            const echecsAvant = regleAvant ? regleAvant.echecs : null;
            const echecsApres = regleApres ? regleApres.echecs : null;
            const ecart = (echecsApres ?? 0) - (echecsAvant ?? 0);
            let tendance: ComparaisonRegle['tendance'] = 'stable';
            if (echecsAvant === null) tendance = 'nouvelle';
            else if (echecsApres === null) tendance = 'disparue';
            else if (ecart < 0) tendance = 'amelioration';
            else if (ecart > 0) tendance = 'degradation';
            return { nom, avant: echecsAvant, apres: echecsApres, ecart, tendance };
        })
        .sort((gauche, droite) => Math.abs(droite.ecart) - Math.abs(gauche.ecart) || gauche.nom.localeCompare(droite.nom));
}

@Component({
    selector: 'app-tendance-scores',
    imports: [FormsModule],
    template: `
        <div class="carte">
            <h2>Tendance du score</h2>
            @if (photographies().length < 1) {
                <div class="vide">Aucune exécution mémorisée : exécutez les règles pour alimenter la tendance.</div>
            } @else {
                <div class="tendance">
                    @for (photographie of photographies(); track photographie.id) {
                        <div class="colonne" [title]="formaterDate(photographie.date) + ' : ' + (photographie.score ?? '—') + ' / 100'">
                            <div
                                class="barre"
                                [style.height.%]="photographie.score ?? 0"
                                [class.bon]="(photographie.score ?? 0) >= 90"
                                [class.moyen]="(photographie.score ?? 0) < 90 && (photographie.score ?? 0) >= 70"
                                [class.mauvais]="(photographie.score ?? 0) < 70"
                            ></div>
                            <span class="valeur">{{ photographie.score ?? '—' }}</span>
                        </div>
                    }
                </div>
                <p class="discret">
                    {{ photographies().length }} exécution(s), de {{ formaterDate(photographies()[0].date) }} à
                    {{ formaterDate(photographies()[photographies().length - 1].date) }}.
                </p>
            }
        </div>
        @if (photographies().length >= 2) {
            <div class="carte">
                <div class="entete-page" style="margin: 0 0 8px">
                    <h2 style="margin: 0">Comparaison de deux exécutions</h2>
                    <select class="champ" style="width: auto" name="comparaison-avant" [(ngModel)]="idAvant">
                        @for (photographie of photographies(); track photographie.id) {
                            <option [value]="photographie.id">
                                {{ formaterDate(photographie.date) }} — {{ photographie.score ?? '—' }}
                            </option>
                        }
                    </select>
                    <span class="discret">→</span>
                    <select class="champ" style="width: auto" name="comparaison-apres" [(ngModel)]="idApres">
                        @for (photographie of photographies(); track photographie.id) {
                            <option [value]="photographie.id">
                                {{ formaterDate(photographie.date) }} — {{ photographie.score ?? '—' }}
                            </option>
                        }
                    </select>
                    @if (ecartScore() !== null) {
                        <span class="badge" [class.succes]="ecartScore()! >= 0" [class.erreur]="ecartScore()! < 0"
                            >score {{ ecartScore()! >= 0 ? '+' : '' }}{{ ecartScore() }} point(s)</span
                        >
                    }
                </div>
                <table class="tableau comparaison">
                    <thead>
                        <tr>
                            <th>Règle</th>
                            <th>Échecs avant</th>
                            <th>Échecs après</th>
                            <th>Écart</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (ligne of comparaison(); track ligne.nom) {
                            <tr>
                                <td>{{ ligne.nom }}</td>
                                <td>{{ ligne.avant ?? '—' }}</td>
                                <td>{{ ligne.apres ?? '—' }}</td>
                                <td>
                                    <span
                                        class="badge"
                                        [class.succes]="ligne.tendance === 'amelioration'"
                                        [class.erreur]="ligne.tendance === 'degradation'"
                                        [class.neutre]="
                                            ligne.tendance === 'stable' || ligne.tendance === 'nouvelle' || ligne.tendance === 'disparue'
                                        "
                                        >{{ libelleTendance(ligne) }}</span
                                    >
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        }
    `,
    styles: `
        .tendance {
            display: flex;
            align-items: flex-end;
            gap: 6px;
            height: 120px;
            padding: 4px 0;
            border-bottom: 1px solid var(--bordure);
        }
        .colonne {
            flex: 1;
            max-width: 40px;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            gap: 2px;
        }
        .barre {
            width: 100%;
            border-radius: 4px 4px 0 0;
            background: var(--accent);
            min-height: 2px;
        }
        .barre.bon {
            background: var(--succes);
        }
        .barre.moyen {
            background: var(--alerte);
        }
        .barre.mauvais {
            background: var(--erreur);
        }
        .valeur {
            font-size: 10px;
            color: var(--texte-2);
        }
    `
})
export class TendanceScoresComponent {
    readonly audits = input<AuditQualite[]>([]);
    readonly photographies = computed(() => photographiesDesAudits(this.audits()));
    readonly formaterDate = formaterDate;
    /** Exécutions comparées : par défaut l'avant-dernière et la dernière. */
    readonly idAvantChoisi = signal('');
    readonly idApresChoisi = signal('');

    get idAvant(): string {
        const photographies = this.photographies();
        return this.idAvantChoisi() || (photographies.length >= 2 ? photographies[photographies.length - 2].id : '');
    }
    set idAvant(valeur: string) {
        this.idAvantChoisi.set(valeur);
    }
    get idApres(): string {
        const photographies = this.photographies();
        return this.idApresChoisi() || (photographies.length ? photographies[photographies.length - 1].id : '');
    }
    set idApres(valeur: string) {
        this.idApresChoisi.set(valeur);
    }

    readonly avant = computed(() => this.photographies().find(photographie => photographie.id === this.idAvant) || null);
    readonly apres = computed(() => this.photographies().find(photographie => photographie.id === this.idApres) || null);
    readonly comparaison = computed(() => {
        const avant = this.avant();
        const apres = this.apres();
        return avant && apres ? comparerPhotographies(avant, apres) : [];
    });
    readonly ecartScore = computed(() => {
        const avant = this.avant();
        const apres = this.apres();
        return avant?.score !== null && avant?.score !== undefined && apres?.score !== null && apres?.score !== undefined
            ? apres.score - avant.score
            : null;
    });

    libelleTendance(ligne: ComparaisonRegle): string {
        if (ligne.tendance === 'nouvelle') return 'nouvelle règle';
        if (ligne.tendance === 'disparue') return 'règle disparue';
        if (ligne.tendance === 'stable') return 'stable';
        return (ligne.ecart > 0 ? '+' : '') + ligne.ecart + (ligne.tendance === 'amelioration' ? ' ↓ amélioration' : ' ↑ dégradation');
    }
}
