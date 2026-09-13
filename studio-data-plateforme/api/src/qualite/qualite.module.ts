/**
 * Module qualité des données : profilage (avec filtres d'audit), inspecteur d'anomalies, doublons, règles et score,
 * audit d'objet métier, clés fonctionnelles composites, audits enregistrés.
 * Il s'appuie sur la gouvernance (listes de valeurs, dictionnaire, objets métier) et sur le modèle de données
 * (relations entre tables pour les facettes et les composants de clé venant d'une table liée).
 */
import { Module } from '@nestjs/common';
import { GouvernanceModule } from '../gouvernance/gouvernance.module';
import { JournalModule } from '../journal/journal.module';
import { ModeleModule } from '../modele/modele.module';
import { SourcesModule } from '../sources/sources.module';
import { QualiteController } from './qualite.controller';
import { QualiteService } from './qualite.service';

@Module({
    imports: [JournalModule, SourcesModule, GouvernanceModule, ModeleModule],
    controllers: [QualiteController],
    providers: [QualiteService],
    exports: [QualiteService]
})
export class QualiteModule {}
