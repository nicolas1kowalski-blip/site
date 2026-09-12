/**
 * Tests de l'API : application NestJS en mémoire (app.inject), base PGlite et données dans un dossier
 * temporaire — aucun service à installer. Lancer : npm run tester (compile puis exécute dist/test).
 * Chaque test est une phrase en français ; les assertions vérifient le comportement vu par un client.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-api-'));
let app: NestFastifyApplication;
/** Cookie de session de l'administrateur, obtenu au premier test de connexion. */
let cookieAdmin: Record<string, string> = {};
let cookieLecteur: Record<string, string> = {};

type Reponse = {
    statusCode: number;
    body: string;
    headers: Record<string, unknown>;
    cookies: { name: string; value: string }[];
    rawPayload: Buffer;
};
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
}) => app.inject(options as never) as unknown as Promise<Reponse>;
const sql = (requete: string, cookies = cookieAdmin) => appel({ method: 'POST', url: '/api/sql', payload: { sql: requete }, cookies });

before(async () => {
    // SD_POSTGRES_URL_TEST permet de rejouer les mêmes tests sur un vrai PostgreSQL (base vidée au préalable).
    const configuration = lireConfiguration({
        SD_DONNEES: dossierTemporaire,
        SD_POSTGRES_URL: process.env.SD_POSTGRES_URL_TEST || '',
        SD_JOURNAL: 'silent',
        SD_LIMITE_LIGNES: '1000',
        SD_TAILLE_MAX_FICHIER_MO: '1',
        SD_ADMIN_MOT_DE_PASSE: 'MotDePasseAdmin1',
        SD_WEB: path.join(dossierTemporaire, 'web-absent'),
        SD_WEB_CLASSIQUE: path.join(dossierTemporaire, 'classique-absent')
    });
    app = await creerApplication(configuration);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('santé sans session : serveur et base référentielle répondent', async () => {
    const reponse = await appel({ method: 'GET', url: '/api/sante' });
    assert.equal(reponse.statusCode, 200);
    const corps = json(reponse);
    assert.equal(corps.ok, true);
    assert.equal(corps.baseReferentielle.pilote, process.env.SD_POSTGRES_URL_TEST ? 'postgresql' : 'pglite');
    assert.equal(corps.duckdb, undefined);
});

test('sans session, une route protégée répond 401 avec un message', async () => {
    const reponse = await appel({ method: 'GET', url: '/api/etat' });
    assert.equal(reponse.statusCode, 401);
    assert.match(json(reponse).erreur, /Connexion requise/);
});

test('connexion : mauvais mot de passe refusé ; bon mot de passe → cookie httpOnly, identité et espace « defaut »', async () => {
    const refus = await appel({ method: 'POST', url: '/api/auth/connexion', payload: { identifiant: 'admin', motDePasse: 'faux' } });
    assert.equal(refus.statusCode, 401);
    const reponse = await appel({
        method: 'POST',
        url: '/api/auth/connexion',
        payload: { identifiant: 'Admin', motDePasse: 'MotDePasseAdmin1' }
    });
    assert.equal(reponse.statusCode, 201);
    const cookie = reponse.cookies.find(cookie => cookie.name === 'sd_session');
    assert.ok(cookie && cookie.value.length > 20);
    assert.match(String(reponse.headers['set-cookie']), /HttpOnly/);
    cookieAdmin = { sd_session: cookie!.value };
    const corps = json(reponse);
    assert.equal(corps.utilisateur.identifiant, 'admin');
    assert.equal(corps.utilisateur.roleGlobal, 'administrateur');
    assert.equal(corps.utilisateur.motDePasseHache, undefined);
    assert.equal(corps.espaceCourant.code, 'defaut');
    assert.equal(corps.espaceCourant.role, 'administrateur');
});

test('validation Zod : un corps invalide répond 400 avec le champ fautif', async () => {
    const reponse = await appel({ method: 'POST', url: '/api/auth/connexion', payload: { identifiant: '' } });
    assert.equal(reponse.statusCode, 400);
    assert.match(json(reponse).erreur, /identifiant/);
});

test('santé avec session : version DuckDB et volumes de l’espace courant', async () => {
    const corps = json(await appel({ method: 'GET', url: '/api/sante', cookies: cookieAdmin }));
    assert.match(corps.duckdb, /^v\d+\.\d+/);
    assert.equal(corps.espace, 'defaut');
    assert.equal(corps.tables, 0);
});

test('état : écrire, lire, lister, supprimer ; clé absente = absent:true ; clé dangereuse refusée', async () => {
    assert.equal(
        (
            await appel({
                method: 'PUT',
                url: '/api/etat/appState',
                payload: { valeur: { relations: [1, 2], governance: { glossary: [] } } },
                cookies: cookieAdmin
            })
        ).statusCode,
        204
    );
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/etat/appState', cookies: cookieAdmin })).valeur.relations, [1, 2]);
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/etat', cookies: cookieAdmin })), ['appState']);
    const absent = json(await appel({ method: 'GET', url: '/api/etat/inconnue', cookies: cookieAdmin }));
    assert.equal(absent.absent, true);
    assert.equal(
        (await appel({ method: 'PUT', url: '/api/etat/..%2Fpirate', payload: { valeur: 1 }, cookies: cookieAdmin })).statusCode,
        400
    );
    assert.equal((await appel({ method: 'DELETE', url: '/api/etat/appState', cookies: cookieAdmin })).statusCode, 204);
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/etat', cookies: cookieAdmin })), []);
});

test('fichiers : dépôt en flux, lecture complète et partielle (Range), refus au-delà de la taille maximale', async () => {
    const contenu = 'id;nom\n1;Ana\n2;Bob\n3;Zoé\n';
    const depot = await appel({
        method: 'PUT',
        url: '/api/fichiers/src_tb_test',
        payload: Buffer.from(contenu),
        headers: { 'content-type': 'application/octet-stream' },
        cookies: cookieAdmin
    });
    assert.equal(depot.statusCode, 201);
    assert.equal(json(depot).taille, Buffer.byteLength(contenu));
    assert.equal((await appel({ method: 'GET', url: '/api/fichiers/src_tb_test', cookies: cookieAdmin })).body, contenu);
    const partielle = await appel({
        method: 'GET',
        url: '/api/fichiers/src_tb_test',
        headers: { range: 'bytes=0-5' },
        cookies: cookieAdmin
    });
    assert.equal(partielle.statusCode, 206);
    assert.equal(partielle.body, 'id;nom');
    const trop = await appel({
        method: 'PUT',
        url: '/api/fichiers/trop_gros',
        payload: Buffer.alloc(1024 * 1024 + 10, 65),
        headers: { 'content-type': 'application/octet-stream' },
        cookies: cookieAdmin
    });
    assert.equal(trop.statusCode, 413);
    assert.equal(fs.existsSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'fichiers', 'trop_gros')), false);
    assert.equal((await appel({ method: 'GET', url: '/api/fichiers/..%2Fetc%2Fpasswd', cookies: cookieAdmin })).statusCode, 400);
});

