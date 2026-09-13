/** Tests de la surveillance des sources : instantanés et dérive, contrat de données, données figées et delta, réconciliation ; fonctions pures. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';
import { comparerContrat, derive, typeSimple } from '../src/surveillance/surveillance';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-surveillance-'));
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
    await chargerCsv('tb_c', 'clients.csv', 'id;nom;ville\n1;Ana;Paris\n2;Bob;Lyon\n3;Zoé;Lille\n');
    await chargerCsv('tb_o', 'commandes.csv', 'id_commande;id_client\n100;1\n101;1\n102;4\n');
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : type simple, dérive, comparaison de contrat', () => {
    assert.equal(typeSimple('BIGINT'), 'nombre');
    assert.equal(typeSimple('TIMESTAMP'), 'date');
    assert.equal(typeSimple('VARCHAR'), 'texte');
    assert.equal(derive([{ ts: 1, rows: 10, schema: [] }]), null);
    const changement = derive([
        {
            ts: 1,
            rows: 10,
            schema: [
                { name: 'a', type: 'texte' },
                { name: 'b', type: 'texte' }
            ]
        },
        {
            ts: 2,
            rows: 12,
            schema: [
                { name: 'a', type: 'nombre' },
                { name: 'c', type: 'texte' }
            ]
        }
    ])!;
    assert.deepEqual(
        [changement.added, changement.removed, changement.retyped, changement.rowsDelta, changement.rowsPct],
        [['c'], ['b'], ['a (texte→nombre)'], 2, 20]
    );
    assert.equal(changement.schemaChanged, true);
    const ecarts = comparerContrat(
        {
            cols: [
                { name: 'a', type: 'texte', required: true },
                { name: 'b', type: 'nombre', required: false }
            ],
            at: 1
        },
        [
            { name: 'a', type: 'texte' },
            { name: 'z', type: 'texte' }
        ]
    );
    assert.deepEqual(ecarts, { missing: ['b'], extra: ['z'], retyped: [] });
});

test('moniteur : instantané, dérive après rechargement, état des sources', async () => {
    const premier = json(await appel({ method: 'POST', url: '/api/surveillance/clients.csv/instantane', payload: {} }));
    assert.equal(premier.instantane.rows, 3);
    assert.deepEqual(
        premier.instantane.schema.map((colonne: { name: string; type: string }) => colonne.name),
        ['id', 'nom', 'ville']
    );
    assert.equal(premier.derive, null);
    // La source est rechargée avec une colonne en plus et une ligne en plus.
    await chargerCsv('tb_c', 'clients.csv', 'id;nom;ville;pays\n1;Ana;Paris;FR\n2;Bob;Lyon;FR\n3;Zoé;Lille;FR\n4;Idris;Paris;FR\n');
    const second = json(await appel({ method: 'POST', url: '/api/surveillance/clients.csv/instantane', payload: {} }));
    assert.deepEqual([second.derive.added, second.derive.removed, second.derive.rowsDelta], [['pays'], [], 1]);
    const etat = json(await appel({ method: 'GET', url: '/api/surveillance' }));
    const clients = etat.find((source: { nom: string }) => source.nom === 'clients.csv');
    assert.equal(clients.nombreInstantanes, 2);
    assert.equal(clients.derive.schemaChanged, true);
    assert.equal(clients.fraicheur.status, 'none', 'fréquence attendue non renseignée au dictionnaire');
});

test('contrat de données : génération, colonne obligatoire, vérification', async () => {
    const contrat = json(await appel({ method: 'POST', url: '/api/surveillance/clients.csv/contrat/generer', payload: {} }));
    assert.equal(contrat.cols.length, 4);
    contrat.cols[1].required = true;
    contrat.cols.push({ name: 'telephone', type: 'texte', required: false });
    await appel({ method: 'PUT', url: '/api/surveillance/clients.csv/contrat', payload: contrat });
    await appel({ method: 'POST', url: '/api/sql', payload: { sql: `UPDATE "t_tb_c" SET nom = '' WHERE id = '4'` } });
    const verification = json(await appel({ method: 'POST', url: '/api/surveillance/clients.csv/contrat/verifier', payload: {} }));
    assert.deepEqual(verification.missing, ['telephone']);
    assert.deepEqual(verification.emptyRequired, [{ col: 'nom', vides: 1 }]);
    assert.equal(verification.conforme, false);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/surveillance/commandes.csv/contrat/verifier', payload: {} })).statusCode,
        400,
        'pas de contrat'
    );
});

test('suivi des changements : figer, recharger, delta par clé', async () => {
    const figees = json(await appel({ method: 'POST', url: '/api/surveillance/clients.csv/figer', payload: {} }));
    assert.equal(figees.rows, 4);
    await chargerCsv('tb_c', 'clients.csv', 'id;nom;ville;pays\n1;Ana;Paris;FR\n2;Bob;Marseille;FR\n5;Léa;Nantes;FR\n');
    const delta = json(await appel({ method: 'POST', url: '/api/surveillance/clients.csv/delta', payload: { cle: 'id' } }));
    assert.deepEqual(
        [delta.added, delta.removed, delta.changed, delta.same, delta.colonnesComparees],
        [1, 2, 1, 1, 3],
        'Léa ajoutée ; Zoé et Idris supprimés ; Bob déménagé ; Ana identique'
    );
    assert.equal(
        (await appel({ method: 'POST', url: '/api/surveillance/commandes.csv/delta', payload: { cle: 'id_commande' } })).statusCode,
        400,
        'rien de figé'
    );
});

test('réconciliation amont / aval : volumétrie et clés orphelines', async () => {
    const resultat = json(
        await appel({
            method: 'POST',
            url: '/api/surveillance/reconcilier',
            payload: { a: 'clients.csv', cleA: 'id', b: 'commandes.csv', cleB: 'id_client' }
        })
    );
    assert.deepEqual(
        [resultat.ta, resultat.tb, resultat.onlyA, resultat.onlyB, resultat.common],
        [3, 3, 2, 1, 1],
        'clés 1 commune ; 2 et 5 sans commande ; 4 sans client'
    );
});
