/** Glossaire métier : liste des termes, recherche, création et modification en place, suppression. */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { TermeGlossaire, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-glossaire',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Glossaire</h1>
                <p class="discret">{{ termes().length }} terme(s) — partagé avec l'application complète</p>
            </div>
            <input
                class="champ recherche"
                placeholder="Rechercher un terme…"
                [(ngModel)]="recherche"
                (ngModelChange)="recherche$.set($event)"
            />
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="nouveau()">Nouveau terme</button>
            }
        </div>
        @if (brouillon(); as brouillon) {
            <form class="carte" (ngSubmit)="enregistrer()">
                <h2>{{ brouillon.nouveau ? 'Nouveau terme' : 'Modifier « ' + brouillon.terme.term + ' »' }}</h2>
                <div class="formulaire-ligne">
                    <div>
                        <label class="etiquette">Terme</label
                        ><input class="champ" name="term" [(ngModel)]="brouillon.terme.term" required />
                    </div>
                    <div>
                        <label class="etiquette">Domaine</label><input class="champ" name="domain" [(ngModel)]="brouillon.terme.domain" />
                    </div>
                    <div>
                        <label class="etiquette">Responsable</label><input class="champ" name="owner" [(ngModel)]="brouillon.terme.owner" />
                    </div>
                </div>
                <label class="etiquette" style="margin-top: 8px">Définition</label>
                <textarea class="champ" name="definition" [(ngModel)]="brouillon.terme.definition" style="font-family: inherit"></textarea>
                <label class="etiquette" style="margin-top: 8px">Synonymes</label>
                <input class="champ" name="synonyms" [(ngModel)]="brouillon.terme.synonyms" />
                <div class="formulaire-ligne" style="margin-top: 10px">
                    <button class="bouton principal" type="submit" style="flex: 0">Enregistrer</button>
                    <button class="bouton" type="button" style="flex: 0" (click)="brouillon$.set(null)">Annuler</button>
                </div>
            </form>
        }
        <div class="carte">
            @if (filtres().length === 0) {
                <div class="vide">Aucun terme{{ recherche ? ' pour « ' + recherche + ' »' : '' }}.</div>
            } @else {
                <table class="tableau">
                    <thead>
                        <tr>
                            <th>Terme</th>
                            <th>Définition</th>
                            <th>Domaine</th>
                            <th>Responsable</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (terme of filtres(); track terme.id) {
                            <tr>
                                <td>
                                    <b>{{ terme.term }}</b>
                                    @if (terme.synonyms) {
                                        <div class="discret">syn. {{ terme.synonyms }}</div>
                                    }
                                </td>
                                <td>{{ terme.definition }}</td>
                                <td>{{ terme.domain || '—' }}</td>
                                <td>{{ terme.owner || '—' }}</td>
                                <td style="white-space: nowrap">
                                    @if (session.peutEditer()) {
                                        <button class="bouton petit" (click)="modifier(terme)">Modifier</button>
                                        <button class="bouton petit danger" (click)="supprimer(terme)">Supprimer</button>
                                    }
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            }
        </div>
    `,
    styles: `
        .recherche {
            width: 260px;
        }
    `
})
export class GlossaireComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly termes = signal<TermeGlossaire[]>([]);
    recherche = '';
    readonly recherche$ = signal('');
    readonly filtres = computed(() => {
        const texte = this.recherche$().trim().toLowerCase();
        if (!texte) return this.termes();
        return this.termes().filter(terme =>
            [terme.term, terme.definition, terme.domain, terme.synonyms].some(champ => (champ || '').toLowerCase().includes(texte))
        );
    });
    readonly brouillon$ = signal<{ nouveau: boolean; terme: TermeGlossaire } | null>(null);
    readonly brouillon = this.brouillon$;

    constructor() {
        this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            this.termes.set(await this.api.glossaire());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    nouveau(): void {
        this.brouillon$.set({
            nouveau: true,
            terme: { id: genererIdentifiant('gl_'), term: '', definition: '', domain: '', synonyms: '', owner: '' }
        });
    }

    modifier(terme: TermeGlossaire): void {
        this.brouillon$.set({ nouveau: false, terme: { ...terme } });
    }

    async enregistrer(): Promise<void> {
        const brouillon = this.brouillon$();
        if (!brouillon || !brouillon.terme.term.trim()) return;
        try {
            const { id, ...champs } = brouillon.terme;
            await this.api.enregistrerTerme(id, champs);
            this.notifications.succes(`Terme « ${brouillon.terme.term} » enregistré.`);
            this.brouillon$.set(null);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(terme: TermeGlossaire): Promise<void> {
        if (!confirm(`Supprimer le terme « ${terme.term} » ?`)) return;
        try {
            await this.api.supprimerTerme(terme.id);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
