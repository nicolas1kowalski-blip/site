/**
 * Tests des gestes de saisie de la V11 : dupliquer une fiche, poser un geste sur plusieurs informations,
 * rattacher une colonne en la faisant glisser, et l'assistant de création en trois étapes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUFFIXE_COPIE, copieDUnActif, copieDUnObjet, copieDUnTerme } from '../web/src/app/coeur/duplication.ts';
import { objetApresGeste, refusDuGeste, selonLeChoix } from '../web/src/app/pages/objets-metier/actions-groupees.ts';
import {
    colonneLachee,
    colonneTransportee,
    colonnesDeLObjet,
    informationAvecColonne
} from '../web/src/app/pages/objets-metier/colonnes-a-rattacher.ts';
import {
    informationsDeLaSaisie,
    objetDeLaSaisie,
    recapitulatifDeLaSaisie,
    refusDeLEtape,
    saisieVide
} from '../web/src/app/pages/objets-metier/assistant-objet.ts';

/** Une fabrique d'identifiants prévisible : « bo1 », « be_2 »… pour que les essais soient lisibles. */
function fabriqueDEssai() {
    let rang = 0;
    return prefixe => prefixe + ++rang;
}

const objet = {
    id: 'bo_1',
    name: 'Client',
    definition: 'La personne qui achète.',
    domain: 'Ventes',
    globalOwner: 'Direction commerciale',
    contributors: [],
    status: 'Validé',
    history: [{ at: '2026-01-01', from: 'Brouillon', to: 'Validé', by: 'lea', comment: '' }],
    elements: [
        { id: 'be_a', name: 'Ville', definition: 'La ville de résidence.', mappings: [{ table: 'clients.csv', col: 'ville' }] },
        { id: 'be_b', name: 'Segment', definition: '', mappings: [], origins: [] }
    ],
    sources: [{ table: 'clients.csv', role: 'maitre' }],
    producedBy: [],
    consumedBy: [],
    references: []
};

// ---- dupliquer ----

test('la copie d’un objet repart en brouillon, sans historique et avec des informations neuves', () => {
    const copie = copieDUnObjet(objet, fabriqueDEssai());
    assert.equal(copie.name, 'Client' + SUFFIXE_COPIE);
    assert.equal(copie.status, 'Brouillon');
    assert.equal(copie.history, undefined);
    assert.notEqual(copie.id, objet.id);
    assert.deepEqual(
        copie.elements.map(information => information.id),
        ['be_2', 'be_3']
    );
    // L'original n'a pas bougé : la duplication ne touche jamais à la fiche de départ.
    assert.equal(objet.status, 'Validé');
    assert.equal(objet.elements[0].id, 'be_a');
});

test('la copie d’un terme ne reprend pas ses rattachements', () => {
    const copie = copieDUnTerme({ id: 'gl_ancien', term: 'Encours', definition: 'Le montant dû.' }, fabriqueDEssai());
    assert.equal(copie.term, 'Encours' + SUFFIXE_COPIE);
    assert.equal(copie.definition, 'Le montant dû.');
    assert.notEqual(copie.id, 'gl_ancien');
});

test('la copie d’une application ne revendique pas les sources de l’original', () => {
    const actif = { id: 'as_ancien', name: 'CRM', kind: 'app', sources: ['clients.csv'], tables: [], columns: [] };
    const copie = copieDUnActif(actif, fabriqueDEssai());
    assert.deepEqual(copie.sources, []);
    assert.equal(copie.name, 'CRM' + SUFFIXE_COPIE);
    assert.deepEqual(actif.sources, ['clients.csv'], 'l’original garde ses sources');
});

// ---- actions groupées ----

test('les choix rapides désignent ce qui manque le plus souvent', () => {
    assert.deepEqual(selonLeChoix(objet.elements, 'tout'), ['be_a', 'be_b']);
    assert.deepEqual(selonLeChoix(objet.elements, 'aucun'), []);
    assert.deepEqual(selonLeChoix(objet.elements, 'sansDefinition'), ['be_b']);
    assert.deepEqual(selonLeChoix(objet.elements, 'sansOrigine'), ['be_b']);
});

test('un geste groupé ne compte que ce qu’il a vraiment changé', () => {
    const premier = objetApresGeste(objet, ['be_a', 'be_b'], 'usage', 'as_crm');
    assert.equal(premier.modifiees, 2);
    const second = objetApresGeste(premier.objet, ['be_a', 'be_b'], 'usage', 'as_crm');
    assert.equal(second.modifiees, 0, 'l’usage était déjà cité : rien à refaire');
    assert.deepEqual(second.objet.elements[0].usedBy, ['as_crm']);
});

