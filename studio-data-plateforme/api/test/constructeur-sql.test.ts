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

test('même table ramenée deux fois par des liens différents : deux routes, deux alias SQL', () => {
    // Le cas classique : le nom du souscripteur ET celui du bénéficiaire, tous deux dans la table des personnes.
    const { sql, alias } = construireSql(
        specification({
            jointures: [
                { cle: 'souscripteur', deTableId: 'a', deColonne: 'id_souscripteur', versTableId: 'b', versColonne: 'id' },
                { cle: 'beneficiaire', deTableId: 'a', deColonne: 'id_beneficiaire', versTableId: 'b', versColonne: 'id' }
            ],
            colonnes: [
                { tableId: 'b', route: 'souscripteur', nomColonne: 'nom', alias: 'Souscripteur' },
                { tableId: 'b', route: 'beneficiaire', nomColonne: 'nom', alias: 'Bénéficiaire' }
            ]
        }),
        contexte
    );
    assert.deepEqual(alias, ['Souscripteur', 'Bénéficiaire']);
    assert.match(sql, /t1\."nom" AS "Souscripteur"/);
    assert.match(sql, /t2\."nom" AS "Bénéficiaire"/);
    assert.match(sql, /LEFT JOIN "t_b" AS t1 ON .*t0\."id_souscripteur"/s);
    assert.match(sql, /LEFT JOIN "t_b" AS t2 ON .*t0\."id_beneficiaire"/s);
});

test('routes : une jointure en chaîne part d’une route, et deux fois la même clé est refusée', () => {
    const enChaine = construireSql(
        specification({
            jointures: [
                { cle: 'commandes', deTableId: 'a', deColonne: 'id', versTableId: 'b', versColonne: 'id_client' },
                { cle: 'lignes', depuis: 'commandes', deTableId: 'b', deColonne: 'id', versTableId: 'c', versColonne: 'id_commande' }
            ],
            colonnes: [{ tableId: 'c', route: 'lignes', nomColonne: 'quantite' }]
        }),
        contexte
    );
    assert.match(enChaine.sql, /LEFT JOIN "t_c" AS t2 ON .*t1\."id"/s, 'la deuxième jointure part bien de la première');
    assert.throws(
        () =>
            construireSql(
                specification({
                    jointures: [
                        { deTableId: 'a', deColonne: 'id', versTableId: 'b', versColonne: 'id_client' },
                        { deTableId: 'a', deColonne: 'autre', versTableId: 'b', versColonne: 'id_client' }
                    ]
                }),
                contexte
            ),
        /jointe deux fois/
    );
});

