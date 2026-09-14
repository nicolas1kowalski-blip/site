/**
 * L'accueil de la gouvernance — repris de la V13 de l'application classique.
 *
 * Quatre choses, dans cet ordre, parce que c'est l'ordre dans lequel on s'en sert :
 *   • **Posez votre question** en français : « qui est responsable de l'adresse client ? », « où va la
 *     prime ? », « qu'est-ce qu'un sinistre ? ». La réponse tient en une carte, avec la fiche à un clic ;
 *   • **Mon domaine** : ne voir que ce qui vous concerne ;
 *   • **Mes tâches** : ce qu'il reste à décrire, et rien d'autre — une liste vide est une bonne nouvelle ;
 *   • **Les mots du métier** : le glossaire, avec « voir les données concernées ».
 *
 * Quand rien n'est encore décrit, l'écran ne montre que trois boutons : décrire un objet, chercher, voir qui
 * utilise quoi. Une page d'accueil pleine de compteurs à zéro n'aide personne.
 *
 * Reconnaître de quoi parle une question est fait par ./question-gouvernance.ts (fonctions pures, testées).
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { Actif, ObjetMetier, TermeGlossaire } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { PreferencesService } from '../../coeur/preferences.service';
import { EntiteGouvernance, chercherEntites, entitesGouvernance, intentionDe, tachesDe } from './question-gouvernance';

/** Mots du glossaire montrés sur l'accueil : les premiers suffisent, le reste est à un clic. */
const MOTS_MONTRES = 8;
/** Autres réponses proposées quand la question est ambiguë. */
const AUTRES_REPONSES = 4;
/** Clé de la préférence « mon domaine », mémorisée d'une visite à l'autre. */
const CLE_DOMAINE = 'gouvernance.domaine';

