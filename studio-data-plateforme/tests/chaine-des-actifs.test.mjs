/**
 * Tests de la chaîne des actifs : qui possède une source, quels objets métier une application alimente,
 * la chaîne aval, l'usage d'un actif, les colonnes critiques d'un processus et les familles d'impact.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ajouterUneColonneCritique,
    blocsDImpact,
    chaineAval,
    etatDeLaSource,
    libelleDeLaColonne,
    objetsAlimentes,
    phraseDeLUsage,
    proprietaireDeLaSource,
    usageDunActif
} from '../web/src/app/pages/actifs/chaine-des-actifs.ts';

const actif = (proprietes = {}) => ({
    id: 'as_1',
    name: 'CRM',
    kind: 'app',
    sources: [],
    tables: [],
    columns: [],
    boIds: [],
    appIds: [],
    producedBy: [],
    deliveredTo: [],
    ...proprietes
});
const crm = actif({ id: 'as_crm', name: 'CRM', sources: ['clients.csv'] });
const facturation = actif({ id: 'as_fact', name: 'Facturation', sources: ['factures.csv'] });
const pilotage = actif({ id: 'as_pilot', name: 'Pilotage commercial', kind: 'process', appIds: ['as_crm'], boIds: ['bo_client'] });
const objetClient = { id: 'bo_client', name: 'Client', sources: [{ table: 'clients.csv', role: 'maitre' }] };

test('une source n’appartient qu’à une application, et l’écran dit laquelle', () => {
    const actifs = [crm, facturation];
    assert.equal(proprietaireDeLaSource(actifs, 'clients.csv').name, 'CRM');
    assert.equal(proprietaireDeLaSource(actifs, 'communes.csv'), null);
    assert.deepEqual(etatDeLaSource(actifs, crm, 'clients.csv'), {
        rattachee: true,
        priseParUnAutre: false,
        proprietaire: 'CRM'
    });
    assert.deepEqual(etatDeLaSource(actifs, facturation, 'clients.csv'), {
        rattachee: false,
        priseParUnAutre: true,
        proprietaire: 'CRM'
    });
    assert.deepEqual(etatDeLaSource(actifs, crm, 'communes.csv'), {
        rattachee: false,
        priseParUnAutre: false,
        proprietaire: ''
    });
});

test('les objets métier alimentés se déduisent des sources, ils ne se saisissent pas', () => {
    assert.deepEqual(
        objetsAlimentes(crm, [objetClient]).map(objet => objet.name),
        ['Client']
    );
    assert.deepEqual(objetsAlimentes(facturation, [objetClient]), []);
    assert.deepEqual(objetsAlimentes(actif(), [objetClient]), [], 'une application sans source n’alimente rien');
});

test('la chaîne aval va des sources aux objets, puis à ceux qui s’en servent', () => {
    assert.deepEqual(chaineAval(crm, [objetClient], [crm, pilotage]), {
        sources: ['clients.csv'],
        objets: ['Client'],
        consommateurs: ['Pilotage commercial']
    });
    assert.deepEqual(chaineAval(facturation, [objetClient], [crm, facturation, pilotage]), {
        sources: ['factures.csv'],
        objets: [],
        consommateurs: []
    });
});

test('l’usage d’un actif se compte, et se dit — ou dit qu’il n’est relié à rien', () => {
    assert.deepEqual(usageDunActif(crm, [objetClient], [crm, pilotage]), { sources: 1, objets: 1, processus: 1 });
    assert.equal(
        phraseDeLUsage(usageDunActif(crm, [objetClient], [crm, pilotage])),
        '1 source(s) · 1 objet(s) métier · 1 processus outillé(s)'
    );
    const isole = usageDunActif(actif({ id: 'as_seul' }), [objetClient], []);
    assert.deepEqual(isole, { sources: 0, objets: 0, processus: 0 });
    assert.match(phraseDeLUsage(isole), /pas encore relié/);
});

test('une colonne critique ne se déclare qu’une fois', () => {
    const colonnes = [];
    assert.ok(ajouterUneColonneCritique(colonnes, 'clients.csv', 'email'));
    assert.equal(libelleDeLaColonne(colonnes[0]), 'clients.csv.email');
    assert.ok(!ajouterUneColonneCritique(colonnes, 'clients.csv', 'email'), 'deux fois la même ne sert à rien');
    assert.ok(!ajouterUneColonneCritique(colonnes, '', 'email'), 'sans table, rien à déclarer');
    assert.ok(!ajouterUneColonneCritique(colonnes, 'clients.csv', ''), 'sans colonne non plus');
    assert.ok(ajouterUneColonneCritique(colonnes, 'clients.csv', 'ville'));
    assert.equal(colonnes.length, 2);
});

test('l’impact se lit en trois familles, chacune disant par où elle passe', () => {
    const blocs = blocsDImpact({
        direct: [{ id: 'as_pilot', name: 'Pilotage', criticality: 'Haute', owner: 'Alice' }],
        viaLineage: [],
        viaRelations: [],
        downstream: ['synthese.csv'],
        related: []
    });
    assert.equal(blocs.length, 3);
    assert.match(blocs[0].titre, /Impact direct/);
    assert.match(blocs[1].titre, /synthese\.csv/);
    assert.match(blocs[2].titre, /tables jointes : —/, 'une famille vide le dit plutôt que de mentir');
});
