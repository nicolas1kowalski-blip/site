/**
 * Routes de l'application. Tout ce qui n'est pas la page de connexion passe par la coque (navigation,
 * en-tête, choix de l'espace) et exige une session ouverte. Les pages d'administration exigent en plus
 * le rôle d'administrateur de la plateforme.
 */
import { Routes } from '@angular/router';
import { gardeAdministrateur, gardeConnecte, gardeDeconnecte } from './coeur/gardes';
import { ConnexionComponent } from './coque/connexion.component';
import { CoqueComponent } from './coque/coque.component';
import { AccueilComponent } from './pages/accueil/accueil.component';
import { ActifsComponent } from './pages/actifs/actifs.component';
import { ClassiqueComponent } from './pages/classique/classique.component';
import { CompteComponent } from './pages/compte/compte.component';
import { DictionnaireComponent } from './pages/dictionnaire/dictionnaire.component';
import { EspacesComponent } from './pages/espaces/espaces.component';
import { ExplorateurComponent } from './pages/explorateur/explorateur.component';
import { ExtractionComponent } from './pages/extraction/extraction.component';
import { GlossaireComponent } from './pages/glossaire/glossaire.component';
import { JournalComponent } from './pages/journal/journal.component';
import { LineageComponent } from './pages/lineage/lineage.component';
import { ListesValeursComponent } from './pages/listes-valeurs/listes-valeurs.component';
import { ModeleComponent } from './pages/modele/modele.component';
import { ObjetsMetierComponent } from './pages/objets-metier/objets-metier.component';
import { PerimetresComponent } from './pages/perimetres/perimetres.component';
import { PersonnesComponent } from './pages/personnes/personnes.component';
import { PropositionsComponent } from './pages/propositions/propositions.component';
import { QualiteComponent } from './pages/qualite/qualite.component';
import { SensibiliteComponent } from './pages/sensibilite/sensibilite.component';
import { SourcesComponent } from './pages/sources/sources.component';
import { TablesConcuesComponent } from './pages/tables-concues/tables-concues.component';
import { UtilisateursComponent } from './pages/utilisateurs/utilisateurs.component';

export const routes: Routes = [
    { path: 'connexion', component: ConnexionComponent, canActivate: [gardeDeconnecte], title: 'Connexion — Studio Data' },
    {
        path: '',
        component: CoqueComponent,
        canActivate: [gardeConnecte],
        children: [
            { path: '', component: AccueilComponent, title: 'Accueil — Studio Data' },
            { path: 'sources', component: SourcesComponent, title: 'Sources — Studio Data' },
            { path: 'modele', component: ModeleComponent, title: 'Modèle de données — Studio Data' },
            { path: 'tables-concues', component: TablesConcuesComponent, title: 'Tables conçues — Studio Data' },
            { path: 'extraction', component: ExtractionComponent, title: 'Extraction — Studio Data' },
            { path: 'explorateur', component: ExplorateurComponent, title: 'Explorateur SQL — Studio Data' },
            { path: 'qualite', component: QualiteComponent, title: 'Qualité & Audit — Studio Data' },
            { path: 'glossaire', component: GlossaireComponent, title: 'Glossaire — Studio Data' },
            { path: 'dictionnaire', component: DictionnaireComponent, title: 'Dictionnaire — Studio Data' },
            { path: 'objets-metier', component: ObjetsMetierComponent, title: 'Objets métier — Studio Data' },
            { path: 'actifs', component: ActifsComponent, title: 'Applications & processus — Studio Data' },
            { path: 'perimetres', component: PerimetresComponent, title: 'Périmètres — Studio Data' },
            { path: 'listes-de-valeurs', component: ListesValeursComponent, title: 'Listes de valeurs — Studio Data' },
            { path: 'sensibilite', component: SensibiliteComponent, title: 'Sensibilité — Studio Data' },
            { path: 'personnes', component: PersonnesComponent, title: 'Personnes & rôles — Studio Data' },
            { path: 'propositions', component: PropositionsComponent, title: 'Propositions à valider — Studio Data' },
            { path: 'lineage', component: LineageComponent, title: 'Lineage — Studio Data' },
            { path: 'journal', component: JournalComponent, title: 'Journal — Studio Data' },
            { path: 'classique', component: ClassiqueComponent, title: 'Application complète — Studio Data' },
            { path: 'espaces', component: EspacesComponent, title: 'Espaces — Studio Data' },
            { path: 'compte', component: CompteComponent, title: 'Mon compte — Studio Data' },
            {
                path: 'utilisateurs',
                component: UtilisateursComponent,
                canActivate: [gardeAdministrateur],
                title: 'Utilisateurs — Studio Data'
            }
        ]
    },
    { path: '**', redirectTo: '' }
];
