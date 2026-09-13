/**
 * Mode démonstration : un interrupteur qui installe, dans un espace de travail dédié, le jeu de données complet
 * et toute sa gouvernance — douze sources chargées, le modèle de données déclaré, le dictionnaire rempli, les
 * listes de valeurs, l'objet métier, la série temporelle, les tableaux de bord, les règles de qualité et un
 * premier audit. Autrement dit : l'application telle qu'elle est après plusieurs semaines d'usage, en quelques
 * secondes, sans rien déposer à la main et sans toucher aux espaces de travail réels.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { EtatDemonstration, RapportDemonstration, formaterDate, formaterOctets } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-demonstration',
    imports: [FormsModule],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Mode démonstration</h1>
                <p class="discret">
                    Installe un espace de travail complet à partir du jeu de démonstration : les données, le modèle, le dictionnaire, les
                    règles et les tableaux de bord, déjà en place.
                </p>
            </div>
            @if (etat(); as etat) {
                <span class="badge" [class.succes]="etat.pretAInstaller" [class.erreur]="!etat.pretAInstaller">
                    jeu prêt : {{ etat.jeuEnBase.fichiers || etat.fichiersSurDisque.length }} fichier(s)
                </span>
                <span class="badge neutre" title="Le jeu est rangé dans PostgreSQL : l'installation ne dépend d'aucun fichier">
                    en base : {{ etat.jeuEnBase.fichiers }} fichier(s){{
                        etat.jeuEnBase.fichiers ? ' · ' + formaterOctets(etat.jeuEnBase.octetsCompresses) : ''
                    }}
                </span>
                @if (etat.espace) {
                    <span class="badge neutre">espace « {{ etat.espace.code }} » : {{ etat.espace.sources }} source(s)</span>
                }
            }
        </div>

        @if (etat(); as etat) {
            <div class="carte">
                <div class="interrupteur">
                    <div class="espace">
                        <b>{{ etat.espace?.installeLe ? 'Démonstration installée' : 'Démonstration non installée' }}</b>
                        <div class="discret">
                            @if (etat.espace?.installeLe) {
                                Installée le {{ formaterDate(etat.espace!.installeLe!) }} dans l'espace « {{ etat.espace!.code }} ».
                                Réinstaller remet le jeu à neuf : les modifications faites pendant la démonstration sont effacées.
                            } @else {
                                L'installation crée l'espace « {{ code }} » et n'écrit rien dans vos autres espaces de travail.
                            }
                        </div>
                    </div>
                    <label class="etiquette" style="margin: 0">Espace</label>
                    <input class="champ" name="code" style="width: 140px" [(ngModel)]="code" [disabled]="enCours()" />
                    <button
                        class="bouton principal"
                        name="installer"
                        (click)="installer(!!etat.espace?.installeLe)"
                        [disabled]="enCours() || !etat.pretAInstaller"
                    >
                        {{ enCours() ? 'Installation…' : etat.espace?.installeLe ? 'Réinstaller' : 'Installer la démonstration' }}
                    </button>
                    @if (etat.espace?.sources) {
                        <button class="bouton danger" (click)="vider()" [disabled]="enCours()">Vider l'espace</button>
                    }
                </div>
                <div class="depot">
                    <span class="discret">
                        @if (etat.jeuEnBase.fichiers) {
                            Jeu rangé dans la base le {{ formaterDate(etat.jeuEnBase.chargeLe) }} :
                            {{ etat.jeuEnBase.fichiers }} fichier(s), {{ formaterOctets(etat.jeuEnBase.octets) }} compressés en
                            {{ formaterOctets(etat.jeuEnBase.octetsCompresses) }}. L'installation n'a besoin d'aucun fichier sur le serveur.
                        } @else {
                            Le jeu n'est pas encore dans la base : il y sera rangé à la première installation, depuis
                            <code>{{ etat.dossier }}</code
                            >.
                        }
                    </span>
                    @if (etat.fichiersSurDisque.length) {
                        <button class="bouton petit" (click)="rechargerLeJeu()" [disabled]="enCours()">
                            {{ etat.jeuEnBase.fichiers ? 'Remettre le jeu à jour depuis les fichiers' : 'Ranger le jeu dans la base' }}
                        </button>
                    }
                    @if (etat.jeuEnBase.fichiers) {
                        <button class="bouton petit danger" (click)="viderLeJeu()" [disabled]="enCours()">Retirer le jeu de la base</button>
                    }
                </div>
                @if (!etat.pretAInstaller) {
                    <p class="manquants">
                        Jeu introuvable, ni en base ni dans <code>{{ etat.dossier }}</code> : {{ etat.fichiersManquants.join(', ') }}.
                        Produisez les fichiers avec <code>npm run demo</code>.
                    </p>
                }
            </div>

            @if (rapport(); as rapport) {
                <div class="carte">
                    <div class="entete-page" style="margin: 0 0 10px">
                        <h2 style="margin: 0">Installation terminée</h2>
                        <span class="badge succes">{{ rapport.sources.length }} source(s)</span>
                        <span class="badge neutre">{{ rapport.liens }} lien(s)</span>
                        <span class="badge neutre">{{ rapport.regles }} règle(s)</span>
                        <span class="badge neutre">{{ rapport.tableaux }} tableau(x) de bord</span>
                        @if (rapport.score !== null) {
                            <span class="badge" [class.succes]="rapport.score >= 90" [class.alerte]="rapport.score < 90"
                                >score qualité {{ rapport.score }} / 100</span
                            >
                        }
                        <span class="discret">en {{ (rapport.dureeMs / 1000).toFixed(1) }} s</span>
                        <span class="espace"></span>
                        <button class="bouton principal" (click)="ouvrirEspace(rapport.espace.code)">
                            Ouvrir l'espace de démonstration
                        </button>
                    </div>
                    <div class="defilement-x">
                        <table class="tableau">
                            <thead>
                                <tr>
                                    <th>Source</th>
                                    <th>Lignes</th>
                                    <th>Colonnes</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (source of rapport.sources; track source.nom) {
                                    <tr>
                                        <td>
                                            <code>{{ source.nom }}</code>
                                        </td>
                                        <td>{{ source.lignes }}</td>
                                        <td>{{ source.colonnes }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            }

            <div class="carte">
                <h2>Ce que l'installation met en place</h2>
                <div class="grille">
                    @for (element of contenu; track element.titre) {
                        <div class="element">
                            <b>{{ element.titre }}</b>
                            <div class="discret">{{ element.detail }}</div>
                        </div>
                    }
                </div>
                <p class="discret" style="margin-top: 10px">
                    Les données sont fictives, sauf les communes. Le détail des fichiers, la liste des défauts semés volontairement et un
                    scénario de démonstration sont dans <code>donnees-demo/README.md</code>.
                </p>
            </div>
        } @else {
            <div class="carte vide">Lecture de l'état de la démonstration…</div>
        }
    `,
    styles: `
        .interrupteur {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .element {
            border: 1px solid var(--bordure);
            border-radius: var(--rayon);
            padding: 10px 12px;
            background: var(--surface-2);
        }
        .depot {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid var(--bordure);
        }
        .manquants {
            margin-top: 10px;
            color: var(--erreur);
            font-size: 12px;
        }
    `
})
export class DemonstrationComponent {
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);
    private readonly session = inject(SessionService);
    private readonly router = inject(Router);

    readonly etat = signal<EtatDemonstration | null>(null);
    readonly rapport = signal<RapportDemonstration | null>(null);
    readonly enCours = signal(false);
    readonly formaterDate = formaterDate;
    readonly formaterOctets = formaterOctets;
    code = 'demo';

    /** Ce que l'écran annonce : la promesse de l'installation, en clair. */
    readonly contenu = [
        {
            titre: '12 sources chargées',
            detail: 'Communes, clients, établissements, contacts, catalogue, commandes, lignes, factures, tickets, relevés.'
        },
        { titre: '12 liens du modèle', detail: 'Déjà déclarés avec leur cardinalité : plus rien à détecter pour commencer.' },
        {
            titre: 'Dictionnaire rempli',
            detail: 'Une fiche par source, des colonnes commentées, un profil de clé fonctionnelle sur les contacts.'
        },
        { titre: '4 listes de valeurs', detail: 'Statuts client, états de commande, priorités du support, régions du référentiel.' },
        {
            titre: '12 règles de qualité',
            detail: 'Onze familles de contrôles, déjà exécutées : score, dettes qualité et historique sont remplis.'
        },
        {
            titre: 'Objet métier et série',
            detail: 'L’objet « Client » avec ses facettes, et la série horaire des relevés de consommation.'
        },
        { titre: '2 tableaux de bord', detail: 'Activité commerciale et qualité de service, avec leurs seuils d’alerte.' },
        { titre: 'Sensibilité et glossaire', detail: 'Colonnes personnelles désignées, termes du vocabulaire, applications productrices.' }
    ];

    constructor() {
        void this.recharger();
    }

    private async recharger(): Promise<void> {
        try {
            this.etat.set(await this.api.etatDemonstration(this.code));
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    async installer(remplacer: boolean): Promise<void> {
        if (remplacer && !confirm('Réinstaller la démonstration ? Le contenu actuel de cet espace sera effacé.')) return;
        this.enCours.set(true);
        this.rapport.set(null);
        try {
            const rapport = await this.api.installerDemonstration({ code: this.code.trim(), remplacer });
            this.rapport.set(rapport);
            this.notifications.succes(
                `Démonstration installée : ${rapport.sources.length} source(s), ${rapport.regles} règle(s), score ${rapport.score ?? '—'} / 100.`
            );
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Range (ou remet à jour) le jeu dans la base à partir des fichiers du serveur. */
    async rechargerLeJeu(): Promise<void> {
        this.enCours.set(true);
        try {
            const chargement = await this.api.chargerJeuDemonstration();
            this.notifications.succes(
                `Jeu rangé dans la base : ${chargement.fichiers} fichier(s), ${formaterOctets(chargement.octetsCompresses)} compressés.`
            );
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async viderLeJeu(): Promise<void> {
        if (!confirm('Retirer le jeu de démonstration de la base ? Il faudra le recharger depuis les fichiers pour réinstaller.')) return;
        this.enCours.set(true);
        try {
            const bilan = await this.api.viderJeuDemonstration();
            this.notifications.succes(`${bilan.fichiersRetires} fichier(s) retiré(s) de la base.`);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    async vider(): Promise<void> {
        if (!confirm('Vider l’espace de démonstration ? Les sources, les règles et la gouvernance seront supprimées.')) return;
        this.enCours.set(true);
        try {
            const bilan = await this.api.viderDemonstration(this.code.trim());
            this.rapport.set(null);
            this.notifications.succes(`${bilan.sourcesSupprimees} source(s) supprimée(s).`);
            await this.recharger();
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        } finally {
            this.enCours.set(false);
        }
    }

    /** Bascule dans l'espace de démonstration et ouvre le cockpit : la démonstration peut commencer. */
    async ouvrirEspace(code: string): Promise<void> {
        try {
            await this.session.changerEspace(code);
            await this.router.navigateByUrl('/');
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }

    /** Nombre total de lignes chargées, affiché après l'installation. */
    readonly lignesChargees = computed(() => (this.rapport()?.sources || []).reduce((somme, source) => somme + source.lignes, 0));
}
