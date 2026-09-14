/**
 * Tests des origines entre objets métier (V12.6) : déclarer qu'une information vient d'une autre, refuser
 * les boucles, dire d'où elle vient et qui la réutilise.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    dependantsDe,
    libelleOrigine,
    origineConnue,
    originesValides,
    provenanceDe,
    refusDeLOrigine,
    remonteJusqua
} from '../web/src/app/pages/objets-metier/origines-information.ts';

/** Personne › Adresse → Contrat › Adresse de risque (copie) ; Contrat › Prime a sa propre colonne. */
const objets = () => [
    {
        id: 'personne',
        name: 'Personne',
        elements: [{ id: 'adresse', name: 'Adresse', mappings: [{ table: 'personnes.csv', col: 'adr' }], usedBy: [] }]
    },
    {
        id: 'contrat',
        name: 'Contrat',
        elements: [
            {
                id: 'adresse_risque',
                name: 'Adresse de risque',
                mappings: [],
                usedBy: [],
                origins: [{ boId: 'personne', elId: 'adresse', kind: 'copie', rule: '' }]
            },
            { id: 'prime', name: 'Prime', mappings: [{ table: 'contrats.csv', col: 'prime' }], usedBy: [] }
        ]
    }
];

test('une origine dont l’objet ou l’information a disparu n’est plus comptée', () => {
    const liste = objets();
    assert.equal(originesValides(liste, liste[1].elements[0]).length, 1);
    liste[0].elements = [];
    assert.equal(originesValides(liste, liste[1].elements[0]).length, 0);
});

test('le nom d’une origine se lit « Objet › Information »', () => {
    const liste = objets();
    assert.equal(libelleOrigine(liste, { boId: 'personne', elId: 'adresse', kind: 'copie' }), 'Personne › Adresse');
    assert.equal(libelleOrigine(liste, { boId: 'x', elId: 'y', kind: 'copie' }), '(information supprimée)');
});

test('une information héritée compte comme alimentée, même sans colonne de fichier', () => {
    const liste = objets();
    const heritee = liste[1].elements[0];
    assert.equal(heritee.mappings.length, 0);
    assert.equal(origineConnue(liste, heritee), true);
    assert.equal(origineConnue(liste, { id: 'z', name: 'Zut', mappings: [], usedBy: [] }), false);
});

test('la provenance se lit en clair : la colonne, et ce dont l’information hérite', () => {
    const liste = objets();
    assert.equal(provenanceDe(liste, liste[1].elements[0]), 'copié de Personne › Adresse');
    assert.equal(provenanceDe(liste, liste[1].elements[1]), 'contrats.csv.prime');
});

test('une boucle est détectée, même par un long détour', () => {
    const liste = objets();
    // Contrat › Adresse de risque vient de Personne › Adresse : Personne › Adresse remonte donc jusqu'à elle.
    assert.equal(remonteJusqua(liste, 'contrat', 'adresse_risque', 'personne', 'adresse'), true);
    assert.equal(remonteJusqua(liste, 'personne', 'adresse', 'contrat', 'adresse_risque'), false);
});

test('les origines impossibles sont refusées avant d’être écrites', () => {
    const liste = objets();
    const adresse = liste[0].elements[0];
    const refus = origine => refusDeLOrigine(liste, adresse, 'personne', origine);
    assert.match(refus({ boId: '', elId: '', kind: 'copie' }), /Choisissez l'objet/);
    assert.match(refus({ boId: 'personne', elId: 'adresse', kind: 'copie' }), /d’elle-même/);
    assert.match(refus({ boId: 'contrat', elId: 'adresse_risque', kind: 'copie' }), /Boucle refusée/);
    assert.equal(refus({ boId: 'contrat', elId: 'prime', kind: 'agrege' }), '', 'celle-ci est acceptable');
    const dejaLa = refusDeLOrigine(liste, liste[1].elements[0], 'contrat', { boId: 'personne', elId: 'adresse', kind: 'copie' });
    assert.match(dejaLa, /déjà déclarée/);
});

test('« Réutilisé par » liste ce qui reprend l’information ailleurs', () => {
    const liste = objets();
    const dependants = dependantsDe(liste, 'personne', 'adresse');
    assert.equal(dependants.length, 1);
    assert.equal(dependants[0].objet.name, 'Contrat');
    assert.equal(dependants[0].information.name, 'Adresse de risque');
    assert.deepEqual(dependantsDe(liste, 'contrat', 'prime'), []);
});
