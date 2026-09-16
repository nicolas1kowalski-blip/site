/** Tests de la devination : à partir de deux tables observées, l'application propose toute la configuration. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    ColonneObservee,
    devinerLaBranche,
    devinerLaCodification,
    devinerLesNiveaux,
    recouvrement,
    scoreDeCode,
    scoreDeLibelle
} from '../src/codification/deviner-codification';

/** Une colonne observée, décrite par ses seuls exemples : le reste s'en déduit. */
const colonne = (nom: string, exemples: string[], distinctes?: number): ColonneObservee => ({
    nom,
    distinctes: distinctes ?? new Set(exemples.filter(Boolean)).size,
    renseignees: exemples.filter(Boolean).length,
    longueurMoyenne: exemples.filter(Boolean).reduce((somme, valeur) => somme + valeur.length, 0) / (exemples.filter(Boolean).length || 1),
    exemples
});

const LISTE = [
    colonne('REPERE', ['EQ001', 'EQ002', 'EQ003', 'EQ004']),
    colonne('LIBELLE', ['Pompe centrifuge alimentaire', 'Vanne papillon DN100', 'Echangeur a plaques', 'Pompe a vide']),
    colonne('FAMILLE', ['POMPES', 'VANNES', 'ECHANGEURS', 'POMPES']),
    colonne('CODE_FOURNI', ['', '', 'ECH-P', ''])
];
const NOMENCLATURE = [
    colonne('FAMILLE', ['POMPES', 'POMPES', 'VANNES', 'ECHANGEURS']),
    colonne('SYSTEME', ['Transfert', 'Vide', 'Sectionnement', 'Thermique']),
    colonne('SOUS_SYSTEME', ['Centrifuge', 'Anneau liquide', 'Quart de tour', 'Plaques']),
    colonne('LIBELLE_TYPE', ['Pompe centrifuge', 'Pompe a vide', 'Vanne papillon', 'Echangeur a plaques']),
    colonne('CODE_TYPE', ['PMP-C', 'PMP-V', 'VAN-P', 'ECH-P'])
];

test('un code se reconnaît à des valeurs uniques et courtes, pas seulement à son nom', () => {
    assert.ok(
        scoreDeCode(colonne('CODE_TYPE', ['PMP-C', 'VAN-P', 'ECH-P'])) >
            scoreDeCode(colonne('LIBELLE_TYPE', ['Pompe centrifuge', 'Vanne papillon', 'Echangeur a plaques']))
    );
    assert.equal(scoreDeCode(colonne('FAMILLE', ['POMPES', 'POMPES', 'VANNES'])), 0, 'une colonne pleine de doublons n’identifie rien');
    assert.equal(scoreDeCode(colonne('VIDE', ['', '', ''])), 0);
});

test('un nom trompeur ne suffit pas : « code postal » n’est pas un code de référentiel', () => {
    const postal = colonne('CODE_POSTAL', ['75001', '69001', '13001']);
    const vrai = colonne('CODE_TYPE', ['PMP-C', 'VAN-P', 'ECH-P']);
    assert.ok(scoreDeCode(vrai) > scoreDeCode(postal));
});

test('un libellé se reconnaît au texte, aux espaces et à la variété', () => {
    assert.ok(
        scoreDeLibelle(colonne('LIBELLE', ['Pompe centrifuge alimentaire', 'Vanne papillon DN100'])) >
            scoreDeLibelle(colonne('REPERE', ['EQ001', 'EQ002']))
    );
});

test('le recouvrement dit si deux colonnes parlent de la même chose, accents et casse ignorés', () => {
    assert.equal(recouvrement(colonne('A', ['POMPES', 'VANNES']), colonne('B', ['Pompes', 'Vannes', 'Echangeurs'])), 1);
    assert.equal(recouvrement(colonne('A', ['POMPES', 'ZZZ']), colonne('B', ['POMPES'])), 0.5);
    assert.equal(recouvrement(colonne('A', ['X']), colonne('B', [])), 0);
});

test('les niveaux de l’arbre se rangent du moins de valeurs différentes au plus, le type en feuille', () => {
    assert.deepEqual(devinerLesNiveaux(NOMENCLATURE, 'CODE_TYPE', 'LIBELLE_TYPE'), ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE']);
});

test('un second code n’est jamais pris pour un niveau de l’arbre : un niveau regroupe, un code non', () => {
    const avecAbrege = [...NOMENCLATURE, colonne('ABREGE', ['PC', 'PV', 'VP', 'EP'])];
    assert.deepEqual(devinerLesNiveaux(avecAbrege, 'CODE_TYPE', 'LIBELLE_TYPE'), ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE']);
});

test('la branche se devine par les valeurs communes, même si les colonnes ne portent pas le même nom', () => {
    const branche = devinerLaBranche(LISTE, NOMENCLATURE, ['CODE_TYPE', 'LIBELLE_TYPE']);
    assert.equal(branche?.source, 'FAMILLE');
    assert.equal(branche?.nomenclature, 'FAMILLE');
    assert.equal(branche?.part, 1);
    const renommee = NOMENCLATURE.map(candidate => (candidate.nom === 'FAMILLE' ? { ...candidate, nom: 'CLASSE' } : candidate));
    assert.equal(devinerLaBranche(LISTE, renommee, ['CODE_TYPE', 'LIBELLE_TYPE'])?.nomenclature, 'CLASSE');
});

test('deux tables sans rien de commun ne proposent aucune branche, plutôt qu’une mauvaise', () => {
    const etrangere = [colonne('PAYS', ['France', 'Italie']), colonne('DEVISE', ['EUR', 'USD'])];
    assert.equal(devinerLaBranche(LISTE, etrangere, []), undefined);
});

test('la proposition complète : tout est trouvé, et chaque choix est justifié en français', () => {
    const proposition = devinerLaCodification(LISTE, NOMENCLATURE);
    assert.equal(proposition.colonneLibelle, 'LIBELLE');
    assert.equal(proposition.colonneCode, 'CODE_TYPE');
    assert.equal(proposition.colonneLibelleRef, 'LIBELLE_TYPE');
    assert.deepEqual(proposition.niveaux, ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE']);
    assert.equal(proposition.restreindreSource, 'FAMILLE');
    assert.equal(proposition.restreindreNomenclature, 'FAMILLE');
    assert.equal(proposition.colonneCodeExistant, 'CODE_FOURNI', 'la colonne à moitié vide porte déjà des codes du référentiel');
    assert.ok(proposition.raisons.length >= 5, 'chaque choix dit pourquoi');
    assert.match(proposition.raisons.join(' '), /« LIBELLE » porte le libellé/);
    assert.match(proposition.raisons.join(' '), /FAMILLE › SYSTEME › SOUS_SYSTEME › LIBELLE_TYPE/);
});

test('une nomenclature réduite au minimum est devinée quand même, sans niveaux inventés', () => {
    const minimale = [colonne('CODE', ['A1', 'B2']), colonne('LIBELLE', ['Premier type', 'Second type'])];
    const proposition = devinerLaCodification(LISTE, minimale);
    assert.equal(proposition.colonneCode, 'CODE');
    assert.equal(proposition.colonneLibelleRef, 'LIBELLE');
    assert.deepEqual(proposition.niveaux, ['LIBELLE'], 'le type seul fait tout le chemin');
    assert.equal(proposition.restreindreSource, '', 'rien de commun : on cherche dans tout l’arbre');
});