test('SQL : le fichier déposé est lisible par son nom, BIGINT en chaîne, erreurs 400, réglages navigateur ignorés, limite 413', async () => {
    assert.equal(
        (
            await sql(
                "CREATE TABLE t_tb_test AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_tb_test', header=true, all_varchar=true, delim=';')"
            )
        ).statusCode,
        201
    );
    const lecture = json(await sql('SELECT * FROM t_tb_test ORDER BY __rn'));
    assert.deepEqual(
        lecture.colonnes.map((colonne: { nom: string }) => colonne.nom),
        ['__rn', 'id', 'nom']
    );
    assert.deepEqual(lecture.lignes[2], ['3', '3', 'Zoé']);
    const erreur = await sql('SELECT * FROM table_inexistante');
    assert.equal(erreur.statusCode, 400);
    assert.match(json(erreur).erreur, /table_inexistante/);
    assert.equal(json(await sql("SET temp_directory=''")).ignoree, true);
    assert.equal((await sql('SELECT range FROM range(1001)')).statusCode, 413);
});

test('SQL en flux : NDJSON avec colonnes puis paquets de lignes', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/sql/flux',
        payload: { sql: 'SELECT range::BIGINT AS i FROM range(5000)' },
        cookies: cookieAdmin
    });
    assert.equal(reponse.statusCode, 201);
    const lignes = reponse.body
        .trim()
        .split('\n')
        .map(ligne => JSON.parse(ligne));
    assert.deepEqual(lignes[0].colonnes, [{ nom: 'i', type: 'BIGINT' }]);
    assert.equal(
        lignes.slice(1).reduce((total, paquet) => total + paquet.lignes.length, 0),
        5000
    );
});

