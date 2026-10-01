// Le point d'entrée de la couche back.
//
// Il fait quatre choses, dans cet ordre, et s'arrête à la première qui échoue :
//   1. lire et vérifier les réglages ;
//   2. ouvrir la base interne et la mettre à jour ;
//   3. poser les protections et les routes ;
//   4. se mettre à l'écoute.
//
// Un serveur qui démarre « à moitié » est plus dangereux qu'un serveur qui refuse de
// démarrer : on s'arrête net.
import Fastify from 'fastify';
import { lireLesReglages, reglagesLisibles } from './configuration/configuration.js';
import { ouvrirLaBaseInterne, type BaseInterne } from './base-de-donnees/connexion.js';
import { appliquerLesMigrations } from './base-de-donnees/migrations.js';
import { poserLesEntetesDeSecurite } from './securite/entetes.js';
import { poserLaRouteDeSante } from './sante/sante.js';
import type { Reglages } from './configuration/configuration.js';

export async function construireLeServeur(reglages: Reglages, base: BaseInterne) {
    const serveur = Fastify({
        logger: false,
        // Une requête anormalement grosse est refusée avant d'être lue.
        bodyLimit: 2 * 1024 * 1024,
        // On ne fait jamais confiance à l'adresse annoncée par le client lui-même.
        trustProxy: reglages.environnement !== 'developpement'
    });
    poserLesEntetesDeSecurite(serveur, reglages.environnement === 'production');
    poserLaRouteDeSante(serveur, base);

    // Une erreur imprévue ne doit jamais révéler l'intérieur de l'application.
    serveur.setErrorHandler((souci: Error & { statusCode?: number }, _requete, reponse) => {
        const codeDeRetour = souci.statusCode ?? 500;
        const visibleParLUtilisateur = codeDeRetour < 500;
        if (!visibleParLUtilisateur) console.error('Erreur inattendue :', souci);
        reponse.code(codeDeRetour).send({
            erreur: visibleParLUtilisateur ? souci.message : 'Une erreur est survenue. Elle a été enregistrée.'
        });
    });
    return serveur;
}

export async function demarrer(): Promise<void> {
    const reglages = lireLesReglages();
    const base = await ouvrirLaBaseInterne(reglages);
    const jouees = await appliquerLesMigrations(base);
    if (jouees.length) console.log('Migrations appliquées : ' + jouees.join(', '));

    const serveur = await construireLeServeur(reglages, base);
    await serveur.listen({ port: reglages.port, host: '0.0.0.0' });
    console.log('Studio Data entreprise — ' + reglagesLisibles(reglages));
}

// Lancé directement (et non importé par un test) : on démarre.
if (process.argv[1] && process.argv[1].endsWith('serveur.js')) {
    demarrer().catch(souci => {
        console.error(String(souci instanceof Error ? souci.message : souci));
        process.exit(1);
    });
}
