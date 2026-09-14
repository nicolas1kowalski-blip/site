/**
 * Tests de « 🔎 Parcours » (V13) : depuis quelle fiche, vers quel parcours.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { libelleDuParcours, lienDuParcours } from '../web/src/app/coeur/lien-parcours.ts';

test('une table du catalogue mène au parcours autour de cette table', () => {
    assert.equal(lienDuParcours({ type: 'table', id: '12', titre: 'clients.csv' }), '/lineage?table=clients.csv');
    assert.equal(lienDuParcours({ type: 'view', id: '13', titre: 'ventes_2026' }), '/lineage?table=ventes_2026');
});

test('une colonne mène à ce qui serait touché si elle changeait', () => {
    assert.equal(
        lienDuParcours({ type: 'column', id: '12.ville', titre: 'ville', motsCles: ['clients.csv'] }),
        '/lineage?table=clients.csv&colonne=ville'
    );
});

test('sans le nom de sa table, une colonne n’a pas de parcours à montrer', () => {
    assert.equal(lienDuParcours({ type: 'column', id: '12.ville', titre: 'ville' }), '');
});

test('un objet métier mène au parcours de l’objet, une information à celui de l’information', () => {
    assert.equal(lienDuParcours({ type: 'bo', id: 'bo_client', titre: 'Client' }), '/lineage?objet=bo_client');
    assert.equal(
        lienDuParcours({ type: 'attr', id: 'bo_client.be_client_ca', titre: 'Chiffre d’affaires' }),
        '/lineage?objet=bo_client&information=be_client_ca'
    );
});

test('une application mène à la carte des flux, centrée sur elle', () => {
    assert.equal(lienDuParcours({ type: 'asset', id: 'as_crm', titre: 'CRM Vega' }), '/lineage?application=as_crm');
});

test('ce qui n’est pas une étape du voyage de la donnée n’a pas de bouton', () => {
    assert.equal(lienDuParcours({ type: 'rule', id: 'rg_1', titre: 'SIRET attendu' }), '');
    assert.equal(lienDuParcours({ type: 'valuelist', id: 'vl_1', titre: 'Statuts' }), '');
});

test('les noms qui contiennent un espace ou un accent restent lisibles une fois dans l’adresse', () => {
    assert.equal(lienDuParcours({ type: 'table', id: '1', titre: 'relevés conso.csv' }), '/lineage?table=relev%C3%A9s%20conso.csv');
});

test('le bouton annonce ce que l’on va voir', () => {
    assert.match(libelleDuParcours('bo'), /objet/);
    assert.match(libelleDuParcours('attr'), /donnée/);
    assert.match(libelleDuParcours('asset'), /application/);
});
