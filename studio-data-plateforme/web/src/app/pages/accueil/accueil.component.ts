/**
 * Cockpit (accueil) : chiffres clés de l'espace, points d'attention (gouvernance, modèle, fraîcheur), dernier audit
 * qualité, volumétrie par table, plus l'état du serveur et les dernières actions du journal.
 */
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClientApiService } from '../../coeur/client-api.service';
import { Cockpit, EntreeJournal, Sante, formaterDate, formaterOctets } from '../../coeur/modeles';
import { NotificationsService } from '../../coeur/notifications.service';
import { SessionService } from '../../coeur/session.service';

@Component({
    selector: 'app-accueil',
    imports: [RouterLink],
    template: `
        <div class="entete-page">
            <div class="espace">
                <h1>Bienvenue dans Studio Data</h1>
                <p class="discret">
                    Espace « {{ session.espaceCourant()?.nom || 'aucun' }} » · vous êtes {{ session.roleDansEspace() || 'sans rôle' }}
                </p>
            </div>
        </div>
        @if (!session.espaceCourant()) {
            <div class="carte vide">Vous n'appartenez à aucun espace de travail. Demandez à un administrateur de vous y ajouter.</div>
        } @else {
            <div class="kpis">
                <a class="kpi" routerLink="/sources"
                    ><b>{{ cockpit()?.sources ?? '…' }}</b
                    ><span>sources et tables</span></a
                >
                <a class="kpi" routerLink="/sources"
                    ><b>{{ nombre(cockpit()?.lignes) }}</b
                    ><span>lignes chargées</span></a
                >
                <a class="kpi" routerLink="/dictionnaire"
                    ><b>{{ cockpit()?.domaines ?? '…' }}</b
                    ><span>domaines</span></a
                >
                <a class="kpi" routerLink="/modele"
                    ><b>{{ cockpit()?.liens ?? '…' }}</b
                    ><span>liens du modèle</span></a
                >
                <a class="kpi" routerLink="/objets-metier"
                    ><b>{{ cockpit()?.objetsMetier ?? '…' }}</b
                    ><span>objets métier</span></a
                >
                <a class="kpi" routerLink="/qualite"
                    ><b>{{ cockpit()?.audits ?? '…' }}</b
                    ><span>audits réalisés</span></a
                >
                <a class="kpi" routerLink="/qualite/regles">
                    <b
                        [class.score-bon]="(cockpit()?.scoreQualite ?? 0) >= 90"
                        [class.score-moyen]="(cockpit()?.scoreQualite ?? 100) < 90 && (cockpit()?.scoreQualite ?? 0) >= 70"
                        [class.score-faible]="(cockpit()?.scoreQualite ?? 100) < 70"
                    >
                        {{ cockpit()?.scoreQualite == null ? '—' : cockpit()?.scoreQualite + ' / 100' }}
                    </b>
                    <span>score qualité (règles)</span>
                </a>
            </div>
            <div class="grille" style="margin-top: 14px">
                <div class="carte">
                    <h2>Points d'attention</h2>
                    @if (cockpit(); as cockpit) {
                        @for (point of cockpit.pointsAttention; track point.message) {
                            <a class="point" [class.alerte]="point.gravite === 'alerte'" [routerLink]="point.lien">
                                {{ point.gravite === 'alerte' ? '⚠' : 'ℹ' }} {{ point.message }}
                            </a>
                        } @empty {
                            <div class="point ok">✔ Aucun point d'attention : gouvernance en ordre.</div>
                        }
                    } @else {
                        <p class="discret">Analyse en cours…</p>
                    }
                </div>
                <div class="carte">
                    <h2>Dernier audit qualité</h2>
                    @if (cockpit()?.dernierAudit; as audit) {
                        <p>
                            Table <b>{{ audit.source }}</b> · {{ formaterDate(audit.date) }}
                        </p>
                        <div class="pastilles">
                            <span class="badge neutre">{{ nombre(audit.lignes) }} lignes</span>
                            @if (audit.completude != null) {
                                <span class="badge" [class.succes]="audit.completude >= 95" [class.alerte]="audit.completude < 95"
                                    >complétude {{ audit.completude }} %</span
                                >
                            }
                            @if (audit.doublons != null) {
                                <span class="badge" [class.succes]="audit.doublons === 0" [class.erreur]="audit.doublons > 0"
                                    >{{ nombre(audit.doublons) }} doublon(s)</span
                                >
                            }
                        </div>
                    } @else {
                        <p class="discret">Aucun audit encore lancé. <a routerLink="/qualite">Ouvrir Qualité & Audit</a>.</p>
                    }
                    <div class="pastilles" style="margin-top: 10px">
                        <a class="bouton petit" routerLink="/sensibilite">Détecter les données personnelles (RGPD)</a>
                        <a class="bouton petit" routerLink="/sauvegarde">Dossier de gouvernance (HTML)</a>
                    </div>
                </div>
            </div>
            <div class="grille" style="margin-top: 14px">
                <div class="carte">
                    <h2>Volumétrie par table</h2>
                    @if (cockpit(); as cockpit) {
                        @if (cockpit.volumetrie.length === 0) {
                            <p class="discret">Aucune source. <a routerLink="/sources">Déposer un fichier</a>.</p>
                        }
                        <div class="volumetrie">
                            @for (ligne of cockpit.volumetrie; track ligne.nom) {
                                <div class="ligne-volume">
                                    <span class="nom"
                                        >{{ ligne.nom }}
                                        @if (ligne.domaine) {
                                            <span class="discret">🗂 {{ ligne.domaine }}</span>
                                        }
                                    </span>
                                    <b>{{ nombre(ligne.lignes) }}</b>
                                </div>
                            }
                        </div>
                    } @else {
                        <p class="discret">Comptage en cours…</p>
                    }
                </div>
                <div class="carte">
                    <h2>Serveur et dernières actions</h2>
                    <div class="pastilles serveur">
                        <span class="badge neutre">moteur DuckDB {{ sante()?.duckdb || '…' }}</span>
                        <span class="badge neutre">base référentielle {{ sante()?.baseReferentielle?.pilote || '…' }}</span>
                        <span class="badge neutre">{{ formaterOctets(sante()?.octetsFichiers) }} de fichiers</span>
                        <span class="badge neutre">{{ sante()?.requetesExecutees ?? '…' }} requêtes exécutées</span>
                    </div>
                    @if (journal().length === 0) {
                        <p class="discret">Rien pour l'instant.</p>
                    }
                    <table class="tableau">
                        <tbody>
                            @for (entree of journal(); track entree.id) {
                                <tr>
                                    <td class="discret">{{ formaterDate(entree.horodatage) }}</td>
                                    <td>{{ entree.auteur }}</td>
                                    <td>
                                        <code>{{ entree.action }}</code> {{ entree.cible || '' }}
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        }
    `,
    styles: `
        a.kpi {
            text-decoration: none;
            color: inherit;
        }
        a.kpi:hover {
            border-color: var(--accent);
        }
        .score-bon {
            color: var(--succes);
        }
        .score-moyen {
            color: var(--alerte);
        }
        .score-faible {
            color: var(--erreur);
        }
        .point {
            display: block;
            font-size: 13px;
            padding: 6px 10px;
            border-radius: 6px;
            margin-bottom: 6px;
            background: var(--surface-2);
            color: inherit;
            text-decoration: none;
            border: 1px solid var(--bordure);
        }
        .point.alerte {
            border-color: var(--alerte);
        }
        .point.ok {
            border-color: var(--succes);
        }
        .pastilles {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .pastilles.serveur {
            margin-bottom: 10px;
        }
        .volumetrie {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 6px;
        }
        .ligne-volume {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            border: 1px solid var(--bordure);
            border-radius: 6px;
            padding: 5px 9px;
            font-size: 13px;
        }
        .ligne-volume .nom {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `
})
export class AccueilComponent {
    readonly session = inject(SessionService);
    private readonly api = inject(ClientApiService);
    private readonly notifications = inject(NotificationsService);

    readonly sante = signal<Sante | null>(null);
    readonly cockpit = signal<Cockpit | null>(null);
    readonly journal = signal<EntreeJournal[]>([]);
    readonly formaterOctets = formaterOctets;
    readonly formaterDate = formaterDate;

    constructor() {
        void this.charger();
    }

    nombre(valeur: number | null | undefined): string {
        return valeur == null ? '…' : valeur.toLocaleString('fr-FR');
    }

    private async charger(): Promise<void> {
        try {
            this.sante.set(await this.api.sante());
            if (!this.session.espaceCourant()) return;
            const [journal, cockpit] = await Promise.all([this.api.journal(8), this.api.cockpit()]);
            this.journal.set(journal);
            this.cockpit.set(cockpit);
        } catch (erreur) {
            this.notifications.erreur(erreur as Error);
        }
    }
}
