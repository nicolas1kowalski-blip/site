/**
 * Tests des chemins de jointure de l'écran Extraction (web/src/app/pages/extraction/chemins.ts).
 *
 * C'est la pièce qui permet de ramener la même table plusieurs fois par des liens différents — le nom du
 * souscripteur ET celui du bénéficiaire. Le module est écrit en TypeScript mais ne contient que des fonctions
 * pures : Node l'exécute directement en retirant les types (--experimental-strip-types).
 *
 *   node --test --experimental-strip-types tests/chemins.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const racine = path.dirname(fileURLToPath(import.meta.url));
const { cheminsVers, cleChemin, libelleChemin, planifierJointures, tablesAccessibles } = await import(
    path.join(racine, '..', 'web', 'src', 'app', 'pages', 'extraction', 'chemins.ts')
);

/** Un lien du modèle, tel que l'API le renvoie. */
const lien = (id, sourceId, sourceCol, targetId, targetCol) => ({
    id,
    sourceId,
    sourceCol,
    targetId,
    targetCol,
    sourceTable: sourceId,
    targetTable: targetId
});
const nomDe = identifiant => identifiant;

test('table de départ : un seul chemin, vide', () => {
    assert.deepEqual(cheminsVers('clients', 'clients', []), [[]]);
    assert.equal(cleChemin([]), '');
    assert.equal(libelleChemin([], nomDe), 'table de départ');
});

test('deux liens vers la même table : deux chemins distincts, avec des clés et des libellés différents', () => {
    const liens = [
        lien('r_souscripteur', 'contrats', 'id_souscripteur', 'personnes', 'id'),
        lien('r_beneficiaire', 'contrats', 'id_beneficiaire', 'personnes', 'id')
    ];
    const chemins = cheminsVers('contrats', 'personnes', liens);
    assert.equal(chemins.length, 2, 'la table des personnes est atteignable de deux façons');
    assert.deepEqual(chemins.map(cleChemin), ['r_souscripteur', 'r_beneficiaire']);
    assert.equal(libelleChemin(chemins[0], nomDe), 'contrats.id_souscripteur → personnes.id');
    assert.equal(libelleChemin(chemins[1], nomDe), 'contrats.id_beneficiaire → personnes.id');
});

test('un lien se parcourt dans les deux sens', () => {
    const liens = [lien('r1', 'commandes', 'id_client', 'clients', 'id')];
    assert.equal(cheminsVers('commandes', 'clients', liens).length, 1);
    const remontee = cheminsVers('clients', 'commandes', liens);
    assert.equal(remontee.length, 1, 'on part aussi des clients vers leurs commandes');
    assert.equal(libelleChemin(remontee[0], nomDe), 'clients.id → commandes.id_client');
});

test('chemins en plusieurs étapes : les plus courts d’abord, jamais deux fois la même table, profondeur bornée', () => {
    const liens = [
        lien('r1', 'lignes', 'id_commande', 'commandes', 'id'),
        lien('r2', 'commandes', 'id_client', 'clients', 'id'),
        lien('r3', 'clients', 'id_pays', 'pays', 'code'),
        lien('r4', 'lignes', 'id_pays_livraison', 'pays', 'code')
    ];
    const chemins = cheminsVers('lignes', 'pays', liens);
    assert.deepEqual(chemins.map(cleChemin), ['r4', 'r1>r2>r3'], 'le lien direct d’abord, puis le chemin long');
    assert.equal(cheminsVers('lignes', 'pays', liens, 2).length, 1, 'à deux étapes, seul le lien direct reste');
    assert.deepEqual(tablesAccessibles('lignes', liens).sort(), ['clients', 'commandes', 'lignes', 'pays']);
});

test('un lien dont une extrémité n’est pas chargée est ignoré', () => {
    const liens = [{ ...lien('r1', 'commandes', 'id_client', 'clients', 'id'), targetId: null }];
    assert.deepEqual(cheminsVers('commandes', 'clients', liens), []);
    assert.deepEqual(tablesAccessibles('commandes', liens), ['commandes']);
});

test('planification : une jointure par route, préfixes partagés, chacune part d’une route déjà posée', () => {
    const liens = [
        lien('r_souscripteur', 'contrats', 'id_souscripteur', 'personnes', 'id'),
        lien('r_beneficiaire', 'contrats', 'id_beneficiaire', 'personnes', 'id'),
        lien('r_pays', 'personnes', 'id_pays', 'pays', 'code')
    ];
    const parSouscripteur = cheminsVers('contrats', 'personnes', liens)[0];
    const parBeneficiaire = cheminsVers('contrats', 'personnes', liens)[1];
    const paysDuSouscripteur = cheminsVers('contrats', 'pays', liens).find(chemin => cleChemin(chemin) === 'r_souscripteur>r_pays');
    const jointures = planifierJointures([parSouscripteur, parBeneficiaire, paysDuSouscripteur], 'contrats');
    assert.deepEqual(
        jointures.map(jointure => [jointure.cle, jointure.depuis, jointure.versTableId]),
        [
            ['r_souscripteur', 'contrats', 'personnes'],
            ['r_beneficiaire', 'contrats', 'personnes'],
            ['r_souscripteur>r_pays', 'r_souscripteur', 'pays']
        ],
        'la troisième jointure repart de la route du souscripteur, déjà posée'
    );
    assert.equal(jointures[0].deColonne, 'id_souscripteur');
    assert.equal(jointures[1].deColonne, 'id_beneficiaire');
    // Le même chemin demandé deux fois ne produit qu'une jointure.
    assert.equal(planifierJointures([parSouscripteur, parSouscripteur], 'contrats').length, 1);
    assert.deepEqual(planifierJointures([[]], 'contrats'), [], 'la table de départ ne demande aucune jointure');
});

test('clé composite : les colonnes en plus suivent le chemin, dans le sens du parcours', () => {
    // Un élément appartient à plusieurs groupes : sans le groupe dans la clé, la jointure multiplie.
    const lien = {
        id: 'arbre',
        sourceTable: 'arbre.csv',
        sourceCol: 'element',
        targetTable: 'elements.csv',
        targetCol: 'code',
        sourceId: 'arbre',
        targetId: 'elements',
        extraCols: [{ sourceCol: 'groupe', targetCol: 'type_groupe' }]
    };
    const chemins = cheminsVers('elements', 'arbre', [lien]);
    assert.equal(chemins.length, 1);
    const jointures = planifierJointures(chemins, 'elements');
    assert.equal(jointures.length, 1);
    assert.deepEqual(
        jointures[0].pairesEnPlus,
        [{ deColonne: 'type_groupe', versColonne: 'groupe' }],
        'parcouru depuis les éléments, la colonne de départ est celle des éléments'
    );
    const retour = planifierJointures(cheminsVers('arbre', 'elements', [lien]), 'arbre');
    assert.deepEqual(
        retour[0].pairesEnPlus,
        [{ deColonne: 'groupe', versColonne: 'type_groupe' }],
        'parcouru dans l’autre sens, les deux colonnes s’échangent'
    );
});

test('clé simple : aucune colonne en plus, la jointure est celle d’avant', () => {
    const lien = {
        id: 'l1',
        sourceTable: 'commandes.csv',
        sourceCol: 'id_client',
        targetTable: 'clients.csv',
        targetCol: 'id_client',
        sourceId: 'commandes',
        targetId: 'clients'
    };
    const jointures = planifierJointures(cheminsVers('commandes', 'clients', [lien]), 'commandes');
    assert.deepEqual(jointures[0].pairesEnPlus, [], 'sans clé composite, la liste est vide et non absente');
});
