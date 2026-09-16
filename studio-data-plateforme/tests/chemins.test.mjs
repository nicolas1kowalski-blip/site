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

// Le modèle du cas réel : la liste des éléments ne porte pas le groupe, c'est la table des affectations qui
// le donne ; l'arbre classe (élément, groupe). La clé du lien vers l'arbre compare donc ces deux groupes.
const LIEN_AFFECTATION = {
    id: 'affectation',
    sourceTable: 'elements.csv',
    sourceCol: 'id_affectation',
    targetTable: 'affectations.csv',
    targetCol: 'id_affectation',
    sourceId: 'elements',
    targetId: 'affectations'
};
const LIEN_ARBRE = {
    id: 'arbre',
    sourceTable: 'arbre.csv',
    sourceCol: 'element',
    targetTable: 'elements.csv',
    targetCol: 'code',
    sourceId: 'arbre',
    targetId: 'elements',
    extraCols: [{ deTable: 'arbre.csv', deColonne: 'groupe', versTable: 'affectations.csv', versColonne: 'groupe' }]
};
const MODELE_DU_CAS = [LIEN_AFFECTATION, LIEN_ARBRE];
const ID_DE_LA_TABLE = nom => ({ 'elements.csv': 'elements', 'affectations.csv': 'affectations', 'arbre.csv': 'arbre' })[nom];

test('clé composite : la table comparée est ramenée d’office, et jointe avant celle qui en dépend', () => {
    const chemins = cheminsVers('elements', 'arbre', MODELE_DU_CAS);
    const jointures = planifierJointures(chemins, 'elements', MODELE_DU_CAS, ID_DE_LA_TABLE);
    assert.equal(jointures.length, 2, 'la table des affectations est ajoutée, bien que rien ne l’ait demandée');
    assert.equal(jointures[0].versTableId, 'affectations', 'elle est posée avant : sa valeur doit exister quand on la compare');
    assert.equal(jointures[1].versTableId, 'arbre');
    assert.deepEqual(jointures[1].conditionsEnPlus, [
        { versColonne: 'groupe', tableComparee: 'affectations', routeComparee: 'affectation', colonneComparee: 'groupe' }
    ]);
    assert.deepEqual(jointures[0].conditionsEnPlus, [], 'le lien des affectations n’a pas de condition en plus');
});

test('clé composite : la condition ne contraint que la table qu’elle nomme, dans les deux sens de parcours', () => {
    // Parcouru depuis l'arbre, c'est « elements » que l'étape atteint : la condition ne la vise pas, donc rien.
    const depuisLArbre = planifierJointures(cheminsVers('arbre', 'elements', MODELE_DU_CAS), 'arbre', MODELE_DU_CAS, ID_DE_LA_TABLE);
    assert.deepEqual(depuisLArbre[0].conditionsEnPlus, []);
    // Parcouru depuis les éléments, c'est « arbre » : la condition s'applique, et la colonne contrainte est la sienne.
    const depuisLesElements = planifierJointures(
        cheminsVers('elements', 'arbre', MODELE_DU_CAS),
        'elements',
        MODELE_DU_CAS,
        ID_DE_LA_TABLE
    );
    assert.equal(depuisLesElements[1].conditionsEnPlus[0].versColonne, 'groupe');
});

test('clé composite : la table comparée déjà présente n’est pas jointe une seconde fois', () => {
    const chemins = [...cheminsVers('elements', 'affectations', MODELE_DU_CAS), ...cheminsVers('elements', 'arbre', MODELE_DU_CAS)];
    const jointures = planifierJointures(chemins, 'elements', MODELE_DU_CAS, ID_DE_LA_TABLE);
    assert.equal(jointures.length, 2);
    assert.equal(jointures.filter(jointure => jointure.versTableId === 'affectations').length, 1);
});

test('clé composite : une table comparée hors de portée abandonne la condition plutôt que de casser la requête', () => {
    const seulArbre = [LIEN_ARBRE];
    const jointures = planifierJointures(cheminsVers('elements', 'arbre', seulArbre), 'elements', seulArbre, ID_DE_LA_TABLE);
    assert.equal(jointures.length, 1);
    assert.deepEqual(jointures[0].conditionsEnPlus, [], 'sans chemin vers les affectations, la condition est laissée de côté');
});

test('clé simple : aucune condition en plus, la jointure est celle d’avant', () => {
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
    assert.deepEqual(jointures[0].conditionsEnPlus, [], 'sans clé composite, la liste est vide et non absente');
});
