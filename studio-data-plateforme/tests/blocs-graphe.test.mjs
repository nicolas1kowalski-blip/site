/**
 * Tests des blocs du graphe (V13) : les lignes d'une table, leur ordre, et le rangement par domaine.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    LIGNES_BLOC_COMPACT,
    couleurDuDomaine,
    lignesDuBloc,
    rangerParDomaine,
    tailleDuBloc,
    texteCoupe
} from '../web/src/app/composants/blocs-graphe.ts';

test('les colonnes qui portent quelque chose passent devant, chacune avec son marqueur', () => {
    const lignes = lignesDuBloc(['ville', 'id_client', 'nom', 'id_commune'], {
        cles: ['id_client'],
        jointures: ['id_commune']
    });
    assert.equal(lignes[0], '🔑 id_client');
    assert.equal(lignes[1], '🔗 id_commune');
    assert.ok(lignes.includes('· ville'));
    assert.ok(lignes.includes('· nom'));
});

test('une clé étrangère se distingue d’une simple colonne de jointure', () => {
    const lignes = lignesDuBloc(['montant', 'id_client'], { clesEtrangeres: ['id_client'] });
    assert.equal(lignes[0], '🔐 id_client');
});

test('au-delà de sept colonnes, le bloc dit combien il en reste', () => {
    const colonnes = Array.from({ length: 10 }, (_, rang) => 'colonne_' + rang);
    const lignes = lignesDuBloc(colonnes);
    assert.equal(lignes.length, LIGNES_BLOC_COMPACT + 1);
    assert.equal(lignes[LIGNES_BLOC_COMPACT], '… 3 autre(s) colonne(s)');
});

test('en vue schéma, toutes les colonnes tiennent dans le bloc', () => {
    const colonnes = Array.from({ length: 10 }, (_, rang) => 'colonne_' + rang);
    assert.equal(lignesDuBloc(colonnes, {}, 40).length, 10);
});

test('la taille d’un bloc suit son titre et sa plus longue ligne, entre deux bornes', () => {
    const [largeurCourte, hauteurCourte] = tailleDuBloc('t', []);
    assert.equal(largeurCourte, 150, 'un bloc minuscule garde une largeur lisible');
    assert.ok(hauteurCourte < 45, 'sans ligne, le bloc se réduit à son en-tête');
    const [largeurLongue, hauteurLongue] = tailleDuBloc('une table au nom interminable', ['· une colonne au nom vraiment très long']);
    assert.ok(largeurLongue > largeurCourte && largeurLongue <= 280);
    assert.ok(hauteurLongue > hauteurCourte);
});

test('la couleur d’un domaine suit l’ordre alphabétique : la même d’un écran à l’autre', () => {
    const domaines = ['Ventes', 'Commercial', 'Finance'];
    assert.deepEqual(couleurDuDomaine(domaines, 'Commercial'), couleurDuDomaine([...domaines].reverse(), 'Commercial'));
    assert.notDeepEqual(couleurDuDomaine(domaines, 'Commercial'), couleurDuDomaine(domaines, 'Finance'));
});

test('un domaine inconnu reste gris : on n’invente pas une couleur de plus', () => {
    assert.equal(couleurDuDomaine(['Ventes'], '').entete, '#f1f5f9');
});

test('les blocs d’un même domaine sont rangés ensemble, dans un cadre qui les contient tous', () => {
    const rangement = rangerParDomaine([
        { id: 'a', largeur: 180, hauteur: 80, domaine: 'Ventes' },
        { id: 'b', largeur: 180, hauteur: 80, domaine: 'Ventes' },
        { id: 'c', largeur: 180, hauteur: 80, domaine: 'Finance' }
    ]);
    assert.equal(rangement.zones.length, 2);
    const ventes = rangement.zones.find(zone => zone.domaine === 'Ventes');
    for (const identifiant of ['a', 'b']) {
        const place = rangement.places[identifiant];
        assert.ok(place.x - 90 >= ventes.x, `${identifiant} est dans le cadre de son domaine`);
        assert.ok(place.x + 90 <= ventes.x + ventes.largeur);
    }
    const finance = rangement.zones.find(zone => zone.domaine === 'Finance');
    assert.notEqual(rangement.places['c'].x + rangement.places['c'].y, rangement.places['a'].x + rangement.places['a'].y);
    assert.ok(finance.largeur > 0 && finance.hauteur > 0);
});

test('sans domaine déclaré, tout tient dans un seul cadre', () => {
    const rangement = rangerParDomaine([
        { id: 'a', largeur: 180, hauteur: 80, domaine: '' },
        { id: 'b', largeur: 180, hauteur: 80, domaine: '' }
    ]);
    assert.equal(rangement.zones.length, 1);
    assert.equal(rangement.zones[0].domaine, '(sans domaine)');
});

test('un texte plus large que son bloc est coupé', () => {
    assert.equal(texteCoupe('court', 200), 'court');
    assert.ok(texteCoupe('un texte vraiment très long pour un si petit bloc', 150).endsWith('…'));
});
