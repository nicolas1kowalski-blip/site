/**
 * Tests de l'importation : archive ZIP et classeur Excel (fonctions pures), ingestion, puis les routes :
 * fichier déposé → source, mise à jour d'une source (colonnes disparues), classeur Excel (feuilles, dates),
 * fusion de fichiers et de sources, import par adresse (serveur HTTP local, différentiel, mode ajout),
 * livraison ZIP (inventaire, import et mise à jour).
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';
import { extraireEntreeZip, fabriquerZip, listerEntreesZip } from '../src/importation/archive-zip';
import { dateDepuisSerieExcel, feuilleEnCsv, lireFeuilleExcel, nomsDesFeuilles } from '../src/importation/classeur-excel';
import { adresseExportGoogleSheets, lectureDuckDB, nomDepuisAdresse, sqlFusion, tableauJsonAuChemin } from '../src/importation/ingestion';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-importation-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;
const deposer = (nomServeur: string, contenu: Buffer | string) =>
    appel({
        method: 'PUT',
        url: '/api/fichiers/' + nomServeur,
        payload: Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu),
        headers: { 'content-type': 'application/octet-stream' }
    });

/** Un classeur Excel minimal : deux feuilles, chaînes partagées, une date (style 14) et un nombre. */
function classeurDeTest(): Buffer {
    const xml = (corps: string) => '<?xml version="1.0" encoding="UTF-8"?>' + corps;
    return fabriquerZip([
        {
            nom: '[Content_Types].xml',
            contenu: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
        },
        {
            nom: 'xl/workbook.xml',
            contenu: xml(
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clients" sheetId="1" r:id="rId1"/><sheet name="Villes &amp; codes" sheetId="2" r:id="rId2"/></sheets></workbook>'
            )
        },
        {
            nom: 'xl/_rels/workbook.xml.rels',
            contenu: xml(
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Type="x" Target="sharedStrings.xml"/></Relationships>'
            )
        },
        {
            nom: 'xl/sharedStrings.xml',
            contenu: xml(
                '<sst xmlns="x" count="5" uniqueCount="5"><si><t>id</t></si><si><t>nom</t></si><si><t>inscrit_le</t></si><si><r><t>Ana </t></r><r><t>Dupont</t></r></si><si><t>Bob; &quot;B&quot;</t></si></sst>'
            )
        },
        {
            nom: 'xl/styles.xml',
            contenu: xml(
                '<styleSheet xmlns="x"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>'
            )
        },
        {
            nom: 'xl/worksheets/sheet1.xml',
            contenu: xml(
                '<worksheet xmlns="x"><sheetData>' +
                    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>score</t></is></c></row>' +
                    '<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" s="1"><v>45292</v></c><c r="D2"><v>12.5</v></c></row>' +
                    '<row r="3"><c r="A3"><v>2</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" s="2"><v>45292.5</v></c><c r="D3" t="b"><v>1</v></c></row>' +
                    '<row r="4"><c r="A4" s="0"/></row>' +
                    '</sheetData></worksheet>'
            )
        },
        {
            nom: 'xl/worksheets/sheet2.xml',
            contenu: xml(
                '<worksheet xmlns="x"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ville</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Paris</t></is></c></row></sheetData></worksheet>'
            )
        }
    ]);
}

