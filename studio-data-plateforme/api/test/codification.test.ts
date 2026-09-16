/** Tests unitaires de la codification (fonctions pures : du SQL fabriqué, des comptes interprétés). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    Codification,
    ErreurCodification,
    RegleCodification,
    bilanDeCodification,
    conditionDeBranche,
    conditionDeLaRegle,
    correspondanceApresDecision,
    motCompare,
    schemaCodification,
    sqlDeCodification,
    sqlDesCasARevoir
} from '../src/codification/codification';

const contexte = { nomTableDe: (nom: string) => 't_' + nom };
const codification = (partielle: object = {}): Codification =>
    schemaCodification.parse({
        id: 'cd1',
        nom: 'Équipements',
        source: 'equipements',
        colonneLibelle: 'LIBELLE',
        nomenclature: 'nomenclature',
        colonneCode: 'CODE_TYPE',
        colonneLibelleRef: 'LIBELLE_TYPE',
        niveaux: ['FAMILLE', 'SYSTEME', 'SOUS_SYSTEME', 'LIBELLE_TYPE'],
        ...partielle
    });
const regle = (partielle: Partial<RegleCodification> = {}): RegleCodification => ({
    id: 'r1',
    actif: true,
    code: 'PMP-C',
    colonne: '',
    type: 'motscles',
    contient: ['pompe'],
    ou: false,
    sauf: [],
    motif: '',
    ...partielle
});

test('mot réduit : accents, casse et ponctuation effacés, pour comparer ce qu’un humain compare', () => {
    assert.equal(motCompare('Pompe centrifuge (X2)'), 'POMPE CENTRIFUGE X2');
    assert.equal(motCompare('  ÉLECTRO-VANNE  '), 'ELECTRO VANNE');
    assert.equal(motCompare('///'), '');
});

test('règle de mots-clés : tous les mots par défaut, un seul avec « ou », et les exclusions sont respectées', () => {
    const tous = conditionDeLaRegle(regle({ contient: ['pompe', 'centrifuge'] }), 'LIBELLE');
    assert.equal(tous.split(' AND ').length, 2, 'les deux mots sont exigés');
    assert.match(tous, /LIKE '%POMPE%'/);
    const unSeul = conditionDeLaRegle(regle({ contient: ['pompe', 'motopompe'], ou: true }), 'LIBELLE');
    assert.match(unSeul, / OR /);
    const avecExclusion = conditionDeLaRegle(regle({ contient: ['pompe'], sauf: ['à vide'] }), 'LIBELLE');
    assert.match(avecExclusion, /AND NOT .*LIKE '%A VIDE%'/);
});

test('règle : une expression régulière pour les cas tordus, et une règle vide est refusée en clair', () => {
    assert.match(conditionDeLaRegle(regle({ type: 'expression', motif: '^VAN[NE]' }), 'LIBELLE'), /regexp_matches\(.*'\^VAN\[NE\]'\)/);
    assert.throws(() => conditionDeLaRegle(regle({ contient: [] }), 'LIBELLE'), ErreurCodification);
    assert.throws(() => conditionDeLaRegle(regle({ type: 'expression', motif: '  ' }), 'LIBELLE'), ErreurCodification);
    assert.throws(() => conditionDeLaRegle(regle(), ''), /quelle colonne/);
});

test('règle : une colonne à soi, quand ce n’est pas le libellé qui porte l’indice', () => {
    assert.match(conditionDeLaRegle(regle({ colonne: 'MARQUE' }), 'LIBELLE'), /s\."MARQUE"/);
});

test('branche : sans restriction on cherche partout ; avec, on reste dans la famille — sauf si elle est vide', () => {
    assert.equal(conditionDeBranche(codification()), 'TRUE');
    const restreinte = conditionDeBranche(codification({ restreindreSource: 'FAMILLE', restreindreNomenclature: 'FAMILLE' }));
    assert.match(restreinte, /s\."FAMILLE"/);
    assert.match(restreinte, /n\."FAMILLE"/);
    assert.match(restreinte, / OR .*IS NULL/, 'une ligne sans famille est cherchée dans tout l’arbre');
});

test('SQL : les règles sont empilées dans l’ordre, le code déjà présent d’abord, la correspondance ensuite', () => {
    const sql = sqlDeCodification(
        codification({
            colonneCodeExistant: 'CODE_FOURNI',
            correspondances: [{ libelle: 'Pompe centrifuge', code: 'PMP-C', auteur: '', le: '' }],
            regles: [regle({ id: 'r1', code: 'VAN', contient: ['vanne'] })]
        }),
        contexte
    );
    const pile = sql.slice(sql.indexOf('CASE WHEN'), sql.indexOf('AS __code_regle'));
    assert.ok(pile.indexOf('CODE_FOURNI') < pile.indexOf('corr.code'), 'le code déjà renseigné passe avant tout');
    assert.ok(pile.indexOf('corr.code') < pile.indexOf('VANNE'), 'la table de correspondance passe avant les règles');
    assert.match(sql, /'regle:r1'/, 'l’origine nomme la règle qui a répondu');
    assert.match(sql, /POMPE CENTRIFUGE/, 'le libellé de la correspondance est réduit comme les autres');
});

test('ressemblance : par défaut on compte les mots du type de référence retrouvés dans le libellé', () => {
    const sql = sqlDeCodification(codification(), contexte);
    assert.match(sql, /string_split/, 'le libellé est découpé en mots');
    assert.match(sql, /list_transform/);
    assert.match(sql, /length\(motRef\) >= 4/, 'une faute n’est tolérée qu’à partir de quatre lettres');
    assert.match(sql, /jaro_winkler_similarity\(motLu, motRef\) >= 0\.9/, 'un mot mal orthographié compte quand même');
    assert.equal(codification().methode, 'mots', 'c’est la méthode retenue par défaut');
});

test('SQL : la ressemblance ne cherche que pour les lignes qu’aucune règle n’a reconnues', () => {
    const sql = sqlDeCodification(codification({ methode: 'jw' }), contexte);
    assert.match(sql, /jaro_winkler_similarity/);
    assert.match(sql, /WHERE r\.__code_regle IS NULL/);
    assert.match(sql, /row_number\(\) OVER \(PARTITION BY r\.__rn ORDER BY __score_voisin DESC\) = 1/);
    assert.match(sqlDeCodification(codification({ methode: 'lev' }), contexte), /1\.0 - levenshtein/);
});

test('SQL : chaque ligne repart avec son code, son origine, son score, son statut et son chemin dans l’arbre', () => {
    const sql = sqlDeCodification(codification(), contexte);
    for (const colonne of ['__code', '__origine', '__score', '__statut', '__chemin']) assert.match(sql, new RegExp(`AS ${colonne}\\b`));
    assert.match(sql, /' › '/, 'le chemin est déplié niveau par niveau');
    assert.match(sql, /'office'.*'revoir'.*'absent'/s);
});

test('SQL : une codification incomplète est refusée en français, pas en erreur SQL', () => {
    assert.throws(() => sqlDeCodification(codification({ colonneLibelle: '' }), contexte), /la colonne du libellé/);
    assert.throws(() => sqlDeCodification(codification({ nomenclature: '' }), contexte), /la nomenclature/);
    assert.throws(() => sqlDeCodification(codification({ seuilAuto: 0.5, seuilRevoir: 0.9 }), contexte), /ne peut pas dépasser/);
});

test('SQL de la revue : les meilleures propositions par ligne, les plus probables d’abord', () => {
    const sql = sqlDesCasARevoir(codification(), contexte, 25);
    assert.match(sql, /__statut = 'revoir'/);
    assert.match(sql, /LIMIT 25/);
    assert.match(sql, /row_number\(\) OVER \(PARTITION BY aCoder\.__rn ORDER BY score DESC\) <= 3/);
});

test('bilan : la couverture et la phrase disent où l’on en est, sans jargon', () => {
    const bilan = bilanDeCodification([
        { statut: 'office', lignes: 812 },
        { statut: 'revoir', lignes: 47 },
        { statut: 'absent', lignes: 6 }
    ]);
    assert.equal(bilan.total, 865);
    assert.equal(bilan.couverture, 0.939);
    assert.match(bilan.phrase, /812 ligne\(s\) codées d’office sur 865 \(94 %\)/);
    assert.match(bilan.phrase, /47 à revoir, 6 sans proposition/);
    assert.match(bilanDeCodification([{ statut: 'office', lignes: 10 }]).phrase, /rien à revoir/);
    assert.match(bilanDeCodification([]).phrase, /Aucune ligne à coder/);
});

test('décision : le libellé tranché entre dans la table de correspondance, et un code vide l’en retire', () => {
    const posee = correspondanceApresDecision([], 'Pompe centrifuge', 'PMP-C', 'Alice', '2026-09-16');
    assert.deepEqual(posee, [{ libelle: 'Pompe centrifuge', code: 'PMP-C', auteur: 'Alice', le: '2026-09-16' }]);
    const remplacee = correspondanceApresDecision(posee, 'POMPE  CENTRIFUGE', 'PMP-V', 'Bob', '2026-09-17');
    assert.equal(remplacee.length, 1, 'le même libellé écrit autrement remplace le précédent, il ne s’ajoute pas');
    assert.equal(remplacee[0].code, 'PMP-V');
    assert.deepEqual(correspondanceApresDecision(remplacee, 'Pompe centrifuge', '', 'Bob', '2026-09-17'), []);
});
