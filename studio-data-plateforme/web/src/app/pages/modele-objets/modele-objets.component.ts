/**
 * Modèle de données (famille Patrimoine) — le diagramme du modèle d'objets, comme la V13.
 *
 * À ne pas confondre avec l'écran « Modèle de données » des sources : celui-là montre les fichiers et
 * leurs jointures, celui-ci montre le **sens** — les objets métier, ce qui les compose, ce qui les relie.
 * On y lit en un coup d'œil ce qui n'a pas de propriétaire, et quels objets s'appuient sur quels autres.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { ObjetMetier } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { AideEcranComponent } from '../../composants/aide-ecran.component';
import { GrapheSvgComponent, NoeudDessine } from '../../composants/graphe-svg.component';
import { diagrammeDesObjets, resumeDuModele } from './modele-objets';

@Component({
    selector: 'app-modele-objets',
    imports: [AideEcranComponent, GrapheSvgComponent],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Modèle de données</h1>
                <p class="discret">{{ resume() }}</p>
            </div>
        </div>
        <app-aide-ecran />

        @if (noeuds().length) {
            <div class="carte">
                <app-graphe-svg
                    [noeuds]="noeuds()"
                    [liens]="liens()"
                    [hauteur]="560"
                    [nomImage]="'modele-objets'"
                    (noeudChoisi)="ouvrir($event)"
                />
                <p class="discret" style="margin-bottom: 0">
                    🏛️ les objets métier · ◆ ce qui les compose (une variante, avec sa cardinalité et, s'il y en a, la condition sous
                    laquelle elle s'applique) · → ce à quoi ils font référence. Un cadre plus sombre et 🌳 signalent un objet qui porte une
                    hiérarchie. Cliquez sur une carte pour ouvrir la fiche de l'objet.
                </p>
            </div>
        } @else {
            <div class="carte vide">
                Aucun objet métier à dessiner. Décrivez-en un dans <b>Objets métier</b> : le modèle se construit tout seul à partir de ce
                que vous y déclarez.
            </div>
        }
    `
})
export class ModeleObjetsComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly routeur = inject(Router);

    readonly objets = signal<ObjetMetier[]>([]);
    private readonly diagramme = computed(() => diagrammeDesObjets(this.objets()));
    readonly noeuds = computed(() => this.diagramme().noeuds);
    readonly liens = computed(() => this.diagramme().liens);
    readonly resume = computed(() => resumeDuModele(this.objets()));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.objets.set(await this.api.objetsMetier());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** D'une carte, on va à la fiche : le diagramme sert à trouver, la fiche à corriger. */
    ouvrir(noeud: NoeudDessine): void {
        const identifiant = noeud.id.startsWith('bo:') ? noeud.id.slice(3) : noeud.id.split(':')[1];
        if (identifiant) void this.routeur.navigate(['/objets-metier'], { queryParams: { objet: identifiant } });
    }
}
