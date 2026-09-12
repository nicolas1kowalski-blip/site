/** Périmètres métier : regrouper les tables et les objets métier par domaine (servent aussi de filtre à l'export). */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { ObjetMetier, Perimetre, Source, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-perimetres',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Périmètres</h1>
                <p class="discret">Regroupez vos tables et vos objets métier par domaine.</p>
            </div>
            @if (session.peutEditer()) {
                <button class="bouton principal" (click)="ajouter()">Nouveau périmètre</button>
            }
        </div>
        @if (!perimetres().length) {
            <div class="carte discret" style="text-align: center; padding: 40px">Aucun périmètre défini.</div>
        }
        <div class="grille">
            @for (perimetre of perimetres(); track perimetre.id; let index = $index) {
                <div class="carte">
                    <div class="formulaire-ligne">
                        <input
                            class="champ"
                            [(ngModel)]="perimetre.name"
                            [name]="'perimetre-nom-' + index"
                            [attr.name]="'perimetre-nom-' + index"
                            placeholder="Nom du périmètre"
                            [disabled]="!session.peutEditer()"
                        />
                        @if (session.peutEditer()) {
                            <button class="bouton petit danger" (click)="supprimer(perimetre)" style="flex: 0 0 auto">✕</button>
                        }
                    </div>
                    <input
                        class="champ"
                        style="margin-top: 6px"
                        [(ngModel)]="perimetre.description"
                        [name]="'perimetre-description-' + index"
                        [attr.name]="'perimetre-description-' + index"
                        placeholder="Description du domaine…"
                        [disabled]="!session.peutEditer()"
                    />
                    <label class="etiquette" style="margin-top: 8px">Tables techniques ({{ perimetre.tables.length }})</label>
                    <div class="cases">
                        @for (source of sources(); track source.id) {
                            <label class="case"
                                ><input
                                    type="checkbox"
                                    [checked]="perimetre.tables.includes(source.name)"
                                    (change)="basculer(perimetre.tables, source.name)"
                                    [disabled]="!session.peutEditer()"
                                />
                                {{ source.name }}</label
                            >
                        } @empty {
                            <span class="discret">Aucune source chargée.</span>
                        }
                    </div>
                    <label class="etiquette" style="margin-top: 8px">Objets métier ({{ perimetre.boIds.length }})</label>
                    <div class="cases">
                        @for (objet of objets(); track objet.id) {
                            <label class="case"
                                ><input
                                    type="checkbox"
                                    [checked]="perimetre.boIds.includes(objet.id)"
                                    (change)="basculer(perimetre.boIds, objet.id)"
                                    [disabled]="!session.peutEditer()"
                                />
                                {{ objet.name }}</label
                            >
                        } @empty {
                            <span class="discret">Aucun objet métier.</span>
                        }
                    </div>
                    @if (session.peutEditer()) {
                        <button class="bouton principal petit" style="margin-top: 10px" (click)="enregistrer(perimetre)">
                            Enregistrer
                        </button>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .cases {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 14px;
        }
        .case {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }
    `
})
export class PerimetresComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly perimetres = signal<Perimetre[]>([]);
    readonly sources = signal<Source[]>([]);
    readonly objets = signal<ObjetMetier[]>([]);

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [perimetres, sources, objets] = await Promise.all([this.api.perimetres(), this.api.sources(), this.api.objetsMetier()]);
            this.perimetres.set(
                perimetres.map(perimetre => ({
                    ...perimetre,
                    description: perimetre.description || '',
                    tables: perimetre.tables || [],
                    boIds: perimetre.boIds || []
                }))
            );
            this.sources.set(sources);
            this.objets.set(objets);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ajouter(): void {
        this.perimetres.update(liste => [
            ...liste,
            { id: genererIdentifiant('pe'), name: 'Nouveau périmètre', description: '', tables: [], boIds: [] }
        ]);
    }

    basculer(liste: string[], valeur: string): void {
        const position = liste.indexOf(valeur);
        if (position >= 0) liste.splice(position, 1);
        else liste.push(valeur);
    }

    async enregistrer(perimetre: Perimetre): Promise<void> {
        try {
            const { id, ...corps } = perimetre;
            await this.api.enregistrerPerimetre(id, corps);
            this.notifications.succes(`Périmètre « ${perimetre.name} » enregistré.`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(perimetre: Perimetre): Promise<void> {
        if (!confirm(`Supprimer le périmètre « ${perimetre.name} » ?`)) return;
        try {
            await this.api.supprimerPerimetre(perimetre.id);
        } catch {
            // Un périmètre jamais enregistré n'existe pas côté serveur : on le retire simplement de l'écran.
        }
        this.perimetres.update(liste => liste.filter(candidat => candidat.id !== perimetre.id));
    }
}
