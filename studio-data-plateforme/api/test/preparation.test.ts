/**
 * Tests des préparations : SQL des étapes (fonctions pures), recette exécutée en table propre (nettoyage,
 * standardisation, enrichissement avec taux d'appariement, dédoublonnage), aperçu par étape, relance par source.
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
import { sqlEtape, sqlRecettePreparation, sqlReferentiel } from '../src/preparation/recettes-preparation';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-preparation-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

async function chargerCsv(id: string, nom: string, csv: string) {
    await appel({
        method: 'PUT',
        url: `/api/fichiers/src_${id}`,
        payload: Buffer.from(csv),
        headers: { 'content-type': 'application/octet-stream' }
    });
    await appel({
        method: 'POST',
        url: '/api/sql',
        payload: {
            sql: `CREATE OR REPLACE TABLE "t_${id}" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_${id}', header=true, all_varchar=true, delim=';')`
        }
    });
    await appel({ method: 'PUT', url: `/api/tables/${id}`, payload: { name: nom, type: 'csv', headers: csv.split('\n')[0].split(';') } });
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
    await chargerCsv(
        'tb_c',
        'contacts.csv',
        'id;nom;email;tel;pays\n1;  ana ;Ana@Mail.FR;06 12 34 56 78;fr\n2;bob;BOB@mail.fr;+33 7 00 00 00 00;DE\n2;bob;bob@mail.fr;0700000000;de\n3;test;x@y.z;;ZZ\n'
    );
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : SQL des étapes, étapes incomplètes ignorées, référentiel en VALUES', () => {
    const base = 'SELECT * FROM "t"';
    assert.match(
        sqlEtape({ id: 'e1', type: 'clean', enabled: true, p: { col: 'nom', action: 'upper' } }, base)!,
        /REPLACE \(UPPER\(CAST\("nom" AS VARCHAR\)\) AS "nom"\)/
    );
    assert.equal(sqlEtape({ id: 'e2', type: 'clean', enabled: true, p: {} }, base), null, 'sans colonne, rien');
    assert.match(
        sqlEtape({ id: 'e3', type: 'dedup', enabled: true, p: { keys: 'id; nom' } }, base)!,
        /QUALIFY row_number\(\) OVER \(PARTITION BY/
    );
    assert.match(
        sqlEtape({ id: 'e4', type: 'calc', enabled: true, p: { name: 'total', formula: '[prix] * [qte]' } }, base)!,
        /\("prix" \* "qte"\) AS "total"/
    );
    assert.match(sqlEtape({ id: 'e5', type: 'drop', enabled: true, p: { cols: 'a;b' } }, base)!, /EXCLUDE \("a", "b"\)/);
    assert.match(sqlEtape({ id: 'e6', type: 'filter', enabled: true, p: { col: 'nom', op: 'neq', val: 'test' } }, base)!, /WHERE/);
    assert.match(sqlReferentiel('pays')!, /\(VALUES \('FR', 'France', 'EUR'\)/);
    assert.equal(sqlReferentiel('inconnu'), null);
    const sql = sqlRecettePreparation(
        {
            steps: [
                { id: 'a', type: 'clean', enabled: false, p: { col: 'nom' } },
                { id: 'b', type: 'rename', enabled: true, p: { col: 'nom', to: 'NOM' } }
            ]
        },
        't_x'
    );
    assert.match(sql, /RENAME \("nom" AS "NOM"\)/);
    assert.doesNotMatch(sql, /TRIM/, "l'étape désactivée n'est pas appliquée");
});

test('recette exécutée : filtre, nettoyage, standardisation, enrichissement (taux), dédoublonnage → table propre', async () => {
    const recette = {
        name: 'Contacts propres',
        src: 'contacts.csv',
        out: 'PROPRE_CONTACTS',
        steps: [
            { id: 's1', type: 'filter', enabled: true, p: { col: 'nom', op: 'neq', val: 'test' } },
            { id: 's2', type: 'clean', enabled: true, p: { col: 'nom', action: 'trim' } },
            { id: 's3', type: 'clean', enabled: true, p: { col: 'nom', action: 'upper' } },
            { id: 's4', type: 'std', enabled: true, p: { col: 'email', what: 'email' } },
            { id: 's5', type: 'std', enabled: true, p: { col: 'tel', what: 'phone' } },
            { id: 's6', type: 'enrich', enabled: true, p: { col: 'pays', ref: 'pays', prefix: 'REF_' } },
            { id: 's7', type: 'dedup', enabled: true, p: { keys: 'id;email' } }
        ]
    };
    assert.equal((await appel({ method: 'PUT', url: '/api/preparation/recettes/rc_1', payload: recette })).statusCode, 200);
    const apercu = json(await appel({ method: 'POST', url: '/api/preparation/recettes/rc_1/apercu', payload: { jusquA: 0 } }));
    assert.equal(apercu.total, 3, 'après le filtre, la ligne de test a disparu');
    const execution = json(await appel({ method: 'POST', url: '/api/preparation/recettes/rc_1/executer', payload: {} }));
    assert.equal(execution.lignes, 2, 'les deux lignes de Bob (même id, même email une fois en minuscules) sont dédoublonnées');
    assert.deepEqual(execution.colonnes, ['id', 'nom', 'email', 'tel', 'pays', 'REF_PAYS', 'REF_DEVISE']);
    assert.equal(execution.recette.steps[5].lastMatch, 100, 'fr et DE sont appariés au référentiel des pays');
    const lignes = json(
        await appel({
            method: 'POST',
            url: '/api/sql',
            payload: { sql: `SELECT nom, email, tel, "REF_PAYS" FROM "t_${execution.sourceId}" ORDER BY id` }
        })
    ).lignes;
    assert.deepEqual(lignes[0], ['ANA', 'ana@mail.fr', '+33612345678', 'France']);
    assert.equal(lignes[1][3], 'Allemagne');
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    const produite = sources.find((source: { name: string }) => source.name === 'PROPRE_CONTACTS');
    assert.equal(produite.type, 'extraction');
    assert.equal(produite.preparation.recetteId, 'rc_1');
});

test('relance par source : la recette est rejouée, la table produite garde son identifiant', async () => {
    const avant = json(await appel({ method: 'GET', url: '/api/preparation/recettes' }))[0];
    const relance = json(
        await appel({ method: 'POST', url: '/api/preparation/executer-pour-source', payload: { nomSource: 'contacts.csv' } })
    );
    assert.deepEqual(relance, { executees: ['Contacts propres'], erreurs: [] });
    const apres = json(await appel({ method: 'GET', url: '/api/preparation/recettes' }))[0];
    assert.equal(apres.targetId, avant.targetId);
    assert.equal((await appel({ method: 'POST', url: '/api/preparation/recettes/inconnue/executer', payload: {} })).statusCode, 404);
    await appel({ method: 'DELETE', url: '/api/preparation/recettes/rc_1' });
    assert.equal(json(await appel({ method: 'GET', url: '/api/preparation/recettes' })).length, 0);
});
