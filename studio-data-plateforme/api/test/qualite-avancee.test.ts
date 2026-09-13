/**
 * Tests de la qualité avancée (reprise de l'application classique) : nouveaux types de règles (condition, cohérence,
 * SQL, agrégat par groupe, fraîcheur, liste de valeurs, unicité composite), filtres d'audit, inspecteur d'anomalies,
 * lignes en échec d'une règle, audit d'un objet métier (facettes), clés fonctionnelles et doublons approchés.
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
import { anomaliesDuProfil } from '../src/qualite/anomalies';
import { sqlAnalyseCle, sqlSourceCle } from '../src/qualite/cle-fonctionnelle';
import { expressionCoherence, sqlEvaluation, verifierConditionSql } from '../src/qualite/regles';

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-qualite-avancee-'));
let app: NestFastifyApplication;
let cookies: Record<string, string> = {};
type Reponse = { statusCode: number; body: string; cookies: { name: string; value: string }[] };
const json = (reponse: Reponse) => JSON.parse(reponse.body);
const appel = (options: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) =>
    app.inject({ ...options, cookies } as never) as unknown as Promise<Reponse>;

/** Charge un CSV comme source de l'espace (fichier, table DuckDB avec __rn, document source). */
async function chargerSource(id: string, nom: string, csv: string, separateur: string) {
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
            sql: `CREATE TABLE "t_${id}" AS SELECT row_number() OVER () AS __rn, * FROM read_csv_auto('src_${id}', header=true, all_varchar=true, delim='${separateur}')`
        }
    });
    await appel({
        method: 'PUT',
        url: '/api/tables/' + id,
        payload: { name: nom, type: 'csv', headers: csv.split('\n')[0].split(separateur) }
    });
}

const aujourdHui = new Date().toISOString().slice(0, 10);

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
    // Sept lignes : doublons de nom (Martin ×3 à Lyon, dont une casse différente), un PRO sans SIRET, une période
    // incohérente (début > fin), une date de mise à jour ancienne, un statut hors liste, un bouche-trous (N/A),
    // un double espace dans un nom, et une ligne entièrement vide.
    const clients = [
        'id;nom;ville;type;siret;date_maj;debut;fin;statut',
        `1;Dupont;Paris;PRO;123;${aujourdHui};2024-01-01;2024-12-31;ACTIF`,
        `2;Dupond;Paris;PART;;${aujourdHui};2024-02-01;2024-01-15;ACTIF`,
        '3;Martin;Lyon;PRO;;2010-01-01;2023-01-01;2023-06-01;INACTIF',
        `4;MARTIN;lyon;PART;;${aujourdHui};;;ACTIF`,
        `5;Martin;Lyon;PART;N/A;${aujourdHui};2024-01-01;2024-12-31;SUSPENDU`,
        `6;Zoé  Lemaire;Paris;PART;;${aujourdHui};2024-01-01;2024-12-31;ACTIF`,
        ';;;;;;;;',
        ''
    ].join('\n');
    await chargerSource('tb_c', 'clients.csv', clients, ';');
    await chargerSource('tb_k', 'contrats.csv', 'id_contrat;id_client;montant\n10;1;100\n11;1;200\n12;2;50\n13;9;5\n', ';');
    const miseEnPlace = [
        appel({
            method: 'POST',
            url: '/api/modele/relations',
            payload: {
                sourceTable: 'contrats.csv',
                sourceCol: 'id_client',
                targetTable: 'clients.csv',
                targetCol: 'id',
                cardinality: 'N-1'
            }
        }),
        appel({
            method: 'PUT',
            url: '/api/gouvernance/listes-de-valeurs/lv_statut',
            payload: { name: 'Statuts', kind: 'inline', values: [{ code: 'ACTIF' }, { code: 'INACTIF' }] }
        }),
        appel({
            method: 'PUT',
            url: '/api/gouvernance/objets-metier/bo_client',
            payload: {
                name: 'Client',
                sources: [{ table: 'clients.csv', role: 'maitre' }],
                structure: [{ id: 'fc_contrat', name: 'Contrat', table: 'contrats.csv' }]
            }
        })
    ];
    for (const reponse of await Promise.all(miseEnPlace)) assert.ok(reponse.statusCode < 300, 'mise en place : ' + reponse.body);
});
after(async () => {
    await app.close();
    fs.rmSync(dossierTemporaire, { recursive: true, force: true });
});

