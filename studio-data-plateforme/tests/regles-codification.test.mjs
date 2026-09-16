/** Tests des fonctions pures de l'écran de codification : lire une règle, un statut, une origine, un score. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    allureDuScore,
    allureDuStatut,
    motsSaisis,
    phraseDeLOrigine,
    phraseDeLaRegle,
    prochaineAction,
    saisieDesMots,
    scoreLisible
} from '../web/src/app/pages/codification/regles-codification.ts';

const regle = (partielle = {}) => ({
    id: 'r1',
    actif: true,
    code: 'PMP-C',
    colonne: '',
    type: 'motscles',
    contient: ['POMPE'],
    ou: false,
    sauf: [],
    motif: '',
    ...partielle
});

test('une règle se lit à voix haute, avec ses et, ses ou et ses exclusions', () => {
    assert.equal(
        phraseDeLaRegle(regle({ contient: ['POMPE', 'CENTRIFUGE'], sauf: ['VIDE'] }), 'LIBELLE'),
        'si LIBELLE contient POMPE et CENTRIFUGE mais pas VIDE → PMP-C'
    );
    assert.match(phraseDeLaRegle(regle({ contient: ['POMPE', 'MOTOPOMPE'], ou: true }), 'LIBELLE'), /POMPE ou MOTOPOMPE/);
    assert.match(phraseDeLaRegle(regle({ colonne: 'MARQUE' }), 'LIBELLE'), /^si MARQUE contient/);
});

test('une règle incomplète le dit, plutôt que de faire semblant', () => {
    assert.match(phraseDeLaRegle(regle({ contient: [] }), 'LIBELLE'), /il manque les mots/);
    assert.match(phraseDeLaRegle(regle({ type: 'expression', motif: '  ' }), 'LIBELLE'), /il manque l'expression/);
    assert.match(phraseDeLaRegle(regle({ type: 'expression', motif: '^VAN' }), 'LIBELLE'), /correspond à « \^VAN » → PMP-C/);
});

test('les mots se saisissent séparés par des virgules ou des points-virgules, et se relisent', () => {
    assert.deepEqual(motsSaisis(' pompe ; centrifuge,  , vide '), ['pompe', 'centrifuge', 'vide']);
    assert.deepEqual(motsSaisis(''), []);
    assert.equal(saisieDesMots(['pompe', 'vide']), 'pompe ; vide');
});

test('statuts et origines sont dits en clair, jamais en identifiants techniques', () => {
    assert.equal(allureDuStatut('office').libelle, "Codé d'office");
    assert.equal(allureDuStatut('revoir').allure, 'alerte');
    assert.equal(allureDuStatut('inconnu').libelle, 'inconnu');
    assert.equal(phraseDeLOrigine('regle:r1', [regle()]), 'règle « PMP-C »');
    assert.equal(phraseDeLOrigine('regle:disparue', [regle()]), 'règle supprimée depuis');
    assert.equal(phraseDeLOrigine('decision', []), 'décision prise à la revue');
});

test('un score se lit en pour cent, et se colore selon la confiance qu’on peut lui faire', () => {
    assert.equal(scoreLisible(0.934), '93 %');
    assert.equal(scoreLisible(1), '100 %');
    assert.equal(allureDuScore(1, 0.99), 'succes');
    assert.equal(allureDuScore(0.6, 0.99), 'alerte');
    assert.equal(allureDuScore(0.2, 0.99), 'neutre');
});

test('l’écran dit toujours quoi faire ensuite, plutôt que de laisser devant un tas', () => {
    assert.match(prochaineAction(null), /Choisissez la liste/);
    assert.match(prochaineAction({ total: 100, revoir: 47, absent: 6 }), /Passez les 47 cas à revoir/);
    assert.match(prochaineAction({ total: 100, revoir: 0, absent: 6 }), /6 ligne\(s\) sans proposition/);
    assert.match(prochaineAction({ total: 100, revoir: 0, absent: 0 }), /Tout est codé/);
});
