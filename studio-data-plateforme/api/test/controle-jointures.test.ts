/** Tests unitaires du contrôle des jointures (fonctions pures : du SQL fabriqué, des nombres interprétés). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    JointureAControler,
    SEUIL_DE_MULTIPLICATION,
    bilanDesJointures,
    sqlDuComptage,
    verdictDeLaJointure
} from '../src/extraction/controle-jointures';

const jointure = (partielle: Partial<JointureAControler>): JointureAControler => ({
    cle: 'r1',
    aliasDepart: 't0',
    nomTable: 't_arbre',
    alias: 't1',
    deColonne: 'id_element',
    versColonne: 'id_element',
    conditionsEnPlus: [],
    ...partielle
});

test('comptage : aucune jointure demandée, on compte la seule table de départ', () => {
    assert.equal(sqlDuComptage('t_elements', [jointure({})], 0), 'SELECT COUNT(*) AS lignes FROM "t_elements" AS t0');
});

test('comptage : la jointure est toujours posée en LEFT, pour mesurer ce qu’elle ajoute et non ce qu’un INNER retirerait', () => {
    const sql = sqlDuComptage('t_elements', [jointure({})], 1);
    assert.match(sql, /LEFT JOIN "t_arbre" AS t1 ON /);
    assert.match(
        sql,
        /NULLIF\(UPPER\(TRIM\(CAST\(t1\."id_element" AS VARCHAR\)\)\), ''\) = NULLIF\(UPPER\(TRIM\(CAST\(t0\."id_element" AS VARCHAR\)\)\), ''\)/
    );
});

test('comptage : une clé composite ajoute ses conditions avec AND, contre la table qu’elle nomme', () => {
    const jointures = [
        jointure({ cle: 'r1', nomTable: 't_rattachements', alias: 't1' }),
        jointure({
            cle: 'r2',
            nomTable: 't_arbre',
            alias: 't2',
            conditionsEnPlus: [{ versColonne: 'groupe', aliasCompare: 't1', colonneComparee: 'groupe' }]
        })
    ];
    const sql = sqlDuComptage('t_elements', jointures, 2);
    const derniere = sql.split('\n').pop() || '';
    const conditions = derniere.slice(derniere.indexOf(' ON ') + 4).split(' AND ');
    assert.equal(conditions.length, 2);
    assert.match(conditions[0], /t2\."id_element".*t0\."id_element"/);
    assert.match(conditions[1], /t2\."groupe".*t1\."groupe"/, 'le groupe vient de la table intermédiaire, pas de la table de départ');
});

test('comptage : une condition qui viserait une table pas encore posée est laissée de côté, jamais du SQL faux', () => {
    const avecCondition = jointure({
        conditionsEnPlus: [{ versColonne: 'groupe', aliasCompare: 't7', colonneComparee: 'groupe' }]
    });
    const sql = sqlDuComptage('t_elements', [avecCondition], 1);
    assert.equal(sql.split(' AND ').length, 1);
    assert.ok(!sql.includes('t7'));
});

test('comptage : on ne garde que les premières jointures, pour mesurer l’effet de chacune l’une après l’autre', () => {
    const jointures = [jointure({}), jointure({ cle: 'r2', nomTable: 't_groupes', alias: 't2', aliasDepart: 't1' })];
    assert.equal(sqlDuComptage('t_elements', jointures, 1).match(/LEFT JOIN/g)?.length, 1);
    assert.equal(sqlDuComptage('t_elements', jointures, 2).match(/LEFT JOIN/g)?.length, 2);
});

test('verdict : une jointure qui laisse le compte intact ne multiplie pas et le dit sans alarmer', () => {
    const verdict = verdictDeLaJointure({ cle: 'r1', nomTable: 'arbre', lignesAvant: 3, lignesApres: 3 });
    assert.equal(verdict.facteur, 1);
    assert.equal(verdict.multiplie, false);
    assert.match(verdict.phrase, /n’ajoute aucune ligne|n'ajoute aucune ligne/);
});

test('verdict : une jointure qui gonfle le compte est signalée avec son facteur et la cause probable', () => {
    const verdict = verdictDeLaJointure({ cle: 'r1', nomTable: 'arbre', lignesAvant: 3, lignesApres: 5 });
    assert.equal(verdict.facteur, 1.67);
    assert.equal(verdict.multiplie, true);
    assert.match(verdict.phrase, /« arbre » multiplie les lignes : 3 → 5/);
    assert.match(verdict.phrase, /colonne à la clé de ce lien/);
});

test('verdict : un écart en deçà du seuil reste du bruit, et une table vide ne fait pas de division par zéro', () => {
    assert.equal(verdictDeLaJointure({ cle: 'r1', nomTable: 'arbre', lignesAvant: 1000, lignesApres: 1005 }).multiplie, false);
    assert.ok(1.005 < SEUIL_DE_MULTIPLICATION);
    assert.equal(verdictDeLaJointure({ cle: 'r1', nomTable: 'arbre', lignesAvant: 0, lignesApres: 0 }).facteur, 1);
});

test('bilan : sans jointure, rien ne peut multiplier ; avec des jointures saines, le résultat compte ce qu’il annonce', () => {
    assert.equal(bilanDesJointures([]).multiplie, false);
    assert.match(bilanDesJointures([]).phrase, /Aucune table liée/);
    const sain = bilanDesJointures([{ cle: 'r1', nomTable: 'arbre', lignesAvant: 3, lignesApres: 3 }]);
    assert.equal(sain.multiplie, false);
    assert.match(sain.phrase, /Aucune jointure ne multiplie/);
});

test('bilan : les jointures fautives sont comptées et le trajet du nombre de lignes est rappelé de bout en bout', () => {
    const bilan = bilanDesJointures([
        { cle: 'r1', nomTable: 'arbre', lignesAvant: 3, lignesApres: 5 },
        { cle: 'r2', nomTable: 'groupes', lignesAvant: 5, lignesApres: 5 }
    ]);
    assert.equal(bilan.multiplie, true);
    assert.equal(bilan.jointures.length, 2);
    assert.match(bilan.phrase, /1 jointure\(s\) multiplient les lignes : 3 au départ, 5 en sortie/);
    assert.match(bilan.phrase, /Modèle de données/);
});
