/**
 * Tests des jeux temporaires : un tableau gardé pour l'espace de travail, exploitable partout, mais qui n'est
 * ni une source, ni dans le modèle, ni dans les sauvegardes. On vérifie surtout la frontière : ce qui le voit
 * (Extraire, Exploitation, Qualité) et ce qui l'ignore (Sources, modèle, catalogue, sauvegarde).
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

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-jeux-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
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
    cookies = { sd_session: connexion.cookies.find(cookie => cookie.name === 'sd_session')!.value };
    await deposerSource('tb_clients', 'clients.csv', 'id;nom;ville\n1;Ana;Paris\n2;Bob;Lyon\n3;Zoé;Lille\n', ['id', 'nom', 'ville']);
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('créer un jeu depuis une requête : la table existe, le jeu est listé avec son origine', async () => {
    const reponse = await appel({
        method: 'POST',
        url: '/api/jeux',
        payload: { sql: `SELECT nom, ville FROM "t_tb_clients" WHERE ville <> 'Lyon'`, nom: 'Clients hors Lyon', origine: 'extraction' }
    });
    assert.equal(reponse.statusCode, 201, reponse.body);
    const jeu = json(reponse);
    assert.deepEqual([jeu.nom, jeu.origine, jeu.lignes], ['Clients hors Lyon', 'extraction', 2]);
    assert.deepEqual(jeu.colonnes, ['nom', 'ville']);
    const jeux = json(await appel({ method: 'GET', url: '/api/jeux' }));
    assert.equal(jeux.length, 1);
    assert.equal(jeux[0].id, jeu.id);
});

test('frontière : le jeu n’apparaît ni dans les sources, ni dans le modèle, ni dans la sauvegarde', async () => {
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    assert.deepEqual(
        sources.map((source: { name: string }) => source.name),
        ['clients.csv'],
        'l’écran Sources ne montre que les vraies sources'
    );
    const propositions = json(await appel({ method: 'POST', url: '/api/modele/relations/detecter' }));
    assert.equal(propositions.length, 0, 'le modèle ne propose pas de lien vers un jeu temporaire');
    const catalogue = (await appel({ method: 'GET', url: '/api/catalogue' })).body;
    assert.doesNotMatch(catalogue, /Clients hors Lyon/, 'le catalogue ignore le jeu');
});

test('les écrans qui doivent l’exploiter le voient : Extraire, Qualité, Exploitation', async () => {
    const jeu = json(await appel({ method: 'GET', url: '/api/jeux' }))[0];
    // Extraire : le jeu est une table de départ comme une autre.
    const apercu = await appel({
        method: 'POST',
        url: '/api/extraction/apercu',
        payload: {
            specification: { baseId: jeu.id, colonnes: [{ tableId: jeu.id, nomColonne: 'nom' }] },
            limite: 10
        }
    });
    assert.equal(apercu.statusCode, 201, apercu.body);
    assert.deepEqual(json(apercu).lignes, [['Ana'], ['Zoé']]);
    // Qualité : on peut profiler un jeu comme une source.
    const profil = await appel({ method: 'POST', url: '/api/qualite/profil', payload: { sourceId: jeu.id } });
    assert.equal(profil.statusCode, 201, profil.body);
    assert.equal(json(profil).lignes, 2);
    // Exploitation : les statistiques acceptent un jeu comme table.
    const stats = await appel({
        method: 'POST',
        url: '/api/exploitation/statistiques',
        payload: { table: jeu.nom, dimension: 'ville' }
    });
    assert.equal(stats.statusCode, 201, stats.body);
    assert.equal(json(stats).points.length, 2, 'Paris et Lille');
});

test('renommer, exporter en CSV, puis promouvoir en source', async () => {
    const jeu = json(await appel({ method: 'GET', url: '/api/jeux' }))[0];
    const renomme = json(await appel({ method: 'PUT', url: `/api/jeux/${jeu.id}/nom`, payload: { nom: 'Hors Lyon' } }));
    assert.equal(renomme.nom, 'Hors Lyon');
    const csv = await appel({ method: 'POST', url: `/api/jeux/${jeu.id}/export.csv` });
    assert.equal(csv.statusCode, 201, 'un POST renvoie 201 par défaut');
    assert.ok(csv.body.startsWith('﻿"nom";"ville"'), csv.body.slice(0, 40));
    assert.equal(csv.body.trim().split('\n').length, 3);
    const promu = await appel({ method: 'POST', url: `/api/jeux/${jeu.id}/promouvoir`, payload: { nom: 'Clients hors Lyon' } });
    assert.equal(promu.statusCode, 201, promu.body);
    assert.equal(json(await appel({ method: 'GET', url: '/api/jeux' })).length, 0, 'promu, ce n’est plus un jeu');
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    assert.deepEqual(
        sources.map((source: { name: string }) => source.name).sort(),
        ['Clients hors Lyon', 'clients.csv'],
        'c’est désormais une source'
    );
});

test('supprimer un jeu : la table disparaît aussi ; un nom déjà pris est refusé à la promotion', async () => {
    const jeu = json(
        await appel({
            method: 'POST',
            url: '/api/jeux',
            payload: { sql: `SELECT nom FROM "t_tb_clients"`, nom: 'Noms', origine: 'requete' }
        })
    );
    const collision = await appel({ method: 'POST', url: `/api/jeux/${jeu.id}/promouvoir`, payload: { nom: 'clients.csv' } });
    assert.equal(collision.statusCode, 400);
    assert.match(json(collision).erreur, /porte déjà le nom/);
    assert.equal((await appel({ method: 'DELETE', url: `/api/jeux/${jeu.id}` })).statusCode, 200);
    assert.equal(json(await appel({ method: 'GET', url: '/api/jeux' })).length, 0);
    const tableAbsente = await appel({ method: 'POST', url: '/api/sql', payload: { sql: `SELECT * FROM "t_${jeu.id}"` } });
    assert.equal(tableAbsente.statusCode, 400, 'la table du jeu a bien été abandonnée');
});

test('une requête qui écrit est refusée, et un jeu inconnu répond 404', async () => {
    const ecriture = await appel({
        method: 'POST',
        url: '/api/jeux',
        payload: { sql: 'DROP TABLE "t_tb_clients"', nom: 'Malveillant' }
    });
    assert.equal(ecriture.statusCode, 400);
    assert.equal((await appel({ method: 'PUT', url: '/api/jeux/tb_inconnu/nom', payload: { nom: 'x' } })).statusCode, 404);
});
