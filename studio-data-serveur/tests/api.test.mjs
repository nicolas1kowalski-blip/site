// Tests de l'API (sans navigateur) : chaque test démarre une application sur un dossier de données temporaire.
//   node --test tests/api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireConfiguration } from '../serveur/configuration.mjs';
import { creerApplication } from '../serveur/application.mjs';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-api-'));
let app;

before(async () => {
    const configuration = lireConfiguration({
        SD_DONNEES: dossierTemporaire,
        SD_JOURNAL: 'silent',
        SD_LIMITE_LIGNES: '1000',
        SD_TAILLE_MAX_FICHIER_MO: '1'
    });
    configuration.dossierClient = path.join(dossierTemporaire, 'client-absent');
    app = await creerApplication(configuration);
    await app.ready();
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

const json = reponse => JSON.parse(reponse.body);
const sql = requete => app.inject({ method: 'POST', url: '/api/sql', payload: { sql: requete } });

test('santé : version, moteur DuckDB, espace par défaut', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/api/sante' });
    assert.equal(reponse.statusCode, 200);
    const corps = json(reponse);
    assert.equal(corps.ok, true);
    assert.match(corps.duckdb, /^v\d+\.\d+/);
    assert.equal(corps.espace, 'defaut');
});

test('authentification « aucune » : utilisateur local administrateur', async () => {
    const corps = json(await app.inject({ method: 'GET', url: '/api/moi' }));
    assert.equal(corps.id, 'local');
    assert.deepEqual(corps.roles, ['administrateur']);
    assert.equal(corps.mode, 'aucune');
});

test('état : écrire, lire, lister, supprimer ; clé absente = absent:true (pas une erreur)', async () => {
    assert.equal(
        (
            await app.inject({
                method: 'PUT',
                url: '/api/etat/appState',
                payload: { valeur: { relations: [1, 2], governance: { glossary: [] } } }
            })
        ).statusCode,
        204
    );
    const lu = json(await app.inject({ method: 'GET', url: '/api/etat/appState' }));
    assert.deepEqual(lu.valeur.relations, [1, 2]);
    assert.deepEqual(json(await app.inject({ method: 'GET', url: '/api/etat' })), ['appState']);
    const absent = json(await app.inject({ method: 'GET', url: '/api/etat/inconnue' }));
    assert.equal(absent.absent, true);
    assert.equal(absent.valeur, null);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/etat/appState' })).statusCode, 204);
    assert.deepEqual(json(await app.inject({ method: 'GET', url: '/api/etat' })), []);
});

test('état : une clé avec traversée de chemin est refusée (400)', async () => {
    const reponse = await app.inject({ method: 'PUT', url: '/api/etat/..%2Fpirate', payload: { valeur: 1 } });
    assert.equal(reponse.statusCode, 400);
    assert.match(json(reponse).erreur, /invalide/);
    assert.equal(fs.existsSync(path.join(dossierTemporaire, 'espaces', 'pirate.json')), false);
});

test('fichiers : dépôt binaire en flux, lecture complète et partielle (Range), liste, suppression', async () => {
    const contenu = 'id;nom\n1;Ana\n2;Bob\n3;Zoé\n';
    const depot = await app.inject({
        method: 'PUT',
        url: '/api/fichiers/src_tb_test',
        payload: Buffer.from(contenu),
        headers: { 'content-type': 'application/octet-stream' }
    });
    assert.equal(depot.statusCode, 201);
    assert.equal(json(depot).taille, Buffer.byteLength(contenu));
    const lecture = await app.inject({ method: 'GET', url: '/api/fichiers/src_tb_test' });
    assert.equal(lecture.statusCode, 200);
    assert.equal(lecture.body, contenu);
    const partielle = await app.inject({
        method: 'GET',
        url: '/api/fichiers/src_tb_test',
        headers: { range: 'bytes=0-5' }
    });
    assert.equal(partielle.statusCode, 206);
    assert.equal(partielle.body, 'id;nom');
    assert.equal(partielle.headers['content-range'], `bytes 0-5/${Buffer.byteLength(contenu)}`);
    const liste = json(await app.inject({ method: 'GET', url: '/api/fichiers' }));
    assert.deepEqual(
        liste.map(f => f.nom),
        ['src_tb_test']
    );
    assert.equal((await app.inject({ method: 'GET', url: '/api/fichiers/..%2F..%2Fetc%2Fpasswd' })).statusCode, 400);
    assert.equal((await app.inject({ method: 'GET', url: '/api/fichiers/absent' })).statusCode, 404);
});

test('fichiers : un dépôt au-delà de la taille maximale est refusé (413) sans laisser de fichier', async () => {
    const trop = Buffer.alloc(1024 * 1024 + 10, 65);
    const reponse = await app.inject({
        method: 'PUT',
        url: '/api/fichiers/trop_gros',
        payload: trop,
        headers: { 'content-type': 'application/octet-stream' }
    });
    assert.equal(reponse.statusCode, 413);
    assert.equal(fs.existsSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'fichiers', 'trop_gros')), false);
    assert.equal(
        fs.existsSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'fichiers', 'trop_gros.partiel')),
        false
    );
});

