/** Tests de la qualité : profilage, doublons, règles (chaque type), score, audits ; plus le SQL des règles (pur). */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { creerApplication } from '../src/application';
import { lireConfiguration } from '../src/configuration/configuration';
import { scoreQualite, sqlEvaluation } from '../src/qualite/regles';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-qualite-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

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
    const csv =
        'id;email;age;ville;date\n1;ana@ex.fr;34;Paris;2024-01-05\n2;bob@ex.fr;;Lyon;2024-02-10\n2;bob@ex.fr;;Lyon;2024-02-10\n3;pas-un-email;150;Lille ;pas-une-date\n4;;41;Paris;2024-03-01\n';
    await appel({
        method: 'PUT',
        url: '/api/fichiers/src_tb_p',
        payload: Buffer.from(csv),
        headers: { 'content-type': 'application/octet-stream' }
    });
    await appel({
        method: 'POST',
        url: '/api/sql',
        payload: {
            sql: `CREATE TABLE "t_tb_p" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_tb_p', header=true, all_varchar=true, delim=';')`
        }
    });
    await appel({
        method: 'PUT',
        url: '/api/tables/tb_p',
        payload: { name: 'personnes.csv', type: 'csv', headers: ['id', 'email', 'age', 'ville', 'date'] }
    });
    await appel({
        method: 'PUT',
        url: '/api/fichiers/src_tb_v',
        payload: Buffer.from('ville\nParis\nLyon\n'),
        headers: { 'content-type': 'application/octet-stream' }
    });
    await appel({
        method: 'POST',
        url: '/api/sql',
        payload: {
            sql: `CREATE TABLE "t_tb_v" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_tb_v', header=true, all_varchar=true)`
        }
    });
    await appel({ method: 'PUT', url: '/api/tables/tb_v', payload: { name: 'villes.csv', type: 'csv', headers: ['ville'] } });
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('SQL des règles (pur) : chaque type produit des requêtes total / échecs ; paramètres manquants refusés', () => {
    const nomTableDe = (id: string) => 't_' + id;
    for (const type of ['nonVide', 'unique', 'dateValide'] as const) {
        const requetes = sqlEvaluation(
            { nom: 'r', sourceId: 'a', colonne: 'x', type, parametres: {}, criticite: 'majeure', active: true },
            nomTableDe
        );
        assert.match(requetes.total, /SELECT COUNT\(\*\)::BIGINT FROM/);
        assert.match(requetes.echecs, /NOT COALESCE\(conforme, FALSE\)/);
    }
    assert.throws(
        () =>
            sqlEvaluation(
                { nom: 'r', sourceId: 'a', colonne: 'x', type: 'format', parametres: {}, criticite: 'majeure', active: true },
                nomTableDe
            ),
        /expression régulière/
    );
    assert.throws(
        () =>
            sqlEvaluation(
                {
                    nom: 'r',
                    sourceId: 'a',
                    colonne: 'x',
                    type: 'dansListe',
                    parametres: { valeurs: [] },
                    criticite: 'majeure',
                    active: true
                },
                nomTableDe
            ),
        /au moins une valeur/
    );
    assert.equal(
        scoreQualite([
            { criticite: 'bloquante', taux: 1 },
            { criticite: 'mineure', taux: 0 }
        ]),
        75
    );
    assert.equal(scoreQualite([]), null);
});

test('profilage : complétude, distinctes, longueurs, espaces parasites, numériques, dates, motif, valeurs fréquentes, doublons exacts', async () => {
    const reponse = await appel({ method: 'POST', url: '/api/qualite/profil', payload: { sourceId: 'tb_p' } });
    assert.equal(reponse.statusCode, 201);
    const profil = json(reponse);
    assert.equal(profil.lignes, 5);
    assert.equal(profil.doublonsExacts, 1);
    const colonne = (nom: string) => profil.colonnes.find((candidat: { colonne: string }) => candidat.colonne === nom);
    assert.equal(colonne('age').vides, 2);
    assert.equal(colonne('age').completude, 0.6);
    assert.equal(colonne('age').partNumerique, 1);
    assert.equal(colonne('email').distinctes, 3);
    assert.equal(colonne('ville').espacesParasites, 1);
    assert.equal(colonne('date').partDate, 0.8);
    assert.equal(colonne('date').motifMajoritaire, '9999-99-99');
    assert.equal(colonne('date').motifsDistincts, 2);
    assert.deepEqual(colonne('ville').valeursFrequentes.slice(0, 2), [
        { valeur: 'Lyon', nombre: 2 },
        { valeur: 'Paris', nombre: 2 }
    ]);
    assert.equal(colonne('id').longueurMax, 1);
    const audits = json(await appel({ method: 'GET', url: '/api/qualite/audits?sourceId=tb_p' }));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].genre, 'profilage');
    assert.equal(audits[0].resume.doublonsExacts, 1);
});

test('doublons sur une clé : groupes, lignes concernées, exemples ; colonne inconnue refusée', async () => {
    const resultat = json(await appel({ method: 'POST', url: '/api/qualite/doublons', payload: { sourceId: 'tb_p', cle: ['id'] } }));
    assert.equal(resultat.groupes, 1);
    assert.equal(resultat.lignes, 2);
    assert.deepEqual(resultat.exemples[0], { valeurs: ['2'], nombre: 2 });
    const multiple = json(
        await appel({ method: 'POST', url: '/api/qualite/doublons', payload: { sourceId: 'tb_p', cle: ['ville', 'age'] } })
    );
    assert.equal(multiple.groupes, 0);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/qualite/doublons', payload: { sourceId: 'tb_p', cle: ['inconnue'] } })).statusCode,
        400
    );
});

