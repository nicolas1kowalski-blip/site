/**
 * Application complète (interface classique) : tous les écrans historiques de Studio Data, servis par le
 * même serveur sous /classique/ et affichés dans un cadre. Ils travaillent sur l'espace courant de la session
 * (même cookie) : les sources déposées ici apparaissent dans Angular, et réciproquement.
 */
import { Component, inject } from '@angular/core';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-classique',
    template: `
        <div class="bandeau">
            <span
                ><b>Application complète</b> — tous les écrans (tables conçues, modèle, extraction, qualité, lineage…) sur l'espace «
                {{ session.espaceCourant()?.nom }} ».</span
            >
            <a class="bouton petit" href="/classique/" target="_blank" rel="noopener">Ouvrir dans un onglet</a>
        </div>
        <iframe class="cadre" src="/classique/" title="Studio Data — application complète"></iframe>
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            height: calc(100vh - 80px);
            margin: -20px;
        }
        .bandeau {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 20px;
            background: var(--surface);
            border-bottom: 1px solid var(--bordure);
            font-size: 12px;
        }
        .bandeau span {
            flex: 1;
        }
        .cadre {
            flex: 1;
            border: 0;
            width: 100%;
            background: #fff;
        }
    `
})
export class ClassiqueComponent {
    readonly session = inject(SessionService);
}
