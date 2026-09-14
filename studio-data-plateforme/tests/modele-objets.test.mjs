/**
 * Tests du diagramme du modèle d'objets (V13) : les cartes, les compositions et les références.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    diagrammeDesObjets,
    libelleDeLaComposition,
    lignesDeLObjet,
    lignesDeLaVariante,
    porteeEnClair,
    resumeDuModele,
    texteDUnFiltre,
    titreDeLaVariante
} from '../web/src/app/pages/modele-objets/modele-objets.ts';

const information = nom => ({ id: 'be_' + nom, name: nom, definition: '', mappings: [], usedBy: [] });
const objet = (identifiant, nom, reste = {}) => ({
    id: identifiant,
    name: nom,
    definition: '',
    globalOwner: '',
    contributors: [],
    elements: [],
    sources: [],
    producedBy: [],
    consumedBy: [],
    references: [],
    ...reste
});

test('la carte d’un objet commence par son propriétaire, et le dit quand il manque', () => {
    assert.equal(lignesDeLObjet(objet('bo_1', 'Client'))[0], '⚠️ sans propriétaire');
    assert.equal(lignesDeLObjet(objet('bo_1', 'Client', { globalOwner: 'Alice' }))[0], '👤 Alice');
});

test('au-delà de six informations, la carte dit combien elle en tait', () => {
    const huit = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(information);
    const lignes = lignesDeLObjet(objet('bo_1', 'Client', { elements: huit }));
    assert.equal(lignes.length, 8, 'le propriétaire, six informations, et la ligne de reste');
    assert.equal(lignes.at(-1), '… 2 autre(s) information(s)');
});

test('un filtre de portée se lit en clair, avec ou sans valeur', () => {
    assert.equal(texteDUnFiltre({ col: 'type', op: '=', val: 'principale' }), 'type = « principale »');
    assert.equal(texteDUnFiltre({ col: 'email', op: 'notempty' }), 'email n’est pas vide');
});

test('sans filtre, une variante porte toute sa table', () => {
    assert.equal(porteeEnClair({ id: 'st_1', name: 'A', table: 'adresses.csv' }), 'toute la table');
    assert.equal(
        porteeEnClair({ id: 'st_1', name: 'A', table: 'adresses.csv', scope: [{ col: 'type', op: '=', val: 'LIV' }] }),
        'type = « LIV »'
    );
});

test('la carte d’une variante dit d’où elle vient et ce qu’elle garde', () => {
    const variante = {
        id: 'st_1',
        name: 'Adresses de livraison',
        table: 'adresses.csv',
        scope: [{ col: 'type', op: '=', val: 'LIV' }],
        elements: ['rue', 'ville', 'code', 'pays', 'cedex'].map(information)
    };
    const lignes = lignesDeLaVariante(variante);
    assert.deepEqual(lignes.slice(0, 2), ['📄 vue de adresses.csv', '⚗ type = « LIV »']);
    assert.equal(lignes.at(-1), '… 1 autre(s)');
});

test('une variante sans nom métier porte celui de sa table', () => {
    assert.equal(titreDeLaVariante({ id: 'st_1', name: 'adresses.csv', table: 'adresses.csv' }), 'adresses.csv');
    assert.equal(titreDeLaVariante({ id: 'st_1', name: 'Livraison', table: 'adresses.csv' }), 'Livraison');
});

test('le trait d’une composition porte la cardinalité et la condition', () => {
    assert.equal(libelleDeLaComposition({ id: 'st_1', name: 'A', table: 't', cardinality: '1–N' }), '1–N');
    assert.equal(
        libelleDeLaComposition({
            id: 'st_1',
            name: 'A',
            table: 't',
            cardinality: '1–N',
            applies: [{ col: 'statut', op: '=', val: 'actif' }]
        }),
        '1–N [si statut = « actif »]'
    );
});

test('le diagramme pose un nœud par objet, un par variante, et relie les deux', () => {
    const client = objet('bo_1', 'Client', {
        globalOwner: 'Alice',
        structure: [{ id: 'st_1', name: 'Adresses', table: 'adresses.csv', cardinality: '1–N', elements: [information('rue')] }],
        references: [{ boId: 'bo_2', cardinality: '1–N' }]
    });
    const commande = objet('bo_2', 'Commande');
    const { noeuds, liens } = diagrammeDesObjets([client, commande]);
    assert.deepEqual(
        noeuds.map(noeud => noeud.id),
        ['bo:bo_1', 'cmp:bo_1:0', 'bo:bo_2']
    );
    assert.equal(noeuds[0].titre, '🏛️ Client');
    assert.equal(noeuds[1].titre, '◆ Adresses');
    assert.deepEqual(
        liens.map(lien => [lien.source, lien.target, lien.libelle, lien.pointille]),
        [
            ['bo:bo_1', 'cmp:bo_1:0', '1–N', false],
            ['bo:bo_1', 'bo:bo_2', '→ 1–N', true]
        ]
    );
});

test('un objet qui porte une hiérarchie se distingue par son cadre et son pictogramme', () => {
    const { noeuds } = diagrammeDesObjets([objet('bo_1', 'Produit', { hierarchies: [{ id: 'h1', name: 'Gamme' }] })]);
    assert.equal(noeuds[0].titre, '🌳 🏛️ Produit');
    assert.equal(noeuds[0].bordure, '#059669');
});

test('une référence vers un objet disparu ne se dessine pas', () => {
    const { liens } = diagrammeDesObjets([objet('bo_1', 'Client', { references: [{ boId: 'bo_disparu', cardinality: '1–1' }] })]);
    assert.deepEqual(liens, [], 'un trait qui ne mène nulle part vaut mieux qu’il ne soit pas tracé');
});

test('le résumé compte ce que le dessin montre, et ce qui manque', () => {
    const client = objet('bo_1', 'Client', {
        structure: [{ id: 'st_1', name: 'A', table: 't' }],
        references: [{ boId: 'bo_2' }]
    });
    assert.equal(
        resumeDuModele([client, objet('bo_2', 'Commande')]),
        '2 objet(s) · 1 composition(s) · 1 référence(s) · 2 sans propriétaire'
    );
});
