/**
 * Tests d'intégration du modèle de données et de l'extraction : deux sources CSV (clients, commandes), détection
 * du lien par le contenu, ajout, extraction jointe avec filtre et regroupement, comptage, export CSV, modèles.
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

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-extraction-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};

type Reponse = { statusCode: number; body: string; headers: Record<string, unknown>; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

async function deposerSource(id: string, nom: string, csv: string, enTetes: string[]) {
    await appel({
        method: 'PUT',
        url: '/api/fichiers/src_' + id,
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
    await appel({ method: 'PUT', url: '/api/tables/' + id, payload: { name: nom, type: 'csv', headers: enTetes } });
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
    cookies = { sd_session: connexion.cookies.find(c => c.name === 'sd_session')!.value };
    await deposerSource('tb_clients', 'clients.csv', 'id_client;nom;ville\n1;Ana;Paris\n2;Bob;Lyon\n3;Zoé;Lille\n4;Idris;Paris\n', [
        'id_client',
        'nom',
        'ville'
    ]);
    await deposerSource('tb_commandes', 'commandes.csv', 'id_commande;id_client;montant\n100;1;25.5\n101;1;12\n102;2;99.9\n103;4;5\n', [
        'id_commande',
        'id_client',
        'montant'
    ]);
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('détection par le contenu : commandes.id_client → clients.id_client proposé (couverture 100 %), pas de lien inverse', async () => {
    const propositions = json(await appel({ method: 'POST', url: '/api/modele/relations/detecter' }));
    assert.equal(propositions.length, 1);
    assert.equal(propositions[0].sourceTable, 'commandes.csv');
    assert.equal(propositions[0].targetTable, 'clients.csv');
    assert.equal(propositions[0].sourceCol, 'id_client');
    assert.equal(propositions[0].couverture, 1);
    assert.equal(propositions[0].cardinality, 'N-1');
});

test('ajout d’un lien : enregistré dans appState.relations (format de l’application classique), doublon ignoré, colonne inconnue refusée', async () => {
    const lien = {
        sourceTable: 'commandes.csv',
        sourceCol: 'id_client',
        targetTable: 'clients.csv',
        targetCol: 'id_client',
        cardinality: 'N-1'
    };
    const ajout = json(await appel({ method: 'POST', url: '/api/modele/relations', payload: lien }));
    assert.equal(ajout.ajoute, true);
    assert.equal(ajout.relations.length, 1);
    assert.equal(ajout.relations[0].sourceId, 'tb_commandes');
    assert.equal(ajout.relations[0].targetId, 'tb_clients');
    assert.equal(json(await appel({ method: 'POST', url: '/api/modele/relations', payload: lien })).ajoute, false);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/modele/relations', payload: { ...lien, sourceCol: 'inconnue' } })).statusCode,
        400
    );
    const etat = json(await appel({ method: 'GET', url: '/api/etat/appState' })).valeur;
    assert.deepEqual(etat.relations[0], { ...lien, kind: '', measured: null });
    assert.deepEqual(json(await appel({ method: 'POST', url: '/api/modele/relations/detecter' })), []);
});

const specificationJointe = {
    baseId: 'tb_clients',
    jointures: [{ deTableId: 'tb_clients', deCol: 'id_client', versTableId: 'tb_commandes', versCol: 'id_client' }],
    colonnes: [
        { tableId: 'tb_clients', col: 'nom' },
        { tableId: 'tb_clients', col: 'ville', transformation: 'upper' },
        { tableId: 'tb_commandes', col: 'montant', alias: 'Montant' }
    ],
    filtres: [{ tableId: 'tb_clients', col: 'ville', op: 'in', valeur: 'paris;lyon' }],
    tri: [
        { alias: 'nom', sens: 'asc' },
        { alias: 'Montant', sens: 'desc' }
    ]
};

test('extraction jointe : aperçu, SQL renvoyé, filtre « dans la liste » et tri appliqués, jointure gauche conservant les clients sans commande', async () => {
    const apercu = json(await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification: specificationJointe } }));
    assert.deepEqual(
        apercu.colonnes.map((c: { nom: string }) => c.nom),
        ['nom', 'ville', 'Montant']
    );
    assert.deepEqual(apercu.lignes, [
        ['Ana', 'PARIS', '25.5'],
        ['Ana', 'PARIS', '12'],
        ['Bob', 'LYON', '99.9'],
        ['Idris', 'PARIS', '5']
    ]);
    assert.match(apercu.sql, /LEFT JOIN "t_tb_commandes"/);
    const total = json(await appel({ method: 'POST', url: '/api/extraction/compter', payload: specificationJointe }));
    assert.equal(total.total, 4);
    const sansFiltre = json(
        await appel({ method: 'POST', url: '/api/extraction/compter', payload: { ...specificationJointe, filtres: [] } })
    );
    assert.equal(sansFiltre.total, 5);
    const interne = json(
        await appel({
            method: 'POST',
            url: '/api/extraction/compter',
            payload: { ...specificationJointe, filtres: [], typeJointure: 'inner' }
        })
    );
    assert.equal(interne.total, 4);
});

test('extraction regroupée : total par ville avec nombre de clients distincts', async () => {
    const specification = {
        baseId: 'tb_clients',
        jointures: specificationJointe.jointures,
        regrouper: true,
        colonnes: [
            { tableId: 'tb_clients', col: 'ville' },
            { tableId: 'tb_clients', col: 'id_client', agregat: 'countd', alias: 'clients' },
            { tableId: 'tb_commandes', col: 'montant', agregat: 'sum', alias: 'total' }
        ],
        tri: [{ alias: 'ville', sens: 'asc' }]
    };
    const apercu = json(await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification } }));
    assert.deepEqual(apercu.lignes, [
        ['Lille', '1', null],
        ['Lyon', '1', 99.9],
        ['Paris', '2', 42.5]
    ]);
});

test('spécification incohérente : 400 avec message ; validation Zod sur les champs', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/extraction/apercu',
        payload: { specification: { ...specificationJointe, jointures: [] } }
    });
    assert.equal(reponse.statusCode, 400);
    assert.match(json(reponse).erreur, /table absente/);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/extraction/apercu', payload: { specification: { baseId: 'tb_clients', colonnes: [] } } }))
            .statusCode,
        400
    );
});

test('export CSV en flux : BOM, en-têtes, point-virgule, guillemets, nom de fichier', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/extraction/export.csv',
        payload: { specification: specificationJointe, nomFichier: 'clients paris/lyon' }
    });
    assert.equal(reponse.statusCode, 201);
    assert.match(String(reponse.headers['content-disposition']), /filename="clients_paris_lyon.csv"/);
    const lignes = reponse.body.split('\r\n');
    assert.equal(lignes[0], '﻿"nom";"ville";"Montant"');
    assert.equal(lignes[1], '"Ana";"PARIS";"25.5"');
    assert.equal(lignes.length, 6);
});

test('modèles d’extraction : enregistrement, liste, suppression ; le vocabulaire est publié', async () => {
    const modele = json(
        await appel({
            method: 'PUT',
            url: '/api/extraction/modeles/ex_test',
            payload: { nom: 'Clients Paris et Lyon', description: 'Test', specification: specificationJointe }
        })
    );
    assert.equal(modele.auteur, 'Administrateur');
    const liste = json(await appel({ method: 'GET', url: '/api/extraction/modeles' }));
    assert.equal(liste.length, 1);
    assert.equal(liste[0].specification.baseId, 'tb_clients');
    assert.equal((await appel({ method: 'DELETE', url: '/api/extraction/modeles/ex_test' })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/extraction/modeles/ex_test' })).statusCode, 404);
    const vocabulaire = json(await appel({ method: 'GET', url: '/api/extraction/vocabulaire' }));
    assert.equal(vocabulaire.operateurs.contains, 'contient');
});

test('suppression d’un lien par son identifiant', async () => {
    const relations = json(await appel({ method: 'GET', url: '/api/modele/relations' }));
    const restantes = json(await appel({ method: 'DELETE', url: '/api/modele/relations/' + encodeURIComponent(relations[0].id) }));
    assert.deepEqual(restantes, []);
});