let serveurLocal: http.Server;
let adresseLocale = '';
/** Contenu servi par le serveur HTTP local, modifiable par les tests. */
const contenuServi: Record<string, { type: string; corps: string }> = {
    '/clients.csv': { type: 'text/csv', corps: 'id;nom\n1;Ana\n2;Bob\n' },
    '/api/clients.json': {
        type: 'application/json',
        corps: JSON.stringify({
            meta: { total: 2 },
            data: {
                items: [
                    { id: 1, nom: 'Ana' },
                    { id: 2, nom: 'Bob' }
                ]
            }
        })
    }
};

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
    serveurLocal = http.createServer((requete, reponse) => {
        const ressource = contenuServi[requete.url || ''];
        if (!ressource) {
            reponse.writeHead(404).end('absent');
            return;
        }
        if (requete.url === '/api/clients.json' && requete.headers['x-cle'] !== 'secret') {
            reponse.writeHead(401).end('clé requise');
            return;
        }
        reponse.writeHead(200, { 'content-type': ressource.type }).end(ressource.corps);
    });
    await new Promise<void>(resoudre => serveurLocal.listen(0, '127.0.0.1', resoudre));
    adresseLocale = `http://127.0.0.1:${(serveurLocal.address() as { port: number }).port}`;
});
after(async () => {
    await app.close();
    serveurLocal.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('archive ZIP (pur) : fabrication, inventaire, extraction ; classeur Excel : feuilles, chaînes, dates, CSV', () => {
    const archive = fabriquerZip([
        { nom: 'ventes/janvier.csv', contenu: 'a;b\n1;2\n' },
        { nom: 'lisez-moi.txt', contenu: 'bonjour' }
    ]);
    const entrees = listerEntreesZip(archive);
    assert.deepEqual(
        entrees.map(entree => [entree.nom, entree.dossier, entree.nomCourt]),
        [
            ['ventes/janvier.csv', 'ventes', 'janvier.csv'],
            ['lisez-moi.txt', '(racine)', 'lisez-moi.txt']
        ]
    );
    assert.equal(extraireEntreeZip(archive, entrees[0]).toString(), 'a;b\n1;2\n');
    assert.throws(() => listerEntreesZip(Buffer.from('pas un zip')), /répertoire central/);
    const classeur = classeurDeTest();
    assert.deepEqual(nomsDesFeuilles(classeur), ['Clients', 'Villes & codes']);
    const feuille = lireFeuilleExcel(classeur);
    assert.equal(feuille.nom, 'Clients');
    assert.deepEqual(feuille.lignes, [
        ['id', 'nom', 'inscrit_le', 'score'],
        ['1', 'Ana Dupont', '2024-01-01', '12.5'],
        ['2', 'Bob; "B"', '2024-01-01 12:00:00', 'VRAI']
    ]);
    assert.equal(lireFeuilleExcel(classeur, 'Villes & codes').lignes[1][0], 'Paris');
    assert.throws(() => lireFeuilleExcel(classeur, 'Absente'), /introuvable/);
    assert.equal(dateDepuisSerieExcel(45292), '2024-01-01');
    assert.equal(feuilleEnCsv(feuille).split('\n')[2], '2;"Bob; ""B""";2024-01-01 12:00:00;VRAI');
    assert.match(lectureDuckDB('src_x', 'parquet'), /read_parquet/);
    assert.match(sqlFusion('tb_f', [{ lecture: "read_csv_auto('a')", origine: 'a.csv' }]), /UNION ALL BY NAME|fichier_origine/);
    assert.equal(nomDepuisAdresse('https://exemple.fr/donnees/ventes%202024.csv?x=1'), 'ventes 2024.csv');
    assert.match(adresseExportGoogleSheets('https://docs.google.com/spreadsheets/d/ABC-123/edit#gid=42'), /export\?format=csv&gid=42/);
    assert.deepEqual(tableauJsonAuChemin('{"a":{"b":[1,2]}}', 'a.b'), [1, 2]);
    assert.throws(() => tableauJsonAuChemin('{"a":1}', 'a'), /tableau JSON/);
});

test('fichier déposé → source, puis mise à jour de la même source : lignes, en-têtes, colonnes disparues, journal', async () => {
    await deposer('src_tb_clients', 'id;nom;ville\n1;Ana;Paris\n2;Bob;Lyon\n');
    const creation = await appel({
        method: 'POST',
        url: '/api/importation/fichier',
        payload: { nomServeur: 'src_tb_clients', nomFichier: 'clients.csv', taille: 30 }
    });
    assert.equal(creation.statusCode, 201, creation.body);
    const cree = json(creation);
    assert.equal(cree.source.id, 'tb_clients');
    assert.deepEqual([cree.lignes, cree.source.headers, cree.colonnesDisparues], [2, ['id', 'nom', 'ville'], []]);
    assert.equal(cree.source.fichier.nom, 'src_tb_clients');
    const doublon = await appel({
        method: 'POST',
        url: '/api/importation/fichier',
        payload: { nomServeur: 'src_tb_clients', nomFichier: 'clients.csv' }
    });
    assert.equal(doublon.statusCode, 400);
    assert.match(json(doublon).erreur, /existe déjà/);
    await deposer('depot_temporaire', 'id;nom;pays\n1;Ana;FR\n2;Bob;FR\n3;Zoé;BE\n');
    const miseAJour = json(
        await appel({
            method: 'POST',
            url: '/api/importation/fichier',
            payload: { nomServeur: 'depot_temporaire', nomFichier: 'clients-v2.csv', sourceId: 'tb_clients' }
        })
    );
    assert.equal(miseAJour.source.name, 'clients.csv', 'le nom de la source survit à la mise à jour');
    assert.deepEqual([miseAJour.lignes, miseAJour.source.headers, miseAJour.colonnesDisparues], [3, ['id', 'nom', 'pays'], ['ville']]);
    assert.equal(miseAJour.source.fichier.nom, 'src_tb_clients', 'le fichier temporaire a pris le nom définitif');
    const lignes = json(await appel({ method: 'POST', url: '/api/sql', payload: { sql: 'SELECT COUNT(*) FROM t_tb_clients' } }));
    assert.equal(String(lignes.lignes[0][0]), '3');
    const journal = json(await appel({ method: 'GET', url: '/api/journal?limite=5' }));
    assert.ok(
        (Array.isArray(journal) ? journal : journal.entrees || []).some(
            (entree: { action: string }) => entree.action === 'source.mise-a-jour'
        )
    );
    assert.equal(
        (
            await appel({
                method: 'POST',
                url: '/api/importation/fichier',
                payload: { nomServeur: 'src_tb_clients', nomFichier: 'image.png' }
            })
        ).statusCode,
        400
    );
});

test('classeur Excel : liste des feuilles, import de la première feuille (dates converties) puis d’une feuille nommée', async () => {
    await deposer('src_tb_classeur', classeurDeTest());
    const feuilles = json(
        await appel({ method: 'POST', url: '/api/importation/excel/feuilles', payload: { nomServeur: 'src_tb_classeur' } })
    );
    assert.deepEqual(feuilles, ['Clients', 'Villes & codes']);
    const importe = json(
        await appel({
            method: 'POST',
            url: '/api/importation/fichier',
            payload: { nomServeur: 'src_tb_classeur', nomFichier: 'classeur.xlsx' }
        })
    );
    assert.equal(importe.source.type, 'xlsx');
    assert.deepEqual(importe.source.headers, ['id', 'nom', 'inscrit_le', 'score']);
    assert.equal(importe.lignes, 2);
    const contenu = json(
        await appel({ method: 'POST', url: '/api/sql', payload: { sql: 'SELECT nom, inscrit_le FROM t_tb_classeur ORDER BY __rn' } })
    );
    assert.deepEqual(contenu.lignes, [
        ['Ana Dupont', '2024-01-01'],
        ['Bob; "B"', '2024-01-01 12:00:00']
    ]);
    await deposer('src_tb_villes', classeurDeTest());
    const villes = json(
        await appel({
            method: 'POST',
            url: '/api/importation/fichier',
            payload: { nomServeur: 'src_tb_villes', nomFichier: 'villes.xlsx', feuille: 'Villes & codes' }
        })
    );
    assert.deepEqual([villes.source.headers, villes.lignes], [['ville'], 1]);
    assert.equal(villes.source.fichier.feuille, 'Villes & codes');
});

test('fusion : deux fichiers et une source existante empilés par nom de colonne, provenance conservée, origines retirées', async () => {
    await deposer('fusion_a', 'id;nom;ville\n10;Léa;Nice\n');
    await deposer('fusion_b', 'id;nom;pays\n11;Max;FR\n');
    const refus = await appel({
        method: 'POST',
        url: '/api/importation/fusion',
        payload: { nom: 'clients.csv', fichiers: [], sourceIds: ['tb_clients'] }
    });
    assert.equal(refus.statusCode, 400, 'nom déjà pris');
    const fusion = json(
        await appel({
            method: 'POST',
            url: '/api/importation/fusion',
            payload: {
                nom: 'Clients complets',
                fichiers: [
                    { nomServeur: 'fusion_a', nomFichier: 'a.csv', taille: 10 },
                    { nomServeur: 'fusion_b', nomFichier: 'b.csv', taille: 10 }
                ],
                sourceIds: ['tb_villes'],
                retirerOrigines: true
            }
        })
    );
    assert.equal(fusion.lignes, 3);
    assert.deepEqual(fusion.source.headers, ['fichier_origine', 'id', 'nom', 'ville', 'pays']);
    assert.equal(fusion.source.origine, 'fusion');
    assert.deepEqual(fusion.source.fusion, { fichiers: ['a.csv', 'b.csv'], sources: ['villes.xlsx'] });
    const provenance = json(
        await appel({
            method: 'POST',
            url: '/api/sql',
            payload: { sql: `SELECT fichier_origine, COALESCE(nom, ville) FROM "t_${fusion.source.id}" ORDER BY __rn` }
        })
    );
    assert.deepEqual(provenance.lignes, [
        ['a.csv', 'Léa'],
        ['b.csv', 'Max'],
        ['villes.xlsx', 'Paris']
    ]);
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    assert.ok(!sources.some((source: { id: string }) => source.id === 'tb_villes'), 'la source d’origine a été retirée');
});

test('import par adresse : CSV local, JSON avec chemin et en-tête d’authentification, différentiel et mode ajout à la mise à jour', async () => {
    const reponseCsv = await appel({
        method: 'POST',
        url: '/api/importation/adresse',
        payload: { adresse: adresseLocale + '/clients.csv', genre: 'csv', nom: 'clients-web.csv' }
    });
    assert.equal(reponseCsv.statusCode, 201, reponseCsv.body);
    const csv = json(reponseCsv);
    assert.deepEqual([csv.source.name, csv.lignes, csv.source.headers], ['clients-web.csv', 2, ['id', 'nom']]);
    const jsonRefuse = await appel({
        method: 'POST',
        url: '/api/importation/adresse',
        payload: { adresse: adresseLocale + '/api/clients.json', genre: 'json', nom: 'clients-api', cheminJson: 'data.items' }
    });
    assert.equal(jsonRefuse.statusCode, 400);
    assert.match(json(jsonRefuse).erreur, /HTTP 401/);
    const jsonImporte = json(
        await appel({
            method: 'POST',
            url: '/api/importation/adresse',
            payload: {
                adresse: adresseLocale + '/api/clients.json',
                genre: 'json',
                nom: 'clients-api',
                cheminJson: 'data.items',
                enTeteNom: 'x-cle',
                enTeteValeur: 'secret'
            }
        })
    );
    assert.deepEqual(
        [jsonImporte.source.name, jsonImporte.lignes, jsonImporte.source.headers, jsonImporte.source.adresse.genre],
        ['clients-api', 2, ['id', 'nom'], 'json']
    );
    contenuServi['/clients.csv'] = { type: 'text/csv', corps: 'id;nom\n1;Ana\n2;Bobby\n3;Zoé\n' };
    const remplacee = json(
        await appel({
            method: 'POST',
            url: '/api/importation/adresse',
            payload: { adresse: adresseLocale + '/clients.csv', genre: 'csv', sourceId: csv.source.id, colonneCle: 'id' }
        })
    );
    assert.deepEqual(remplacee.differentiel, { ajoutees: 1, disparues: 0, modifiees: 1, cle: 'id' });
    assert.equal(remplacee.lignes, 3);
    contenuServi['/clients.csv'] = { type: 'text/csv', corps: 'id;nom\n1;Ana\n4;Nour\n' };
    const ajoutee = json(
        await appel({
            method: 'POST',
            url: '/api/importation/adresse',
            payload: { adresse: adresseLocale + '/clients.csv', genre: 'csv', sourceId: csv.source.id, colonneCle: 'id', mode: 'ajouter' }
        })
    );
    assert.deepEqual(ajoutee.differentiel, { ajoutees: 1, disparues: 2, modifiees: 0, cle: 'id' });
    assert.equal(ajoutee.lignes, 4, 'mode ajout : les lignes existantes sont conservées, la nouvelle clé est insérée');
    assert.equal(
        (await appel({ method: 'POST', url: '/api/importation/adresse', payload: { adresse: 'ftp://x', genre: 'csv' } })).statusCode,
        400
    );
    assert.equal(
        (
            await appel({
                method: 'POST',
                url: '/api/importation/adresse',
                payload: { adresse: adresseLocale + '/absent.csv', genre: 'csv' }
            })
        ).statusCode,
        400
    );
});

test('livraison ZIP : inventaire (source existante repérée), import d’un nouveau fichier, mise à jour d’une source, fichier ignoré', async () => {
    const archive = fabriquerZip([
        { nom: 'ventes/clients.csv', contenu: 'id;nom;pays\n1;Ana;FR\n' },
        { nom: 'ventes/produits.csv', contenu: 'ref;libelle\nP1;Stylo\nP2;Cahier\n' },
        { nom: 'divers/notes.txt', contenu: 'a;b\n1;2\n' },
        { nom: 'divers/lisez-moi.md', contenu: 'ignoré (pas un fichier de données)' }
    ]);
    await deposer('livraison.zip', archive);
    const inventaire = json(
        await appel({ method: 'POST', url: '/api/importation/zip/inventaire', payload: { nomServeur: 'livraison.zip' } })
    );
    assert.deepEqual(
        inventaire.map((entree: { nom: string; sourceExistante: string | null }) => [entree.nom, entree.sourceExistante]),
        [
            ['ventes/clients.csv', 'tb_clients'],
            ['ventes/produits.csv', null],
            ['divers/notes.txt', null]
        ]
    );
    const bilan = json(
        await appel({
            method: 'POST',
            url: '/api/importation/zip/importer',
            payload: {
                nomServeur: 'livraison.zip',
                choix: [
                    { nom: 'ventes/clients.csv', action: 'mettreAJour' },
                    { nom: 'ventes/produits.csv', action: 'importer' },
                    { nom: 'divers/notes.txt', action: 'ignorer' }
                ]
            }
        })
    );
    assert.deepEqual(bilan, { importees: ['produits.csv'], misesAJour: ['clients.csv'], ignorees: ['divers/notes.txt'], erreurs: [] });
    const sources = json(await appel({ method: 'GET', url: '/api/tables' }));
    const clients = sources.find((source: { id: string }) => source.id === 'tb_clients');
    assert.equal(
        String(json(await appel({ method: 'POST', url: '/api/sql', payload: { sql: 'SELECT COUNT(*) FROM t_tb_clients' } })).lignes[0][0]),
        '1',
        'clients.csv mise à jour par le ZIP'
    );
    assert.ok(clients && sources.some((source: { name: string }) => source.name === 'produits.csv'));
    assert.equal((await appel({ method: 'HEAD', url: '/api/fichiers/livraison.zip' })).statusCode, 404, 'archive supprimée après import');
});
