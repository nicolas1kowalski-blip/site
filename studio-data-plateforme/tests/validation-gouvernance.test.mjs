/**
 * Tests du cycle de validation (V13) : le statut d'une fiche du dictionnaire et son historique, et le
 * regroupement des propositions avec le droit d'en décider.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    AUTEUR_INCONNU,
    PASSAGES_RETENUS,
    STATUTS_FICHE,
    avancementDuDictionnaire,
    changerLeStatut,
    depuisQuand,
    passagesRecentsDAbord,
    sourcesAValider,
    statutDe
} from '../web/src/app/pages/dictionnaire/validation-fiche.ts';
import {
    cleDuGroupe,
    decidablesDuGroupe,
    etatDuToutValider,
    libelleDuGroupe,
    peutDecider,
    pouvoirDeDecider,
    regrouperLesPropositions
} from '../web/src/app/pages/propositions/groupes-propositions.ts';
import { correspondALIdentite } from '../web/src/app/pages/personnes/roles-personnes.ts';

// ---- le statut d'une fiche ----

test('une fiche dont personne n’a rien dit est au brouillon', () => {
    assert.equal(statutDe({}), 'Brouillon');
    assert.equal(statutDe({ status: 'Validé' }), 'Validé');
    assert.deepEqual(STATUTS_FICHE, ['Brouillon', 'Proposé', 'Validé', 'Obsolète']);
});

test('changer de statut date, attribue et historise le passage', () => {
    const fiche = {};
    const quand = new Date('2026-03-04T10:00:00Z');
    assert.equal(changerLeStatut(fiche, 'Proposé', 'Alice Martin', 'relue avec les Ventes', quand), true);
    assert.equal(fiche.status, 'Proposé');
    assert.equal(fiche.statusAt, quand.toISOString());
    assert.equal(fiche.statusBy, 'Alice Martin');
    assert.deepEqual(fiche.history, [
        { at: quand.toISOString(), from: 'Brouillon', to: 'Proposé', by: 'Alice Martin', comment: 'relue avec les Ventes' }
    ]);
});

test('le même statut réécrit ne produit rien', () => {
    const fiche = { status: 'Validé' };
    assert.equal(changerLeStatut(fiche, 'Validé', 'Alice'), false);
    assert.equal(fiche.history, undefined, 'aucun historique fabriqué pour du vent');
});

test('un statut inconnu est refusé plutôt qu’enregistré', () => {
    const fiche = {};
    assert.equal(changerLeStatut(fiche, 'Peut-être', 'Alice'), false);
    assert.equal(statutDe(fiche), 'Brouillon');
});

test('sans personne nommée, on le dit plutôt que de laisser un blanc', () => {
    const fiche = {};
    changerLeStatut(fiche, 'Proposé', '   ');
    assert.equal(fiche.statusBy, AUTEUR_INCONNU);
});

test('l’historique ne grossit pas indéfiniment : les plus anciens passages s’effacent', () => {
    const fiche = {};
    for (let tour = 0; tour < PASSAGES_RETENUS + 20; tour++)
        changerLeStatut(fiche, STATUTS_FICHE[tour % STATUTS_FICHE.length], 'Alice', '', new Date(2026, 0, 1, 0, tour));
    assert.equal(fiche.history.length, PASSAGES_RETENUS);
    assert.equal(passagesRecentsDAbord(fiche)[0].at, fiche.history[PASSAGES_RETENUS - 1].at, 'le plus récent d’abord');
});

test('le badge dit depuis quand et par qui', () => {
    assert.equal(
        depuisQuand({}, date => date),
        'Statut jamais modifié.'
    );
    const fiche = { statusAt: '2026-03-04T10:00:00Z', statusBy: 'Alice' };
    assert.equal(
        depuisQuand(fiche, () => '4 mars 2026'),
        'Depuis le 4 mars 2026 par Alice.'
    );
});

test('l’avancement ne compte que les fiches des sources qui existent', () => {
    const fiches = {
        'clients.csv': { status: 'Validé' },
        'commandes.csv': { status: 'Proposé' },
        'ancienne.csv': { status: 'Validé' }
    };
    const avancement = avancementDuDictionnaire(fiches, ['clients.csv', 'commandes.csv', 'produits.csv']);
    assert.deepEqual(avancement, { total: 3, validees: 1, aValider: 1, obsoletes: 0, pourcentage: 33 });
    assert.deepEqual(sourcesAValider(fiches, ['clients.csv', 'commandes.csv', 'produits.csv']), ['commandes.csv']);
});

test('sans aucune source, l’avancement ne divise pas par zéro', () => {
    assert.deepEqual(avancementDuDictionnaire({}, []), { total: 0, validees: 0, aValider: 0, obsoletes: 0, pourcentage: 0 });
});

// ---- le regroupement des propositions ----

const proposition = (identifiant, genre, cible, domaine = 'Ventes') => ({
    id: identifiant,
    kind: genre,
    field: 'definition',
    target: cible,
    label: identifiant,
    before: '',
    after: 'x',
    domain: domaine,
    status: 'pending',
    by: 'bob',
    byName: 'Bob',
    at: '2026-03-04T10:00:00Z'
});

test('une proposition est rattachée à ce qu’elle vise, et une information à son objet', () => {
    assert.equal(cleDuGroupe(proposition('p1', 'dictcol', { tn: 'clients.csv', col: 'ville' })), 'table:clients.csv');
    assert.equal(cleDuGroupe(proposition('p2', 'attr', { boId: 'bo_1', elId: 'be_1' })), 'objet:bo_1');
    assert.equal(cleDuGroupe(proposition('p3', 'bo', { boId: 'bo_1' })), 'objet:bo_1', 'la fiche et ses informations ne font qu’un');
    assert.equal(cleDuGroupe(proposition('p4', 'term', { termId: 'gl_1' })), 'terme:gl_1');
    assert.equal(cleDuGroupe(proposition('p5', 'asset', { assetId: 'as_1' })), 'application:as_1');
    assert.equal(cleDuGroupe(proposition('p6', 'bo', {})), 'domaine:Ventes', 'sans cible reconnue, le domaine');
});

test('un groupe se nomme par le nom réel de sa cible, jamais par un identifiant', () => {
    assert.equal(libelleDuGroupe('objet:bo_1', { bo_1: 'Client' }), '🏛️ Client');
    assert.equal(libelleDuGroupe('table:clients.csv', {}), '▦ clients.csv');
    assert.equal(libelleDuGroupe('terme:gl_1', { gl_1: 'Client' }), '📖 Client');
    assert.equal(libelleDuGroupe('domaine:', {}), '◫ Sans domaine');
});

test('les propositions se regroupent par cible, dans leur ordre d’arrivée', () => {
    const groupes = regrouperLesPropositions(
        [
            proposition('p1', 'attr', { boId: 'bo_1', elId: 'be_1' }),
            proposition('p2', 'dictcol', { tn: 'clients.csv' }),
            proposition('p3', 'bo', { boId: 'bo_1' })
        ],
        { bo_1: 'Client' }
    );
    assert.deepEqual(
        groupes.map(groupe => [groupe.libelle, groupe.propositions.length]),
        [
            ['🏛️ Client', 2],
            ['▦ clients.csv', 1]
        ]
    );
});

// ---- qui peut décider ----

const personnes = [
    { id: 'pe_1', name: 'Alice Martin', email: 'alice@exemple.fr', roles: [{ domain: 'Ventes', role: 'owner' }] },
    { id: 'pe_2', name: 'Bob Durand', email: 'bob@exemple.fr', roles: [{ domain: 'Ventes', role: 'contrib' }] }
];

test('le responsable d’un domaine décide sur son domaine, et seulement là', () => {
    const pouvoir = pouvoirDeDecider(personnes, { email: 'alice@exemple.fr' }, false, correspondALIdentite);
    assert.deepEqual(pouvoir, { domaines: ['Ventes'], partout: false });
    assert.equal(peutDecider(proposition('p1', 'bo', {}, 'Ventes'), pouvoir), true);
    assert.equal(peutDecider(proposition('p2', 'bo', {}, 'Achats'), pouvoir), false);
});

test('un contributeur ne tranche pas, un administrateur tranche partout', () => {
    assert.deepEqual(pouvoirDeDecider(personnes, { email: 'bob@exemple.fr' }, false, correspondALIdentite).domaines, []);
    const administrateur = pouvoirDeDecider(personnes, { email: 'inconnu@exemple.fr' }, true, correspondALIdentite);
    assert.equal(peutDecider(proposition('p1', 'bo', {}, 'Achats'), administrateur), true);
});

test('à défaut d’adresse, on reconnaît la personne à son nom', () => {
    assert.deepEqual(pouvoirDeDecider(personnes, { nom: 'Alice Martin' }, false, correspondALIdentite).domaines, ['Ventes']);
    assert.deepEqual(pouvoirDeDecider(personnes, {}, false, correspondALIdentite).domaines, [], 'sans identité, aucun pouvoir');
});

test('« tout valider » ne prend que ce que l’on a le droit de trancher, et dit pourquoi', () => {
    const groupe = regrouperLesPropositions(
        [proposition('p1', 'bo', { boId: 'bo_1' }, 'Ventes'), proposition('p2', 'bo', { boId: 'bo_1' }, 'Achats')],
        {}
    )[0];
    const responsableDesVentes = pouvoirDeDecider(personnes, { email: 'alice@exemple.fr' }, false, correspondALIdentite);
    assert.deepEqual(
        decidablesDuGroupe(groupe, responsableDesVentes).map(une => une.id),
        ['p1']
    );
    const etat = etatDuToutValider(groupe, responsableDesVentes);
    assert.equal(etat.possible, true);
    assert.equal(etat.libelle, '✔ Tout valider (1)');
    assert.match(etat.raison, /1 proposition\(s\) de ce groupe relèvent d'un autre responsable/);
    const sansPouvoir = etatDuToutValider(groupe, { domaines: [], partout: false });
    assert.equal(sansPouvoir.possible, false);
    assert.match(sansPouvoir.raison, /revient au responsable du domaine/);
});
