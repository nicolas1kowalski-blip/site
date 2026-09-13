/**
 * Sauvegarde et partage : exporter la configuration de l'espace (documents partagés, sources, recettes) en JSON
 * — au format de la plateforme ou de l'application classique —, importer un tel fichier dans l'espace courant,
 * et produire le dossier de gouvernance (HTML autonome, imprimable).
 */
import { Component, inject, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { RapportImport } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-sauvegarde',
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Sauvegarde et partage</h1>
                <p class="discret">
                    Les données restent dans l'espace ; ce qui se partage, c'est ce que l'équipe a décrit et construit autour.
                </p>
            </div>
        </div>
        <div class="grille">
            <div class="carte">
                <h2>Exporter</h2>
                <p class="discret">
                    Un fichier JSON avec les documents partagés (modèle, gouvernance, tableaux de bord…), les métadonnées des sources et les
                    recettes des tables conçues.
                </p>
                <a class="bouton principal" [href]="api.adresseExport('plateforme')" download>Exporter l'espace (plateforme)</a>
                <a class="bouton" [href]="api.adresseExport('classique')" download style="margin-left: 6px"
                    >Exporter pour l'application classique</a
                >
            </div>
            <div class="carte">
                <h2>Importer</h2>
                <p class="discret">
                    Un export de la plateforme, ou un fichier de configuration de l'application classique. Les tables conçues sont
                    reconstruites si leurs sources sont présentes.
                </p>
                @if (session.peutEditer()) {
                    <input type="file" accept="application/json,.json" (change)="importer($event)" name="fichier" />
                }
                @if (rapport(); as rapport) {
                    <div class="rapport">
                        {{ rapport.documents }} document(s) repris · {{ rapport.sources }} source(s) mise(s) à jour ·
                        {{ rapport.tablesConcues.reconstruites.length }} table(s) conçue(s) reconstruite(s){{
                            rapport.tablesConcues.reconstruites.length ? ' (' + rapport.tablesConcues.reconstruites.join(', ') + ')' : ''
                        }}
                        @for (erreur of rapport.tablesConcues.erreurs; track erreur.table) {
                            <div class="erreur-texte">{{ erreur.table }} : {{ erreur.erreur }}</div>
                        }
                    </div>
                }
            </div>
            <div class="carte">
                <h2>Dossier de gouvernance</h2>
                <p class="discret">
                    Un document HTML autonome : sources, objets métier, glossaire, applications, périmètres, listes de valeurs, personnes,
                    règles de qualité, sensibilité.
                </p>
                <a class="bouton principal" [href]="api.adresseDossier(false)" target="_blank" rel="noopener">Ouvrir le dossier</a>
                <a class="bouton" [href]="api.adresseDossier(true)" download style="margin-left: 6px">Télécharger</a>
            </div>
        </div>
    `,
    styles: `
        a.bouton {
            display: inline-block;
            text-decoration: none;
        }
        .rapport {
            margin-top: 10px;
            font-size: 13px;
        }
        .erreur-texte {
            color: var(--erreur);
        }
    `
})
export class SauvegardeComponent {
    readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly rapport = signal<RapportImport | null>(null);

    async importer(evenement: Event): Promise<void> {
        const champ = evenement.target as HTMLInputElement;
        const fichier = champ.files?.[0];
        if (!fichier) return;
        try {
            const contenu = JSON.parse(await fichier.text());
            this.rapport.set(await this.api.importerSauvegarde(contenu));
            this.notifications.succes('Import terminé.');
        } catch (erreur) {
            this.notifications.erreur(erreur instanceof SyntaxError ? 'Fichier JSON invalide.' : (erreur as Error));
        } finally {
            champ.value = '';
        }
    }
}