test('sources : métadonnées, optimisation Parquet côté serveur, export, suppression complète', async () => {
    assert.equal(
        (
            await appel({
                method: 'PUT',
                url: '/api/tables/tb_test',
                payload: {
                    name: 'test.csv',
                    type: 'csv',
                    config: { delim: ';' },
                    storage: 'table',
                    headers: ['id', 'nom'],
                    fichier: { nom: 'src_tb_test', name: 'test.csv', size: 20 }
                },
                cookies: cookieAdmin
            })
        ).statusCode,
        204
    );
    const liste = json(await appel({ method: 'GET', url: '/api/tables', cookies: cookieAdmin }));
    assert.equal(liste.length, 1);
    assert.equal(liste[0].id, 'tb_test');
    assert.equal(liste[0].fichier.nom, 'src_tb_test');
    assert.deepEqual(liste[0].headers, ['id', 'nom']);
    const optimisation = json(await appel({ method: 'POST', url: '/api/tables/tb_test/optimiser', cookies: cookieAdmin }));
    assert.equal(optimisation.fichier, 'pq_tb_test.parquet');
    const apres = json(await appel({ method: 'GET', url: '/api/tables/tb_test', cookies: cookieAdmin }));
    assert.equal(apres.storage, 'parquet');
    assert.equal(apres.optimized, true);
    assert.equal(json(await sql('SELECT COUNT(*)::BIGINT AS n FROM t_tb_test')).lignes[0][0], '3');
    const parquet = await appel({ method: 'POST', url: '/api/tables/tb_test/parquet', cookies: cookieAdmin });
    assert.equal(parquet.rawPayload.subarray(0, 4).toString(), 'PAR1');
    assert.equal((await appel({ method: 'DELETE', url: '/api/tables/tb_test', cookies: cookieAdmin })).statusCode, 204);
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/tables', cookies: cookieAdmin })), []);
    assert.equal((await sql('SELECT * FROM t_tb_test')).statusCode, 400);
    assert.equal(fs.existsSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'fichiers', 'pq_tb_test.parquet')), false);
});

