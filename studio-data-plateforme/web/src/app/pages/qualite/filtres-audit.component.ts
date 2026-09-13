/**
 * Éditeur de filtres d'audit : des conditions « colonne opérateur valeur » qui restreignent les lignes auditées
 * (profilage, doublons, audit d'objet métier, périmètre d'une clé fonctionnelle). Le composant expose la liste des
 * filtres en lecture / écriture (`model`) ; le parent l'envoie telle quelle au serveur.
 */
import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FiltreAudit, OperateurFiltreSource } from '../../coeur/modeles';

export const OPERATEURS_FILTRE_AUDIT: Record<OperateurFiltreSource, string> = {
    eq: 'est égal à',
    neq: 'est différent de',
    contains: 'contient',
    ncontains: 'ne contient pas',
    starts: 'commence par',
    ends: 'finit par',
    empty: 'est vide',
    nempty: 'est renseigné',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤'
};
const OPERATEURS_SANS_VALEUR: OperateurFiltreSource[] = ['empty', 'nempty'];

@Component({
    selector: 'app-filtres-audit',
    imports: [FormsModule],
    template: `
        <div class="filtres">
            @for (filtre of filtres(); track $index; let index = $index) {
                <div class="filtre">
                    <select
                        class="champ"
                        [attr.name]="prefixe() + '-colonne-' + index"
                        [ngModel]="filtre.col"
                        (ngModelChange)="modifier(index, { col: $event })"
                    >
                        @for (colonne of colonnes(); track colonne) {
                            <option [value]="colonne">{{ colonne }}</option>
                        }
                    </select>
                    <select
                        class="champ"
                        [attr.name]="prefixe() + '-operateur-' + index"
                        [ngModel]="filtre.op"
                        (ngModelChange)="modifier(index, { op: $event })"
                    >
                        @for (operateur of operateurs; track operateur[0]) {
                            <option [value]="operateur[0]">{{ operateur[1] }}</option>
                        }
                    </select>
                    @if (!sansValeur(filtre.op)) {
                        <input
                            class="champ"
                            [attr.name]="prefixe() + '-valeur-' + index"
                            [ngModel]="filtre.val"
                            (ngModelChange)="modifier(index, { val: $event })"
                            placeholder="valeur"
                        />
                    }
                    <button class="bouton petit" type="button" (click)="retirer(index)" title="Retirer ce filtre">✕</button>
                </div>
            }
            <button class="bouton petit" type="button" (click)="ajouter()" [disabled]="!colonnes().length">
                {{ filtres().length ? 'Ajouter un filtre' : libelleAjout() }}
            </button>
        </div>
    `,
    styles: `
        .filtres {
            display: flex;
            flex-direction: column;
            gap: 6px;
            align-items: flex-start;
        }
        .filtre {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            align-items: center;
        }
        .filtre .champ {
            width: auto;
            min-width: 120px;
        }
    `
})
export class FiltresAuditComponent {
    readonly colonnes = input<string[]>([]);
    /** Préfixe des attributs name (plusieurs éditeurs peuvent coexister sur la même page). */
    readonly prefixe = input('filtre');
    readonly libelleAjout = input('Restreindre le périmètre (filtre)');
    readonly filtres = model<FiltreAudit[]>([]);
    readonly operateurs = Object.entries(OPERATEURS_FILTRE_AUDIT) as [OperateurFiltreSource, string][];

    sansValeur(operateur: OperateurFiltreSource): boolean {
        return OPERATEURS_SANS_VALEUR.includes(operateur);
    }
    ajouter(): void {
        this.filtres.update(filtres => [...filtres, { col: this.colonnes()[0] || '', op: 'eq', val: '' }]);
    }
    retirer(index: number): void {
        this.filtres.update(filtres => filtres.filter((_, position) => position !== index));
    }
    modifier(index: number, changement: Partial<FiltreAudit>): void {
        this.filtres.update(filtres => filtres.map((filtre, position) => (position === index ? { ...filtre, ...changement } : filtre)));
    }
}
