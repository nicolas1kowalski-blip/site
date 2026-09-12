/** Page de connexion : identifiant + mot de passe, message d'erreur de l'API affiché tel quel. */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../coeur/session.service';

@Component({
    selector: 'app-connexion',
    imports: [FormsModule],
    template: `
        <div class="page-connexion">
            <form class="carte formulaire" (ngSubmit)="connecter()">
                <div class="logo">SD</div>
                <h1>Studio Data</h1>
                <p class="discret">Gouvernance, qualité et exploitation des données</p>
                <label class="etiquette" for="identifiant">Identifiant</label>
                <input
                    id="identifiant"
                    class="champ"
                    name="identifiant"
                    [(ngModel)]="identifiant"
                    autocomplete="username"
                    autofocus
                    required
                />
                <label class="etiquette" for="motDePasse">Mot de passe</label>
                <input
                    id="motDePasse"
                    class="champ"
                    type="password"
                    name="motDePasse"
                    [(ngModel)]="motDePasse"
                    autocomplete="current-password"
                    required
                />
                @if (erreur()) {
                    <p class="erreur" role="alert">{{ erreur() }}</p>
                }
                <button class="bouton principal" type="submit" [disabled]="enCours()">
                    {{ enCours() ? 'Connexion…' : 'Se connecter' }}
                </button>
            </form>
        </div>
    `,
    styles: `
        .page-connexion {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 20px;
        }
        .formulaire {
            width: 100%;
            max-width: 380px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .logo {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            background: var(--accent);
            color: #fff;
            font-weight: 800;
            display: grid;
            place-items: center;
            margin-bottom: 6px;
        }
        .erreur {
            color: var(--erreur);
            font-weight: 600;
        }
        button {
            margin-top: 8px;
            justify-content: center;
        }
    `
})
export class ConnexionComponent {
    private readonly session = inject(SessionService);
    private readonly routeur = inject(Router);

    identifiant = '';
    motDePasse = '';
    readonly erreur = signal('');
    readonly enCours = signal(false);

    async connecter(): Promise<void> {
        this.erreur.set('');
        this.enCours.set(true);
        try {
            await this.session.connecter(this.identifiant, this.motDePasse);
            await this.routeur.navigate(['/']);
        } catch (erreur) {
            this.erreur.set((erreur as Error).message);
        } finally {
            this.enCours.set(false);
        }
    }
}
