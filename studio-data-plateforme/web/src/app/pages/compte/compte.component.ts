/** Mon compte : identité, espaces accessibles et changement de mot de passe. */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-compte',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace"><h1>Mon compte</h1></div>
        </div>
        <div class="grille">
            <div class="carte">
                <h2>{{ session.utilisateur()?.nomAffiche }}</h2>
                <p>
                    <code>{{ session.utilisateur()?.identifiant }}</code> · {{ session.utilisateur()?.email || 'sans courriel' }} ·
                    <span class="badge">{{ session.utilisateur()?.roleGlobal }}</span>
                </p>
                <h3 style="margin-top: 12px">Mes espaces</h3>
                <ul>
                    @for (espace of session.espaces(); track espace.code) {
                        <li>
                            {{ espace.nom }} <span class="discret">({{ espace.role }})</span>
                        </li>
                    } @empty {
                        <li class="discret">Aucun espace.</li>
                    }
                </ul>
            </div>
            <form class="carte" (ngSubmit)="changer()">
                <h2>Changer de mot de passe</h2>
                <label class="etiquette">Ancien mot de passe</label>
                <input class="champ" type="password" name="ancien" [(ngModel)]="ancien" autocomplete="current-password" required />
                <label class="etiquette" style="margin-top: 8px">Nouveau (8 caractères minimum)</label>
                <input
                    class="champ"
                    type="password"
                    name="nouveau"
                    [(ngModel)]="nouveau"
                    autocomplete="new-password"
                    required
                    minlength="8"
                />
                <label class="etiquette" style="margin-top: 8px">Confirmation</label>
                <input class="champ" type="password" name="confirmation" [(ngModel)]="confirmation" autocomplete="new-password" required />
                <button class="bouton principal" type="submit" style="margin-top: 12px" [disabled]="enCours()">Enregistrer</button>
            </form>
        </div>
    `
})
export class CompteComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    ancien = '';
    nouveau = '';
    confirmation = '';
    readonly enCours = signal(false);

    async changer(): Promise<void> {
        if (this.nouveau !== this.confirmation) {
            this.notifications.erreur('La confirmation ne correspond pas au nouveau mot de passe.');
            return;
        }
        this.enCours.set(true);
        try {
            await this.api.changerMotDePasse(this.ancien, this.nouveau);
            this.notifications.succes('Mot de passe changé.');
            this.ancien = this.nouveau = this.confirmation = '';
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }
}
