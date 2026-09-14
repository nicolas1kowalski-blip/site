/**
 * Tests du geste inverse (V11) : ce que fait « ⟲ Annuler » selon ce que l'on vient de faire.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { questionAvantSuppression, retourDUneEcriture, retourDUneSuppression } from '../web/src/app/coeur/gestes-annulables.ts';

/** Un faux référentiel : il note ce qu'on lui demande, sans réseau ni serveur. */
function referentielDEssai() {
    const journal = [];
    return {
        journal,
        moyens: {
            ecrire: async (id, contenu) => journal.push({ geste: 'ecrire', id, contenu }),
            effacer: async id => journal.push({ geste: 'effacer', id }),
            relire: async () => journal.push({ geste: 'relire' })
        }
    };
}

test('annuler une modification réécrit la version d’avant, sans son identifiant dans le contenu', async () => {
    const essai = referentielDEssai();
    const avant = { id: 'bo_1', name: 'Client', definition: 'La définition d’avant.' };
    const geste = retourDUneEcriture('l’objet métier « Client »', 'bo_1', avant, essai.moyens);
    await geste.retablir();
    assert.deepEqual(essai.journal, [
        { geste: 'ecrire', id: 'bo_1', contenu: { name: 'Client', definition: 'La définition d’avant.' } },
        { geste: 'relire' }
    ]);
});

test('annuler une création efface l’élément : il n’existait pas avant', async () => {
    const essai = referentielDEssai();
    const geste = retourDUneEcriture('l’objet métier « Contrat »', 'bo_2', null, essai.moyens);
    await geste.retablir();
    assert.deepEqual(essai.journal, [{ geste: 'effacer', id: 'bo_2' }, { geste: 'relire' }]);
});

test('annuler une suppression remet l’élément, identifiant compris', async () => {
    const essai = referentielDEssai();
    const supprime = { id: 'gl_7', term: 'Encours', definition: 'Le montant restant dû.' };
    const geste = retourDUneSuppression('le terme « Encours »', supprime, essai.moyens);
    await geste.retablir();
    assert.deepEqual(essai.journal, [
        { geste: 'ecrire', id: 'gl_7', contenu: { term: 'Encours', definition: 'Le montant restant dû.' } },
        { geste: 'relire' }
    ]);
});

test('le geste garde en clair ce qu’il défait : c’est ce que lit la notification', () => {
    const essai = referentielDEssai();
    assert.equal(retourDUneEcriture('le terme « Encours »', 'gl_7', null, essai.moyens).quoi, 'le terme « Encours »');
});

test('la question posée avant une suppression nomme la chose et rappelle qu’on peut revenir en arrière', () => {
    const question = questionAvantSuppression('l’objet métier « Client »');
    assert.ok(question.includes('l’objet métier « Client »'));
    assert.ok(/Annuler|Ctrl\+Z/.test(question));
});
