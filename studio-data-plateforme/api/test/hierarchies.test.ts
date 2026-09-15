/** Tests unitaires de l'audit d'arbre d'un objet métier (fonctions pures, aucun moteur). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    Hierarchie,
    cequiManquePourAuditer,
    conditionDeTypeInconnu,
    conditionDeViolationDeNiveau,
    phraseDeLAudit,
    profondeurMesurable,
    sqlAuditDeLArbre,
    sqlProfondeurDeLArbre
} from '../src/gouvernance/hierarchies';

const danssaTable = (reste: Partial<Hierarchie> = {}): Hierarchie => ({
    id: 'bh_1',
    name: 'Implantation',
    mode: 'self',
    childCol: 'code_parent',
    parentKeyCol: 'code',
    ...reste
});

test('on dit ce qui manque plutôt que d’auditer une déclaration incomplète', () => {
    assert.equal(cequiManquePourAuditer(danssaTable()), '');
    assert.match(cequiManquePourAuditer(danssaTable({ childCol: '' })), /colonne qui pointe vers le parent/);
    assert.match(cequiManquePourAuditer({ id: 'h', name: 'H', mode: 'link' }), /table de liaison/);
    assert.match(cequiManquePourAuditer({ id: 'h', name: 'H', mode: 'link', linkTable: 'liens.csv' }), /colonnes enfant et parent/);
    assert.match(
        cequiManquePourAuditer({ id: 'h', name: 'H', mode: 'link', linkTable: 'l', linkChildCol: 'a', linkParentCol: 'b' }),
        /colonne clé de la table maître/
    );
});

test('les clés sont comparées sans espaces ni casse, le vide valant absence', () => {
    const sql = sqlAuditDeLArbre(danssaTable(), 't_sites');
    assert.match(sql, /NULLIF\(UPPER\(TRIM\(CAST\(enfant\."code_parent" AS VARCHAR\)\)\), ''\)/);
    assert.match(sql, /LEFT JOIN "t_sites" parent/);
});

test('l’audit compte les racines, les orphelins et les lignes parent d’elles-mêmes', () => {
    const sql = sqlAuditDeLArbre(danssaTable(), 't_sites');
    assert.match(sql, /AS total/);
    assert.match(sql, /AS racines/);
    assert.match(sql, /AS orphelins/);
    assert.match(sql, /AS bouclesSurSoi/);
});

test('par table de liaison, l’arbre passe par la liaison et revient sur la table maître', () => {
    const parLiaison = sqlAuditDeLArbre(
        { id: 'h', name: 'H', mode: 'link', linkTable: 'liens.csv', linkChildCol: 'fils', linkParentCol: 'pere', parentKeyCol: 'code' },
        't_sites',
        't_liens'
    );
    assert.match(parLiaison, /LEFT JOIN "t_liens" lien ON/);
    assert.match(parLiaison, /LEFT JOIN "t_sites" parent ON/);
});

test('sans colonne de type ni niveaux, aucune violation n’est cherchée', () => {
    assert.equal(conditionDeViolationDeNiveau(danssaTable()), 'FALSE');
    assert.equal(conditionDeTypeInconnu(danssaTable()), 'FALSE');
    assert.equal(conditionDeViolationDeNiveau(danssaTable({ typeCol: 'type' })), 'FALSE', 'une colonne de type sans niveau ne dit rien');
});

test('un niveau sans parent admis est racine : en avoir un est une violation', () => {
    // Chaque niveau est éprouvé seul : ensemble, leurs conditions sont jointes par « OR » et se mêleraient.
    const pourSite = conditionDeViolationDeNiveau(danssaTable({ typeCol: 'type', levels: [{ name: 'SITE', parents: [] }] }));
    // Le niveau racine n'admet aucun parent : en avoir un suffit à le mettre en faute.
    assert.match(pourSite, /'SITE'/);
    assert.ok(!pourSite.includes('NOT IN'), 'un niveau racine n’a pas de liste de parents admis à vérifier');
    // Un niveau qui admet des parents est en faute quand le type du sien n'est pas dans sa liste.
    const pourBatiment = conditionDeViolationDeNiveau(danssaTable({ typeCol: 'type', levels: [{ name: 'BATIMENT', parents: ['SITE'] }] }));
    assert.match(pourBatiment, /'BATIMENT'/);
    assert.match(pourBatiment, /NOT IN \('SITE'\)/);
});

test('un type présent dans les données mais non déclaré est signalé', () => {
    const condition = conditionDeTypeInconnu(danssaTable({ typeCol: 'type', levels: [{ name: 'SITE', parents: [] }] }));
    assert.match(condition, /NOT IN \('SITE'\)/);
});

test('les niveaux sont comparés en capitales, comme les clés', () => {
    const condition = conditionDeTypeInconnu(danssaTable({ typeCol: 'type', levels: [{ name: 'Bâtiment', parents: [] }] }));
    assert.match(condition, /'BÂTIMENT'/);
});

test('la profondeur ne se mesure que sur un arbre porté par la table, et si une limite est annoncée', () => {
    assert.equal(profondeurMesurable(danssaTable()), 0, 'sans limite annoncée, rien à mesurer');
    assert.equal(profondeurMesurable(danssaTable({ maxDepth: '4' })), 4);
    assert.equal(profondeurMesurable(danssaTable({ maxDepth: '0' })), 0);
    assert.equal(profondeurMesurable({ id: 'h', name: 'H', mode: 'link', maxDepth: '4' }), 0, 'par liaison, on ne descend pas');
});

test('la descente s’arrête un peu au-delà de la limite : un arbre bouclé ne doit pas tourner sans fin', () => {
    const sql = sqlProfondeurDeLArbre(danssaTable({ maxDepth: '4' }), 't_sites', 4);
    assert.match(sql, /WITH RECURSIVE descente AS/);
    assert.match(sql, /profondeur <= 7/, 'quatre annoncés, plus la marge de trois');
    assert.match(sql, /WHEN profondeur > 4 THEN 1/);
});

test('l’audit se raconte : conforme, ou le compte de ce qui cloche', () => {
    const conforme = {
        total: 120,
        racines: 3,
        orphelins: 0,
        bouclesSurSoi: 0,
        violationsDeNiveau: 0,
        typesInconnus: 0,
        profondeurMaximale: 3,
        auDelaDeLaProfondeur: 0
    };
    assert.equal(phraseDeLAudit(conforme), 'Arbre conforme : 120 ligne(s), 3 racine(s).');
    assert.equal(
        phraseDeLAudit({ ...conforme, orphelins: 2, violationsDeNiveau: 1, auDelaDeLaProfondeur: 5 }),
        '120 ligne(s) — 2 orphelin(s) · 1 parent(s) non admis · 5 ligne(s) au-delà de la profondeur annoncée.'
    );
});
