/** Tests de la sauvegarde : export plateforme et classique, import dans un autre espace (documents, tables conçues), dossier de gouvernance, analyse d'impact. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';
import { genererDossier } from '../src/sauvegarde/dossier';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-sauvegarde-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; headers: Record<string, unknown>; cookies: { name: string; value: string }[] };
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
    await chargerCsv('tb_c', 'clients.csv', 'id;nom;ville\n1;Ana;Paris\n2;Bob;Lyon\n');
    await chargerCsv('tb_o', 'commandes.csv', 'id_commande;id_client;montant\n100;1;10\n101;2;20\n');
    await appel({
        method: 'POST',
        url: '/api/tables-concues/construire',
        payload: {
            name: 'Clients vue',
            sources: [{ src: 'clients.csv', map: { id: 'id', nom: 'nom' } }],
            attrs: ['id', 'nom'],
            key: ['id']
        }
    });
    await appel({ method: 'PUT', url: '/api/gouvernance/glossaire/gl_1', payload: { term: 'Client', definition: 'Acheteur' } });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/objets-metier/bo_1',
        payload: {
            name: 'Client',
            definition: 'Personne',
            elements: [{ id: 'be_1', name: 'Nom', mappings: [{ table: 'clients.csv', col: 'nom' }] }]
        }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/actifs/as_fact',
        payload: { name: 'Facturation', kind: 'process', criticality: 'Haute', tables: ['commandes.csv'] }
    });
    await appel({
        method: 'PUT',
        url: '/api/gouvernance/actifs/as_vue',
        payload: { name: 'Reporting', kind: 'process', tables: ['Clients vue'] }
    });
    await appel({
        method: 'POST',
        url: '/api/modele/relations',
        payload: { sourceTable: 'commandes.csv', sourceCol: 'id_client', targetTable: 'clients.csv', targetCol: 'id' }
    });
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('dossier de gouvernance : HTML autonome, sections et échappement', () => {
    const html = genererDossier({
        espace: 'Démo <test>',
        genereLe: 'aujourd’hui',
        sources: [{ nom: 'a.csv', type: 'csv', colonnes: 2, domaine: 'Ventes', description: 'Desc & co', proprietaire: '' }],
        objets: [
            {
                nom: 'Client',
                definition: '',
                domaine: '',
                proprietaire: '',
                statut: '',
                attributs: [{ nom: 'Nom', definition: '', colonnes: 'a.csv.nom' }]
            }
        ],
        termes: [],
        actifs: [],
        perimetres: [],
        listes: [],
        personnes: [],
        regles: [],
        sensibilite: [{ niveau: 'interne', colonnes: 2 }]
    });
    assert.match(html, /<title>Dossier de gouvernance — Démo &lt;test&gt;<\/title>/);
    assert.match(html, /Desc &amp; co/);
    assert.match(html, /Définition à écrire\./);
    assert.match(html, /<h2>3\. Glossaire<\/h2><p class="vide">Aucun élément\.<\/p>/);
});

test('export plateforme : documents et sources ; export classique : cfg avec relations, gouvernance, designs', async () => {
    const reponse = await appel({ method: 'GET', url: '/api/sauvegarde/export?telecharger=1' });
    assert.equal(reponse.statusCode, 200);
    assert.match(String(reponse.headers['content-disposition']), /attachment; filename="StudioData_/);
    const exporte = json(reponse);
    assert.equal(exporte.kind, 'studio-data-espace');
    assert.ok(exporte.documents.appState.governance.glossary.length === 1);
    assert.equal(exporte.sources.length, 3);
    const classique = json(await appel({ method: 'GET', url: '/api/sauvegarde/export?format=classique' }));
    assert.equal(classique.kind, 'studio-data-config');
    assert.equal(classique.cfg.relations.length, 1);
    assert.deepEqual(Object.keys(classique.cfg.designs), ['Clients vue']);
    assert.equal(classique.cfg.designs['Clients vue'].targetId, undefined);
    assert.deepEqual(classique.cfg.governance.qualityHistory, []);
});

test('import dans un autre espace : documents repris, table conçue reconstruite ou signalée', async () => {
    const exporte = json(await appel({ method: 'GET', url: '/api/sauvegarde/export' }));
    const classique = json(await appel({ method: 'GET', url: '/api/sauvegarde/export?format=classique' }));
    // Nouvel espace « demo2 », sans la source clients.csv : la table conçue ne peut pas être reconstruite.
    // L'espace actif est celui de la session : on bascule dessus, puis on revient sur l'espace « defaut » à la fin.
    await appel({ method: 'POST', url: '/api/espaces', payload: { code: 'demo2', nom: 'Second espace' } });
    await appel({ method: 'PUT', url: '/api/auth/espace-courant', payload: { code: 'demo2' } });
    const entete = {};
    let rapport = json(await appel({ method: 'POST', url: '/api/sauvegarde/import', payload: exporte, headers: entete }));
    assert.equal(rapport.documents, Object.keys(exporte.documents).length);
    assert.equal(rapport.sources, 0);
    assert.deepEqual(rapport.tablesConcues.reconstruites, []);
    assert.match(rapport.tablesConcues.erreurs[0].erreur, /clients\.csv/);
    const glossaire = json(await appel({ method: 'GET', url: '/api/gouvernance/glossaire', headers: entete }));
    assert.equal(glossaire[0].term, 'Client');
    // Avec la source présente dans le second espace, la table conçue est reconstruite.
    await appel({
        method: 'PUT',
        url: '/api/fichiers/src_tb_c2',
        payload: Buffer.from('id;nom;ville\n1;Ana;Paris\n'),
        headers: { ...entete, 'content-type': 'application/octet-stream' }
    });
    await appel({
        method: 'POST',
        url: '/api/sql',
        payload: {
            sql: `CREATE TABLE "t_tb_c2" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_tb_c2', header=true, all_varchar=true, delim=';')`
        },
        headers: entete
    });
    await appel({
        method: 'PUT',
        url: '/api/tables/tb_c2',
        payload: { name: 'clients.csv', type: 'csv', headers: ['id', 'nom', 'ville'] },
        headers: entete
    });
    rapport = json(await appel({ method: 'POST', url: '/api/sauvegarde/import', payload: exporte, headers: entete }));
    assert.deepEqual(rapport.tablesConcues.reconstruites, ['Clients vue']);
    rapport = json(await appel({ method: 'POST', url: '/api/sauvegarde/import', payload: classique, headers: entete }));
    assert.deepEqual(rapport.tablesConcues.reconstruites, ['Clients vue'], 'un fichier de l’application classique s’importe aussi');
    assert.equal(
        (await appel({ method: 'POST', url: '/api/sauvegarde/import', payload: { kind: 'autre' }, headers: entete })).statusCode,
        400
    );
    await appel({ method: 'PUT', url: '/api/auth/espace-courant', payload: { code: 'defaut' } });
});

test('dossier de gouvernance HTML de l’espace', async () => {
    const reponse = await appel({ method: 'GET', url: '/api/sauvegarde/dossier' });
    assert.match(String(reponse.headers['content-type']), /text\/html/);
    assert.match(reponse.body, /Clients vue/);
    assert.match(reponse.body, /<h3>Client /);
    assert.match(reponse.body, /Facturation/);
});

test('analyse d’impact : direct, via le lineage, via les relations', async () => {
    const impact = json(await appel({ method: 'GET', url: '/api/lineage/impact?table=clients.csv' }));
    assert.deepEqual(impact.direct, []);
    assert.deepEqual(
        impact.viaLineage.map((actif: { name: string }) => actif.name),
        ['Reporting'],
        'Reporting lit la table conçue construite depuis clients.csv'
    );
    assert.deepEqual(
        impact.viaRelations.map((actif: { name: string }) => actif.name),
        ['Facturation'],
        'Facturation lit commandes.csv, jointe à clients.csv'
    );
    assert.deepEqual(impact.downstream, ['Clients vue']);
    const colonne = json(await appel({ method: 'GET', url: '/api/lineage/impact?table=clients.csv&col=nom' }));
    assert.deepEqual(colonne.viaRelations, [], 'la relation passe par la colonne id, pas par nom');
    assert.equal((await appel({ method: 'GET', url: '/api/lineage/impact' })).statusCode, 400);
});
