/**
 * Tests du modèle de données enrichi : modification d'un lien (cardinalité, nature), mesure d'un lien sur les
 * données, règles métier sur les liens (cardinalités conditionnelles) ; et relecture d'un CSV avec ses paramètres.
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
import { lectureDuckDB } from '../src/importation/ingestion';
import { conditionEnfants, libelleRegleLien, mesureDepuisLigne, sqlTestRegleLien } from '../src/modele/regles-liens';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-modele-regles-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

async function chargerSource(id: string, nom: string, csv: string) {
    await appel({
        method: 'PUT',
        url: '/api/fichiers/src_' + id,
        payload: Buffer.from(csv),
        headers: { 'content-type': 'application/octet-stream' }
    });
    const reponse = await appel({ method: 'POST', url: '/api/importation/fichier', payload: { nomServeur: 'src_' + id, nomFichier: nom } });
    assert.equal(reponse.statusCode, 201, reponse.body);
}

before(async () => {
    const configuration = lireConfiguration({
        SD_DONNEES: dossierTemporaire,
        SD_JOURNAL: 'silent',
        SD_ADMIN_MOT_DE_PASSE: 'MotDePasseAdmin1',
        SD_WEB: path.join(dossierTemporaire, 'absent'),
        SD_WEB_CLASSIQUE: path.join(dossierTemporaire, 'absent')
    });
    app = await creerApplication(configuration);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const connexion = await appel({
        method: 'POST',
        url: '/api/auth/connexion',
        payload: { identifiant: 'admin', motDePasse: 'MotDePasseAdmin1' }
    });
    cookies = { sd_session: connexion.cookies.find(cookie => cookie.name === 'sd_session')!.value };
    // Emplacements et accès : l'emplacement 1 a deux accès GENERAL, le 2 un seul, le 3 aucun ; l'accès 14 est orphelin.
    await chargerSource('tb_e', 'emplacements.csv', 'id;nom\n1;Hall\n2;Cave\n3;Toit\n');
    await chargerSource(
        'tb_a',
        'acces.csv',
        'id_acces;id_emplacement;type\n10;1;GENERAL\n11;1;GENERAL\n12;2;GENERAL\n13;2;SECOURS\n14;9;GENERAL\n'
    );
    const relation = await appel({
        method: 'POST',
        url: '/api/modele/relations',
        payload: { sourceTable: 'acces.csv', sourceCol: 'id_emplacement', targetTable: 'emplacements.csv', targetCol: 'id' }
    });
    assert.ok(relation.statusCode < 300, relation.body);
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : libellé d’une règle, condition sur les enfants, requête de test, mesure, options de lecture CSV', () => {
    const regle = {
        id: 'r1',
        parentTable: 'emplacements.csv',
        parentCol: 'id',
        childTable: 'acces.csv',
        childCol: 'id_emplacement',
        cond: { col: 'type', op: '=', val: 'GENERAL' },
        expect: '=' as const,
        n: 1,
        label: ''
    };
    assert.equal(libelleRegleLien(regle), '1 emplacements.csv doit avoir exactement 1 acces.csv [type = "GENERAL"]');
    assert.equal(libelleRegleLien({ ...regle, label: 'Un accès général par emplacement' }), 'Un accès général par emplacement');
    assert.match(conditionEnfants({ col: 'type', op: 'contains', val: 'gen' }), /LIKE '%' \|\| 'gen' \|\| '%'/);
    assert.match(conditionEnfants({ col: 'type', op: 'empty', val: '' }), /IS NULL OR TRIM/);
    assert.equal(conditionEnfants(null), '');
    assert.match(sqlTestRegleLien(regle, 't_e', 't_a'), /COALESCE\(cnt\.c, 0\) = 1/);
    assert.deepEqual(mesureDepuisLigne(['5', '3', '2', '1', '1', '0']).suggested, 'N-1');
    assert.equal(
        lectureDuckDB('src_x', 'csv', { delim: ';', enc: 'ISO-8859-1', quote: 'none', ignoreErrors: true }),
        "read_csv_auto('src_x', header=true, all_varchar=true, delim=';', encoding='latin-1', quote='', ignore_errors=true)"
    );
    assert.equal(lectureDuckDB('src_x', 'csv'), "read_csv_auto('src_x', header=true, all_varchar=true)");
});

test('lien : modification de la cardinalité et de la nature, mesure sur les données (cardinalité constatée, orphelins)', async () => {
    const [relation] = json(await appel({ method: 'GET', url: '/api/modele/relations' }));
    const modifiees = json(
        await appel({
            method: 'PUT',
            url: '/api/modele/relations/' + encodeURIComponent(relation.id),
            payload: { cardinality: 'N-1', kind: 'composition' }
        })
    );
    assert.deepEqual([modifiees[0].cardinality, modifiees[0].kind], ['N-1', 'composition']);
    const mesure = json(await appel({ method: 'POST', url: '/api/modele/relations/' + encodeURIComponent(relation.id) + '/mesurer' }));
    assert.deepEqual(
        [mesure.stotal, mesure.ttotal, mesure.smax, mesure.tmax, mesure.sorph, mesure.torph, mesure.suggested],
        [5, 3, 2, 1, 1, 1, 'N-1']
    );
    const [relue] = json(await appel({ method: 'GET', url: '/api/modele/relations' }));
    assert.equal(relue.measured.suggested, 'N-1', 'la mesure est mémorisée sur le lien');
    assert.equal((await appel({ method: 'POST', url: '/api/modele/relations/absent/mesurer' })).statusCode, 404);
});

test('règles métier sur les liens : enregistrement, test (violations et exemples), lignes en défaut, suppression', async () => {
    const regle = {
        parentTable: 'emplacements.csv',
        parentCol: 'id',
        childTable: 'acces.csv',
        childCol: 'id_emplacement',
        cond: { col: 'type', op: '=', val: 'GENERAL' },
        expect: '=',
        n: 1
    };
    const regles = json(await appel({ method: 'PUT', url: '/api/modele/regles/rul_general', payload: regle }));
    assert.equal(regles.length, 1);
    const liste = json(await appel({ method: 'GET', url: '/api/modele/regles' }));
    assert.equal(liste[0].libelle, '1 emplacements.csv doit avoir exactement 1 acces.csv [type = "GENERAL"]');
    const test1 = json(await appel({ method: 'POST', url: '/api/modele/regles/rul_general/tester' }));
    assert.deepEqual([test1.total, test1.violations, test1.exemples.sort()], [3, 2, ['1', '3']], 'Hall a deux accès généraux, Toit aucun');
    const lignes = json(await appel({ method: 'GET', url: '/api/modele/regles/rul_general/lignes' }));
    assert.equal(lignes.total, 2);
    assert.deepEqual(lignes.colonnes, ['id', 'nom', 'nombre_enfants']);
    await appel({
        method: 'PUT',
        url: '/api/modele/regles/rul_general',
        payload: { ...regle, expect: '>=', n: 1, label: 'Au moins un accès général' }
    });
    const test2 = json(await appel({ method: 'POST', url: '/api/modele/regles/rul_general/tester' }));
    assert.deepEqual([test2.total, test2.violations], [3, 1]);
    assert.equal(json(await appel({ method: 'GET', url: '/api/modele/regles' }))[0].libelle, 'Au moins un accès général');
    const vocabulaire = json(await appel({ method: 'GET', url: '/api/modele/regles/vocabulaire' }));
    assert.equal(vocabulaire.operateursAttendu['<='], 'au plus');
    assert.deepEqual(json(await appel({ method: 'DELETE', url: '/api/modele/regles/rul_general' })), []);
    assert.equal((await appel({ method: 'POST', url: '/api/modele/regles/rul_general/tester' })).statusCode, 404);
});

test('relecture d’un CSV avec ses paramètres : séparateur forcé, guillemets ignorés, paramètres mémorisés', async () => {
    await chargerSource('tb_p', 'pipes.csv', 'a|b\n1|"x\n2|y\n');
    const source = json(await appel({ method: 'GET', url: '/api/tables/tb_p' }));
    assert.ok(source.headers.length >= 1);
    const relecture = await appel({
        method: 'POST',
        url: '/api/importation/relire',
        payload: { sourceId: 'tb_p', config: { delim: '|', quote: 'none', ignoreErrors: true } }
    });
    assert.equal(relecture.statusCode, 201, relecture.body);
    const relue = json(relecture);
    assert.deepEqual(relue.source.headers, ['a', 'b']);
    assert.equal(relue.lignes, 2);
    assert.deepEqual(relue.source.config, { delim: '|', enc: 'UTF-8', quote: 'none', ignoreErrors: true });
    const contenu = json(await appel({ method: 'POST', url: '/api/sql', payload: { sql: 'SELECT b FROM t_tb_p ORDER BY __rn' } }));
    assert.deepEqual(
        contenu.lignes.map((ligne: string[]) => ligne[0]),
        ['"x', 'y']
    );
    assert.equal(
        (await appel({ method: 'POST', url: '/api/importation/relire', payload: { sourceId: 'absente', config: {} } })).statusCode,
        404
    );
});
