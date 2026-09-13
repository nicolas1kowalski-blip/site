/** Tests unitaires du constructeur SQL d'extraction (fonction pure, aucun moteur). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErreurSpecification, conditionFiltre, construireSql, schemaSpecification } from '../src/extraction/constructeur-sql';

const contexte = {
    nomTableDe: (id: string) => 't_' + id,
    nomSourceDe: (id: string) => ({ a: 'clients.csv', b: 'commandes.csv' })[id] || id
};
const specification = (partielle: object) =>
    schemaSpecification.parse({ baseId: 'a', colonnes: [{ tableId: 'a', nomColonne: 'nom' }], ...partielle });

test('extraction simple : une table, des colonnes, la colonne technique __rn absente', () => {
    const { sql, alias } = construireSql(
        specification({
            colonnes: [
                { tableId: 'a', nomColonne: 'nom' },
                { tableId: 'a', nomColonne: 'ville', alias: 'Ville' }
            ]
        }),
        contexte
    );
    assert.equal(sql, 'SELECT t0."nom" AS "nom", t0."ville" AS "Ville"\nFROM "t_a" AS t0');
    assert.deepEqual(alias, ['nom', 'Ville']);
});

test('jointure : clés normalisées des deux côtés, LEFT par défaut, INNER sur demande, alias « table.colonne »', () => {
    const spec = specification({
        jointures: [{ deTableId: 'a', deColonne: 'id_client', versTableId: 'b', versColonne: 'id_client' }],
        colonnes: [
            { tableId: 'a', nomColonne: 'nom' },
            { tableId: 'b', nomColonne: 'montant' }
        ]
    });
    const { sql, alias } = construireSql(spec, contexte);
    assert.match(
        sql,
        /LEFT JOIN "t_b" AS t1 ON NULLIF\(UPPER\(TRIM\(CAST\(t1\."id_client" AS VARCHAR\)\)\), ''\) = NULLIF\(UPPER\(TRIM\(CAST\(t0\."id_client" AS VARCHAR\)\)\), ''\)/
    );
    assert.deepEqual(alias, ['nom', 'commandes.montant']);
    assert.match(construireSql({ ...spec, typeJointure: 'inner' }, contexte).sql, /INNER JOIN/);
});

test('filtres : chaque opérateur produit une condition ; nombre invalide refusé', () => {
    assert.equal(
        conditionFiltre('t0', { tableId: 'a', nomColonne: 'ville', op: '=', valeur: ' paris ' }),
        `UPPER(TRIM(CAST(t0."ville" AS VARCHAR))) = 'PARIS'`
    );
    assert.match(conditionFiltre('t0', { tableId: 'a', nomColonne: 'ville', op: 'in', valeur: 'Paris; Lyon' }), /IN \('PARIS', 'LYON'\)/);
    assert.match(
        conditionFiltre('t0', { tableId: 'a', nomColonne: 'montant', op: 'between', valeur: '10', valeur2: '20,5' }),
        /BETWEEN 10 AND 20.5/
    );
    assert.match(conditionFiltre('t0', { tableId: 'a', nomColonne: 'date', op: 'dfrom', valeur: '2024-01-01' }), />= '2024-01-01'::DATE/);
    assert.match(conditionFiltre('t0', { tableId: 'a', nomColonne: 'x', op: 'empty' }), /IS NULL OR TRIM/);
    assert.match(
        conditionFiltre('t0', { tableId: 'a', nomColonne: 'x', op: 'contains', valeur: "O'Neil" }),
        /LIKE '%' \|\| 'o''neil' \|\| '%'/
    );
    assert.throws(() => conditionFiltre('t0', { tableId: 'a', nomColonne: 'x', op: '>=', valeur: 'abc' }), ErreurSpecification);
});

test('regroupement : les colonnes sans agrégat forment la clé, les autres deviennent des mesures', () => {
    const { sql } = construireSql(
        specification({
            regrouper: true,
            colonnes: [
                { tableId: 'a', nomColonne: 'ville' },
                { tableId: 'a', nomColonne: 'id_client', agregat: 'countd' },
                { tableId: 'a', nomColonne: 'montant', agregat: 'sum' }
            ]
        }),
        contexte
    );
    assert.match(sql, /COUNT\(DISTINCT t0\."id_client"\) AS "id_client_countd"/);
    assert.match(sql, /SUM\(TRY_CAST\(t0\."montant" AS DOUBLE\)\) AS "montant_sum"/);
    assert.match(sql, /GROUP BY t0\."ville"$/m);
});

test('dédoublonnage, tri et limite', () => {
    const { sql } = construireSql(specification({ dedoublonner: true, tri: [{ alias: 'nom', sens: 'desc' }], limite: 10 }), contexte);
    assert.match(sql, /^SELECT DISTINCT /);
    assert.match(sql, /ORDER BY "nom" DESC\nLIMIT 10$/);
});

test('spécifications incohérentes refusées : jointure depuis une table absente, colonne d’une table absente, alias en double, tri hors sortie', () => {
    assert.throws(
        () =>
            construireSql(
                specification({ jointures: [{ deTableId: 'zz', deColonne: 'x', versTableId: 'b', versColonne: 'x' }] }),
                contexte
            ),
        /table absente/
    );
    assert.throws(() => construireSql(specification({ colonnes: [{ tableId: 'b', nomColonne: 'x' }] }), contexte), /table absente/);
    assert.throws(
        () =>
            construireSql(
                specification({
                    colonnes: [
                        { tableId: 'a', nomColonne: 'x', alias: 'n' },
                        { tableId: 'a', nomColonne: 'y', alias: 'n' }
                    ]
                }),
                contexte
            ),
        /même nom/
    );
    assert.throws(() => construireSql(specification({ tri: [{ alias: 'inconnu', sens: 'asc' }] }), contexte), /absente de la sortie/);
});

test('colonne calculée : [colonne] et [table.colonne] deviennent des expressions SQL ; référence inconnue refusée', () => {
    const contexteAvecColonnes = {
        ...contexte,
        colonnesDe: (id: string) => ({ a: ['nom', 'ville', 'prix', 'qte'], b: ['id_client', 'montant'] })[id] || []
    };
    const spec = specification({
        jointures: [{ deTableId: 'a', deColonne: 'id_client', versTableId: 'b', versColonne: 'id_client' }],
        colonnes: [
            { tableId: 'a', nomColonne: 'nom' },
            { tableId: 'a', genre: 'calcul', formule: "upper([nom]) || ' - ' || [commandes.montant]", alias: 'etiquette' },
            { tableId: 'a', genre: 'calcul', formule: '[prix] * [qte]', alias: 'total' }
        ]
    });
    const { sql, alias } = construireSql(spec, contexteAvecColonnes);
    assert.match(sql, /\(upper\(t0\."nom"\) \|\| ' - ' \|\| t1\."montant"\) AS "etiquette"/);
    assert.match(sql, /\(t0\."prix" \* t0\."qte"\) AS "total"/);
    assert.deepEqual(alias, ['nom', 'etiquette', 'total']);
    assert.throws(
        () =>
            construireSql(
                specification({ colonnes: [{ tableId: 'a', genre: 'calcul', formule: '[inconnue] + 1' }] }),
                contexteAvecColonnes
            ),
        /Colonne inconnue dans la formule/
    );
});

test('synthèse d’une table liée : sous-requête corrélée (nombre, valeurs, N premières) sans jointure', () => {
    const synthese = { tableId: 'b', deTableId: 'a', deColonne: 'id_client', versColonne: 'id_client' };
    const { sql, alias } = construireSql(
        specification({
            colonnes: [
                { tableId: 'a', nomColonne: 'nom' },
                { tableId: 'a', genre: 'synthese', synthese: { ...synthese, mode: 'count' }, alias: 'nb_commandes' },
                { tableId: 'a', genre: 'synthese', synthese: { ...synthese, mode: 'values', nomColonne: 'montant' }, alias: 'montants' },
                { tableId: 'a', genre: 'synthese', synthese: { ...synthese, mode: 'first', nomColonne: 'montant', n: 2 } }
            ]
        }),
        contexte
    );
    assert.match(
        sql,
        /\(SELECT COUNT\(\*\) FROM "t_b" s WHERE NULLIF\(UPPER\(TRIM\(CAST\(s\."id_client" AS VARCHAR\)\)\), ''\) = NULLIF\(UPPER\(TRIM\(CAST\(t0\."id_client" AS VARCHAR\)\)\), ''\)\) AS "nb_commandes"/
    );
    assert.match(sql, /string_agg\(DISTINCT NULLIF\(TRIM\(CAST\(s\."montant" AS VARCHAR\)\), ''\), ' \| '\)/);
    assert.deepEqual(alias, ['nom', 'nb_commandes', 'montants', 'commandes_1', 'commandes_2']);
    assert.doesNotMatch(sql, /JOIN/);
});

test('hiérarchie aplatie : CTE récursive, jointure sur l’identifiant normalisé, une colonne par niveau', () => {
    const { sql, alias } = construireSql(
        specification({
            colonnes: [
                { tableId: 'a', nomColonne: 'nom' },
                {
                    tableId: 'a',
                    genre: 'hierarchie',
                    hierarchie: { idColonne: 'id', parentColonne: 'parent', attributs: ['nom'], profondeur: 3 },
                    alias: 'chemin'
                }
            ]
        }),
        contexte
    );
    assert.match(sql, /^WITH RECURSIVE hierarchie0\(k, chain\) AS \(/);
    assert.match(sql, /LEFT JOIN hierarchie0 ON hierarchie0\.k = NULLIF\(UPPER\(TRIM\(CAST\(t0\."id" AS VARCHAR\)\)\), ''\)/);
    assert.deepEqual(alias, ['nom', 'chemin_niv1', 'chemin_niv2', 'chemin_niv3']);
});

test('filtre sur liste fournie : valeurs normalisées, sens « exclure », liste vide neutre', () => {
    assert.equal(
        conditionFiltre('t0', { nomColonne: 'ville', op: 'list', liste: [' paris', 'Lyon', 'lyon', ''] }),
        `NULLIF(UPPER(TRIM(CAST(t0."ville" AS VARCHAR))), '') IN ('PARIS', 'LYON')`
    );
    assert.match(conditionFiltre('t0', { nomColonne: 'ville', op: 'list', liste: ['Paris'], exclure: true }), /NOT IN \('PARIS'\)/);
    assert.equal(conditionFiltre('t0', { nomColonne: 'ville', op: 'list', liste: [] }), 'TRUE');
});
