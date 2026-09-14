/**
 * Tests du repli d'un graphe trop chargé (V12.8) : regrouper ce qui se répète, sans jamais perdre le graphe
 * d'origine.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estUnGroupe, grapheReplie, groupesDe, identifiantDeGroupe, titreDuGroupe } from '../web/src/app/composants/repli-graphe.ts';

/** Un objet lu par six applications, alimenté par deux fichiers. */
const graphe = () => {
    const noeuds = [{ id: 'bo:client', titre: 'Client', genre: 'objet' }];
    const liens = [];
    for (let numero = 1; numero <= 6; numero += 1) {
        noeuds.push({ id: 'use:a' + numero, titre: 'Application ' + numero, genre: 'app' });
        liens.push({ source: 'bo:client', target: 'use:a' + numero, libelle: 'utilise 1 information(s)' });
    }
    for (const fichier of ['clients.csv', 'contrats.csv']) {
        noeuds.push({ id: 'tbl:' + fichier, titre: fichier, genre: 'table' });
        liens.push({ source: 'tbl:' + fichier, target: 'bo:client', libelle: 'alimente' });
    }
    return { noeuds, liens };
};

test('on ne regroupe qu’au-delà du seuil, et par côté et par genre', () => {
    const groupes = groupesDe(graphe(), 'bo:client');
    assert.equal(groupes.length, 1, 'six applications en aval : un groupe ; deux fichiers en amont : aucun');
    assert.equal(groupes[0].sens, 'aval');
    assert.equal(groupes[0].genre, 'app');
    assert.equal(groupes[0].membres.length, 6);
    assert.equal(groupes[0].id, identifiantDeGroupe('app', 'aval'));
    assert.ok(estUnGroupe(groupes[0].id));
});

test('la case regroupée se lit en français', () => {
    assert.equal(titreDuGroupe(groupesDe(graphe(), 'bo:client')[0]), '6 applications en aval');
});

test('replié, le graphe montre une case au lieu de six, et un seul lien qui porte leur nombre', () => {
    const replie = grapheReplie(graphe(), 'bo:client', new Set());
    assert.equal(replie.noeuds.length, 1 + 2 + 1, 'le centre, les deux fichiers, et la case regroupée');
    assert.ok(replie.noeuds.some(noeud => noeud.titre === '6 applications en aval'));
    const versLeGroupe = replie.liens.filter(lien => lien.target === identifiantDeGroupe('app', 'aval'));
    assert.equal(versLeGroupe.length, 1);
    assert.equal(versLeGroupe[0].libelle, '6 liens');
});

test('ouvrir le groupe rend exactement le graphe d’origine', () => {
    const origine = graphe();
    const ouvert = grapheReplie(origine, 'bo:client', new Set([identifiantDeGroupe('app', 'aval')]));
    assert.deepEqual(ouvert.noeuds, origine.noeuds);
    assert.deepEqual(ouvert.liens, origine.liens);
});

test('un élément relié des deux côtés n’est jamais regroupé : il raconte le graphe', () => {
    const avecAllerRetour = graphe();
    avecAllerRetour.liens.push({ source: 'use:a1', target: 'bo:client', libelle: 'alimente aussi' });
    const groupes = groupesDe(avecAllerRetour, 'bo:client');
    assert.equal(groupes.length, 1);
    assert.ok(!groupes[0].membres.includes('use:a1'), 'celle qui alimente ET consomme reste visible');
    assert.equal(groupes[0].membres.length, 5);
});

test('sous le seuil, rien n’est touché', () => {
    const petit = { noeuds: graphe().noeuds.slice(0, 4), liens: graphe().liens.slice(0, 3) };
    const replie = grapheReplie(petit, 'bo:client', new Set());
    assert.equal(replie.noeuds, petit.noeuds, 'le graphe d’origine est rendu tel quel');
    assert.deepEqual(replie.groupes, []);
});
