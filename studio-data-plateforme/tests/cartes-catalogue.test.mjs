/**
 * Tests des cartes du catalogue : allure d'un type, surtitre, pastille de responsable, seuils de qualité,
 * libellés de confidentialité et de validation, limite d'affichage, fraîcheur lisible.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ALLURES_DE_TYPE,
    CARTES_MONTREES,
    allureDe,
    cartesLimitees,
    classeDeQualite,
    couleurDeResponsable,
    fraicheurLisible,
    initialesDe,
    libelleDeConfidentialite,
    libelleDeValidation,
    surtitreDe
} from '../web/src/app/pages/catalogue/cartes-catalogue.ts';

const entree = (proprietes = {}) => ({
    type: 'bo',
    id: 'bo_1',
    titre: 'Client',
    sousTitre: '3 attribut(s)',
    description: '',
    domaine: 'Ventes',
    proprietaire: '',
    qualite: null,
    sensibilite: null,
    validation: null,
    etiquettes: [],
    motsCles: [],
    lien: '/objets-metier',
    fraicheur: null,
    ...proprietes
});

test('les treize types du catalogue ont tous une allure', () => {
    const types = Object.keys(ALLURES_DE_TYPE);
    assert.equal(types.length, 13);
    for (const type of types) {
        const allure = ALLURES_DE_TYPE[type];
        assert.match(allure.couleur, /^#[0-9a-f]{6}$/, `${type} a une couleur`);
        assert.ok(allure.pictogramme, `${type} a un pictogramme`);
        assert.ok(allure.libelle, `${type} a un libellé`);
    }
});

test('un type inconnu retombe sur l’allure d’une table, jamais sur du vide', () => {
    assert.deepEqual(allureDe('inconnu'), ALLURES_DE_TYPE.table);
    assert.equal(allureDe('bo').libelle, 'Objet métier');
});

test('le surtitre annonce le type, et le domaine seulement quand il est renseigné', () => {
    assert.equal(surtitreDe(entree()), 'Objet métier · Ventes');
    assert.equal(surtitreDe(entree({ domaine: '—' })), 'Objet métier');
    assert.equal(surtitreDe(entree({ domaine: '' })), 'Objet métier');
});

test('les initiales d’un responsable tiennent en deux lettres', () => {
    assert.equal(initialesDe('Alice Martin'), 'AM');
    assert.equal(initialesDe('alice'), 'A');
    assert.equal(initialesDe('Jean-Pierre Durand Dupont'), 'JD');
    assert.equal(initialesDe(''), '');
});

test('la couleur d’un responsable est toujours la même, et fait partie de la palette', () => {
    const palette = ['#2563eb', '#059669', '#8b5cf6', '#f59e0b', '#0ea5e9', '#dc2626', '#0f172a'];
    assert.equal(couleurDeResponsable('Alice'), couleurDeResponsable('Alice'));
    assert.ok(palette.includes(couleurDeResponsable('Alice')));
    assert.ok(palette.includes(couleurDeResponsable('Bob')));
    assert.notEqual(couleurDeResponsable('Alice'), couleurDeResponsable('Alice Martin'));
});

test('la pastille de qualité change à 90 et à 70', () => {
    assert.equal(classeDeQualite(100), 'qualite-bonne');
    assert.equal(classeDeQualite(90), 'qualite-bonne');
    assert.equal(classeDeQualite(89), 'qualite-moyenne');
    assert.equal(classeDeQualite(70), 'qualite-moyenne');
    assert.equal(classeDeQualite(69), 'qualite-mauvaise');
    assert.equal(classeDeQualite(0), 'qualite-mauvaise');
});

test('confidentialité et validation ne s’affichent que lorsqu’elles sont déclarées', () => {
    assert.equal(libelleDeConfidentialite('perso'), '🛡 Personnelle');
    assert.equal(libelleDeConfidentialite('conf'), '🔒 Confidentiel');
    assert.equal(libelleDeConfidentialite('non'), 'Non sensible');
    assert.equal(libelleDeConfidentialite(null), '');
    assert.equal(libelleDeValidation('ok'), '✓ Validé');
    assert.equal(libelleDeValidation('pending'), '◷ À valider');
    assert.equal(libelleDeValidation(null), '');
});

test('au-delà de soixante résultats, le catalogue s’arrête et dit combien il en reste', () => {
    const beaucoup = Array.from({ length: 75 }, (rien, rang) => entree({ id: 'bo_' + rang }));
    const limite = cartesLimitees(beaucoup);
    assert.equal(limite.visibles.length, CARTES_MONTREES);
    assert.equal(limite.restantes, 15);
    const peu = cartesLimitees(beaucoup.slice(0, 5));
    assert.equal(peu.visibles.length, 5);
    assert.equal(peu.restantes, 0, 'en deçà du seuil, rien n’est annoncé comme restant');
});

test('la fraîcheur ne s’écrit que si elle est connue', () => {
    const formater = quand => new Date(quand).toLocaleDateString('fr-FR');
    assert.equal(fraicheurLisible(Date.UTC(2026, 0, 15, 12), formater), '↻ 15/01/2026');
    assert.equal(fraicheurLisible(null, formater), '');
    assert.equal(fraicheurLisible(0, formater), '', 'un horodatage vide n’est pas une date');
});
