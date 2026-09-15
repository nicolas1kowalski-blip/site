/**
 * Tests des personnes et des rôles : allure d'un rôle, résumé, usage d'un domaine, reconnaissance du
 * compte connecté, jeu de rôles d'exemple.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ALLURES_DE_ROLE,
    PERSONNES_DEXEMPLE,
    allureDeRole,
    correspondALIdentite,
    libelleDuRole,
    personnesDExempleAAjouter,
    phraseDeLUsage,
    resumeDesRoles,
    usageDunDomaine
} from '../web/src/app/pages/personnes/roles-personnes.ts';

const personne = (proprietes = {}) => ({ id: 'pe_1', name: 'Alice Martin', email: 'alice@exemple.fr', roles: [], ...proprietes });

test('les quatre rôles ont un pictogramme, un nom et des couleurs', () => {
    assert.deepEqual(Object.keys(ALLURES_DE_ROLE), ['owner', 'contrib', 'reader', 'admin']);
    for (const role of Object.keys(ALLURES_DE_ROLE)) {
        assert.ok(ALLURES_DE_ROLE[role].pictogramme);
        assert.ok(ALLURES_DE_ROLE[role].libelle);
        assert.ok(ALLURES_DE_ROLE[role].classes);
    }
    assert.equal(allureDeRole('inconnu'), ALLURES_DE_ROLE.admin, 'un rôle inconnu est traité comme administrateur');
});

test('la puce d’un rôle dit le domaine, ou « tous domaines » quand aucun n’est précisé', () => {
    assert.equal(libelleDuRole({ domain: 'Ventes', role: 'owner' }), '👑 Ventes · Propriétaire');
    assert.equal(libelleDuRole({ domain: '', role: 'contrib' }), '✍️ tous domaines · Contributeur');
});

test('le résumé des rôles se lit en une phrase', () => {
    assert.equal(
        resumeDesRoles(
            personne({
                roles: [
                    { domain: 'Ventes', role: 'owner' },
                    { domain: '', role: 'reader' }
                ]
            })
        ),
        'Propriétaire · Ventes, Lecteur · tous domaines'
    );
    assert.equal(resumeDesRoles(personne()), '', 'sans rôle, rien à dire');
});

test('l’usage d’un domaine compte tout ce qui le cite', () => {
    const referentiel = {
        sources: [{ domaine: 'Ventes' }, { domaine: 'Ventes' }, { domaine: 'Finance' }],
        objets: [{ domain: 'Ventes' }],
        termes: [{ domain: 'Finance' }],
        actifs: [{ domain: ' Ventes ' }],
        personnes: [
            personne({
                roles: [
                    { domain: 'Ventes', role: 'owner' },
                    { domain: 'Finance', role: 'reader' }
                ]
            })
        ]
    };
    const usage = usageDunDomaine('Ventes', referentiel);
    assert.deepEqual(usage, { sources: 2, objets: 1, termes: 0, actifs: 1, roles: 1 });
    assert.equal(phraseDeLUsage(usage), '2 source(s), 1 objet(s), 1 appli/processus, 1 rôle(s)');
    const inutilise = usageDunDomaine('Logistique', referentiel);
    assert.deepEqual(inutilise, { sources: 0, objets: 0, termes: 0, actifs: 0, roles: 0 });
    assert.equal(phraseDeLUsage(inutilise), '', 'un domaine que rien ne cite se supprime sans conséquence');
});

test('le compte connecté est reconnu par son adresse, sinon par son nom', () => {
    assert.ok(correspondALIdentite(personne(), { email: 'ALICE@exemple.fr ' }));
    assert.ok(!correspondALIdentite(personne(), { email: 'bob@exemple.fr' }));
    assert.ok(
        correspondALIdentite(personne({ email: '' }), { email: 'bob@exemple.fr', nom: 'alice martin' }),
        'sans adresse sur la personne, le nom départage'
    );
    assert.ok(!correspondALIdentite(personne({ email: '' }), { nom: 'Bob Durand' }));
    assert.ok(!correspondALIdentite(personne({ email: '' }), {}), 'sans rien pour rapprocher, on ne reconnaît personne');
});

test('le jeu de rôles d’exemple ne crée jamais deux fois la même personne', () => {
    assert.equal(PERSONNES_DEXEMPLE.length, 4);
    assert.deepEqual(
        PERSONNES_DEXEMPLE.map(exemple => exemple.role),
        ['owner', 'contrib', 'reader', 'admin']
    );
    assert.equal(personnesDExempleAAjouter([]).length, 4);
    const dejaLa = personnesDExempleAAjouter([personne({ name: 'Alice Martin' }), personne({ name: 'Bob Durand' })]);
    assert.deepEqual(
        dejaLa.map(exemple => exemple.name),
        ['Chloé Petit', 'Admin gouvernance']
    );
    assert.equal(personnesDExempleAAjouter(PERSONNES_DEXEMPLE).length, 0);
});
