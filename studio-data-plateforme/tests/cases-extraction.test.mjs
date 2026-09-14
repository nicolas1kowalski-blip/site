/**
 * Tests de la vue graphique de l'extraction (V13) : une case par chemin, le filtre d'affichage, le rangement.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    LARGEUR_CASE,
    casesVisibles,
    colonnesVisibles,
    flecheEntreCases,
    rangerLesCases
} from '../web/src/app/pages/extraction/cases-extraction.ts';
import { casesDuGraphe } from '../web/src/app/pages/extraction/chemins.ts';

/** clients ← commandes, et personnes atteinte deux fois : par le souscripteur et par le bénéficiaire. */
const nomDe = tableId => ({ t_clients: 'clients.csv', t_commandes: 'commandes.csv', t_personnes: 'personnes.csv' })[tableId] || tableId;
const etape = (relationId, deTableId, deColonne, versTableId, versColonne) => ({
    relationId,
    deTableId,
    deColonne,
    versTableId,
    versColonne
});
const chemins = new Map([
    ['t_commandes', [[etape('r1', 't_clients', 'id_client', 't_commandes', 'id_client')]]],
    [
        't_personnes',
        [
            [etape('r2', 't_clients', 'id_souscripteur', 't_personnes', 'id_personne')],
            [etape('r3', 't_clients', 'id_beneficiaire', 't_personnes', 'id_personne')]
        ]
    ]
]);

test('la table de départ a sa case, sans chemin', () => {
    const cases = casesDuGraphe('t_clients', new Map(), nomDe);
    assert.equal(cases.length, 1);
    assert.deepEqual(
        { cle: cases[0].cle, profondeur: cases[0].profondeur, route: cases[0].route },
        {
            cle: '',
            profondeur: 0,
            route: 't_clients'
        }
    );
});

test('une table reliée de deux façons donne deux cases, une par lien', () => {
    const cases = casesDuGraphe('t_clients', chemins, nomDe);
    const personnes = cases.filter(uneCase => uneCase.tableId === 't_personnes');
    assert.equal(personnes.length, 2);
    assert.deepEqual(personnes.map(uneCase => uneCase.cle).sort(), ['r2', 'r3']);
    assert.match(personnes[0].via, /clients\.csv\.id_/);
    assert.notEqual(personnes[0].route, personnes[1].route, 'chaque case porte sa propre route');
});

test('chaque case sait de quelle case elle descend, et par quel lien', () => {
    const cases = casesDuGraphe('t_clients', chemins, nomDe);
    const commandes = cases.find(uneCase => uneCase.tableId === 't_commandes');
    assert.equal(commandes.cleParent, '', 'elle descend de la table de départ');
    assert.equal(commandes.profondeur, 1);
    assert.equal(commandes.libelleLien, 'clients.csv.id_client → commandes.csv.id_client');
});

test('le filtre d’affichage ne garde que ce qui est cherché, ou ce qui est déjà choisi', () => {
    const colonnes = ['ville', 'nom', 'code_postal'];
    assert.deepEqual(
        colonnesVisibles(colonnes, { recherche: 'vil' }, () => false),
        ['ville']
    );
    assert.deepEqual(
        colonnesVisibles(colonnes, { choisiesSeulement: true }, colonne => colonne === 'nom'),
        ['nom']
    );
    assert.deepEqual(
        colonnesVisibles(colonnes, {}, () => false),
        colonnes
    );
});

test('chercher le nom d’une table montre toutes ses colonnes : on cherchait la table', () => {
    assert.deepEqual(
        colonnesVisibles(['ville', 'nom'], { recherche: 'clients' }, () => false, 'clients.csv'),
        ['ville', 'nom']
    );
});

test('une case gardée garde ses parents : le chemin doit se lire de bout en bout', () => {
    const profond = casesDuGraphe(
        't_clients',
        new Map([
            ['t_commandes', [[etape('r1', 't_clients', 'id_client', 't_commandes', 'id_client')]]],
            [
                't_personnes',
                [
                    [
                        etape('r1', 't_clients', 'id_client', 't_commandes', 'id_client'),
                        etape('r4', 't_commandes', 'id_livreur', 't_personnes', 'id_personne')
                    ]
                ]
            ]
        ]),
        nomDe
    );
    // On ne garde que la table la plus profonde : sa case parente doit rester pour que le chemin se voie.
    const gardees = casesVisibles(profond, uneCase => uneCase.tableId === 't_personnes');
    assert.deepEqual(gardees.map(uneCase => uneCase.tableId).sort(), ['t_clients', 't_commandes', 't_personnes']);
});

test('les cases se rangent en colonnes de profondeur, sans se chevaucher', () => {
    const cases = casesDuGraphe('t_clients', chemins, nomDe);
    const places = rangerLesCases(cases, () => 100);
    const depart = places[''];
    assert.equal(depart.x, 12);
    const premierNiveau = cases.filter(uneCase => uneCase.profondeur === 1).map(uneCase => places[uneCase.cle]);
    assert.ok(
        premierNiveau.every(place => place.x > depart.x + LARGEUR_CASE),
        'le premier niveau est à droite de la table de départ'
    );
    const ordonnees = premierNiveau.map(place => place.y).sort((premier, second) => premier - second);
    for (let rang = 1; rang < ordonnees.length; rang += 1)
        assert.ok(ordonnees[rang] - ordonnees[rang - 1] >= 100, 'deux cases voisines ne se chevauchent pas');
});

test('la flèche part du bord droit du parent et arrive au bord gauche de l’enfant', () => {
    const fleche = flecheEntreCases({ x: 10, y: 20, hauteur: 100 }, { x: 400, y: 200, hauteur: 100 });
    assert.ok(fleche.chemin.startsWith(`M ${10 + LARGEUR_CASE} 36`));
    assert.ok(fleche.chemin.includes('C '), 'le trait est une courbe, comme dans le classique');
    assert.equal(fleche.milieuY, (36 + 216) / 2);
});
