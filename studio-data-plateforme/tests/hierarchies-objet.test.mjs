/**
 * Tests des hiérarchies d'un objet métier (V13) : les niveaux, leurs parents admis, et la lecture de l'audit.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    ajouterUnNiveau,
    arbreConforme,
    basculerUnParentAdmis,
    cequiManquePourAuditer,
    estUneRacine,
    hierarchieNeuve,
    hierarchiesDe,
    parentsPossibles,
    resumeDeLaHierarchie,
    retirerUnNiveau,
    tuilesDeLAudit
} from '../web/src/app/pages/objets-metier/hierarchies-objet.ts';

const identifiants = () => {
    let rang = 0;
    return prefixe => prefixe + ++rang;
};
const arbre = () => {
    const hierarchie = hierarchieNeuve(identifiants(), 0);
    hierarchie.typeCol = 'type';
    ['SITE', 'BATIMENT', 'LOCAL'].forEach(nom => ajouterUnNiveau(hierarchie, nom));
    basculerUnParentAdmis(hierarchie, 'BATIMENT', 'SITE');
    basculerUnParentAdmis(hierarchie, 'LOCAL', 'BATIMENT');
    return hierarchie;
};

test('une hiérarchie neuve porte le parent dans la même table, ce qui est le cas courant', () => {
    const neuve = hierarchieNeuve(identifiants(), 0);
    assert.equal(neuve.mode, 'self');
    assert.equal(neuve.name, 'Hiérarchie 1');
    assert.deepEqual(neuve.levels, []);
});

test('un objet sans hiérarchie n’en invente pas', () => {
    assert.deepEqual(hierarchiesDe({}), []);
});

test('un niveau écrit en simple texte redevient un niveau sans parent admis', () => {
    const objet = { hierarchies: [{ id: 'bh_1', name: 'H', mode: 'self', levels: ['SITE', { name: 'LOCAL', parents: ['SITE'] }] }] };
    const [hierarchie] = hierarchiesDe(objet);
    assert.deepEqual(hierarchie.levels, [
        { name: 'SITE', parents: [] },
        { name: 'LOCAL', parents: ['SITE'] }
    ]);
});

test('un niveau ne s’ajoute pas deux fois, quelle que soit la casse', () => {
    const hierarchie = hierarchieNeuve(identifiants(), 0);
    assert.equal(ajouterUnNiveau(hierarchie, 'SITE'), true);
    assert.equal(ajouterUnNiveau(hierarchie, 'site'), false, 'le même niveau deux fois rendrait les parents ambigus');
    assert.equal(ajouterUnNiveau(hierarchie, '   '), false);
    assert.equal(hierarchie.levels.length, 1);
});

test('retirer un niveau le retire aussi des parents admis des autres', () => {
    const hierarchie = arbre();
    retirerUnNiveau(hierarchie, 'SITE');
    assert.deepEqual(
        hierarchie.levels.map(niveau => niveau.name),
        ['BATIMENT', 'LOCAL']
    );
    assert.deepEqual(hierarchie.levels[0].parents, [], 'un parent disparu n’est plus admis');
});

test('cocher puis décocher un parent admis', () => {
    const hierarchie = arbre();
    assert.deepEqual(hierarchie.levels[1].parents, ['SITE']);
    basculerUnParentAdmis(hierarchie, 'BATIMENT', 'SITE');
    assert.deepEqual(hierarchie.levels[1].parents, []);
    basculerUnParentAdmis(hierarchie, 'INCONNU', 'SITE');
    assert.equal(hierarchie.levels.length, 3, 'un niveau inconnu ne casse rien');
});

test('un niveau ne peut pas être son propre parent', () => {
    const hierarchie = arbre();
    assert.deepEqual(
        parentsPossibles(hierarchie, 'BATIMENT').map(niveau => niveau.name),
        ['SITE', 'LOCAL']
    );
});

test('un niveau sans parent admis est une racine', () => {
    const hierarchie = arbre();
    assert.equal(estUneRacine(hierarchie.levels[0]), true);
    assert.equal(estUneRacine(hierarchie.levels[1]), false);
});

test('on dit ce qui manque avant d’aller interroger les données', () => {
    const hierarchie = hierarchieNeuve(identifiants(), 0);
    assert.match(cequiManquePourAuditer(hierarchie), /colonne qui pointe vers le parent/);
    hierarchie.childCol = 'code_parent';
    hierarchie.parentKeyCol = 'code';
    assert.equal(cequiManquePourAuditer(hierarchie), '');
    hierarchie.mode = 'link';
    assert.match(cequiManquePourAuditer(hierarchie), /table de liaison/);
});

test('la hiérarchie se résume sous son nom', () => {
    const hierarchie = arbre();
    hierarchie.childCol = 'code_parent';
    hierarchie.parentKeyCol = 'code';
    hierarchie.maxDepth = '4';
    assert.equal(resumeDeLaHierarchie(hierarchie), 'code_parent → code · 3 niveau(x) · profondeur ≤ 4');
    hierarchie.mode = 'link';
    hierarchie.linkTable = 'liens.csv';
    assert.match(resumeDeLaHierarchie(hierarchie), /^via liens\.csv/);
});

const auditVide = {
    total: 120,
    racines: 3,
    orphelins: 0,
    bouclesSurSoi: 0,
    violationsDeNiveau: 0,
    typesInconnus: 0,
    profondeurMaximale: null,
    auDelaDeLaProfondeur: null
};

test('l’audit se lit en tuiles, et la profondeur n’apparaît que si elle a été mesurée', () => {
    assert.deepEqual(
        tuilesDeLAudit(auditVide).map(tuile => tuile.libelle),
        ['lignes', 'racines', 'orphelins', 'parent d’elles-mêmes', 'parents non admis', 'types non déclarés']
    );
    const avecProfondeur = tuilesDeLAudit({ ...auditVide, profondeurMaximale: 3, auDelaDeLaProfondeur: 0 });
    assert.equal(avecProfondeur.length, 8);
    assert.equal(avecProfondeur.at(-1).libelle, 'au-delà de la limite');
});

test('un arbre est conforme quand aucune tuile inquiétante n’est peuplée', () => {
    assert.equal(arbreConforme(auditVide), true);
    assert.equal(arbreConforme({ ...auditVide, orphelins: 2 }), false);
    assert.equal(arbreConforme({ ...auditVide, racines: 50 }), true, 'beaucoup de racines n’est pas une faute');
});
