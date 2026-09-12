/** Tests unitaires du constructeur SQL d'extraction (fonction pure, aucun moteur). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErreurSpecification, conditionFiltre, construireSql, schemaSpecification } from '../src/extraction/constructeur-sql';

const contexte = {
    nomTableDe: (id: string) => 't_' + id,
    nomSourceDe: (id: string) => ({ a: 'clients.csv', b: 'commandes.csv' })[id] || id
};
const specification = (partielle: object) =>
    schemaSpecification.parse({ baseId: 'a', colonnes: [{ tableId: 'a', col: 'nom' }], ...partielle });

test('extraction simple : une table, des colonnes, la colonne technique __rn absente', () => {
    const { sql, alias } = construireSql(
        specification({
            colonnes: [
                { tableId: 'a', col: 'nom' },
                { tableId: 'a', col: 'ville', alias: 'Ville' }
            ]
        }),
        contexte
    );
    assert.equal(sql, 'SELECT t0."nom" AS "nom", t0."ville" AS "Ville"\nFROM "t_a" AS t0');
    assert.deepEqual(alias, ['nom', 'Ville']);
});

test('jointure : clés normalisées des deux côtés, LEFT par défaut, INNER sur demande, alias « table.colonne »', () => {
    const spec = specification({
        jointures: [{ deTableId: 'a', deCol: 'id_client', versTableId: 'b', versCol: 'id_client' }],
        colonnes: [
            { tableId: 'a', col: 'nom' },
            { tableId: 'b', col: 'montant' }
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
        conditionFiltre('t0', { tableId: 'a', col: 'ville', op: '=', valeur: ' paris ' }),
        `UPPER(TRIM(CAST(t0."ville" AS VARCHAR))) = 'PARIS'`
    );
    assert.match(conditionFiltre('t0', { tableId: 'a', col: 'ville', op: 'in', valeur: 'Paris; Lyon' }), /IN \('PARIS', 'LYON'\)/);
    assert.match(
        conditionFiltre('t0', { tableId: 'a', col: 'montant', op: 'between', valeur: '10', valeur2: '20,5' }),
        /BETWEEN 10 AND 20.5/
    );
    assert.match(conditionFiltre('t0', { tableId: 'a', col: 'date', op: 'dfrom', valeur: '2024-01-01' }), />= '2024-01-01'::DATE/);
    assert.match(conditionFiltre('t0', { tableId: 'a', col: 'x', op: 'empty' }), /IS NULL OR TRIM/);
    assert.match(conditionFiltre('t0', { tableId: 'a', col: 'x', op: 'contains', valeur: "O'Neil" }), /LIKE '%' \|\| 'o''neil' \|\| '%'/);
    assert.throws(() => conditionFiltre('t0', { tableId: 'a', col: 'x', op: '>=', valeur: 'abc' }), ErreurSpecification);
});

test('regroupement : les colonnes sans agrégat forment la clé, les autres deviennent des mesures', () => {
    const { sql } = construireSql(
        specification({
            regrouper: true,
            colonnes: [
                { tableId: 'a', col: 'ville' },
                { tableId: 'a', col: 'id_client', agregat: 'countd' },
                { tableId: 'a', col: 'montant', agregat: 'sum' }
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
        () => construireSql(specification({ jointures: [{ deTableId: 'zz', deCol: 'x', versTableId: 'b', versCol: 'x' }] }), contexte),
        /table absente/
    );
    assert.throws(() => construireSql(specification({ colonnes: [{ tableId: 'b', col: 'x' }] }), contexte), /table absente/);
    assert.throws(
        () =>
            construireSql(
                specification({
                    colonnes: [
                        { tableId: 'a', col: 'x', alias: 'n' },
                        { tableId: 'a', col: 'y', alias: 'n' }
                    ]
                }),
                contexte
            ),
        /même nom/
    );
    assert.throws(() => construireSql(specification({ tri: [{ alias: 'inconnu', sens: 'asc' }] }), contexte), /absente de la sortie/);
});
