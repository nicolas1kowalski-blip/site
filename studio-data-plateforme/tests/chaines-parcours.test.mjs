/**
 * Tests des chaînes « Depuis le début » (V12.10) : dire en une ligne d'où vient vraiment une donnée.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chaineLisible, chainesVers, pointsDeDepart, resumeDesChaines } from '../web/src/app/composants/chaines-parcours.ts';

/** Système tiers → Gestion des tiers → personnes.csv → Personne (le centre). */
const graphe = {
    noeuds: [
        { id: 'bo:personne', titre: 'Personne' },
        { id: 'tbl:personnes.csv', titre: 'personnes.csv', niveau: 1 },
        { id: 'as:gestion', titre: 'Gestion des tiers', niveau: 2 },
        { id: 'tbl:tiers.csv', titre: 'tiers.csv', niveau: 3 },
        { id: 'as:systeme', titre: 'Système tiers', niveau: 4, debut: true }
    ],
    liens: [
        { source: 'tbl:personnes.csv', target: 'bo:personne' },
        { source: 'as:gestion', target: 'tbl:personnes.csv' },
        { source: 'tbl:tiers.csv', target: 'as:gestion' },
        { source: 'as:systeme', target: 'tbl:tiers.csv' }
    ]
};

test('les points de départ sont ce que rien n’alimente', () => {
    assert.deepEqual(
        pointsDeDepart(graphe).map(noeud => noeud.titre),
        ['Système tiers']
    );
});

test('la chaîne remonte du début connu jusqu’au centre', () => {
    const chaines = chainesVers(graphe, 'bo:personne');
    assert.equal(chaines.length, 1);
    assert.equal(chaineLisible(graphe, chaines[0]), 'Système tiers ⇢ tiers.csv ⇢ Gestion des tiers ⇢ personnes.csv ⇢ Personne');
});

test('la plus longue chaîne vient en premier : c’est celle qui raconte le plus', () => {
    const deuxChemins = {
        noeuds: [...graphe.noeuds, { id: 'tbl:direct.csv', titre: 'direct.csv', niveau: 1 }],
        liens: [...graphe.liens, { source: 'tbl:direct.csv', target: 'bo:personne' }]
    };
    const chaines = chainesVers(deuxChemins, 'bo:personne');
    assert.equal(chaines.length, 2);
    assert.equal(chaines[0].length, 5);
    assert.equal(chaineLisible(deuxChemins, chaines[1]), 'direct.csv ⇢ Personne');
});

test('un cycle ne fait pas tourner le calcul en rond', () => {
    const enBoucle = {
        noeuds: [
            { id: 'a', titre: 'A' },
            { id: 'b', titre: 'B' }
        ],
        liens: [
            { source: 'a', target: 'b' },
            { source: 'b', target: 'a' }
        ]
    };
    const chaines = chainesVers(enBoucle, 'a');
    assert.ok(
        chaines.every(chaine => new Set(chaine).size === chaine.length),
        'aucun élément répété dans une chaîne'
    );
});

test('le résumé dit combien de chaînes, et d’où elles partent', () => {
    const resume = resumeDesChaines(graphe, 'bo:personne');
    assert.equal(resume.chaines, 1);
    assert.deepEqual(resume.departs, ['Système tiers']);
});

test('sans amont, il n’y a rien à remonter', () => {
    const seul = { noeuds: [{ id: 'bo:x', titre: 'X' }], liens: [] };
    assert.deepEqual(chainesVers(seul, 'bo:x'), []);
    assert.deepEqual(resumeDesChaines(seul, 'bo:x'), { chaines: 0, departs: [] });
});
