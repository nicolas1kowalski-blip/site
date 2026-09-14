/**
 * Tests des usages d'un objet (V13) : qui se sert de quelle information, et les exemples pris dans les données.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    aEchantillonner,
    autresUsages,
    bilanDesUsages,
    bilanNeuf,
    classerAvantEchantillonnage,
    compteDesUsages,
    lignesDUsage,
    phraseDuBilan,
    poserDesExemples,
    poserLUsage,
    poserLUsagePourToutes,
    sourceDifferente,
    utiliseePar,
    vueDouverture
} from '../web/src/app/pages/objets-metier/usages-objet.ts';

const information = (nom, usages = []) => ({
    id: 'be_' + nom,
    name: nom,
    definition: '',
    mappings: [{ table: 'clients.csv', col: nom }],
    usedBy: [...usages]
});
const objet = () => ({
    id: 'bo_1',
    name: 'Client',
    definition: '',
    globalOwner: '',
    contributors: [],
    elements: [information('nom'), information('ville', ['as_1'])],
    structure: [{ id: 'st_1', name: 'Adresses de livraison', table: 'adresses.csv', elements: [information('rue')] }],
    sources: [],
    producedBy: [],
    consumedBy: [],
    references: []
});

test('les lignes d’usage réunissent le cœur de l’objet et ses variantes', () => {
    const lignes = lignesDUsage(objet());
    assert.deepEqual(
        lignes.map(ligne => [ligne.information.name, ligne.variante]),
        [
            ['nom', ''],
            ['ville', ''],
            ['rue', 'Adresses de livraison']
        ]
    );
});

test('un objet sans variante ne montre que ses propres informations', () => {
    const sansVariante = { ...objet(), structure: undefined };
    assert.equal(lignesDUsage(sansVariante).length, 2);
});

test('déclarer et retirer un usage, sans jamais le déclarer deux fois', () => {
    const une = information('nom');
    poserLUsage(une, 'as_1', true);
    poserLUsage(une, 'as_1', true);
    assert.deepEqual(une.usedBy, ['as_1'], 'le même usage ne s’ajoute pas deux fois');
    assert.equal(utiliseePar(une, 'as_1'), true);
    poserLUsage(une, 'as_1', false);
    assert.deepEqual(une.usedBy, []);
    poserLUsage(une, 'as_2', false);
    assert.deepEqual(une.usedBy, [], 'retirer un usage absent ne casse rien');
});

test('« tout cocher » ne compte que ce qui change vraiment', () => {
    const lignes = lignesDUsage(objet());
    assert.equal(poserLUsagePourToutes(lignes, 'as_1', true), 2, 'ville était déjà cochée');
    assert.equal(poserLUsagePourToutes(lignes, 'as_1', true), 0, 'rien à refaire');
    assert.equal(poserLUsagePourToutes(lignes, 'as_1', false), 3);
});

test('le compte dit où l’on en est pour une application', () => {
    const lignes = lignesDUsage(objet());
    assert.equal(compteDesUsages(lignes, 'as_1'), '1/3 information(s) cochée(s)');
    assert.equal(compteDesUsages(lignes, 'as_9'), '0/3 information(s) cochée(s)');
});

test('les autres usages d’une information nomment les actifs, et ignorent les inconnus', () => {
    const actifs = [
        { id: 'as_1', name: 'CRM', kind: 'app' },
        { id: 'as_2', name: 'Facturation', kind: 'app' }
    ];
    const une = information('nom', ['as_1', 'as_2', 'as_disparu']);
    assert.deepEqual(
        autresUsages(une, 'as_1', actifs).map(actif => actif.name),
        ['Facturation']
    );
});

test('une information venue d’une autre application que l’objet se signale', () => {
    const une = information('nom');
    assert.equal(sourceDifferente(une, 'as_1'), false, 'rien de déclaré : rien à signaler');
    une.sourceApp = 'as_1';
    assert.equal(sourceDifferente(une, 'as_1'), false, 'la même que l’objet : rien à signaler');
    une.sourceApp = 'as_2';
    assert.equal(sourceDifferente(une, 'as_1'), true);
});

test('le bilan dit ce que personne ne lit et ce qui a sa propre source', () => {
    const modele = objet();
    modele.elements[0].sourceApp = 'as_9';
    const bilan = bilanDesUsages(lignesDUsage(modele), 'as_1');
    assert.deepEqual(bilan, { sansUsage: 2, sourcesPropres: 1 });
});

test('la vue d’ouverture dépend du nombre d’applications', () => {
    assert.equal(vueDouverture(3), 'matrice');
    assert.equal(vueDouverture(6), 'matrice');
    assert.equal(vueDouverture(7), 'application', 'au-delà, la matrice ne tient plus à l’écran');
});

test('on n’échantillonne jamais par-dessus des exemples écrits à la main', () => {
    const une = information('ville');
    assert.equal(aEchantillonner(une), true, 'rien d’écrit : on peut aller chercher');
    une.examples = 'PARIS ; LYON';
    assert.equal(aEchantillonner(une), false, 'écrit à la main : on n’y touche pas');
    une.examplesAuto = true;
    assert.equal(aEchantillonner(une), true, 'déjà échantillonné : remplaçable');
    une.mappings = [];
    assert.equal(aEchantillonner(une), false, 'sans colonne, il n’y a rien à lire');
});

test('chaque information est rangée dans la bonne case du bilan', () => {
    const bilan = bilanNeuf();
    const aLire = information('ville');
    const aLaMain = { ...information('nom'), examples: 'Dupont' };
    const sansColonne = { ...information('age'), mappings: [] };
    assert.equal(classerAvantEchantillonnage(aLire, bilan), true);
    assert.equal(classerAvantEchantillonnage(aLaMain, bilan), false);
    assert.equal(classerAvantEchantillonnage(sansColonne, bilan), false);
    assert.deepEqual(bilan, { completees: 0, gardees: 1, sansColonne: 1, sansValeur: 0 });
});

test('les exemples posés se disent automatiques, donc remplaçables la fois suivante', () => {
    const une = information('ville');
    poserDesExemples(une, ['PARIS', 'LYON']);
    assert.equal(une.examples, 'PARIS ; LYON');
    assert.equal(une.examplesAuto, true);
    assert.equal(aEchantillonner(une), true);
});

test('le bilan se raconte sans rien taire', () => {
    assert.equal(phraseDuBilan({ completees: 4, gardees: 0, sansColonne: 0, sansValeur: 0 }), '4 information(s) complétée(s).');
    assert.equal(
        phraseDuBilan({ completees: 2, gardees: 1, sansColonne: 3, sansValeur: 1 }),
        '2 information(s) complétée(s) · 1 laissée(s) intacte(s) car saisie(s) à la main · 3 sans colonne rattachée · 1 sans valeur dans le fichier.'
    );
});