test('dédoublonnage par clé fonctionnelle : une ligne par clé, première ou dernière au choix', () => {
    const parCle = (garder: string) =>
        construireSql(
            specification({
                colonnes: [
                    { tableId: 'a', nomColonne: 'siren', alias: 'SIREN' },
                    { tableId: 'a', nomColonne: 'nom' }
                ],
                dedoublonnage: { actif: true, cles: ['SIREN'], garder }
            }),
            contexte
        ).sql;
    const premiere = parCle('premiere');
    assert.match(premiere, /ROW_NUMBER\(\) OVER \(PARTITION BY "SIREN" ORDER BY __ordre_t0\)/);
    assert.match(premiere, /t0\."__rn" AS __ordre_t0/, 'le rang de la table de départ sert d’ordre');
    assert.match(premiere, /WHERE __rang = 1$/);
    assert.match(premiere, /^SELECT "SIREN", "nom" FROM \(/, 'les colonnes techniques ne ressortent pas');
    assert.match(parCle('derniere'), /ORDER BY __ordre_t0 DESC/);
    // Une clé qui ne désigne aucune colonne de la sortie est ignorée : la requête reste celle de base.
    const cleInconnue = construireSql(specification({ dedoublonnage: { actif: true, cles: ['absente'] } }), contexte).sql;
    assert.doesNotMatch(cleInconnue, /ROW_NUMBER/);
});

test('mesures d’un regroupement : nombre de lignes, somme, et critères façon NB.SI.ENS', () => {
    const { sql, alias } = construireSql(
        specification({
            regrouper: true,
            colonnes: [{ tableId: 'a', nomColonne: 'region' }],
            mesures: [
                { fn: 'count', alias: 'Nombre' },
                { fn: 'sum', tableId: 'a', nomColonne: 'montant', alias: 'Total' },
                {
                    fn: 'count',
                    alias: 'Nombre au Nord',
                    criteres: [{ tableId: 'a', nomColonne: 'region', op: '=', valeur: 'Nord' }]
                }
            ]
        }),
        contexte
    );
    assert.deepEqual(alias, ['region', 'Nombre', 'Total', 'Nombre au Nord']);
    assert.match(sql, /COUNT\(\*\) AS "Nombre"/);
    assert.match(sql, /SUM\(TRY_CAST\(t0\."montant" AS DOUBLE\)\) AS "Total"/);
    assert.match(sql, /COUNT\(\*\) FILTER \(WHERE UPPER\(TRIM\(CAST\(t0\."region" AS VARCHAR\)\)\) = 'NORD'\) AS "Nombre au Nord"/);
    assert.match(sql, /GROUP BY t0\."region"/);
    // Hors regroupement, les mesures ne sont pas produites.
    assert.doesNotMatch(construireSql(specification({ mesures: [{ fn: 'count', alias: 'Nombre' }] }), contexte).sql, /COUNT/);
});

test('mesure incohérente refusée : colonne manquante, table absente, nom en double', () => {
    const avecMesure = (mesure: object) => specification({ regrouper: true, mesures: [mesure] });
    assert.throws(() => construireSql(avecMesure({ fn: 'sum', tableId: 'a', alias: 'Total' }), contexte), /colonne à mesurer/);
    assert.throws(() => construireSql(avecMesure({ fn: 'sum', tableId: 'b', nomColonne: 'x', alias: 'T' }), contexte), /table absente/);
    assert.throws(() => construireSql(avecMesure({ fn: 'count', alias: 'nom' }), contexte), /même nom/);
});

test('hiérarchie par table de liaison : rattachement daté lu à une date de référence', () => {
    const { sql, alias } = construireSql(
        specification({
            colonnes: [
                {
                    tableId: 'a',
                    genre: 'hierarchie',
                    alias: 'org',
                    hierarchie: {
                        idColonne: 'code',
                        attributs: ['libelle'],
                        profondeur: 2,
                        type: 'liaison',
                        liaisonTableId: 'b',
                        liaisonEnfant: 'code_enfant',
                        liaisonParent: 'code_parent',
                        valideDu: 'debut',
                        valideAu: 'fin',
                        dateReference: '2026-01-01'
                    }
                }
            ]
        }),
        contexte
    );
    assert.match(sql, /hierarchie0_liens\(enfant, parent\) AS \(/, 'les rattachements retenus sont isolés dans leur CTE');
    assert.match(sql, /FROM "t_b" l WHERE/);
    assert.match(sql, /TRY_CAST\(l\."debut" AS DATE\) <= '2026-01-01'::DATE/);
    assert.match(sql, /TRY_CAST\(l\."fin" AS DATE\) >= '2026-01-01'::DATE/);
    assert.match(sql, /JOIN hierarchie0_liens li ON li\.enfant =/, 'la récursion suit la table de liaison');
    assert.deepEqual(alias, ['org_niv1', 'org_niv2']);
    // Sans table de liaison choisie, la spécification est refusée avec un message clair.
    assert.throws(
        () =>
            construireSql(
                specification({
                    colonnes: [{ tableId: 'a', genre: 'hierarchie', alias: 'o', hierarchie: { idColonne: 'code', type: 'liaison' } }]
                }),
                contexte
            ),
        /table de rattachement/
    );
});

test('hiérarchie simple sans colonne parent : refusée avec un message clair', () => {
    assert.throws(
        () =>
            construireSql(
                specification({ colonnes: [{ tableId: 'a', genre: 'hierarchie', alias: 'h', hierarchie: { idColonne: 'code' } }] }),
                contexte
            ),
        /colonne parent est requise/
    );
});

test('SQL personnalisé : la requête écrite à la main remplace la requête construite', () => {
    const { sql, alias } = construireSql(specification({ sqlPersonnalise: '  SELECT 1 AS un  ' }), contexte);
    assert.equal(sql, 'SELECT 1 AS un');
    assert.deepEqual(alias, [], 'aucun alias connu : le tri et le dédoublonnage ne s’appliquent plus');
});

test('dédoublonnage avec une jointure : l’ordre est départagé table par table, jamais arbitraire', () => {
    // Deux commandes d’un même client partagent le rang du client : sans le rang des commandes, « la première »
    // et « la dernière » désigneraient la même ligne au hasard.
    const { sql } = construireSql(
        specification({
            jointures: [{ deTableId: 'a', deColonne: 'id', versTableId: 'b', versColonne: 'id_client' }],
            colonnes: [
                { tableId: 'a', nomColonne: 'nom', alias: 'Client' },
                { tableId: 'b', nomColonne: 'id_commande', alias: 'Commande' }
            ],
            dedoublonnage: { actif: true, cles: ['Client'], garder: 'derniere' }
        }),
        contexte
    );
    assert.match(sql, /t0\."__rn" AS __ordre_t0, t1\."__rn" AS __ordre_t1/);
    assert.match(sql, /ORDER BY __ordre_t0 DESC, __ordre_t1 DESC/);
});
