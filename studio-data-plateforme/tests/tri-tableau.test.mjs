/**
 * Tests du tri des tableaux de résultats (fonctions pures, sans navigateur) : ce qui fait qu'un clic sur une
 * en-tête range les lignes comme on s'y attend, et qu'une case vide se lit « — ».
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    comparerValeurs,
    estVide,
    flecheTri,
    lignesTriees,
    nombreDe,
    triSuivant,
    valeurAffichee
} from '../web/src/app/composants/tri-tableau.ts';

test('une valeur absente ou vide s’affiche « — »', () => {
    assert.equal(valeurAffichee(null), '—');
    assert.equal(valeurAffichee(undefined), '—');
    assert.equal(valeurAffichee('   '), '—');
    assert.equal(valeurAffichee(0), '0', 'zéro est une valeur, pas un vide');
    assert.equal(valeurAffichee('Paris'), 'Paris');
    assert.equal(estVide(0), false);
});

test('les nombres sont reconnus, écrits à la française ou à l’anglaise', () => {
    assert.equal(nombreDe('1234.5'), 1234.5);
    assert.equal(nombreDe('1 234,50'), 1234.5);
    assert.equal(nombreDe('-12'), -12);
    assert.equal(nombreDe('12 rue du Port'), null);
    assert.equal(nombreDe(''), null);
});

test('les nombres se comparent comme des nombres, le texte comme du texte', () => {
    assert.ok(comparerValeurs('100', '20') > 0, '100 vient après 20');
    assert.ok(comparerValeurs('Ana', 'Zoé') < 0);
    assert.ok(comparerValeurs('éclair', 'zèbre') < 0, 'les accents restent à leur place alphabétique');
    assert.ok(comparerValeurs('2026-01-05', '2026-10-02') < 0, 'les dates ISO se trient comme du texte');
});

test('les valeurs vides sont reléguées à la fin, dans les deux sens', () => {
    const lignes = [
        ['Bob', ''],
        ['Ana', '25'],
        ['Zoé', null]
    ];
    assert.deepEqual(
        lignesTriees(lignes, { colonne: 1, sens: 'asc' }).map(ligne => ligne[0]),
        ['Ana', 'Bob', 'Zoé']
    );
    assert.deepEqual(lignesTriees(lignes, { colonne: 1, sens: 'desc' })[0][0], 'Ana');
});

test('sans tri, les lignes gardent l’ordre du serveur et ne sont pas recopiées', () => {
    const lignes = [['Bob'], ['Ana']];
    assert.equal(lignesTriees(lignes, null), lignes);
});

test('le tri ne modifie jamais les lignes reçues', () => {
    const lignes = [['Bob'], ['Ana']];
    lignesTriees(lignes, { colonne: 0, sens: 'asc' });
    assert.deepEqual(lignes, [['Bob'], ['Ana']]);
});

test('trois clics sur la même colonne : croissant, décroissant, ordre d’origine', () => {
    const premier = triSuivant(null, 2);
    assert.deepEqual(premier, { colonne: 2, sens: 'asc' });
    const second = triSuivant(premier, 2);
    assert.deepEqual(second, { colonne: 2, sens: 'desc' });
    assert.equal(triSuivant(second, 2), null);
    assert.deepEqual(triSuivant(second, 3), { colonne: 3, sens: 'asc' }, 'une autre colonne repart en croissant');
});

test('la flèche ne s’affiche que sur la colonne qui trie', () => {
    assert.equal(flecheTri({ colonne: 1, sens: 'asc' }, 1), ' ▲');
    assert.equal(flecheTri({ colonne: 1, sens: 'desc' }, 1), ' ▼');
    assert.equal(flecheTri({ colonne: 1, sens: 'asc' }, 0), '');
    assert.equal(flecheTri(null, 0), '');
});
