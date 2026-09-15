/**
 * Tests des colonnes du dictionnaire : définition sous ses deux noms de champ, héritage depuis l'objet
 * métier, exemples pris dans la source, et avancement d'une fiche.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    EXEMPLES_RETENUS,
    colonnesDecrites,
    definitionDe,
    exemplesDepuisLesValeurs,
    exemplesRemplacables,
    heriteDeLObjetMetier,
    phraseDeLHeritage
} from '../web/src/app/pages/dictionnaire/colonnes-dictionnaire.ts';

const objetClient = {
    id: 'bo_client',
    name: 'Client',
    elements: [
        {
            id: 'be_ville',
            name: 'Ville',
            definition: 'La commune de résidence du client.',
            sensitivity: 'interne',
            mappings: [{ table: 'clients.csv', col: 'ville' }]
        },
        { id: 'be_email', name: 'Courriel', definition: '', sensitivity: 'personnel', mappings: [{ table: 'clients.csv', col: 'email' }] }
    ]
};

test('la définition d’une colonne se lit sous son nom d’aujourd’hui comme sous l’ancien', () => {
    assert.equal(definitionDe({ definition: 'La commune' }), 'La commune');
    assert.equal(definitionDe({ description: 'La commune' }), 'La commune', 'les fiches anciennes restent lisibles');
    assert.equal(definitionDe({ definition: 'neuve', description: 'ancienne' }), 'neuve', 'le nom d’aujourd’hui l’emporte');
    assert.equal(definitionDe({}), '');
    assert.equal(definitionDe(undefined), '');
});

test('une colonne sans définition hérite de ce que l’objet métier en dit, et l’on sait d’où', () => {
    const herite = heriteDeLObjetMetier([objetClient], 'clients.csv', 'ville', 'definition');
    assert.deepEqual(herite, { valeur: 'La commune de résidence du client.', objet: 'Client', information: 'Ville' });
    assert.equal(phraseDeLHeritage(herite), "défini sur l'objet Client — Ville");
    assert.equal(
        heriteDeLObjetMetier([objetClient], 'clients.csv', 'email', 'definition'),
        null,
        'une information sans définition n’a rien à transmettre'
    );
    assert.deepEqual(heriteDeLObjetMetier([objetClient], 'clients.csv', 'email', 'sensitivity'), {
        valeur: 'personnel',
        objet: 'Client',
        information: 'Courriel'
    });
    assert.equal(heriteDeLObjetMetier([objetClient], 'factures.csv', 'ville', 'definition'), null, 'une autre table n’hérite pas');
    assert.equal(heriteDeLObjetMetier([], 'clients.csv', 'ville', 'definition'), null);
});

test('les exemples pris dans la source tiennent en quelques valeurs', () => {
    assert.equal(EXEMPLES_RETENUS, 5);
    assert.equal(exemplesDepuisLesValeurs([{ valeur: 'Paris' }, { valeur: 'Lyon' }]), 'Paris ; Lyon');
    assert.equal(exemplesDepuisLesValeurs(Array.from({ length: 9 }, (rien, rang) => ({ valeur: 'V' + rang }))), 'V0 ; V1 ; V2 ; V3 ; V4');
    assert.equal(exemplesDepuisLesValeurs([{ valeur: '  ' }, { valeur: 'Paris' }]), 'Paris', 'les valeurs vides ne comptent pas');
    assert.equal(exemplesDepuisLesValeurs([]), '');
});

test('on ne remplace jamais des exemples saisis à la main', () => {
    assert.ok(exemplesRemplacables({}));
    assert.ok(exemplesRemplacables(undefined));
    assert.ok(exemplesRemplacables({ examples: 'Paris ; Lyon', examplesAuto: true }), 'un échantillon se rafraîchit');
    assert.ok(!exemplesRemplacables({ examples: 'Paris ; Lyon' }), 'une saisie manuelle est protégée');
});

test('l’avancement d’une fiche se compte en colonnes définies', () => {
    const colonnes = { ville: { definition: 'La commune' }, email: { description: 'Le courriel' }, code: {} };
    assert.equal(colonnesDecrites(['ville', 'email', 'code'], colonnes), 2);
    assert.equal(colonnesDecrites([], colonnes), 0);
    assert.equal(colonnesDecrites(['inconnue'], colonnes), 0);
});
