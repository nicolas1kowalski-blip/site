/** Tests unitaires de la lecture d'une liste fournie (fonctions pures : du texte entre, un tableau sort). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    decouperTexte,
    detecterSeparateur,
    lireTexteDelimite,
    nommerEnTetes,
    tableauDepuisLignes
} from '../src/extraction/tableau-fichier';

test('le séparateur le plus découpant est retenu', () => {
    assert.equal(detecterSeparateur('siren;nom;ville\n123;Alpha;Paris'), ';');
    assert.equal(detecterSeparateur('siren\tnom\tville'), '\t');
    assert.equal(detecterSeparateur('siren,nom,ville'), ',');
    assert.equal(detecterSeparateur('siren|nom'), '|');
});

test('une liste collée sans séparateur reste une seule colonne', () => {
    assert.equal(detecterSeparateur('123456789\n987654321'), ';');
    const tableau = lireTexteDelimite('SIREN\n123456789\n987654321');
    assert.deepEqual(tableau.colonnes, ['SIREN']);
    assert.deepEqual(tableau.lignes, [['123456789'], ['987654321']]);
});

test('les guillemets protègent le séparateur et les retours à la ligne', () => {
    const lignes = decouperTexte('a;"b;c";"d\ne"\n1;2;3', ';');
    assert.deepEqual(lignes, [
        ['a', 'b;c', 'd\ne'],
        ['1', '2', '3']
    ]);
});

test('deux guillemets à l’intérieur d’une valeur protégée valent un guillemet', () => {
    assert.deepEqual(decouperTexte('"il dit ""bonjour""";x', ';'), [['il dit "bonjour"', 'x']]);
});

test('les en-têtes vides ou en double sont nommés et distingués', () => {
    assert.deepEqual(nommerEnTetes(['siren', '', 'nom', 'nom']), ['siren', 'Colonne 2', 'nom', 'nom (2)']);
});

test('les lignes vides sont ignorées et les cellules manquantes complétées', () => {
    const tableau = tableauDepuisLignes([['siren', 'nom'], ['', ''], ['123', 'Alpha'], ['456']]);
    assert.deepEqual(tableau.colonnes, ['siren', 'nom']);
    assert.deepEqual(tableau.lignes, [
        ['123', 'Alpha'],
        ['456', '']
    ]);
});

test('le marqueur d’octets initial d’Excel ne colle pas au premier en-tête', () => {
    assert.deepEqual(lireTexteDelimite('﻿siren;nom\n1;Alpha').colonnes, ['siren', 'nom']);
});
