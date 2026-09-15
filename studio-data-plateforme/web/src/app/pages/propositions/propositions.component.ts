/**
 * Propositions à valider : les modifications proposées par les membres (définition, propriétaire, description…)
 * sont listées ici, regroupées par domaine ; un éditeur les accepte (la valeur est appliquée) ou les refuse ;
 * l'auteur peut retirer la sienne. Les décisions passées restent consultables.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ClientApiService } from '../../coeur/client-api.service';
import { Actif, ObjetMetier, Personne, Proposition, TermeGlossaire, formaterDate } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { Router } from '@angular/router';
import { correspondALIdentite, resumeDesRoles } from '../personnes/roles-personnes';
import { SessionService } from '../../coeur/session.service';
import {
    DECISIONS_MONTREES,
    GroupeDePropositions,
    VUES_DES_PROPOSITIONS,
    VueDesPropositions,
    decidablesDuGroupe,
    etatDuToutValider,
    grouperParDomaine,
    lienVersLaCible,
    peutDecider,
    pouvoirDeDecider,
    propositionsDeLaVue,
    regrouperLesPropositions,
    valeurLisible
} from './groupes-propositions';

@Component({
    selector: 'app-propositions',
    template: `
        <div class="ecran-v13">
            <!-- Les deux façons de regarder la file : ce qui m'attend, et ce que j'ai proposé. -->
            <div class="flex items-center gap-2 flex-wrap mb-4">
                <div class="seg-ux" role="group" aria-label="Vue des propositions">
                    @for (choix of vues; track choix.cle) {
                        <button
                            type="button"
                            [attr.name]="'vue-' + choix.cle"
                            [class.on]="vue() === choix.cle"
                            (click)="vue.set(choix.cle)"
                        >
                            {{ choix.libelle }}
                            @if (compteDeLaVue(choix.cle); as compte) {
                                ({{ compte }})
                            }
                        </button>
                    }
                </div>
                @if (vue() === 'aValider') {
                    <label class="text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1 cursor-pointer">
                        <input
                            type="checkbox"
                            name="mesDomainesSeulement"
                            [checked]="mesDomainesSeulement()"
                            (change)="basculerMesDomaines()"
                        />
                        mes domaines seulement
                    </label>
                }
                <span class="flex-grow"></span>
                <span class="text-[11px] text-slate-500" name="quiJeSuis">{{ quiJeSuis() }}</span>
            </div>

            @if (parDomaine().length) {
                @for (rangee of parDomaine(); track rangee.domaine) {
                    <div class="mb-4">
                        <div class="text-[10px] uppercase font-bold tracking-wider text-emerald-700 mb-2">Domaine {{ rangee.domaine }}</div>
                        @for (groupe of rangee.groupes; track groupe.cle) {
                            <div class="border border-slate-200 rounded-xl bg-white mb-3 overflow-hidden">
                                <div class="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                                    @if (lienCible(groupe.cle); as lien) {
                                        <button
                                            type="button"
                                            class="font-black text-sm text-slate-800 hover:underline"
                                            title="Ouvrir la fiche"
                                            name="titreDuGroupe"
                                            (click)="ouvrirLaCible(lien)"
                                        >
                                            {{ groupe.libelle }}
                                        </button>
                                    } @else {
                                        <span class="font-black text-sm text-slate-800" name="titreDuGroupe">{{ groupe.libelle }}</span>
                                    }
                                    <span class="text-[11px] text-slate-500">{{ groupe.propositions.length }} proposition(s)</span>
                                    <span class="flex-grow"></span>
                                    @if (session.peutEditer() && groupe.propositions.length > 1) {
                                        @let tout = etatDuToutValider(groupe);
                                        <button
                                            type="button"
                                            class="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold disabled:opacity-40"
                                            [attr.name]="'toutValider-' + groupe.cle"
                                            [disabled]="!tout.possible || enCours()"
                                            [title]="tout.raison"
                                            (click)="toutValider(groupe)"
                                        >
                                            {{ tout.libelle }} pour cette fiche
                                        </button>
                                    }
                                </div>
                                @for (proposition of groupe.propositions; track proposition.id) {
                                    <div
                                        class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-50 last:border-b-0"
                                        name="propositionEnAttente"
                                    >
                                        <div class="min-w-0 flex-1">
                                            <div class="text-[12.5px] font-semibold text-slate-800">{{ proposition.label }}</div>
                                            <div class="prop-diff">
                                                <span class="avant" title="Valeur en vigueur">{{ lisible(proposition.before) }}</span>
                                                <span class="fleche">→</span>
                                                <span class="apres" title="Valeur proposée">{{ lisible(proposition.after) }}</span>
                                            </div>
                                            <div class="text-[10.5px] text-slate-500 mt-0.5">
                                                par {{ proposition.byName || proposition.by }} · {{ formaterDate(proposition.at) }}
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-1.5 shrink-0">
                                            @if (session.peutEditer() && peutDecider(proposition)) {
                                                <button
                                                    type="button"
                                                    class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold"
                                                    name="validerProposition"
                                                    (click)="accepter(proposition)"
                                                >
                                                    ✓ Valider
                                                </button>
                                                <button
                                                    type="button"
                                                    class="text-xs bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50"
                                                    name="refuserProposition"
                                                    (click)="refuser(proposition)"
                                                >
                                                    ✕ Refuser
                                                </button>
                                            } @else if (estDeMoi(proposition)) {
                                                <button
                                                    type="button"
                                                    class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg font-bold"
                                                    name="retirerProposition"
                                                    (click)="retirer(proposition)"
                                                >
                                                    Retirer
                                                </button>
                                            } @else {
                                                <span class="text-[11px] text-slate-400 italic">
                                                    en attente du responsable de « {{ proposition.domain || 'sans domaine' }} »
                                                </span>
                                            }
                                            @if (lienCible(groupe.cle); as lien) {
                                                <button
                                                    type="button"
                                                    name="voirEnContexte"
                                                    class="text-xs text-indigo-700 font-bold px-2 py-1.5 hover:underline"
                                                    title="Voir en contexte"
                                                    (click)="ouvrirLaCible(lien)"
                                                >
                                                    Voir ›
                                                </button>
                                            }
                                        </div>
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            } @else {
                <div class="empty-v13" name="rienAValider">
                    <div class="text-[34px]">🎉</div>
                    <div class="text-[14.5px] font-black text-slate-800 mt-2 mb-1">
                        {{ vue() === 'parMoi' ? 'Aucune proposition en attente de votre part' : 'Rien à valider' }}
                    </div>
                    <p class="text-[12px] text-slate-500 max-w-[560px] mx-auto">
                        {{
                            vue() === 'parMoi'
                                ? 'Modifiez une définition, un exemple ou une confidentialité sur une fiche de votre domaine : votre proposition apparaîtra ici.'
                                : 'Aucune proposition en attente dans vos domaines. Les contributeurs verront leurs modifications arriver ici.'
                        }}
                    </p>
                </div>
            }

            <!-- Les décisions passées, repliées : elles se consultent, elles n'encombrent pas. -->
            @if (decidees().length) {
                <details class="border border-slate-200 rounded-xl bg-white mt-2" name="decisionsPassees">
                    <summary class="cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-slate-600">
                        🗂 Décisions passées ({{ decidees().length }})
                    </summary>
                    <div class="px-4 pb-3">
                        @for (proposition of decidees().slice(0, decisionsMontrees); track proposition.id) {
                            <div class="flex items-center gap-2 py-1.5 border-b border-slate-50 text-[12px]">
                                <span
                                    class="font-bold w-16 shrink-0"
                                    [class]="
                                        proposition.status === 'accepted'
                                            ? 'font-bold w-16 shrink-0 text-emerald-700'
                                            : 'font-bold w-16 shrink-0 text-red-600'
                                    "
                                >
                                    {{ proposition.status === 'accepted' ? '✓ validée' : '✕ refusée' }}
                                </span>
                                <span class="flex-1 min-w-0 truncate">
                                    {{ proposition.label }}
                                    <span class="text-slate-400"
                                        >— {{ lisible(proposition.before) }} → {{ lisible(proposition.after) }}</span
                                    >
                                </span>
                                <span class="text-[10.5px] text-slate-500 whitespace-nowrap">
                                    par {{ proposition.decidedBy }} · {{ formaterDate(proposition.decidedAt) }}
                                    @if (proposition.comment) {
                                        · {{ proposition.comment }}
                                    }
                                </span>
                            </div>
                        }
                    </div>
                </details>
            }
        </div>
    `,
    styles: `
        /* La bascule à deux positions, reprise du classique. */
        .seg-ux {
            display: inline-flex;
            background: #fff;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            overflow: hidden;
        }
        .seg-ux button {
            padding: 5px 10px;
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
            background: none;
            border: none;
            cursor: pointer;
        }
        .seg-ux button.on {
            background: #0f172a;
            color: #fff;
        }
        /* La valeur en vigueur, la flèche, la valeur proposée. */
        .prop-diff {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            flex-wrap: wrap;
        }
        .prop-diff .avant {
            color: #94a3b8;
            text-decoration: line-through;
        }
        .prop-diff .fleche {
            color: #cbd5e1;
        }
        .prop-diff .apres {
            color: #065f46;
            font-weight: 700;
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
export class PropositionsComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    readonly session = inject(SessionService);
    readonly formaterDate = formaterDate;
    readonly propositions = signal<Proposition[]>([]);
    readonly enAttente = computed(() => this.propositions().filter(proposition => proposition.status === 'pending'));
    readonly decidees = computed(() => this.propositions().filter(proposition => proposition.status !== 'pending'));
    readonly personnes = signal<Personne[]>([]);
    readonly enCours = signal(false);
    /** Les noms réels des cibles : une proposition doit se lire sans jamais montrer d'identifiant interne. */
    readonly nomsConnus = signal<Record<string, string>>({});

    /** La vue en cours : ce qui m'attend, ou ce que j'ai proposé. */
    readonly vue = signal<VueDesPropositions>('aValider');
    /** Vrai pour ne montrer que les domaines dont on répond — le réglage par défaut du classique. */
    readonly mesDomainesSeulement = signal(true);
    readonly vues = VUES_DES_PROPOSITIONS;
    readonly decisionsMontrees = DECISIONS_MONTREES;
    readonly lisible = valeurLisible;
    readonly lienCible = lienVersLaCible;
    private readonly routeur = inject(Router);

    /** Les propositions que la vue en cours retient, regroupées par cible puis rangées par domaine. */
    readonly parCible = computed(() =>
        regrouperLesPropositions(
            propositionsDeLaVue(
                this.enAttente(),
                this.vue(),
                this.pouvoir(),
                this.session.utilisateur()?.identifiant || '',
                this.mesDomainesSeulement()
            ),
            this.nomsConnus()
        )
    );
    readonly parDomaine = computed(() => grouperParDomaine(this.parCible()));
    /** Ce que la personne connectée a le droit de trancher : ses domaines, ou tout si elle administre. */
    readonly pouvoir = computed(() =>
        pouvoirDeDecider(
            this.personnes(),
            { email: this.session.utilisateur()?.email || '', nom: this.session.utilisateur()?.nomAffiche || '' },
            this.session.estAdministrateurGlobal(),
            correspondALIdentite
        )
    );

    constructor() {
        void this.recharger();
    }

    async recharger(): Promise<void> {
        try {
            const [propositions, personnes, objets, termes, actifs] = await Promise.all([
                this.api.propositions(),
                this.api.personnes(),
                this.api.objetsMetier(),
                this.api.glossaire(),
                this.api.actifs()
            ]);
            this.propositions.set(propositions);
            this.personnes.set(personnes);
            this.nomsConnus.set(this.nommerLesCibles(objets, termes, actifs));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Un identifiant ne dit rien à personne : on garde, pour chacun, le nom sous lequel on le connaît. */
    private nommerLesCibles(objets: ObjetMetier[], termes: TermeGlossaire[], actifs: Actif[]): Record<string, string> {
        const noms: Record<string, string> = {};
        for (const objet of objets) noms[objet.id] = objet.name;
        for (const terme of termes) noms[terme.id] = terme.term;
        for (const actif of actifs) noms[actif.id] = actif.name;
        return noms;
    }

    /** Combien de propositions chaque vue montrerait : le compteur de l'onglet. */
    compteDeLaVue(vue: VueDesPropositions): number {
        return propositionsDeLaVue(
            this.enAttente(),
            vue,
            this.pouvoir(),
            this.session.utilisateur()?.identifiant || '',
            this.mesDomainesSeulement()
        ).length;
    }

    basculerMesDomaines(): void {
        this.mesDomainesSeulement.update(actif => !actif);
    }

    /**
     * Qui l'on est, et ce que l'on peut trancher : sans cette phrase, une file vide laisse croire à une
     * panne alors qu'on n'a simplement aucun domaine à valider.
     */
    quiJeSuis(): string {
        const utilisateur = this.session.utilisateur();
        if (!utilisateur) return 'Aucun profil actif.';
        const moi = this.personnes().find(personne =>
            correspondALIdentite(personne, { email: utilisateur.email || '', nom: utilisateur.nomAffiche || '' })
        );
        const nom = utilisateur.nomAffiche || utilisateur.identifiant;
        if (this.session.estAdministrateurGlobal()) return `Vous êtes ${nom} — administrateur : vous décidez sur tous les domaines.`;
        const roles = moi ? resumeDesRoles(moi) : '';
        return roles
            ? `Vous êtes ${nom} — ${roles}`
            : `Vous êtes ${nom} — aucun rôle déclaré dans la gouvernance : déclarez-vous dans « Personnes & rôles ».`;
    }

    /** Vrai quand la proposition vient de soi : on peut alors la retirer. */
    estDeMoi(proposition: Proposition): boolean {
        const identifiant = this.session.utilisateur()?.identifiant || '';
        return !!identifiant && proposition.by === identifiant;
    }

    /** Ouvre la fiche visée, sur l'écran qui la porte : on ne décide pas sans avoir vu le contexte. */
    ouvrirLaCible(lien: string): void {
        void this.routeur.navigateByUrl(lien);
    }

    peutDecider(proposition: Proposition): boolean {
        return peutDecider(proposition, this.pouvoir());
    }

    etatDuToutValider(groupe: GroupeDePropositions): { possible: boolean; libelle: string; raison: string } {
        return etatDuToutValider(groupe, this.pouvoir());
    }

    /**
     * Valide d'un geste toutes les propositions du groupe que l'on a le droit de trancher. Une par une
     * côté serveur : chacune applique sa valeur, et un refus isolé n'emporte pas les autres.
     */
    async toutValider(groupe: GroupeDePropositions): Promise<void> {
        const aValider = decidablesDuGroupe(groupe, this.pouvoir());
        if (!aValider.length) return;
        this.enCours.set(true);
        let validees = 0;
        try {
            for (const proposition of aValider) {
                await this.api.accepterProposition(proposition.id);
                validees++;
            }
            this.notifications.succes(`${validees} proposition(s) validées et appliquées sur « ${groupe.libelle} ».`);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
            await this.recharger();
        }
    }

    async accepter(proposition: Proposition): Promise<void> {
        try {
            await this.api.accepterProposition(proposition.id);
            this.notifications.succes('Proposition validée et appliquée.');
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async refuser(proposition: Proposition): Promise<void> {
        const motif = prompt('Motif du refus (facultatif) :') ?? '';
        try {
            await this.api.refuserProposition(proposition.id, motif);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async retirer(proposition: Proposition): Promise<void> {
        try {
            await this.api.retirerProposition(proposition.id);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
