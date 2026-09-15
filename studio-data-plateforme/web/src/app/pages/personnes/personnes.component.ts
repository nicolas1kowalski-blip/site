/**
 * Personnes, rôles et domaines métier — repris point pour point de la V13.
 *
 * C'est ici que se décide qui a le droit de quoi : chaque personne porte un ou plusieurs couples
 * « domaine métier → rôle ». Le propriétaire modifie et valide, le contributeur propose, le lecteur
 * consulte, l'administrateur passe partout. Le reste de l'application s'y réfère : c'est cette grille qui
 * fait que « à valider » veut dire quelque chose.
 *
 * Les domaines déclarés ici sont proposés partout (objets, sources, actifs, termes) ; ceux cités ailleurs
 * apparaissent aussi. Avant d'en retirer un, l'écran dit ce qu'il sert — combien de sources, d'objets, de
 * termes, d'applications et de rôles le citent.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../../coeur/client-api.service';
import { Actif, ObjetMetier, Personne, RolePersonne, Source, TermeGlossaire, genererIdentifiant } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { couleurDeResponsable, initialesDe } from '../../coeur/pastille-personne';
import { SessionService } from '../../coeur/session.service';
import {
    ALLURES_DE_ROLE,
    allureDeRole,
    correspondALIdentite,
    libelleDuRole,
    personnesDExempleAAjouter,
    phraseDeLUsage,
    resumeDesRoles,
    usageDunDomaine
} from './roles-personnes';

@Component({
    selector: 'app-personnes',
    imports: [FormsModule],
    template: `
        <div class="ecran-v13">
            <!-- Ce que les rôles veulent dire : la règle est écrite là où on la pose. -->
            <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
                <p class="text-sm text-slate-600 max-w-3xl">
                    Chaque personne a un ou plusieurs couples <b>domaine métier → rôle</b>. Le <b>propriétaire</b> modifie et valide ; le
                    <b>contributeur</b> propose ; le <b>lecteur</b> consulte ; l'<b>administrateur</b> décide sur tous les domaines. Le
                    <b>propriétaire nommé sur un objet</b> (champ « Propriétaire global ») valide aussi cet objet, quel que soit son rôle
                    sur le domaine. Toutes les décisions sont tracées.
                </p>
                @if (session.peutEditer()) {
                    <div class="flex gap-2">
                        <button
                            type="button"
                            name="exempleDeRoles"
                            class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg font-bold hover:bg-slate-50"
                            title="Crée quatre personnes d'exemple (propriétaire, contributeur, lectrice, administrateur) sur tous les domaines, sans modifier vos données"
                            (click)="poserLExempleDeRoles()"
                        >
                            Exemple de rôles
                        </button>
                        <button
                            type="button"
                            name="ajouterPersonne"
                            class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg"
                            (click)="ajouterPersonne()"
                        >
                            + Personne
                        </button>
                    </div>
                }
            </div>

            <!-- Les domaines métier, chacun avec ce qu'il sert : on ne supprime pas à l'aveugle. -->
            <div class="flex items-center gap-2 flex-wrap mb-4 bg-white border border-slate-200 rounded-xl p-3" name="domainesMetier">
                <span class="text-[10px] uppercase font-bold text-slate-500">Domaines métier</span>
                @for (domaine of domaines(); track domaine) {
                    @let usage = phraseDUsage(domaine);
                    <span
                        class="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-2.5 py-1 font-bold inline-flex items-center gap-1.5"
                        [title]="usage || 'non utilisé'"
                    >
                        {{ domaine }}
                        @if (usage) {
                            <span class="font-normal opacity-70">· {{ usage }}</span>
                        }
                        @if (session.peutEditer()) {
                            <button
                                type="button"
                                class="opacity-60 hover:opacity-100 hover:text-red-600"
                                title="Supprimer ce domaine de la liste déclarée"
                                (click)="retirerDomaine(domaine)"
                            >
                                ✕
                            </button>
                        }
                    </span>
                } @empty {
                    <span class="text-xs text-slate-400 italic">
                        aucun — ajoutez-en un, ou renseignez le domaine des sources, objets et applications
                    </span>
                }
                @if (session.peutEditer()) {
                    <input
                        type="text"
                        name="nouveauDomaine"
                        [(ngModel)]="nouveauDomaine"
                        (keydown.enter)="ajouterDomaine()"
                        placeholder="＋ nouveau domaine…"
                        class="border border-dashed border-emerald-300 rounded-full px-3 py-1 text-xs w-44"
                    />
                    <button
                        type="button"
                        name="ajouterDomaine"
                        class="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-full font-bold"
                        [disabled]="!nouveauDomaine.trim()"
                        (click)="ajouterDomaine()"
                    >
                        Ajouter
                    </button>
                }
            </div>

            @if (personnes().length) {
                @for (personne of personnes(); track personne.id; let index = $index) {
                    @let moi = estMoi(personne);
                    <div
                        class="rounded-xl p-4 mb-3 bg-white"
                        [class]="
                            moi
                                ? 'rounded-xl p-4 mb-3 bg-white border border-indigo-400 ring-2 ring-indigo-100'
                                : 'rounded-xl p-4 mb-3 bg-white border border-slate-200'
                        "
                        [attr.name]="'personne-' + index"
                    >
                        <div class="flex items-center gap-2 flex-wrap mb-2">
                            <span class="cat-oav" [style.background]="couleurDe(personne.name)">{{ initiales(personne.name) }}</span>
                            <input
                                type="text"
                                class="font-bold text-sm border border-slate-300 px-2.5 py-1.5 rounded-lg w-56 bg-white"
                                [(ngModel)]="personne.name"
                                [name]="'personne-nom-' + index"
                                [attr.name]="'personne-nom-' + index"
                                placeholder="Nom"
                                aria-label="Nom"
                                [disabled]="!session.peutEditer()"
                            />
                            <input
                                type="text"
                                class="text-xs border border-slate-200 px-2.5 py-1.5 rounded-lg w-56 bg-white"
                                [(ngModel)]="personne.email"
                                [name]="'personne-email-' + index"
                                [attr.name]="'personne-email-' + index"
                                placeholder="e-mail"
                                aria-label="E-mail"
                                [disabled]="!session.peutEditer()"
                            />
                            @if (moi) {
                                <span
                                    class="text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800 rounded-full px-2 py-0.5"
                                    name="profilActif"
                                >
                                    c'est vous
                                </span>
                            }
                            @if (session.peutEditer()) {
                                <button
                                    type="button"
                                    class="ml-auto text-red-500 hover:text-red-700 px-2 py-1 rounded-lg border border-red-200 bg-white text-xs font-bold"
                                    title="Supprimer"
                                    [attr.name]="'supprimerPersonne-' + index"
                                    (click)="supprimer(personne)"
                                >
                                    🗑
                                </button>
                            }
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[10px] uppercase font-bold text-slate-500 w-36">Domaines → rôles</span>
                            @for (role of personne.roles; track $index; let indexRole = $index) {
                                <span
                                    class="text-xs rounded-full px-2.5 py-1 font-bold inline-flex items-center gap-1.5"
                                    [class]="
                                        'text-xs rounded-full px-2.5 py-1 font-bold inline-flex items-center gap-1.5 ' +
                                        allureRole(role.role).classes
                                    "
                                >
                                    {{ libelleRole(role) }}
                                    @if (session.peutEditer()) {
                                        <button
                                            type="button"
                                            class="opacity-60 hover:opacity-100"
                                            title="Retirer"
                                            (click)="retirerRole(personne, indexRole)"
                                        >
                                            ✕
                                        </button>
                                    }
                                </span>
                            } @empty {
                                <span class="text-xs text-slate-400 italic">aucun rôle</span>
                            }
                            @if (session.peutEditer()) {
                                <select
                                    class="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
                                    [(ngModel)]="nouveauDomaineRole[personne.id]"
                                    [name]="'personne-domaine-' + index"
                                    [attr.name]="'personne-domaine-' + index"
                                >
                                    <option value="">tous domaines</option>
                                    @for (domaine of domaines(); track domaine) {
                                        <option [value]="domaine">{{ domaine }}</option>
                                    }
                                </select>
                                <select
                                    class="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
                                    [(ngModel)]="nouveauRole[personne.id]"
                                    [name]="'personne-role-' + index"
                                    [attr.name]="'personne-role-' + index"
                                >
                                    @for (role of rolesOfferts; track role.cle) {
                                        <option [value]="role.cle">{{ role.pictogramme }} {{ role.libelle }}</option>
                                    }
                                </select>
                                <button
                                    type="button"
                                    class="text-xs bg-white border border-slate-300 px-2.5 py-1 rounded-lg font-bold hover:bg-slate-50"
                                    [attr.name]="'ajouterRole-' + index"
                                    (click)="ajouterRole(personne)"
                                >
                                    + Rôle
                                </button>
                                <button
                                    type="button"
                                    class="ml-auto text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold"
                                    [attr.name]="'enregistrerPersonne-' + index"
                                    (click)="enregistrer(personne)"
                                >
                                    Enregistrer
                                </button>
                            }
                        </div>
                        @if (personne.roles.length) {
                            <div class="text-[11px] text-slate-500 mt-1.5" [attr.name]="'resumeDesRoles-' + index">
                                {{ resume(personne) }}
                            </div>
                        }
                    </div>
                }
            } @else {
                <div class="empty-v13" name="aucunePersonne">
                    <div class="text-[34px]">👥</div>
                    <div class="text-[14.5px] font-black text-slate-800 mt-2 mb-1">Aucune personne</div>
                    <p class="text-[12px] text-slate-500 max-w-[560px] mx-auto">
                        Créez les personnes de votre organisation et affectez-leur un rôle par domaine ; le propriétaire nommé sur un objet
                        valide cet objet. Un exemple de rôles peut aussi être créé pour essayer le circuit.
                    </p>
                    @if (session.peutEditer()) {
                        <button type="button" class="bouton principal mt-3" (click)="ajouterPersonne()">+ Personne</button>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        /* La pastille d'une personne, reprise telle quelle du classique. */
        .cat-oav {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            color: #fff;
            font-size: 9px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            vertical-align: middle;
        }
        /* L'écran vide : un pictogramme, ce qui se passe, et quoi faire. */
        .empty-v13 {
            text-align: center;
            background: #fff;
            border: 1px dashed #cbd5e1;
            border-radius: 12px;
            padding: 34px 20px;
        }
    `
})
export class PersonnesComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly personnes = signal<Personne[]>([]);
    readonly domaines = signal<string[]>([]);
    /** Ce qui cite les domaines : sources, objets, termes et applications, lus une fois au chargement. */
    private readonly sources = signal<Source[]>([]);
    private readonly objets = signal<ObjetMetier[]>([]);
    private readonly termes = signal<TermeGlossaire[]>([]);
    private readonly actifs = signal<Actif[]>([]);
    nouveauDomaine = '';
    nouveauRole: Record<string, RolePersonne> = {};
    nouveauDomaineRole: Record<string, string> = {};
    /** Les quatre rôles offerts, dans l'ordre du classique. */
    readonly rolesOfferts = (Object.keys(ALLURES_DE_ROLE) as RolePersonne[]).map(cle => ({ cle, ...ALLURES_DE_ROLE[cle] }));

    /** Rappels des fonctions pures utilisées par le gabarit. */
    readonly initiales = initialesDe;
    readonly couleurDe = couleurDeResponsable;
    readonly allureRole = allureDeRole;
    readonly libelleRole = libelleDuRole;
    readonly resume = resumeDesRoles;

    /** L'identité du compte connecté, sous la forme que la reconnaissance des personnes attend. */
    private readonly identite = computed(() => ({
        email: this.session.utilisateur()?.email || '',
        nom: this.session.utilisateur()?.nomAffiche || ''
    }));

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [personnes, domaines, sources, objets, termes, actifs] = await Promise.all([
                this.api.personnes(),
                this.api.domaines(),
                this.api.sources(),
                this.api.objetsMetier(),
                this.api.glossaire(),
                this.api.actifs()
            ]);
            this.personnes.set(personnes.map(personne => ({ ...personne, email: personne.email || '', roles: personne.roles || [] })));
            this.domaines.set(domaines);
            this.sources.set(sources);
            this.objets.set(objets);
            this.termes.set(termes);
            this.actifs.set(actifs);
            for (const personne of personnes) {
                this.nouveauRole[personne.id] = this.nouveauRole[personne.id] || 'contrib';
                this.nouveauDomaineRole[personne.id] = this.nouveauDomaineRole[personne.id] || '';
            }
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Ce qu'un domaine sert, en clair : c'est ce que l'on perdrait en le retirant. */
    phraseDUsage(domaine: string): string {
        return phraseDeLUsage(
            usageDunDomaine(domaine, {
                sources: this.sources().map(source => ({ domaine: source.theme })),
                objets: this.objets(),
                termes: this.termes(),
                actifs: this.actifs(),
                personnes: this.personnes()
            })
        );
    }

    /** Vrai pour la personne qui correspond au compte connecté : sa fiche est mise en avant. */
    estMoi(personne: Personne): boolean {
        return correspondALIdentite(personne, this.identite());
    }

    ajouterPersonne(): void {
        const personne: Personne = { id: genererIdentifiant('pe'), name: 'Nouvelle personne', email: '', roles: [] };
        this.nouveauRole[personne.id] = 'contrib';
        this.nouveauDomaineRole[personne.id] = '';
        this.personnes.update(liste => [...liste, personne]);
    }

    /**
     * Le jeu de rôles d'exemple : quatre personnes, une par rôle, sur tous les domaines. Rien des données
     * de l'espace n'est touché, et une personne déjà présente n'est jamais recréée.
     */
    async poserLExempleDeRoles(): Promise<void> {
        const aAjouter = personnesDExempleAAjouter(this.personnes());
        if (!aAjouter.length) return this.notifications.succes('Les quatre personnes d’exemple sont déjà là.');
        try {
            for (const exemple of aAjouter) {
                const personne: Personne = {
                    id: genererIdentifiant('pe'),
                    name: exemple.name,
                    email: exemple.email,
                    roles: [{ domain: '', role: exemple.role }]
                };
                const { id, ...corps } = personne;
                await this.api.enregistrerPersonne(id, corps);
            }
            await this.recharger();
            this.notifications.succes(
                `Exemple créé : ${aAjouter.map(exemple => exemple.name).join(', ')} — sur tous vos domaines, sans toucher à vos données. Renommez-les ou remplacez-les par les vôtres.`
            );
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    ajouterRole(personne: Personne): void {
        const role = this.nouveauRole[personne.id] || 'contrib';
        const domain = this.nouveauDomaineRole[personne.id] || '';
        if (!personne.roles.some(candidat => candidat.domain === domain && candidat.role === role)) personne.roles.push({ domain, role });
    }

    retirerRole(personne: Personne, rang: number): void {
        personne.roles.splice(rang, 1);
    }

    async enregistrer(personne: Personne): Promise<void> {
        try {
            const { id, ...corps } = personne;
            await this.api.enregistrerPersonne(id, corps);
            this.notifications.succes(`« ${personne.name} » enregistré(e).`);
            this.domaines.set(await this.api.domaines());
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async supprimer(personne: Personne): Promise<void> {
        if (!confirm(`Supprimer « ${personne.name} » ?`)) return;
        try {
            await this.api.supprimerPersonne(personne.id);
        } catch {
            // Personne jamais enregistrée : rien côté serveur.
        }
        this.personnes.update(liste => liste.filter(candidat => candidat.id !== personne.id));
    }

    async ajouterDomaine(): Promise<void> {
        const nom = this.nouveauDomaine.trim();
        if (!nom) return;
        try {
            this.domaines.set(await this.api.ajouterDomaine(nom));
            this.nouveauDomaine = '';
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async retirerDomaine(nom: string): Promise<void> {
        try {
            this.domaines.set(await this.api.retirerDomaine(nom));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