test('gouvernance typée : glossaire et dictionnaire lisent et modifient le document appState', async () => {
    await appel({
        method: 'PUT',
        url: '/api/etat/appState',
        payload: { valeur: { governance: { glossary: [{ id: 'gl_a', term: 'Zèbre', definition: 'Animal' }], dictionary: {} } } },
        cookies: cookieAdmin
    });
    const terme = json(
        await appel({
            method: 'PUT',
            url: '/api/gouvernance/glossaire/gl_b',
            payload: { term: 'Client', definition: 'Personne ayant commandé' },
            cookies: cookieAdmin
        })
    );
    assert.equal(terme.id, 'gl_b');
    const glossaire = json(await appel({ method: 'GET', url: '/api/gouvernance/glossaire', cookies: cookieAdmin }));
    assert.deepEqual(
        glossaire.map((terme: { term: string }) => terme.term),
        ['Client', 'Zèbre']
    );
    const fiche = json(
        await appel({
            method: 'PUT',
            url: '/api/gouvernance/dictionnaire/clients.csv',
            payload: { description: 'Référentiel clients', owner: 'Équipe Données' },
            cookies: cookieAdmin
        })
    );
    assert.equal(fiche.owner, 'Équipe Données');
    const etat = json(await appel({ method: 'GET', url: '/api/etat/appState', cookies: cookieAdmin })).valeur;
    assert.equal(etat.governance.glossary.length, 2);
    assert.equal(etat.governance.dictionary['clients.csv'].description, 'Référentiel clients');
    assert.equal((await appel({ method: 'DELETE', url: '/api/gouvernance/glossaire/gl_a', cookies: cookieAdmin })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/gouvernance/glossaire/gl_zz', cookies: cookieAdmin })).statusCode, 404);
});

test('utilisateurs : création par l’administrateur, identifiant en double refusé, réservé aux administrateurs', async () => {
    const creation = await appel({
        method: 'POST',
        url: '/api/utilisateurs',
        payload: { identifiant: 'Lea', nomAffiche: 'Léa Martin', motDePasse: 'MotDePasse1!', email: 'lea@exemple.fr' },
        cookies: cookieAdmin
    });
    assert.equal(creation.statusCode, 201);
    assert.equal(json(creation).identifiant, 'lea');
    assert.equal(
        (
            await appel({
                method: 'POST',
                url: '/api/utilisateurs',
                payload: { identifiant: 'lea', nomAffiche: 'x', motDePasse: 'MotDePasse1!' },
                cookies: cookieAdmin
            })
        ).statusCode,
        400
    );
    assert.equal(
        (
            await appel({
                method: 'POST',
                url: '/api/utilisateurs',
                payload: { identifiant: 'x', nomAffiche: 'x', motDePasse: 'court' },
                cookies: cookieAdmin
            })
        ).statusCode,
        400
    );
    const liste = json(await appel({ method: 'GET', url: '/api/utilisateurs', cookies: cookieAdmin }));
    assert.deepEqual(
        liste.map((utilisateur: { identifiant: string }) => utilisateur.identifiant),
        ['admin', 'lea']
    );
});

test('espaces et rôles : une utilisatrice sans espace ne peut rien lire ; ajoutée comme lectrice, elle lit mais n’écrit pas', async () => {
    const connexion = await appel({
        method: 'POST',
        url: '/api/auth/connexion',
        payload: { identifiant: 'lea', motDePasse: 'MotDePasse1!' }
    });
    assert.equal(connexion.statusCode, 201);
    cookieLecteur = { sd_session: connexion.cookies.find(cookie => cookie.name === 'sd_session')!.value };
    assert.equal(json(connexion).espaceCourant, null);
    assert.equal((await appel({ method: 'GET', url: '/api/etat', cookies: cookieLecteur })).statusCode, 403);
    assert.equal((await appel({ method: 'GET', url: '/api/utilisateurs', cookies: cookieLecteur })).statusCode, 403);
    const membres = json(
        await appel({ method: 'PUT', url: '/api/espaces/defaut/membres/lea', payload: { role: 'lecteur' }, cookies: cookieAdmin })
    );
    assert.ok(membres.some((membre: { identifiant: string; role: string }) => membre.identifiant === 'lea' && membre.role === 'lecteur'));
    const moi = json(await appel({ method: 'GET', url: '/api/auth/moi', cookies: cookieLecteur }));
    assert.equal(moi.espaceCourant.code, 'defaut');
    assert.equal(moi.espaceCourant.role, 'lecteur');
    assert.equal((await appel({ method: 'GET', url: '/api/gouvernance/glossaire', cookies: cookieLecteur })).statusCode, 200);
    const ecriture = await appel({ method: 'PUT', url: '/api/etat/appState', payload: { valeur: {} }, cookies: cookieLecteur });
    assert.equal(ecriture.statusCode, 403);
    assert.match(json(ecriture).erreur, /editeur/);
    assert.equal((await sql('SELECT 1 AS un', cookieLecteur)).statusCode, 201);
    assert.equal((await sql('CREATE TABLE t_pirate AS SELECT 1', cookieLecteur)).statusCode, 403);
    assert.equal(
        (await appel({ method: 'PUT', url: '/api/espaces/defaut/membres/lea', payload: { role: 'editeur' }, cookies: cookieLecteur }))
            .statusCode,
        403
    );
});

test('espaces : création par l’administrateur, bascule d’espace courant, isolation des données', async () => {
    const creation = await appel({
        method: 'POST',
        url: '/api/espaces',
        payload: { code: 'finance', nom: 'Finance' },
        cookies: cookieAdmin
    });
    assert.equal(creation.statusCode, 201);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/espaces', payload: { code: 'Finance!', nom: 'x' }, cookies: cookieAdmin })).statusCode,
        400
    );
    const bascule = json(
        await appel({ method: 'PUT', url: '/api/auth/espace-courant', payload: { code: 'finance' }, cookies: cookieAdmin })
    );
    assert.equal(bascule.espaceCourant.code, 'finance');
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/etat', cookies: cookieAdmin })), []);
    assert.equal(json(await appel({ method: 'GET', url: '/api/sante', cookies: cookieAdmin })).espace, 'finance');
    assert.equal(
        (await appel({ method: 'PUT', url: '/api/auth/espace-courant', payload: { code: 'finance' }, cookies: cookieLecteur })).statusCode,
        400
    );
    await appel({ method: 'PUT', url: '/api/auth/espace-courant', payload: { code: 'defaut' }, cookies: cookieAdmin });
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/etat', cookies: cookieAdmin })), ['appState']);
});

test('journal : les actions sont consignées avec leur auteur', async () => {
    const entrees = json(await appel({ method: 'GET', url: '/api/journal?limite=50', cookies: cookieAdmin }));
    const actions = entrees.map((entree: { action: string }) => entree.action);
    for (const attendue of [
        'fichier.depot',
        'source.ajout',
        'source.optimisation',
        'source.suppression',
        'glossaire.ajout',
        'dictionnaire.modification',
        'espace.membre'
    ]) {
        assert.ok(actions.includes(attendue), 'action attendue dans le journal : ' + attendue);
    }
    assert.ok(entrees.every((entree: { auteur: string }) => entree.auteur === 'Administrateur'));
});

test('mot de passe : changement par l’utilisateur, ancien mot de passe vérifié', async () => {
    assert.equal(
        (
            await appel({
                method: 'PUT',
                url: '/api/auth/mot-de-passe',
                payload: { ancien: 'faux', nouveau: 'NouveauMotDePasse1' },
                cookies: cookieLecteur
            })
        ).statusCode,
        400
    );
    assert.equal(
        (
            await appel({
                method: 'PUT',
                url: '/api/auth/mot-de-passe',
                payload: { ancien: 'MotDePasse1!', nouveau: 'NouveauMotDePasse1' },
                cookies: cookieLecteur
            })
        ).statusCode,
        200
    );
    assert.equal(
        (await appel({ method: 'POST', url: '/api/auth/connexion', payload: { identifiant: 'lea', motDePasse: 'NouveauMotDePasse1' } }))
            .statusCode,
        201
    );
});

test('déconnexion : la session ne vaut plus rien ; un utilisateur désactivé ne peut plus se connecter', async () => {
    assert.equal((await appel({ method: 'POST', url: '/api/auth/deconnexion', cookies: cookieLecteur })).statusCode, 201);
    assert.equal((await appel({ method: 'GET', url: '/api/auth/moi', cookies: cookieLecteur })).statusCode, 401);
    const lea = json(await appel({ method: 'GET', url: '/api/utilisateurs', cookies: cookieAdmin })).find(
        (utilisateur: { identifiant: string }) => utilisateur.identifiant === 'lea'
    );
    assert.equal(
        (await appel({ method: 'PUT', url: '/api/utilisateurs/' + lea.id, payload: { actif: false }, cookies: cookieAdmin })).statusCode,
        200
    );
    assert.equal(
        (await appel({ method: 'POST', url: '/api/auth/connexion', payload: { identifiant: 'lea', motDePasse: 'NouveauMotDePasse1' } }))
            .statusCode,
        401
    );
});

test('documentation OpenAPI disponible sur /api/docs', async () => {
    const reponse = await appel({ method: 'GET', url: '/api/docs-json' });
    assert.equal(reponse.statusCode, 200);
    assert.ok(Object.keys(json(reponse).paths).includes('/api/sql'));
});

test('front absent : la racine explique comment construire', async () => {
    const reponse = await appel({ method: 'GET', url: '/sources' });
    assert.equal(reponse.statusCode, 404);
    assert.match(json(reponse).erreur, /construire/);
});
