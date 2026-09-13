/**
 * Tests de l'analyse de couverture (population × dimension × présence d'éléments liés) et des règles de qualité
 * sur les séries temporelles (trou, doublon, plateau, saut, monotonie, fraîcheur, saisonnalité, couverture).
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
import { sqlCouverture } from '../src/exploitation/couverture';
import { sqlEvaluationSerie } from '../src/qualite/regles-series';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-couverture-'));
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

/** Capteur A : horaire, un trou (05:00), un plateau (7 ×4), un doublon (08:00), un saut (100). Capteur B : compteur qui recule. */
const MESURES = [
    'capteur;horodatage;valeur',
    'A;2024-01-01 00:00:00;1',
    'A;2024-01-01 01:00:00;2',
    'A;2024-01-01 02:00:00;3',
    'A;2024-01-01 03:00:00;4',
    'A;2024-01-01 04:00:00;5',
    'A;2024-01-01 06:00:00;6',
    'A;2024-01-01 07:00:00;7',
    'A;2024-01-01 08:00:00;7',
    'A;2024-01-01 08:00:00;7',
    'A;2024-01-01 09:00:00;7',
    'A;2024-01-01 10:00:00;100',
    'B;2024-01-01 00:00:00;10',
    'B;2024-01-01 01:00:00;20',
    'B;2024-01-01 02:00:00;15',
    'B;2024-01-01 03:00:00;30',
    ''
].join('\n');

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
    await chargerSource('tb_c', 'clients.csv', 'id;nom;ville\n1;Ana;Paris\n2;Bob;Paris\n3;Zoé;Lyon\n4;Idris;Lille\n');
    await chargerSource(
        'tb_k',
        'commandes.csv',
        'id_commande;id_client;montant;date\n100;1;25;2024-03-01\n101;1;12;2023-11-05\n102;2;5;2024-01-10\n103;4;99;2024-06-30\n'
    );
    await chargerSource('tb_m', 'mesures.csv', MESURES);
    const relation = await appel({
        method: 'POST',
        url: '/api/modele/relations',
        payload: { sourceTable: 'commandes.csv', sourceCol: 'id_client', targetTable: 'clients.csv', targetCol: 'id', cardinality: 'N-1' }
    });
    assert.ok(relation.statusCode < 300, relation.body);
    const serie = await appel({
        method: 'PUT',
        url: '/api/exploitation/series/s_capteurs',
        payload: {
            name: 'Capteurs',
            table: 'mesures.csv',
            keyCols: ['capteur'],
            tsCol: 'horodatage',
            valCol: 'valeur',
            step: '3600',
            tol: 0.5,
            regMin: 0.7
        }
    });
    assert.ok(serie.statusCode < 300, serie.body);
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('couverture (pur) : requête avec dimension de la base, table liée filtrée ; erreurs explicites sans lien ni table', () => {
    const contexte = {
        nomTableDe: (nom: string) => (nom === 'clients.csv' ? 't_c' : nom === 'commandes.csv' ? 't_k' : null),
        lienEntre: (base: string, autre: string) =>
            base === 'clients.csv' && autre === 'commandes.csv' ? { colonneBase: 'id', colonneAutre: 'id_client' } : null
    };
    const parametres = {
        base: 'clients.csv',
        dimensionTable: 'clients.csv',
        dimensionColonne: 'ville',
        dimensionParAnnee: false,
        liee: 'commandes.csv',
        filtresBase: [],
        filtresLiee: [{ col: 'montant', op: 'gt' as const, val: '10' }],
        dimension2Table: '',
        dimension2Colonne: ''
    };
    const sql = sqlCouverture(parametres, contexte);
    assert.match(sql, /WITH b AS \(SELECT \* FROM "t_c"\)/);
    assert.match(sql, /elements AS \(SELECT DISTINCT [^\n]*"id_client"[^\n]* FROM "t_k" WHERE [^\n]*"montant"[^\n]*'10'/);
    assert.match(sql, /GROUP BY 1, 2/);
    assert.throws(() => sqlCouverture({ ...parametres, liee: 'inconnue.csv' }, contexte), /non chargée/);
    assert.throws(
        () => sqlCouverture({ ...parametres, dimensionTable: 'commandes.csv', dimensionColonne: 'montant', liee: 'clients.csv' }, contexte),
        /Aucun lien/
    );
    assert.match(
        sqlCouverture({ ...parametres, dimensionTable: 'commandes.csv', dimensionColonne: 'date', dimensionParAnnee: true }, contexte),
        /YEAR\([\s\S]*LEFT JOIN [\s\S]*QUALIFY row_number\(\)/
    );
});

test('couverture : clients par ville avec ou sans commande de plus de 10 ; dimension année d’une table liée ; seconde dimension', async () => {
    const parametres = {
        base: 'clients.csv',
        dimensionTable: 'clients.csv',
        dimensionColonne: 'ville',
        liee: 'commandes.csv',
        filtresLiee: [{ col: 'montant', op: 'gt', val: '10' }]
    };
    const lignes = json(await appel({ method: 'POST', url: '/api/exploitation/couverture', payload: parametres }));
    assert.deepEqual(
        lignes.map((ligne: { dimension: string; avec: number; sans: number; total: number }) => [
            ligne.dimension,
            ligne.avec,
            ligne.sans,
            ligne.total
        ]),
        [
            ['Paris', 1, 1, 2],
            ['Lille', 1, 0, 1],
            ['Lyon', 0, 1, 1]
        ]
    );
    const parAnnee = json(
        await appel({
            method: 'POST',
            url: '/api/exploitation/couverture',
            payload: {
                base: 'clients.csv',
                dimensionTable: 'commandes.csv',
                dimensionColonne: 'date',
                dimensionParAnnee: true,
                liee: 'commandes.csv'
            }
        })
    );
    // Dimension 1–1 : la première commande de chaque client (par ordre du fichier) donne l'année ; Zoé n'en a pas.
    assert.deepEqual(
        parAnnee.map((ligne: { dimension: string; total: number }) => [ligne.dimension, ligne.total]),
        [
            ['2024', 3],
            ['(vide)', 1]
        ]
    );
    const deuxDimensions = json(
        await appel({
            method: 'POST',
            url: '/api/exploitation/couverture',
            payload: {
                ...parametres,
                filtresLiee: [],
                dimension2Table: 'clients.csv',
                dimension2Colonne: 'nom',
                filtresBase: [{ col: 'ville', op: 'eq', val: 'Paris' }]
            }
        })
    );
    assert.deepEqual(
        deuxDimensions.map((ligne: { dimension: string; dimension2: string; avec: number }) => [
            ligne.dimension,
            ligne.dimension2,
            ligne.avec
        ]),
        [
            ['Paris', 'Ana', 1],
            ['Paris', 'Bob', 1]
        ]
    );
    const sansLien = await appel({ method: 'POST', url: '/api/exploitation/couverture', payload: { ...parametres, liee: 'mesures.csv' } });
    assert.equal(sansLien.statusCode, 400);
    assert.match(json(sansLien).erreur, /Aucun lien/);
});

test('règles de série (pur) : requêtes total / échecs / lignes ; saut sans seuil refusé', () => {
    const configuration = {
        id: 's',
        name: 'S',
        table: 'mesures.csv',
        keyCols: ['capteur'],
        tsCol: 'horodatage',
        valCol: 'valeur',
        step: '3600',
        tol: 0.5,
        regMin: 0.7
    };
    const requetes = sqlEvaluationSerie('serieTrou', {}, configuration, 't_m');
    assert.match(requetes.total, /SELECT COUNT\(\*\)::BIGINT FROM b$/);
    assert.match(requetes.echecs, /^SELECT COUNT\(\*\)::BIGINT FROM \(/);
    assert.match(requetes.lignes, /points_manquants/);
    assert.match(sqlEvaluationSerie('serieFraicheur', {}, configuration, 't_m').total, /COUNT\(DISTINCT sid\)/);
    assert.throws(() => sqlEvaluationSerie('serieSaut', {}, configuration, 't_m'), /écart absolu/);
});

test('règles de série : les huit contrôles créés sur la série « Capteurs », exécutés, résultats attendus, lignes en échec', async () => {
    const definitions: Record<string, object> = {
        serieTrou: {},
        serieDoublon: {},
        seriePlateau: { longueurMinimale: 3 },
        serieSaut: { sautAbsolu: 50 },
        serieMonotonie: { sens: 'croissant' },
        serieFraicheur: { ageMaximalHeures: 1, reference: 'fichier' },
        serieSaisonnalite: { sensibilite: 4, creneau: 'heure' },
        serieCouverture: { couvertureMinimale: 95 }
    };
    for (const [type, parametres] of Object.entries(definitions)) {
        const reponse = await appel({
            method: 'POST',
            url: '/api/qualite/regles',
            payload: { nom: type, sourceId: 'tb_m', type, parametres: { serieId: 's_capteurs', ...parametres }, criticite: 'majeure' }
        });
        assert.equal(reponse.statusCode, 201, type + ' : ' + reponse.body);
    }
    const sansSerie = await appel({
        method: 'POST',
        url: '/api/qualite/regles',
        payload: { nom: 'sans série', sourceId: 'tb_m', type: 'serieTrou', parametres: {} }
    });
    assert.equal(sansSerie.statusCode, 400);
    assert.match(json(sansSerie).erreur, /série temporelle/);
    const execution = json(await appel({ method: 'POST', url: '/api/qualite/regles/executer', payload: { sourceId: 'tb_m' } }));
    const resultat = (nom: string) => {
        const regle = execution.regles.find((candidat: { nom: string }) => candidat.nom === nom);
        assert.ok(regle.resultat, nom + ' : ' + regle.erreur);
        return [regle.resultat.total, regle.resultat.echecs];
    };
    assert.deepEqual(resultat('serieTrou'), [15, 1], 'A : 04:00 → 06:00');
    assert.deepEqual(resultat('serieDoublon'), [15, 1], 'A : 08:00 en double');
    assert.deepEqual(resultat('seriePlateau'), [15, 1], 'A : 7 sur quatre points');
    assert.deepEqual(resultat('serieSaut'), [15, 1], 'A : 7 → 100');
    assert.deepEqual(resultat('serieMonotonie'), [15, 1], 'B : 20 → 15');
    assert.deepEqual(resultat('serieFraicheur'), [2, 1], 'B s’arrête sept heures avant A');
    assert.deepEqual(resultat('serieCouverture'), [2, 1], 'A : 10 horodatages sur 11 attendus');
    assert.equal(resultat('serieSaisonnalite')[0], 15);
    const regles = json(await appel({ method: 'GET', url: '/api/qualite/regles?sourceId=tb_m' }));
    const saut = regles.find((regle: { nom: string }) => regle.nom === 'serieSaut');
    const lignes = json(await appel({ method: 'GET', url: `/api/qualite/regles/${saut.id}/lignes` }));
    assert.equal(lignes.total, 1);
    assert.equal(lignes.lignes[0][lignes.colonnes.indexOf('serie')], 'A');
    assert.equal(String(lignes.lignes[0][lignes.colonnes.indexOf('valeur')]), '100');
    assert.equal(execution.regles.find((regle: { nom: string }) => regle.nom === 'serieMonotonie').resultat.exemples[0], 'B');
});
