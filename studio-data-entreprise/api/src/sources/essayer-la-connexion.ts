// La commande qui montre que la connexion marche.
//
//   npm run essayer-redshift
//
// Elle se connecte, lit le catalogue et affiche ce qu'elle a trouvé. Elle n'écrit RIEN,
// ni dans l'entrepôt, ni dans notre base : c'est un essai, pas une installation.
import { lireLesReglagesRedshift, reglagesRedshiftLisibles } from './reglages-redshift.js';
import { ouvrirUneConnexionRedshift, expliquerLEchec } from './connexion-redshift.js';
import { listerLesSchemas, lireLeSchema, compterLesColonnesParTable } from './catalogue.js';

const TABLES_MONTREES = 15;

function titre(texte: string): void {
    console.log('\n' + texte);
    console.log('─'.repeat(texte.length));
}

export async function essayerLaConnexion(): Promise<void> {
    const reglages = lireLesReglagesRedshift();
    console.log('Essai de connexion : ' + reglagesRedshiftLisibles(reglages));

    const debut = Date.now();
    const source = await ouvrirUneConnexionRedshift(reglages);
    console.log('✓ Connecté en ' + (Date.now() - debut) + ' ms, en liaison chiffrée.');

    try {
        const identite = await source.interroger<{ moteur: string; utilisateur: string; base: string }>(
            'SELECT version() AS moteur, current_user AS utilisateur, current_database() AS base'
        );
        console.log('  Moteur     : ' + String(identite[0]?.moteur ?? '').split(',')[0]);
        console.log('  Utilisateur: ' + identite[0]?.utilisateur);

        titre('Les schémas visibles');
        const schemas = await listerLesSchemas(source);
        if (!schemas.length) {
            console.log('Aucun schéma visible. L’utilisateur a-t-il le droit de lire quelque chose ?');
            return;
        }
        console.log(schemas.map(schema => '  · ' + schema.nom).join('\n'));

        const choisi = schemas.some(schema => schema.nom === reglages.schemaParDefaut)
            ? reglages.schemaParDefaut
            : (schemas[0]?.nom as string);
        titre('Le schéma « ' + choisi + ' »');

        const apercu = await lireLeSchema(source, choisi);
        const colonnesParTable = compterLesColonnesParTable(apercu);
        const tables = apercu.tables.filter(table => table.genre === 'table').length;
        const vues = apercu.tables.length - tables;
        console.log(`  ${tables} table(s), ${vues} vue(s), ${apercu.colonnes.length} colonne(s) au total.`);

        apercu.tables.slice(0, TABLES_MONTREES).forEach(table => {
            const combien = colonnesParTable.get(table.nom) ?? 0;
            console.log(`  · ${table.nom}${table.genre === 'vue' ? ' (vue)' : ''} — ${combien} colonne(s)`);
        });
        if (apercu.tables.length > TABLES_MONTREES) {
            console.log(`  … et ${apercu.tables.length - TABLES_MONTREES} autre(s).`);
        }

        titre('Les liens entre tables');
        if (apercu.liensDeclares.length) {
            console.log(`  ${apercu.liensDeclares.length} lien(s) déclaré(s) dans le catalogue :`);
            apercu.liensDeclares
                .slice(0, 10)
                .forEach(lien =>
                    console.log(
                        `  · ${lien.tableQuiPointe}.${lien.colonneQuiPointe} → ${lien.tablePointee}.${lien.colonnePointee}`
                    )
                );
        } else {
            console.log('  Aucun lien déclaré dans le catalogue.');
        }
        console.log(
            '\n  C’est le cas habituel dans un entrepôt : les clés étrangères y sont facultatives.\n' +
                '  Les liens manquants se retrouveront à partir des données, puis se valideront à la main.'
        );

        console.log('\n✓ Tout s’est bien passé. Rien n’a été écrit, ni ici, ni dans l’entrepôt.');
    } finally {
        await source.fermer();
    }
}

if (process.argv[1] && process.argv[1].endsWith('essayer-la-connexion.js')) {
    essayerLaConnexion().catch(souci => {
        console.error('\n✗ ' + expliquerLEchec(souci) + '\n');
        process.exit(1);
    });
}
