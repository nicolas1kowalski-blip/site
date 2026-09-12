/**
 * Tests des tables conçues : constructeur SQL (pur), construction d'une table consolidée à partir de deux sources
 * (formats, clé, enrichissement, colonne calculée, clé étrangère), écarts, contributions, reconstruction.
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
import {
    Recette,
    conditionFiltreSource,
    construireSqlTableConcue,
    formuleEnSql,
    schemaRecette,
    verifierRecette
} from '../src/tables-concues/constructeur-table-concue';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-tables-concues-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

/** Dépose un CSV (séparateur ;), le charge dans DuckDB et enregistre la source. */
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
            sql: `CREATE TABLE "t_${id}" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_${id}', header=true, all_varchar=true, delim=';')`
        }
    });
    const enTetes = csv.split('\n')[0].split(';');
    await appel({ method: 'PUT', url: `/api/tables/${id}`, payload: { name: nom, type: 'csv', headers: enTetes } });
}

const recetteSites = (): Recette =>
    schemaRecette.parse({
        name: 'Sites consolidés',
        sources: [
            { src: 'sites_nord.csv', map: { Code: 'code', Libellé: 'libelle', Surface: 'surface', Ouverture: 'date_ouverture' } },
            { src: 'sites_sud.csv', map: { Code: 'CODE', Libellé: 'NOM', Surface: 'SURFACE_M2', Ouverture: 'OUVERTURE' } }
        ],
        attrs: ['Code', 'Libellé', 'Surface', 'Ouverture'],
        formats: { Surface: 'dec', Ouverture: 'date' },
        key: ['Code'],
        joins: [{ src: 'regions.csv', srcKey: 'code_site', attr: 'Code', col: 'region', as: 'Région' }],
        calcs: [{ name: 'Grande', formula: "CASE WHEN TRY_CAST([Surface] AS DOUBLE) > 1000 THEN 'OUI' ELSE 'NON' END" }],
        fks: [{ attr: 'Code', table: 'regions.csv', col: 'code_site' }]
    });

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
        'tb_nord',
        'sites_nord.csv',
        'code;libelle;surface;date_ouverture\nS1;Dépôt Lille;1 200;01/02/2019\nS2;Agence Arras;300;2020-05-10\nS3;Hub Douai;abc;2021-13-40\n'
    );
    await chargerCsv(
        'tb_sud',
        'sites_sud.csv',
        'CODE;NOM;SURFACE_M2;OUVERTURE\nS1;Dépôt Lille;1200;2019-02-01\nS4;Agence Nice;450;15/03/2022\nS2;Agence Arras Sud;300;2020-05-10\n'
    );
    await chargerCsv('tb_reg', 'regions.csv', 'code_site;region\nS1;Hauts-de-France\nS2;Hauts-de-France\nS4;PACA\n');
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('constructeur SQL : filtres d’entrée, formules et vérifications de recette', () => {
    assert.equal(conditionFiltreSource({ col: 'ville', op: 'eq', val: 'Paris' }), `CAST("ville" AS VARCHAR) = 'Paris'`);
    assert.equal(conditionFiltreSource({ col: 'ville', op: 'contains', val: '' }), '', 'valeur vide → filtre ignoré');
    assert.match(conditionFiltreSource({ col: 'date', op: 'gte', val: '01/02/2024' }), /AS DATE\)\) >= /);
    assert.match(conditionFiltreSource({ col: 'montant', op: 'lt', val: '10' }, 'lk.'), /^TRY_CAST\(REPLACE\(CAST\(lk\."montant"/);
    assert.equal(formuleEnSql('[Prix] * [ Quantité ]'), '"Prix" * "Quantité"');
    const recette = recetteSites();
    assert.throws(() => verifierRecette({ ...recette, attrs: [...recette.attrs, 'SOURCE_ORIGINE'] }), /réservé/);
    assert.throws(() => verifierRecette({ ...recette, calcs: [{ name: 'Code', formula: '1' }] }), /en double/);
    assert.throws(() => verifierRecette({ ...recette, key: ['Inconnu'] }), /clé cite un attribut inconnu/);
    const sql = construireSqlTableConcue(recette, {
        nomTableDe: nom => 't_' + nom,
        colonnesDe: () => ['code', 'libelle', 'surface', 'date_ouverture', 'CODE', 'NOM', 'SURFACE_M2', 'OUVERTURE', 'code_site', 'region']
    });
    assert.match(sql, /UNION ALL/);
    assert.match(sql, /LEFT JOIN/);
    assert.match(sql, /QUALIFY row_number\(\) OVER \(PARTITION BY/);
    assert.match(sql, /"Grande"/);
});

test('construction : union de deux sources, formats, dédoublonnage par clé, enrichissement, calcul, contrôles', async () => {
    const reponse = await appel({ method: 'POST', url: '/api/tables-concues/construire', payload: recetteSites() });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const table = json(reponse);
    assert.equal(table.type, 'designed');
    assert.deepEqual(table.headers, ['SOURCE_ORIGINE', 'Code', 'Libellé', 'Surface', 'Ouverture', 'Région', 'Grande']);
    // 3 + 3 lignes, S1 strictement identique après normalisation → 5 lignes.
    assert.equal(table.design.lastRows, 5);
    assert.deepEqual(table.design.lastConform, { Surface: 1, Ouverture: 1 }, '« abc » et « 2021-13-40 » restent non conformes');
    assert.equal(table.design.lastFk[0].orphans, 1, 'S3 n’a pas de région');
    const contenu = json(
        await appel({
            method: 'POST',
            url: '/api/sql',
            payload: {
                sql: `SELECT "Code", "Surface", "Ouverture", "Région", "Grande" FROM "t_${table.id}" ORDER BY "Code", "SOURCE_ORIGINE"`
            }
        })
    );
    assert.deepEqual(contenu.lignes[0], ['S1', '1200.0', '2019-02-01', 'Hauts-de-France', 'OUI']);
    assert.equal(
        contenu.lignes.filter((ligne: string[]) => ligne[0] === 'S2').length,
        2,
        'S2 diverge sur le libellé : deux lignes conservées'
    );
    // La table apparaît dans les sources, et le lien de clé étrangère est déclaré dans le modèle.
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    assert.ok(sources.some((source: { id: string; type: string }) => source.id === table.id && source.type === 'designed'));
    const relations = json(await appel({ method: 'GET', url: '/api/modele/relations' }));
    assert.ok(
        relations.some(
            (relation: { sourceTable: string; targetTable: string }) =>
                relation.sourceTable === 'Sites consolidés' && relation.targetTable === 'regions.csv'
        )
    );
});

test('sql et aperçu d’une recette, sans construire', async () => {
    const sql = json(await appel({ method: 'POST', url: '/api/tables-concues/sql', payload: recetteSites() }));
    assert.match(sql.sql, /SOURCE_ORIGINE/);
    const apercu = json(
        await appel({ method: 'POST', url: '/api/tables-concues/apercu', payload: { recette: recetteSites(), limite: 2 } })
    );
    assert.equal(apercu.lignes.length, 2);
    assert.equal(apercu.colonnes[0].nom, 'SOURCE_ORIGINE');
    const invalide = await appel({
        method: 'POST',
        url: '/api/tables-concues/sql',
        payload: { ...recetteSites(), sources: [{ src: 'absente.csv', map: {} }] }
    });
    assert.equal(invalide.statusCode, 400);
    assert.match(json(invalide).erreur, /absente\.csv/);
});

test('écarts entre sources et contributions', async () => {
    const [table] = json(await appel({ method: 'GET', url: '/api/tables-concues' }));
    const ecarts = json(await appel({ method: 'GET', url: `/api/tables-concues/${table.id}/ecarts` }));
    assert.equal(ecarts.nombreCles, 1);
    assert.deepEqual(
        ecarts.ecarts.map((ecart: { cle: string; attribut: string; source: string; valeur: string }) => [
            ecart.cle,
            ecart.attribut,
            ecart.source,
            ecart.valeur
        ]),
        [
            ['S2', 'Libellé', 'sites_nord.csv', 'Agence Arras'],
            ['S2', 'Libellé', 'sites_sud.csv', 'Agence Arras Sud']
        ]
    );
    const contributions = json(await appel({ method: 'GET', url: `/api/tables-concues/${table.id}/contributions` }));
    assert.deepEqual(
        contributions.map((contribution: { source: string; lignes: number }) => [contribution.source, contribution.lignes]),
        [
            ['sites_nord.csv', 3],
            ['sites_sud.csv', 2]
        ]
    );
});

test('reconstruction après mise à jour d’une source, filtre d’entrée, renommage et suppression', async () => {
    const [table] = json(await appel({ method: 'GET', url: '/api/tables-concues' }));
    // La source sud reçoit une ligne de plus : la reconstruction des dépendantes la prend en compte.
    await appel({
        method: 'POST',
        url: '/api/sql',
        payload: { sql: `INSERT INTO "t_tb_sud" VALUES (99, 'S5', 'Agence Toulon', '120', '2023-01-01')` }
    });
    const dependantes = json(
        await appel({ method: 'POST', url: '/api/tables-concues/reconstruire-dependantes', payload: { nomSource: 'sites_sud.csv' } })
    );
    assert.deepEqual(dependantes, { reconstruites: ['Sites consolidés'], erreurs: [] });
    const [reconstruite] = json(await appel({ method: 'GET', url: '/api/tables-concues' }));
    assert.equal(reconstruite.design.lastRows, 6);
    // Modification de la recette : filtre d'entrée sur la source sud (sans S4) et nouveau nom.
    const recette = { ...reconstruite.design, name: 'Sites retenus' };
    recette.sources[1].filters = [{ col: 'CODE', op: 'neq', val: 'S4' }];
    const modifiee = json(await appel({ method: 'POST', url: '/api/tables-concues/construire', payload: recette }));
    assert.equal(modifiee.id, table.id, 'même identifiant : la table est remplacée');
    assert.equal(modifiee.name, 'Sites retenus');
    assert.equal(modifiee.design.lastRows, 5);
    const explicite = json(await appel({ method: 'POST', url: `/api/tables-concues/${table.id}/reconstruire` }));
    assert.equal(explicite.design.lastRows, 5);
    // Un nom déjà pris par une autre source est refusé.
    const conflit = await appel({
        method: 'POST',
        url: '/api/tables-concues/construire',
        payload: { ...recetteSites(), name: 'regions.csv' }
    });
    assert.equal(conflit.statusCode, 400);
    // Suppression : la route des sources suffit (la table conçue est une source comme une autre).
    const suppression = await appel({ method: 'DELETE', url: `/api/tables/${table.id}` });
    assert.equal(suppression.statusCode, 204);
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/tables-concues' })), []);
});