@Component({
    selector: 'app-accueil-gouvernance',
    imports: [FormsModule, RouterLink],
    template: `
        @if (premiereFois()) {
            <div class="carte premiere-fois">
                <h2>Par où commencer ?</h2>
                <p class="discret">Rien n'est encore décrit dans cet espace. Trois façons de s'y mettre :</p>
                <div class="trois">
                    <a class="choix" routerLink="/objets-metier">
                        <span class="pictogramme">✨</span>
                        <b>Décrire un objet</b>
                        <span class="discret">à partir d'un fichier chargé ou d'un modèle — l'application propose, vous validez</span>
                    </a>
                    <a class="choix" routerLink="/catalogue">
                        <span class="pictogramme">🔍</span>
                        <b>Chercher</b>
                        <span class="discret">un mot, une donnée, une application — partout dans l'application</span>
                    </a>
                    <a class="choix" routerLink="/lineage">
                        <span class="pictogramme">🕸️</span>
                        <b>Voir qui utilise quoi</b>
                        <span class="discret">le parcours de la donnée, de l'application au rapport</span>
                    </a>
                </div>
            </div>
        } @else {
            <div class="carte question">
                <div class="ligne-champs">
                    <span class="pictogramme">💬</span>
                    <input
                        class="champ espace"
                        name="question"
                        [(ngModel)]="question"
                        (keydown.enter)="repondre()"
                        placeholder="Posez votre question : qui est responsable de… ? où va… ? d'où vient… ? qu'est-ce que… ?"
                    />
                    <button class="bouton principal" type="button" name="repondre" (click)="repondre()">Répondre</button>
                </div>
                <div class="exemples discret">
                    Exemples :
                    @for (exemple of exemples; track exemple) {
                        <button class="lien-exemple" type="button" (click)="question = exemple; repondre()">{{ exemple }}</button>
                    }
                </div>
                @if (reponse(); as reponse) {
                    <div class="reponse">
                        <h3>{{ pictogrammeDe(reponse) }} {{ reponse.nom }}</h3>
                        @if (montrer('definition')) {
                            <p class="definition">{{ reponse.definition || 'Pas encore de définition.' }}</p>
                        }
                        @if (montrer('responsable')) {
                            <p>
                                Responsable : <b>{{ reponse.responsable || "personne n'est désigné" }}</b>
                                @if (reponse.domaine) {
                                    · domaine <b>{{ reponse.domaine }}</b>
                                }
                            </p>
                        }
                        @if (montrer('parcours') && reponse.objet) {
                            <p>{{ parcours(reponse) }}</p>
                        }
                        <div class="pastilles">
                            @if (reponse.objet) {
                                <a class="bouton petit" [routerLink]="'/objets-metier'" [queryParams]="{ objet: reponse.objet!.id }">
                                    Ouvrir la fiche
                                </a>
                                <a class="bouton petit" [routerLink]="'/lineage'" [queryParams]="{ objet: reponse.objet!.id }">
                                    Voir le parcours
                                </a>
                            }
                            @if (reponse.mot) {
                                <a class="bouton petit" routerLink="/glossaire">Ouvrir le mot</a>
                            }
                            @if (reponse.application) {
                                <a class="bouton petit" routerLink="/actifs">Ouvrir la fiche</a>
                            }
                        </div>
                        @if (autres().length) {
                            <p class="discret">
                                Vous vouliez peut-être :
                                @for (autre of autres(); track autre.nom) {
                                    <button class="lien-exemple" type="button" (click)="question = autre.nom; repondre()">
                                        {{ autre.nom }}
                                    </button>
                                }
                            </p>
                        }
                    </div>
                } @else if (questionPosee()) {
                    <div class="reponse">
                        <h3>Je n'ai rien trouvé qui corresponde</h3>
                        <p class="discret">
                            Essayez avec le nom d'un objet, d'une information, d'un mot du glossaire ou d'une application.
                        </p>
                    </div>
                }
            </div>

            <div class="grille" style="margin-top: 14px">
                <div class="carte">
                    <div class="entete-page" style="margin: 0 0 8px">
                        <h2 class="espace">✅ Mes tâches</h2>
                        <select class="champ petit" name="monDomaine" [ngModel]="domaine()" (ngModelChange)="choisirDomaine($event)">
                            <option value="">Tous les domaines</option>
                            @for (nom of domaines(); track nom) {
                                <option [value]="nom">{{ nom }}</option>
                            }
                        </select>
                    </div>
                    @for (tache of taches(); track tache.libelle) {
                        <a class="tache" [routerLink]="tache.lien">
                            <span class="espace">{{ tache.libelle }}</span>
                            <span class="badge alerte">{{ tache.nombre }}</span>
                        </a>
                    } @empty {
                        <div class="point ok">✔ Rien à faire : tout est décrit.</div>
                    }
                </div>
                <div class="carte">
                    <div class="entete-page" style="margin: 0 0 8px">
                        <h2 class="espace">📖 Les mots du métier</h2>
                        <span class="badge neutre">{{ mots().length }}</span>
                    </div>
                    @for (mot of motsMontres(); track mot.id) {
                        <div class="mot">
                            <b>{{ mot.term }}</b>
                            <span class="discret">{{ mot.definition || 'pas encore de définition' }}</span>
                            @if (nombreDeDonnees(mot); as nombre) {
                                <a routerLink="/catalogue" [queryParams]="{ terme: mot.term }"
                                    >voir les données concernées ({{ nombre }})</a
                                >
                            }
                        </div>
                    } @empty {
                        <p class="discret">Aucun mot défini. <a routerLink="/glossaire">Ajouter le premier mot</a>.</p>
                    }
                    @if (mots().length > motsMontres().length) {
                        <a class="bouton petit" routerLink="/glossaire">Tout le glossaire ›</a>
                    }
                </div>
            </div>
        }
    `,
    styles: `
        .question .pictogramme {
            font-size: 18px;
        }
        .exemples {
            margin-top: 6px;
        }
        .lien-exemple {
            border: 0;
            background: none;
            color: var(--accent);
            font: inherit;
            cursor: pointer;
            padding: 0 6px;
        }
        .reponse {
            margin-top: 10px;
            border-top: 1px solid var(--bordure);
            padding-top: 10px;
        }
        .reponse h3 {
            margin: 0 0 4px;
        }
        .reponse p {
            margin: 4px 0;
            font-size: 13px;
        }
        .definition {
            font-style: italic;
        }
        .tache,
        .mot {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 0;
            border-bottom: 1px solid var(--bordure);
            font-size: 13px;
            color: inherit;
            text-decoration: none;
        }
        .mot {
            display: grid;
            gap: 2px;
        }
        .tache:hover {
            color: var(--accent);
        }
        .premiere-fois .trois {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-top: 10px;
        }
        .premiere-fois .choix {
            display: grid;
            gap: 4px;
            padding: 14px;
            border: 1px solid var(--bordure);
            border-radius: 10px;
            text-decoration: none;
            color: inherit;
        }
        .premiere-fois .choix:hover {
            border-color: var(--accent);
        }
        .premiere-fois .pictogramme {
            font-size: 22px;
        }
    `
})
export class AccueilGouvernanceComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly preferences = inject(PreferencesService);

    readonly objets = signal<ObjetMetier[]>([]);
    readonly mots = signal<TermeGlossaire[]>([]);
    readonly applications = signal<Actif[]>([]);
    readonly propositionsEnAttente = signal(0);
    readonly domaine = signal(this.preferences.lire(CLE_DOMAINE));
    readonly reponse = signal<EntiteGouvernance | null>(null);
    readonly autres = signal<EntiteGouvernance[]>([]);
    readonly questionPosee = signal(false);
    question = '';

    readonly exemples = ['qui est responsable du client ?', "d'où vient l'adresse ?", 'où va la prime ?', "qu'est-ce qu'un sinistre ?"];
    private intention = signal<string>('tout');

    /** Rien de décrit : on ne montre que par où commencer. */
    readonly premiereFois = computed(() => !this.objets().length && !this.mots().length);
    readonly domaines = computed(() =>
        [
            ...new Set(
                this.objets()
                    .map(objet => (objet.domain || '').trim())
                    .filter(Boolean)
            )
        ].sort((premier, second) => premier.localeCompare(second, 'fr'))
    );
    readonly taches = computed(() => tachesDe(this.objets(), this.propositionsEnAttente(), this.domaine()));
    readonly motsMontres = computed(() =>
        this.mots()
            .filter(mot => !this.domaine() || (mot.domain || '') === this.domaine())
            .slice(0, MOTS_MONTRES)
    );

    constructor() {
        void this.charger();
    }

    private async charger(): Promise<void> {
        try {
            const [objets, mots, applications, propositions] = await Promise.all([
                this.api.objetsMetier(),
                this.api.glossaire(),
                this.api.actifs(),
                this.api.propositions().catch(() => [])
            ]);
            // Le serveur n'écrit que ce qui a été renseigné : on complète les listes absentes une fois pour toutes.
            this.objets.set(
                objets.map(objet => ({
                    ...objet,
                    elements: objet.elements || [],
                    sources: objet.sources || [],
                    producedBy: objet.producedBy || [],
                    consumedBy: objet.consumedBy || []
                }))
            );
            this.mots.set(mots);
            this.applications.set(applications);
            this.propositionsEnAttente.set(propositions.filter(proposition => proposition.status === 'pending').length);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    choisirDomaine(domaine: string): void {
        this.domaine.set(domaine);
        this.preferences.ecrire(CLE_DOMAINE, domaine);
    }

    /** Cherche de quoi parle la question, et retient ce qu'elle demande. */
    repondre(): void {
        const question = this.question.trim();
        this.questionPosee.set(Boolean(question));
        if (!question) {
            this.reponse.set(null);
            return;
        }
        this.intention.set(intentionDe(question));
        const entites = entitesGouvernance(this.objets(), this.mots(), this.applications());
        const trouvees = chercherEntites(question, entites);
        this.reponse.set(trouvees[0] || null);
        this.autres.set(trouvees.slice(1, 1 + AUTRES_REPONSES).filter(entite => entite.nom !== trouvees[0]?.nom));
    }

    /** Ce qu'on affiche dépend de la question : on répond à ce qui est demandé, pas à tout. */
    montrer(partie: 'definition' | 'responsable' | 'parcours'): boolean {
        const intention = this.intention();
        if (intention === 'tout') return true;
        if (partie === 'definition') return intention === 'definition';
        if (partie === 'responsable') return intention === 'responsable';
        return intention === 'amont' || intention === 'aval';
    }

    pictogrammeDe(entite: EntiteGouvernance): string {
        return { objet: '🏛️', information: '🔹', mot: '📖', application: '🖥' }[entite.genre];
    }

    /** Le parcours en une phrase : d'où vient la donnée, et ce qui s'en sert. */
    parcours(entite: EntiteGouvernance): string {
        const objet = entite.objet;
        if (!objet) return '';
        const sources = objet.sources.map(source => source.table);
        const consommateurs = this.applications()
            .filter(
                application => objet.consumedBy.includes(application.id) || (entite.information?.id && this.utilise(application, entite))
            )
            .map(application => application.name);
        const producteurs = this.applications()
            .filter(application => objet.producedBy.includes(application.id))
            .map(application => application.name);
        const amont = [...producteurs, ...sources];
        const phrases = [
            amont.length ? `vient de ${amont.join(', ')}` : "n'a pas encore de source déclarée",
            consommateurs.length ? `sert à ${consommateurs.join(', ')}` : "personne n'a encore déclaré s'en servir"
        ];
        return `« ${entite.nom} » ${phrases[0]} ; ${phrases[1]}.`;
    }

    private utilise(application: Actif, entite: EntiteGouvernance): boolean {
        const information = entite.objet?.elements.find(candidat => candidat.id === entite.information?.id);
        return Boolean(information && information.usedBy.includes(application.id));
    }

    /** Combien de données ce mot du métier étiquette : informations qui le portent. */
    nombreDeDonnees(mot: TermeGlossaire): number {
        return this.objets().reduce(
            (total, objet) => total + objet.elements.filter(information => information.term === mot.term).length,
            0
        );
    }
}