test('SQL : le fichier déposé est lisible par son nom (file_search_path), BIGINT en chaîne, colonnes typées', async () => {
    const creation = await sql(
        "CREATE TABLE t_tb_test AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_tb_test', header=true, all_varchar=true, delim=';')"
    );
    assert.equal(creation.statusCode, 200);
    const lecture = json(await sql('SELECT * FROM t_tb_test ORDER BY __rn'));
    assert.deepEqual(
        lecture.colonnes.map(c => c.nom),
        ['__rn', 'id', 'nom']
    );
    assert.equal(lecture.colonnes[0].type, 'BIGINT');
    assert.deepEqual(lecture.lignes, [
        ['1', '1', 'Ana'],
        ['2', '2', 'Bob'],
        ['3', '3', 'Zoé']
    ]);
    const agregat = json(await sql('SELECT COUNT(*)::BIGINT AS n, list(nom ORDER BY nom) AS noms FROM t_tb_test'));
    assert.equal(agregat.lignes[0][0], '3');
    assert.deepEqual(agregat.lignes[0][1], ['Ana', 'Bob', 'Zoé']);
});

test('SQL : erreur DuckDB → 400 avec le message du moteur ; requête vide → 400', async () => {
    const reponse = await sql('SELECT * FROM table_inexistante');
    assert.equal(reponse.statusCode, 400);
    assert.match(json(reponse).erreur, /table_inexistante/);
    assert.equal((await sql('')).statusCode, 400);
});

test('SQL : les réglages mémoire/spill du navigateur sont acceptés sans être exécutés', async () => {
    for (const requete of [
        "SET temp_directory=''",
        "SET memory_limit='1GB'",
        'PRAGMA threads=1',
        'RESET memory_limit'
    ]) {
        const corps = json(await sql(requete));
        assert.equal(corps.ignoree, true, requete);
    }
    const reglage = json(await sql("SELECT current_setting('memory_limit') AS m"));
    assert.notEqual(reglage.lignes[0][0], '1.0 GiB');
});

test('SQL : au-delà de la limite de lignes, erreur 413 explicite', async () => {
    const reponse = await sql('SELECT range FROM range(1001)');
    assert.equal(reponse.statusCode, 413);
    assert.match(json(reponse).erreur, /LIMIT|flux/);
});

test('SQL en flux : NDJSON, première ligne = colonnes, puis paquets de lignes ; erreur SQL = 400', async () => {
    const reponse = await app.inject({
        method: 'POST',
        url: '/api/sql/flux',
        payload: { sql: 'SELECT range::BIGINT AS i FROM range(5000)' }
    });
    assert.equal(reponse.statusCode, 200);
    assert.match(reponse.headers['content-type'], /x-ndjson/);
    const lignes = reponse.body
        .trim()
        .split('\n')
        .map(l => JSON.parse(l));
    assert.deepEqual(lignes[0].colonnes, [{ nom: 'i', type: 'BIGINT' }]);
    const total = lignes.slice(1).reduce((n, paquet) => n + paquet.lignes.length, 0);
    assert.equal(total, 5000);
    assert.equal(lignes[1].lignes[0][0], '0');
    assert.equal(
        (await app.inject({ method: 'POST', url: '/api/sql/flux', payload: { sql: 'SELECT * FROM rien' } })).statusCode,
        400
    );
});