test('la confidentialité, le mot du glossaire, le responsable et la définition se posent d’un coup', () => {
    assert.equal(objetApresGeste(objet, ['be_b'], 'confidentialite', 'Interne').objet.elements[1].sensitivity, 'Interne');
    assert.equal(objetApresGeste(objet, ['be_b'], 'terme', 'Segment client').objet.elements[1].term, 'Segment client');
    assert.equal(objetApresGeste(objet, ['be_b'], 'responsable', 'Marketing').objet.elements[1].owner, 'Marketing');
    assert.equal(objetApresGeste(objet, ['be_b'], 'definition', 'Le segment.').objet.elements[1].definition, 'Le segment.');
});

test('le geste est refusé sans information cochée, ou sans valeur', () => {
    assert.match(refusDuGeste([], 'confidentialite', 'Interne'), /Cochez/);
    assert.match(refusDuGeste(['be_a'], 'confidentialite', ' '), /valeur/);
    assert.equal(refusDuGeste(['be_a'], 'definition', ''), '', 'une définition peut être vidée volontairement');
});

// ---- glisser une colonne ----

const sources = [{ id: 1, name: 'clients.csv', headers: ['ville', 'segment'] }];

test('les colonnes offertes disent celles déjà rattachées', () => {
    assert.deepEqual(colonnesDeLObjet(objet, sources), [
        { table: 'clients.csv', colonne: 'ville', dejaRattachee: true },
        { table: 'clients.csv', colonne: 'segment', dejaRattachee: false }
    ]);
});

test('une source déclarée mais absente de l’espace n’offre rien', () => {
    assert.deepEqual(colonnesDeLObjet({ ...objet, sources: [{ table: 'disparu.csv', role: 'maitre' }] }, sources), []);
});

test('rattacher deux fois la même colonne ne fait rien', () => {
    const premier = informationAvecColonne(objet.elements[1], 'clients.csv', 'segment');
    assert.equal(premier.ajoutee, true);
    assert.deepEqual(premier.information.mappings, [{ table: 'clients.csv', col: 'segment' }]);
    const second = informationAvecColonne(premier.information, 'clients.csv', 'segment');
    assert.equal(second.ajoutee, false);
});

test('ce qui est lâché sur une information est relu, ou refusé', () => {
    assert.deepEqual(colonneLachee(colonneTransportee('clients.csv', 'ville')), { table: 'clients.csv', colonne: 'ville' });
    assert.equal(colonneLachee('un texte quelconque'), null);
    assert.equal(colonneLachee('{"table":"clients.csv"}'), null);
});

// ---- assistant en trois étapes ----

test('l’assistant refuse d’avancer sans nom, puis sans information', () => {
    const saisie = saisieVide();
    assert.match(refusDeLEtape(saisie, 0), /nom/);
    saisie.nom = 'Facture';
    assert.equal(refusDeLEtape(saisie, 0), '');
    assert.match(refusDeLEtape(saisie, 1), /information/);
});

test('les informations viennent des colonnes cochées, ou des lignes écrites à la main', () => {
    const depuisFichier = { ...saisieVide(), nom: 'Client', table: 'clients.csv', colonnes: ['ville'] };
    assert.deepEqual(informationsDeLaSaisie(depuisFichier), [{ nom: 'ville', table: 'clients.csv', colonne: 'ville' }]);
    const aLaMain = { ...saisieVide(), nom: 'Client', libres: 'Numéro client\n\n  Raison sociale  ' };
    assert.deepEqual(
        informationsDeLaSaisie(aLaMain).map(information => information.nom),
        ['Numéro client', 'Raison sociale']
    );
});

test('l’objet monté par l’assistant rattache la source maître et les colonnes retenues', () => {
    const saisie = {
        ...saisieVide(),
        nom: ' Facture ',
        domaine: 'Finance',
        definition: 'Ce que le client doit.',
        table: 'factures.csv',
        colonnes: ['numero', 'montant'],
        responsable: 'Comptabilité',
        statut: 'À valider'
    };
    const monte = objetDeLaSaisie(saisie, fabriqueDEssai());
    assert.equal(monte.name, 'Facture');
    assert.equal(monte.globalOwner, 'Comptabilité');
    assert.equal(monte.status, 'À valider');
    assert.deepEqual(monte.sources, [{ table: 'factures.csv', role: 'maitre' }]);
    assert.deepEqual(monte.elements[1].mappings, [{ table: 'factures.csv', col: 'montant' }]);
    assert.match(recapitulatifDeLaSaisie(saisie), /Facture · Finance — 2 information\(s\) depuis factures\.csv/);
});
