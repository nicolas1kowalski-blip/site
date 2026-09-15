/**
 * Tests de l'audit global d'un objet métier (V13) : la check-list, le score, le périmètre et ses règles.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    aUneMaitriseContextuelle,
    controlerLObjet,
    couleurDuScore,
    perimetreDeLObjet,
    phraseDuScore,
    reglesDuPerimetre,
    scoreDeGouvernance,
    tableMaitreDe,
    variantesExactementUne,
    volumetrieDuPerimetre
} from '../web/src/app/pages/objets-metier/audit-objet.ts';

const information = nom => ({ id: 'be_' + nom, name: nom, definition: '', mappings: [], usedBy: [] });
const objet = (reste = {}) => ({
    id: 'bo_1',
    name: 'Client',
    definition: 'Personne ayant acheté',
    globalOwner: 'Alice',
    contributors: [],
    elements: [information('nom')],
    sources: [{ table: 'clients.csv', role: 'maitre' }],
    producedBy: [],
    consumedBy: [],
    references: [],
    ...reste
});
const toutVaBien = { statutDuDictionnaire: 'Validé', dansUnPerimetre: true, utiliseParUnActif: true };

test('la table maître est la source marquée maître, sinon la première rattachée', () => {
    assert.equal(tableMaitreDe(objet()), 'clients.csv');
    assert.equal(tableMaitreDe(objet({ sources: [{ table: 'crm.csv', role: 'contributeur' }] })), 'crm.csv');
    assert.equal(tableMaitreDe(objet({ sources: [] })), '');
});

test('un objet complet passe les huit contrôles de la V13', () => {
    const controles = controlerLObjet(objet(), toutVaBien);
    assert.equal(controles.length, 8);
    assert.ok(controles.every(controle => controle.ok));
    assert.equal(scoreDeGouvernance(controles), 100);
});

test('chaque manque se voit, et fait baisser le score', () => {
    const controles = controlerLObjet(objet({ globalOwner: '  ', definition: '' }), toutVaBien);
    const manques = controles.filter(controle => !controle.ok).map(controle => controle.libelle);
    assert.deepEqual(manques, ['Propriétaire global nommé', 'Définition renseignée']);
    assert.equal(scoreDeGouvernance(controles), 75);
});

test('deux sources maîtres sont un conflit — sauf si la maîtrise est contextuelle', () => {
    const deuxMaitres = objet({
        sources: [
            { table: 'clients.csv', role: 'maitre' },
            { table: 'crm.csv', role: 'maitre' }
        ]
    });
    const enConflit = controlerLObjet(deuxMaitres, toutVaBien);
    assert.equal(enConflit.find(controle => controle.libelle === 'Pas de conflit de maîtres').ok, false);
    assert.equal(enConflit.find(controle => controle.libelle.startsWith('Source maître désignée')).ok, false);
    // La maîtrise contextuelle dit précisément qui maîtrise quoi : les deux contrôles sont alors satisfaits.
    deuxMaitres.contextRules = { elementId: 'be_nom', rules: [{ id: 'cr_1', value: 'A', masterTable: 'crm.csv', owner: '' }] };
    assert.equal(aUneMaitriseContextuelle(deuxMaitres), true);
    const contextuelle = controlerLObjet(deuxMaitres, toutVaBien);
    assert.equal(contextuelle.find(controle => controle.libelle === 'Pas de conflit de maîtres').ok, true);
    assert.equal(contextuelle.find(controle => controle.libelle.startsWith('Source maître désignée')).ok, true);
});

test('une fiche de dictionnaire non validée est un manque, pas un détail', () => {
    const controles = controlerLObjet(objet(), { ...toutVaBien, statutDuDictionnaire: 'Brouillon' });
    assert.equal(controles.find(controle => controle.libelle.startsWith('Fiche dictionnaire')).ok, false);
});

test('le score se colore comme dans la V13', () => {
    assert.equal(couleurDuScore(100), 'text-emerald-600');
    assert.equal(couleurDuScore(80), 'text-emerald-600');
    assert.equal(couleurDuScore(79), 'text-amber-600');
    assert.equal(couleurDuScore(49), 'text-red-600');
    assert.equal(scoreDeGouvernance([]), 0, 'sans contrôle, pas de score inventé');
});

test('le périmètre couvre la table maître, les autres sources et les tables des variantes', () => {
    const avecVariantes = objet({
        sources: [
            { table: 'clients.csv', role: 'maitre' },
            { table: 'crm.csv', role: 'contributeur' }
        ],
        structure: [{ id: 'st_1', name: 'Adresses', table: 'adresses.csv' }]
    });
    assert.deepEqual(perimetreDeLObjet(avecVariantes), ['clients.csv', 'crm.csv', 'adresses.csv']);
    assert.deepEqual(perimetreDeLObjet(objet({ sources: [] })), [], 'sans source, pas de périmètre');
});

test('la volumétrie additionne les tables connues et ignore les autres', () => {
    const mesures = [
        { nom: 'clients.csv', lignes: 120 },
        { nom: 'adresses.csv', lignes: 340 },
        { nom: 'autre.csv', lignes: 9 }
    ];
    const volumetrie = volumetrieDuPerimetre(['clients.csv', 'adresses.csv', 'disparue.csv'], mesures);
    assert.deepEqual(
        volumetrie.tables.map(table => table.nom),
        ['clients.csv', 'adresses.csv']
    );
    assert.equal(volumetrie.total, 460);
});

const regle = (identifiant, cible, active = true) => ({
    id: identifiant,
    nom: 'Règle ' + identifiant,
    genre: 'liste',
    cible,
    active,
    dernierTaux: null
});

test('les règles retenues sont celles de l’objet ou de son périmètre, et seulement les actives', () => {
    const regles = [regle('r1', 'bo_1'), regle('r2', 'clients.csv'), regle('r3', 'ailleurs.csv'), regle('r4', 'bo_1', false)];
    assert.deepEqual(
        reglesDuPerimetre(regles, 'bo_1', ['clients.csv']).map(une => une.id),
        ['r1', 'r2'],
        'on ne juge pas un objet sur un contrôle que personne ne fait tourner'
    );
});

test('seules les variantes « exactement une » valent d’être vérifiées', () => {
    const avecVariantes = objet({
        structure: [
            { id: 'st_1', name: 'Adresse principale', table: 'adresses.csv', cardinality: '1–1' },
            { id: 'st_2', name: 'Livraisons', table: 'adresses.csv', cardinality: '1–N' }
        ]
    });
    assert.deepEqual(
        variantesExactementUne(avecVariantes).map(variante => variante.name),
        ['Adresse principale']
    );
});

test('l’audit se présente sous le nom de l’objet, avec le compte des contrôles', () => {
    assert.equal(phraseDuScore(objet(), controlerLObjet(objet(), toutVaBien)), 'Score de gouvernance de « Client » (8/8)');
});