test('fonctions pures : expression de cohérence typée, condition SQL contrôlée, SQL des nouveaux types, anomalies d’un profil', () => {
    const sql = expressionCoherence("[debut] <= [fin] AND ([statut] = 'ACTIF' OR [siret] IS NULL)");
    assert.match(sql, /"debut"/);
    assert.match(sql, /TRY_STRPTIME/, 'comparaison typée (date)');
    assert.match(sql, / AND \(.* OR .*\)$/);
    assert.throws(() => expressionCoherence('[inconnue] = 1', ['debut']), /Colonne inconnue/);
    assert.equal(verifierConditionSql(' ville IS NOT NULL '), 'ville IS NOT NULL');
    assert.throws(() => verifierConditionSql('1=1; DROP TABLE x'), /« ; »/);
    assert.throws(() => verifierConditionSql('(a = 1'), /Parenthèses/);
    assert.throws(() => verifierConditionSql('delete from x'), /lecture/);
    const nomTableDe = (id: string) => 't_' + id;
    const regle = (type: string, parametres: object, colonne = 'x') =>
        sqlEvaluation(
            { nom: 'r', sourceId: 'a', colonne, type: type as 'sql', parametres, criticite: 'majeure', active: true },
            nomTableDe
        );
    assert.match(regle('groupe', { colonnesGroupe: ['ville'], agregat: 'count', operateur: '<=', seuil: 2 }, '').total, /GROUP BY "ville"/);
    assert.match(regle('sql', { condition: 'x > 0' }, '').echecs, /COALESCE\(\(x > 0\), TRUE\)/);
    assert.match(regle('fraicheur', { jours: 30 }).echecs, /INTERVAL 30 DAY/);
    assert.match(regle('unique', { colonnes: ['y'] }).echecs, /PARTITION BY .*"x".*"y"/);
    assert.throws(() => regle('groupe', { colonnesGroupe: [] }, ''), /regroupement/);
    assert.throws(() => regle('condition', {}), /« alors »/);
    assert.throws(() => regle('listeValeurs', { listeId: 'absente' }), /liste inconnue/);
    const anomalies = anomaliesDuProfil(
        {
            colonnes: [{ colonne: 'a', vides: 0, espacesParasites: 2, boucheTrous: 0 } as never],
            doublonsExacts: 0,
            lignesVides: 1
        } as never,
        ['a']
    );
    assert.deepEqual(
        anomalies.map(anomalie => [anomalie.genre, anomalie.nombre]),
        [
            ['lignesVides', 1],
            ['espacesParasites', 2]
        ]
    );
    const contexte = { nomTableDe: () => null, relationVers: () => null };
    const source = sqlSourceCle(
        't_a',
        'a.csv',
        { id: 'p', scope: [], parts: [{ table: 'a.csv', col: 'nom', whereCol: '', whereVal: '', match: 'fuzzy' }] },
        contexte,
        false
    );
    assert.match(source, /AS ke, .* AS kn, .* AS kb, .* AS kf/);
    assert.match(sqlAnalyseCle(source, 0.9, true).floues!, /^WITH src AS \([\s\S]*\), d AS \(SELECT kb, kf/);
    assert.equal(sqlAnalyseCle(source, 0.9, false).floues, null);
    assert.throws(
        () =>
            sqlSourceCle(
                't_a',
                'a.csv',
                { id: 'p', scope: [], parts: [{ table: 'b.csv', col: 'x', whereCol: '', whereVal: '', match: 'exact' }] },
                contexte,
                false
            ),
        /non chargée/
    );
});

test('vocabulaire : types de règles, opérateurs, genres d’anomalie et modes d’appariement exposés', async () => {
    const vocabulaire = json(await appel({ method: 'GET', url: '/api/qualite/vocabulaire' }));
    for (const type of ['condition', 'expression', 'sql', 'groupe', 'fraicheur', 'listeValeurs'])
        assert.ok(vocabulaire.typesRegle[type], type);
    assert.deepEqual(vocabulaire.typesSansColonne, ['expression', 'sql', 'groupe']);
    assert.ok(vocabulaire.genresAnomalie.boucheTrous);
    assert.ok(vocabulaire.modesAppariement.fuzzy);
    assert.ok(vocabulaire.agregatsGroupe.avg);
    assert.ok(vocabulaire.operateursGroupe.includes('<='));
});

test('profilage avec anomalies : bouche-trous, espaces multiples, casse incohérente, ligne vide ; lignes d’une anomalie ; filtres d’audit', async () => {
    const profil = json(await appel({ method: 'POST', url: '/api/qualite/profil', payload: { sourceId: 'tb_c' } }));
    assert.equal(profil.lignes, 7);
    assert.equal(profil.lignesVides, 1);
    const anomalie = (genre: string, colonne: string) =>
        profil.anomalies.find((candidat: { genre: string; colonne: string }) => candidat.genre === genre && candidat.colonne === colonne);
    assert.equal(anomalie('boucheTrous', 'siret').nombre, 1);
    assert.equal(anomalie('espacesMultiples', 'nom').nombre, 1);
    assert.equal(anomalie('casseIncoherente', 'ville').nombre, 3, 'Lyon, lyon, Lyon : trois lignes concernées');
    assert.equal(anomalie('lignesVides', '(toute la ligne)').nombre, 1);
    const lignes = json(
        await appel({
            method: 'POST',
            url: '/api/qualite/anomalies/lignes',
            payload: { sourceId: 'tb_c', genre: 'boucheTrous', colonne: 'siret' }
        })
    );
    assert.equal(lignes.total, 1);
    assert.equal(lignes.lignes.length, 1);
    assert.equal(lignes.lignes[0][lignes.colonnes.indexOf('siret')], 'N/A');
    assert.ok(!lignes.colonnes.includes('__rn'));
    const filtres = [{ col: 'ville', op: 'eq', val: 'Paris' }];
    const profilParis = json(await appel({ method: 'POST', url: '/api/qualite/profil', payload: { sourceId: 'tb_c', filtres } }));
    assert.equal(profilParis.lignes, 3);
    assert.equal(profilParis.filtres.length, 1);
    const doublonsParis = json(
        await appel({ method: 'POST', url: '/api/qualite/doublons', payload: { sourceId: 'tb_c', cle: ['nom'], filtres } })
    );
    assert.equal(doublonsParis.groupes, 0);
    const doublonsTous = json(await appel({ method: 'POST', url: '/api/qualite/doublons', payload: { sourceId: 'tb_c', cle: ['nom'] } }));
    assert.equal(doublonsTous.groupes, 1, 'Martin ×3 (casse ignorée)');
    const lignesVides = json(
        await appel({ method: 'POST', url: '/api/qualite/anomalies/lignes', payload: { sourceId: 'tb_c', genre: 'lignesVides', filtres } })
    );
    assert.equal(lignesVides.total, 0, 'la ligne vide est hors du périmètre Paris');
});

test('nouveaux types de règles : condition, cohérence, SQL, agrégat par groupe, fraîcheur, liste de valeurs, unicité composite ; lignes en échec', async () => {
    const regles = [
        {
            nom: 'PRO avec SIRET',
            sourceId: 'tb_c',
            colonne: 'type',
            type: 'condition',
            parametres: { siOperateur: 'dans', siValeurs: ['PRO'], alorsColonne: 'siret', alorsOperateur: 'renseigne' }
        },
        { nom: 'Période cohérente', sourceId: 'tb_c', type: 'expression', parametres: { formule: '[debut] <= [fin]' } },
        { nom: 'Ville renseignée (SQL)', sourceId: 'tb_c', type: 'sql', parametres: { condition: "TRIM(COALESCE(ville, '')) <> ''" } },
        {
            nom: 'Au plus 2 clients par ville',
            sourceId: 'tb_c',
            type: 'groupe',
            parametres: { colonnesGroupe: ['ville'], agregat: 'count', operateur: '<=', seuil: 2 }
        },
        { nom: 'Mise à jour récente', sourceId: 'tb_c', colonne: 'date_maj', type: 'fraicheur', parametres: { jours: 365 } },
        { nom: 'Statut du référentiel', sourceId: 'tb_c', colonne: 'statut', type: 'listeValeurs', parametres: { listeId: 'lv_statut' } },
        { nom: 'Nom + ville uniques', sourceId: 'tb_c', colonne: 'nom', type: 'unique', parametres: { colonnes: ['ville'] } }
    ];
    for (const regle of regles) {
        const reponse = await appel({ method: 'POST', url: '/api/qualite/regles', payload: regle });
        assert.equal(reponse.statusCode, 201, regle.nom + ' : ' + reponse.body);
    }
    const refus = await appel({
        method: 'POST',
        url: '/api/qualite/regles',
        payload: { nom: 'Dangereuse', sourceId: 'tb_c', type: 'sql', parametres: { condition: 'DROP TABLE x' } }
    });
    assert.equal(refus.statusCode, 400);
    assert.match(json(refus).erreur, /lecture/);
    assert.equal(
        (await appel({ method: 'POST', url: '/api/qualite/regles', payload: { nom: 'Sans colonne', sourceId: 'tb_c', type: 'nonVide' } }))
            .statusCode,
        400
    );
    const execution = json(await appel({ method: 'POST', url: '/api/qualite/regles/executer', payload: { sourceId: 'tb_c' } }));
    const resultat = (nom: string) => {
        const regle = execution.regles.find((candidat: { nom: string }) => candidat.nom === nom);
        assert.ok(regle.resultat, nom + ' : ' + regle.erreur);
        return [regle.resultat.total, regle.resultat.echecs];
    };
    assert.deepEqual(resultat('PRO avec SIRET'), [2, 1]);
    assert.deepEqual(resultat('Période cohérente'), [7, 1]);
    assert.match(
        execution.regles.find((regle: { nom: string }) => regle.nom === 'Période cohérente').resultat.exemples[0],
        /^ligne 2$/,
        'sans colonne, l’exemple est le numéro de ligne'
    );
    assert.deepEqual(resultat('Ville renseignée (SQL)'), [7, 1]);
    assert.deepEqual(
        resultat('Au plus 2 clients par ville'),
        [4, 1],
        'groupes Paris (3), Lyon (2), lyon (1), vide (1) : seul Paris dépasse'
    );
    assert.deepEqual(resultat('Mise à jour récente'), [6, 1]);
    assert.deepEqual(resultat('Statut du référentiel'), [6, 1]);
    assert.deepEqual(resultat('Nom + ville uniques'), [6, 3]);
    const liste = json(await appel({ method: 'GET', url: '/api/qualite/regles?sourceId=tb_c' }));
    const unicite = liste.find((regle: { nom: string }) => regle.nom === 'Nom + ville uniques');
    const lignes = json(await appel({ method: 'GET', url: `/api/qualite/regles/${unicite.id}/lignes` }));
    assert.equal(lignes.total, 3);
    assert.equal(lignes.lignes.length, 3);
    assert.ok(lignes.colonnes.includes('nom') && !lignes.colonnes.includes('conforme'));
    const groupe = liste.find((regle: { nom: string }) => regle.nom === 'Au plus 2 clients par ville');
    const groupesEnEchec = json(await appel({ method: 'GET', url: `/api/qualite/regles/${groupe.id}/lignes` }));
    assert.deepEqual(groupesEnEchec.colonnes, ['ville', 'valeur_agregat']);
    assert.equal(groupesEnEchec.total, 1);
    assert.deepEqual(groupesEnEchec.lignes[0], ['Paris', '3']);
    assert.equal((await appel({ method: 'GET', url: '/api/qualite/regles/00000000-0000-4000-8000-000000000000/lignes' })).statusCode, 404);
});

test('audit d’un objet métier : profil de la table maître, règles du périmètre, cardinalité des facettes', async () => {
    const audit = json(await appel({ method: 'POST', url: '/api/qualite/objet', payload: { objetId: 'bo_client' } }));
    assert.equal(audit.tableMaitre, 'clients.csv');
    assert.equal(audit.profil.lignes, 7);
    assert.equal(audit.regles.regles.length, 7);
    assert.ok(audit.regles.score !== null);
    assert.equal(audit.facettes.length, 1);
    const [facette] = audit.facettes;
    assert.equal(facette.nom, 'Contrat');
    assert.equal(facette.total, 6, 'six identifiants clients renseignés');
    assert.equal(facette.sansLigne, 4, 'clients 3, 4, 5, 6 sans contrat');
    assert.equal(facette.plusieurs, 1, 'client 1 a deux contrats');
    assert.ok(facette.exemples.includes('1'));
    assert.equal((await appel({ method: 'POST', url: '/api/qualite/objet', payload: { objetId: 'bo_absent' } })).statusCode, 404);
    const filtre = json(
        await appel({
            method: 'POST',
            url: '/api/qualite/objet',
            payload: { objetId: 'bo_client', filtres: [{ col: 'ville', op: 'eq', val: 'Paris' }] }
        })
    );
    assert.equal(filtre.profil.lignes, 3);
});

test('clés fonctionnelles : profils enregistrés dans le dictionnaire ; doublons exacts, écritures différentes, clés ressemblantes ; composant d’une table liée', async () => {
    assert.deepEqual(json(await appel({ method: 'GET', url: '/api/qualite/cles/clients.csv' })), []);
    const profils = [
        {
            id: 'p_nom_ville',
            parts: [
                { table: 'clients.csv', col: 'nom', match: 'fuzzy' },
                { table: 'clients.csv', col: 'ville', match: 'norm' }
            ]
        },
        {
            id: 'p_avec_contrat',
            parts: [
                { table: 'clients.csv', col: 'id', match: 'exact' },
                { table: 'contrats.csv', col: 'montant', match: 'exact' }
            ]
        },
        { id: 'p_table_inconnue', parts: [{ table: 'inconnue.csv', col: 'x', match: 'exact' }] },
        { id: 'p_paris', scope: [{ col: 'ville', op: 'eq', val: 'Paris' }], parts: [{ table: 'clients.csv', col: 'nom', match: 'norm' }] }
    ];
    const enregistres = json(await appel({ method: 'PUT', url: '/api/qualite/cles/clients.csv', payload: { profils } }));
    assert.equal(enregistres.length, 4);
    assert.equal(enregistres[0].parts[0].whereCol, '', 'valeurs par défaut posées');
    assert.equal(json(await appel({ method: 'GET', url: '/api/qualite/cles/clients.csv' })).length, 4);
    const analyse = json(
        await appel({ method: 'POST', url: '/api/qualite/doublons-approches', payload: { sourceId: 'tb_c', seuil: 0.85 } })
    );
    assert.equal(analyse.length, 4);
    const [nomVille, avecContrat, tableInconnue, paris] = analyse;
    assert.equal(nomVille.totalLignes, 7);
    assert.deepEqual([nomVille.exactes.groupes, nomVille.exactes.lignes], [1, 2], 'Martin · Lyon ×2');
    assert.equal(nomVille.exactes.exemples[0].cle, 'Martin · Lyon');
    assert.equal(nomVille.proches.groupes, 1, 'MARTIN · lyon écrit différemment');
    assert.equal(nomVille.proches.exemples[0].ecritures.length, 2);
    assert.equal(nomVille.floues.length, 1, 'Dupont ~ Dupond');
    assert.ok(nomVille.floues[0].similarite >= 0.85);
    assert.ok([nomVille.floues[0].exemple1, nomVille.floues[0].exemple2].every(exemple => exemple.startsWith('Dupon')));
    assert.equal(avecContrat.erreur, undefined, 'jointure sur la relation du modèle');
    assert.equal(avecContrat.totalLignes, 7);
    assert.equal(avecContrat.exactes.groupes, 0);
    assert.match(tableInconnue.erreur, /non chargée/);
    assert.equal(paris.totalLignes, 3);
    assert.equal(paris.floues.length, 0, 'mode normalisé : pas de recherche floue');
    const audits = json(await appel({ method: 'GET', url: '/api/qualite/audits?sourceId=tb_c' }));
    assert.equal(audits[0].genre, 'doublons-approches');
    assert.equal(audits[0].resume.profils, 4);
    assert.equal((await appel({ method: 'POST', url: '/api/qualite/doublons-approches', payload: { sourceId: 'tb_k' } })).statusCode, 400);
});