test('tables : métadonnées écrites, listées, optimisées en Parquet côté serveur, exportées, supprimées', async () => {
    assert.equal(
        (
            await app.inject({
                method: 'PUT',
                url: '/api/tables/tb_test',
                payload: { name: 'test.csv', type: 'csv', config: { delim: ';' }, storage: 'table' }
            })
        ).statusCode,
        204
    );
    assert.equal(
        (await app.inject({ method: 'PUT', url: '/api/tables/tb_test', payload: { pasDeNom: true } })).statusCode,
        400
    );
    const liste = json(await app.inject({ method: 'GET', url: '/api/tables' }));
    assert.equal(liste.length, 1);
    assert.equal(liste[0].id, 'tb_test');
    assert.equal(liste[0].name, 'test.csv');
    const optimisation = json(await app.inject({ method: 'POST', url: '/api/tables/tb_test/optimiser' }));
    assert.equal(optimisation.fichier, 'pq_tb_test.parquet');
    assert.ok(optimisation.taille > 0);
    const apres = json(await app.inject({ method: 'GET', url: '/api/tables/tb_test' }));
    assert.equal(apres.storage, 'parquet');
    assert.equal(apres.optimized, true);
    const tables = await app.inject({ method: 'GET', url: '/api/sante' });
    assert.equal(json(tables).tables, 1);
    const relecture = json(await sql('SELECT COUNT(*)::BIGINT AS n FROM t_tb_test'));
    assert.equal(relecture.lignes[0][0], '3');
    const parquet = await app.inject({ method: 'POST', url: '/api/tables/tb_test/parquet' });
    assert.equal(parquet.statusCode, 200);
    assert.equal(parquet.rawPayload.subarray(0, 4).toString(), 'PAR1');
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/tables/tb_test' })).statusCode, 204);
    assert.deepEqual(json(await app.inject({ method: 'GET', url: '/api/tables' })), []);
    assert.equal((await sql('SELECT * FROM t_tb_test')).statusCode, 400);
    const fichiers = json(await app.inject({ method: 'GET', url: '/api/fichiers' }));
    assert.equal(
        fichiers.some(f => f.nom.startsWith('src_tb_test') || f.nom.startsWith('pq_tb_test')),
        false
    );
});

test('remise à zéro : DELETE /api/tables efface tables DuckDB, fichiers et métadonnées', async () => {
    await app.inject({
        method: 'PUT',
        url: '/api/fichiers/src_tb_z',
        payload: Buffer.from('a\n1\n'),
        headers: { 'content-type': 'application/octet-stream' }
    });
    await sql("CREATE TABLE t_tb_z AS SELECT * FROM read_csv_auto('src_tb_z')");
    await app.inject({ method: 'PUT', url: '/api/tables/tb_z', payload: { name: 'z.csv', type: 'csv' } });
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/tables' })).statusCode, 204);
    assert.deepEqual(json(await app.inject({ method: 'GET', url: '/api/fichiers' })), []);
    assert.equal(json(await app.inject({ method: 'GET', url: '/api/sante' })).tables, 0);
});

test('persistance : après fermeture et réouverture, les tables et l’état sont toujours là', async () => {
    await app.inject({
        method: 'PUT',
        url: '/api/fichiers/src_tb_p',
        payload: Buffer.from('x;y\n1;2\n'),
        headers: { 'content-type': 'application/octet-stream' }
    });
    await sql(
        "CREATE VIEW t_tb_p AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_tb_p', header=true, all_varchar=true, delim=';')"
    );
    await app.inject({ method: 'PUT', url: '/api/etat/appState', payload: { valeur: { savedAt: 'x' } } });
    await app.close();
    const configuration = lireConfiguration({ SD_DONNEES: dossierTemporaire, SD_JOURNAL: 'silent' });
    configuration.dossierClient = path.join(dossierTemporaire, 'client-absent');
    app = await creerApplication(configuration);
    await app.ready();
    const lecture = json(await sql('SELECT * FROM t_tb_p'));
    assert.deepEqual(lecture.lignes, [['1', '1', '2']]);
    assert.equal(json(await app.inject({ method: 'GET', url: '/api/etat/appState' })).valeur.savedAt, 'x');
});

test('front absent : la racine explique comment construire le client', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/' });
    assert.equal(reponse.statusCode, 200);
    assert.match(json(reponse).message, /npm run construire/);
});