test('règles : création de chaque type, exécution, résultats attendus, score pondéré, audit enregistré', async () => {
    const regles = [
        { nom: 'Identifiant unique', sourceId: 'tb_p', colonne: 'id', type: 'unique', criticite: 'bloquante' },
        { nom: 'Courriel renseigné', sourceId: 'tb_p', colonne: 'email', type: 'nonVide', criticite: 'majeure' },
        {
            nom: 'Courriel valide',
            sourceId: 'tb_p',
            colonne: 'email',
            type: 'format',
            parametres: { expression: '^[^@]+@[^@]+\\.[a-z]+$' },
            criticite: 'majeure'
        },
        {
            nom: 'Âge plausible',
            sourceId: 'tb_p',
            colonne: 'age',
            type: 'plage',
            parametres: { minimum: 0, maximum: 120 },
            criticite: 'mineure'
        },
        {
            nom: 'Ville connue',
            sourceId: 'tb_p',
            colonne: 'ville',
            type: 'reference',
            parametres: { sourceCibleId: 'tb_v', colonneCible: 'ville' },
            criticite: 'majeure'
        },
        { nom: 'Date valide', sourceId: 'tb_p', colonne: 'date', type: 'dateValide', criticite: 'mineure' },
        {
            nom: 'Ville dans la liste',
            sourceId: 'tb_p',
            colonne: 'ville',
            type: 'dansListe',
            parametres: { valeurs: ['Paris', 'Lyon'] },
            criticite: 'mineure'
        },
        {
            nom: 'Longueur id',
            sourceId: 'tb_p',
            colonne: 'id',
            type: 'longueur',
            parametres: { minimum: 1, maximum: 1 },
            criticite: 'mineure'
        }
    ];
    for (const regle of regles)
        assert.equal((await appel({ method: 'POST', url: '/api/qualite/regles', payload: regle })).statusCode, 201, regle.nom);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/qualite/regles', payload: { ...regles[0], colonne: 'inconnue' } })).statusCode,
        400
    );
    assert.equal((await appel({ method: 'POST', url: '/api/qualite/regles', payload: { ...regles[2], parametres: {} } })).statusCode, 400);
    const execution = json(await appel({ method: 'POST', url: '/api/qualite/regles/executer', payload: { sourceId: 'tb_p' } }));
    const resultat = (nom: string) => execution.regles.find((regle: { nom: string }) => regle.nom === nom).resultat;
    assert.deepEqual([resultat('Identifiant unique').total, resultat('Identifiant unique').echecs], [5, 2]);
    assert.deepEqual([resultat('Courriel renseigné').total, resultat('Courriel renseigné').echecs], [5, 1]);
    assert.deepEqual(
        [resultat('Courriel valide').total, resultat('Courriel valide').echecs, resultat('Courriel valide').exemples],
        [4, 1, ['pas-un-email']]
    );
    assert.deepEqual([resultat('Âge plausible').total, resultat('Âge plausible').echecs], [3, 1]);
    assert.deepEqual([resultat('Ville connue').total, resultat('Ville connue').echecs], [5, 1]);
    assert.deepEqual([resultat('Date valide').total, resultat('Date valide').echecs], [5, 1]);
    assert.deepEqual([resultat('Ville dans la liste').echecs], [1]);
    assert.deepEqual([resultat('Longueur id').echecs], [0]);
    assert.ok(execution.score > 60 && execution.score < 90, 'score ' + execution.score);
    const liste = json(await appel({ method: 'GET', url: '/api/qualite/regles?sourceId=tb_p' }));
    assert.equal(liste.length, 8);
    assert.ok(liste.every((regle: { dernierResultat: unknown }) => regle.dernierResultat));
    const audits = json(await appel({ method: 'GET', url: '/api/qualite/audits?sourceId=tb_p' }));
    assert.equal(audits[0].genre, 'regles');
    assert.equal(audits[0].resume.regles, 8);
    const detail = json(await appel({ method: 'GET', url: '/api/qualite/audits/' + audits[0].id }));
    assert.equal(detail.detail.regles.length, 8);
});

test('règles : modification, désactivation (non exécutée), suppression', async () => {
    const liste = json(await appel({ method: 'GET', url: '/api/qualite/regles?sourceId=tb_p' }));
    const regle = liste.find((candidat: { nom: string }) => candidat.nom === 'Longueur id');
    const modifiee = json(
        await appel({
            method: 'PUT',
            url: '/api/qualite/regles/' + regle.id,
            payload: { ...regle, nom: 'Longueur identifiant', active: false }
        })
    );
    assert.equal(modifiee.nom, 'Longueur identifiant');
    const execution = json(await appel({ method: 'POST', url: '/api/qualite/regles/executer', payload: { sourceId: 'tb_p' } }));
    assert.equal(execution.regles.length, 7);
    assert.equal((await appel({ method: 'DELETE', url: '/api/qualite/regles/' + regle.id })).statusCode, 200);
    assert.equal((await appel({ method: 'DELETE', url: '/api/qualite/regles/' + regle.id })).statusCode, 404);
    assert.equal(json(await appel({ method: 'GET', url: '/api/qualite/regles' })).length, 7);
});
