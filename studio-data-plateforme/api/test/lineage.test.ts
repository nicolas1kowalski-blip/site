/**
 * Tests du lineage : synchronisation de la carte depuis les données (table conçue, application, dictionnaire,
 * objet métier), rôles déduits, purge des liens dérivés, nœuds et liens manuels, réconciliation dans DuckDB,
 * parcours d'un attribut, lineage d'une table ; plus les fonctions pures (fraîcheur, santé, SQL).
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
import { fraicheurLien, fraicheurTable, joursMaximum, normaliserFlux, roleNoeud, santeLien, synchroniserFlux } from '../src/lineage/flux';
import { expressionsPaire, sqlReconciliation } from '../src/lineage/reconciliation';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-lineage-'));
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
            sql: `CREATE TABLE "t_${id}" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_${id}', header=true, all_varchar=true, delim=';')`
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
    await chargerCsv('tb_crm', 'clients_crm.csv', 'id;nom;montant\n1;Ana;10\n2;Bob;20,5\n3;Zoé;30\n');
    await chargerCsv('tb_erp', 'clients_erp.csv', 'id;nom;montant\n1;ANA;10\n2;BOB;20.5\n');
    // Table conçue alimentée par les deux fichiers.
    await appel({
        method: 'POST',
        url: '/api/tables-concues/construire',
        payload: {
            name: 'Clients consolidés',
            sources: [
                { src: 'clients_crm.csv', map: { id: 'id', nom: 'nom' } },
                { src: 'clients_erp.csv', map: { id: 'id', nom: 'nom' } }
            ],
            attrs: ['id', 'nom'],
            key: ['id']
        }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/dictionnaire/clients_erp.csv',
        payload: { sourceSystem: 'ERP', updateFrequency: 'quotidienne' }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/actifs/as_crm',
        payload: { name: 'CRM', kind: 'app', sources: ['clients_crm.csv'] }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/actifs/as_bi',
        payload: { name: 'Reporting', kind: 'app', tables: ['Clients consolidés'] }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/objets-metier/bo_client',
        payload: {
            name: 'Client',
            sources: [{ table: 'clients_crm.csv', role: 'maitre' }],
            producedBy: ['as_crm'],
            elements: [{ id: 'be_nom', name: 'Nom', mappings: [{ table: 'clients_crm.csv', col: 'nom' }], usedBy: ['as_bi'] }]
        }
    });
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : synchronisation, rôles, fraîcheur, santé, SQL de réconciliation', () => {
    const flux = normaliserFlux(undefined);
    const contexte = {
        nomsSources: ['a.csv', 'b.csv', 'conso'],
        tablesConcues: [{ name: 'conso', sourcesContributrices: ['a.csv', 'b.csv'] }],
        systemeSourceDe: (nom: string) => (nom === 'a.csv' ? 'SI Amont' : ''),
        actifs: [{ id: 'as_1', name: 'SI Amont', kind: 'app' }],
        objetsMetier: [{ id: 'bo_1', name: 'Objet', sources: [{ table: 'conso', role: 'maitre' }] }]
    };
    const bilan = synchroniserFlux(flux, contexte);
    assert.equal(bilan.noeudsAjoutes, 5, 'a, b, conso, SI Amont (producteur), Objet');
    const noeudDe = (nom: string) => flux.nodes.find(noeud => noeud.name === nom)!;
    assert.equal(roleNoeud(flux, noeudDe('conso')), 'reference', 'deux alimentations entrantes = référentiel');
    assert.equal(roleNoeud(flux, noeudDe('a.csv')), 'source', 'produite par une application = source');
    assert.equal(roleNoeud(flux, noeudDe('b.csv')), 'master');
    assert.ok(flux.edges.some(lien => lien.rel === 'composes' && lien.target === noeudDe('Objet').id));
    // Deuxième synchronisation sans l'objet : le lien et le nœud dérivés sont purgés, le reste est préservé.
    const bilan2 = synchroniserFlux(flux, { ...contexte, objetsMetier: [] });
    assert.deepEqual([bilan2.liensRetires, bilan2.noeudsRetires, bilan2.noeudsAjoutes], [1, 1, 0]);
    assert.equal(joursMaximum('Mise à jour hebdomadaire'), 8);
    assert.equal(joursMaximum('parfois'), null);
    const maintenant = Date.parse('2026-09-12T12:00:00Z');
    assert.equal(fraicheurTable(maintenant - 2 * 864e5, 'quotidienne', maintenant).status, 'bad');
    assert.equal(fraicheurTable(maintenant - 1.3 * 864e5, 'quotidienne', maintenant).status, 'warn');
    assert.equal(
        fraicheurLien({ id: 'l', source: 'x', target: 'y', slaHours: 72 }, maintenant - 2 * 864e5, 'quotidienne', maintenant).status,
        'ok',
        'le SLA du lien prime'
    );
    assert.equal(santeLien('none', 'none'), 'ok');
    assert.equal(santeLien('ok', 'bad'), 'bad');
    assert.equal(
        expressionsPaire({ id: 'p', src: 'x', tgt: 'y', xform: { kind: 'scalar', op: 'upper' } }).maitre,
        'MIN(UPPER(TRIM(CAST(a."x" AS VARCHAR))))'
    );
    assert.match(sqlReconciliation('t_a', 't_b', 'id', 'id', [{ id: 'p', src: 'm', tgt: 'm' }]).synthese, /JOIN d USING \(k\)/);
});

test('carte des flux : synchronisation depuis les données, rôles, contrôles, lineage d’une table', async () => {
    const bilan = json(await appel({ method: 'POST', url: '/api/lineage/flux/synchroniser', payload: {} }));
    assert.ok(bilan.noeudsAjoutes >= 5, JSON.stringify(bilan));
    const carte = json(await appel({ method: 'GET', url: '/api/lineage/flux' }));
    const noeud = (nom: string) => carte.noeuds.find((candidat: { name: string }) => candidat.name === nom);
    assert.equal(noeud('Clients consolidés').role, 'reference');
    assert.equal(noeud('clients_crm.csv').role, 'source', 'CRM produit le fichier');
    assert.equal(noeud('clients_erp.csv').role, 'source', 'ERP est son système source (dictionnaire)');
    assert.equal(noeud('ERP').kind, 'app');
    assert.equal(noeud('Client').kind, 'object');
    const types = carte.liens.map((lien: { type: string }) => lien.type).sort();
    assert.deepEqual(types, ['composes', 'consolidates', 'consolidates', 'produces', 'reads', 'writes', 'writes']);
    assert.ok(
        carte.controles.some((controle: { categorie: string }) => controle.categorie === 'application') === false,
        'la source maître appartient au CRM'
    );
    const lineage = json(await appel({ method: 'GET', url: '/api/lineage/table/clients_crm.csv' }));
    assert.deepEqual(lineage.noeuds.map((candidat: { titre: string }) => candidat.titre).sort(), [
        'CRM',
        'Client',
        'Clients consolidés',
        'Reporting',
        'clients_crm.csv'
    ]);
    // Une deuxième synchronisation ne change rien.
    const bilan2 = json(await appel({ method: 'POST', url: '/api/lineage/flux/synchroniser', payload: {} }));
    assert.deepEqual(bilan2, { noeudsAjoutes: 0, liensAjoutes: 0, originesRenseignees: 0, liensRetires: 0, noeudsRetires: 0 });
});

test('nœuds et liens manuels, options, réconciliation d’une alimentation', async () => {
    const noeud = json(
        await appel({ method: 'PUT', url: '/api/lineage/flux/noeuds/ln_manuel', payload: { name: 'Entrepôt', kind: 'table' } })
    );
    assert.equal(noeud.derived, false);
    let carte = json(await appel({ method: 'GET', url: '/api/lineage/flux' }));
    const crm = carte.noeuds.find((candidat: { name: string }) => candidat.name === 'clients_crm.csv');
    const erp = carte.noeuds.find((candidat: { name: string }) => candidat.name === 'clients_erp.csv');
    const refuse = await appel({ method: 'PUT', url: '/api/lineage/flux/liens/le_manuel', payload: { source: crm.id, target: crm.id } });
    assert.equal(refuse.statusCode, 400);
    await appel({
        method: 'PUT',
        url: '/api/lineage/flux/liens/le_manuel',
        payload: {
            source: crm.id,
            target: erp.id,
            rel: 'feeds',
            srcKey: 'id',
            tgtKey: 'id',
            slaHours: 48,
            attrPairs: [
                { id: 'ap_1', src: 'nom', tgt: 'nom', xform: { kind: 'scalar', op: 'upper' } },
                { id: 'ap_2', src: 'montant', tgt: 'montant' }
            ]
        }
    });
    const resultat = json(await appel({ method: 'POST', url: '/api/lineage/flux/liens/le_manuel/reconcilier', payload: {} }));
    assert.equal(resultat.rows, 2, 'deux clés partagées (1 et 2)');
    assert.equal(resultat.missing, 1, 'la clé 3 manque en aval');
    assert.deepEqual(
        resultat.pairs.map((paire: { src: string; dist: number }) => [paire.src, paire.dist]),
        [
            ['nom', 0],
            ['montant', 1]
        ],
        'nom comparé en majuscules (transformation) ; « 20,5 » ≠ « 20.5 »'
    );
    await appel({ method: 'PUT', url: '/api/lineage/flux/options', payload: { threshold: 10 } });
    carte = json(await appel({ method: 'GET', url: '/api/lineage/flux' }));
    const lien = carte.liens.find((candidat: { id: string }) => candidat.id === 'le_manuel');
    assert.equal(lien.lastRun.rate, 50);
    assert.equal(lien.distorsion, 'bad', '50 % d’écart au-dessus du seuil de 10 %');
    assert.equal(lien.sante, 'bad');
    assert.equal((await appel({ method: 'DELETE', url: '/api/lineage/flux/noeuds/ln_manuel' })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/lineage/flux/liens/le_manuel' })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/lineage/flux/liens/le_manuel' })).statusCode, 404);
});

test('parcours d’un attribut : application source, colonne, attribut, consommateur', async () => {
    const graphe = json(await appel({ method: 'GET', url: '/api/lineage/attribut?boId=bo_client&elId=be_nom' }));
    assert.deepEqual(graphe.noeuds.map((candidat: { id: string; genre: string }) => [candidat.id, candidat.genre]).sort(), [
        ['as:as_crm', 'app'],
        ['attr:be_nom', 'attribut'],
        ['col:clients_crm.csv.nom', 'colonne'],
        ['use:as_bi', 'app']
    ]);
    assert.equal(graphe.liens.length, 3);
    assert.equal((await appel({ method: 'GET', url: '/api/lineage/attribut?boId=bo_client&elId=absent' })).statusCode, 404);
});
