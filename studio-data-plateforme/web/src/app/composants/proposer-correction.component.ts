/**
 * « 💬 Proposer une correction » — repris de la V13 de l'application classique.
 *
 * Contribuer sans risque : n'importe qui peut signaler qu'une définition est fausse, vague ou datée, et
 * écrire celle qu'il croit juste. Rien n'est modifié tant que le responsable n'a pas validé — la proposition
 * part dans « À valider ». C'est ce qui permet d'ouvrir la gouvernance à ceux qui connaissent la donnée sans
 * avoir les droits de la modifier.
 *
 * Le bouton se pose sur n'importe quelle fiche : objet métier, mot du glossaire, application ou restitution.
 */
import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../coeur/client-api.service';
import { GenreProposition } from '../coeur/modeles';
import { NotificationsService } from '../coeur/notifications.service';

@Component({
    selector: 'app-proposer-correction',
    imports: [FormsModule],
    template: `
        @if (!ouvert()) {
            <button
                class="bouton petit"
                type="button"
                name="proposerCorrection"
                title="Signaler une erreur ou proposer une meilleure formulation ; le responsable valide"
                (click)="ouvrir()"
            >
                💬 Proposer une correction
            </button>
        } @else {
            <div class="correction">
                <b>💬 Proposer une correction sur « {{ sujet() }} »</b>
                <p class="discret">
                    Écrivez ce qui ne va pas ou la bonne formulation : rien n'est modifié tant que le responsable n'a pas validé.
                </p>
                <label class="etiquette">{{ libelleChamp() }} actuelle</label>
                <div class="actuelle discret">{{ valeurActuelle() || '(vide)' }}</div>
                <label class="etiquette">Votre proposition</label>
                <textarea
                    class="champ"
                    name="correctionProposee"
                    rows="3"
                    [(ngModel)]="texte"
                    placeholder="ex. La définition est trop vague : un client est une personne ou une société ayant au moins un contrat en cours."
                ></textarea>
                <div class="ligne-champs">
                    <button class="bouton petit" type="button" name="annulerCorrection" (click)="ouvert.set(false)">Annuler</button>
                    <button
                        class="bouton petit principal"
                        type="button"
                        name="envoyerCorrection"
                        [disabled]="enCours()"
                        (click)="envoyer()"
                    >
                        Envoyer au responsable
                    </button>
                </div>
            </div>
        }
    `,
    styles: `
        .correction {
            display: grid;
            gap: 6px;
            border: 1px solid var(--bordure);
            border-radius: 10px;
            padding: 10px;
            margin-top: 8px;
        }
        .correction p {
            margin: 0;
        }
        .actuelle {
            font-style: italic;
        }
    `
})
export class ProposerCorrectionComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    /** Ce sur quoi porte la correction : objet métier, mot du glossaire, application ou restitution. */
    readonly genre = input.required<GenreProposition>();
    /** Ce qui désigne l'élément côté serveur ({ boId } pour un objet, { termId } pour un mot…). */
    readonly cible = input.required<Record<string, string>>();
    /** Le nom montré dans la proposition, pour que le responsable sache de quoi il s'agit. */
    readonly sujet = input('');
    /** Le champ corrigé — « definition » partout, « description » pour une application. */
    readonly champ = input('definition');
    readonly valeurActuelle = input('');
    /** Domaine de l'élément : il dirige la proposition vers le bon responsable. */
    readonly domaine = input('');

    readonly ouvert = signal(false);
    readonly enCours = signal(false);
    texte = '';

    libelleChamp(): string {
        return this.champ() === 'description' ? 'Description' : 'Définition';
    }
    ouvrir(): void {
        this.texte = this.valeurActuelle();
        this.ouvert.set(true);
    }

    async envoyer(): Promise<void> {
        const proposition = this.texte.trim();
        if (!proposition) {
            this.notifications.erreur('Écrivez votre proposition.');
            return;
        }
        this.enCours.set(true);
        try {
            await this.api.proposer({
                kind: this.genre(),
                field: this.champ(),
                target: this.cible(),
                label: `Correction proposée sur « ${this.sujet()} »`,
                before: this.valeurActuelle(),
                after: proposition,
                domain: this.domaine()
            });
            this.ouvert.set(false);
            this.notifications.succes('Proposition envoyée : le responsable la validera avant toute modification.');
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
