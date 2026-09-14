/**
 * Tests de « Posez votre question » et de « Mes tâches » (V13) : reconnaître de quoi parle une question
 * posée en français, et lister ce qui reste à décrire.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    chercherEntites,
    entitesGouvernance,
    intentionDe,
    normaliser,
    phraseDeParcours,
    tachesDe
} from '../web/src/app/pages/accueil/question-gouvernance.ts';

const objets = [
    {
        id: 'bo1',
        name: 'Client',
        definition: 'Personne ayant au moins un contrat en cours.',
        domain: 'Ventes',
        globalOwner: 'Alice Martin',
        elements: [
            {
                id: 'be1',
                name: 'Adresse',
                definition: 'Adresse postale principale.',
                mappings: [{ table: 'clients.csv', col: 'adr' }],
                usedBy: ['as1']
            },
            { id: 'be2', name: 'Segment', definition: '', mappings: [], usedBy: [] }
        ]
    },
    {
        id: 'bo2',
        name: 'Contrat',
        definition: '',
        domain: 'Assurance',
        globalOwner: '',
        elements: [{ id: 'be3', name: 'Prime', definition: 'Montant périodique dû.', mappings: [], usedBy: [] }]
    }
];
const mots = [{ id: 'gl1', term: 'Sinistre', definition: 'Événement déclaré par un assuré.', domain: 'Assurance' }];
const applications = [{ id: 'as1', name: 'CRM', description: 'Gestion de la relation client.', owner: 'Bob', domain: 'Ventes' }];

test('l’intention se lit dans la tournure de la question', () => {
    assert.equal(intentionDe("qui est responsable de l'adresse client ?"), 'responsable');
    assert.equal(intentionDe('où va la prime ?'), 'aval');
    assert.equal(intentionDe("d'où vient l'adresse ?"), 'amont');
    assert.equal(intentionDe("qu'est-ce qu'un sinistre ?"), 'definition');
    assert.equal(intentionDe('client'), 'tout', 'sans tournure particulière, on répond tout');
});

test('le texte est réduit à ce qui compte pour comparer', () => {
    assert.equal(normaliser("L'Adresse du Client ?"), 'l adresse du client');
});

test('tout ce dont la gouvernance parle est mis à plat, avec son responsable et son domaine', () => {
    const entites = entitesGouvernance(objets, mots, applications);
    assert.equal(entites.length, 3 + 2 + 1 + 1, 'deux objets, trois informations, un mot, une application');
    const adresse = entites.find(entite => entite.nom === 'Client › Adresse');
    assert.equal(adresse.genre, 'information');
    assert.equal(adresse.responsable, 'Alice Martin', 'à défaut, le responsable de l’objet');
    assert.equal(adresse.domaine, 'Ventes');
});

test('la question désigne la bonne chose, l’information avant l’objet quand les deux sont cités', () => {
    const entites = entitesGouvernance(objets, mots, applications);
    const trouvees = chercherEntites("qui est responsable de l'adresse du client ?", entites);
    assert.equal(trouvees[0].nom, 'Client › Adresse');
    assert.equal(chercherEntites("qu'est-ce qu'un sinistre ?", entites)[0].nom, 'Sinistre');
    assert.equal(chercherEntites('où va la prime ?', entites)[0].nom, 'Contrat › Prime');
    assert.deepEqual(chercherEntites('combien de fleurs au printemps ?', entites), [], 'rien ne correspond');
});

test('les tâches ne listent que ce qui manque vraiment', () => {
    const taches = tachesDe(objets, 2);
    assert.deepEqual(
        taches.map(tache => [tache.libelle, tache.nombre]),
        [
            ['objet(s) sans responsable', 1],
            ['information(s) sans définition', 1],
            ["information(s) dont on ne sait pas d'où elles viennent", 2],
            ['information(s) dont personne ne dit se servir', 2],
            ['proposition(s) à valider', 2]
        ]
    );
});

test('les tâches se restreignent au domaine choisi', () => {
    const taches = tachesDe(objets, 0, 'Ventes');
    assert.ok(!taches.some(tache => tache.libelle.includes('sans responsable')), 'Client a un responsable');
    assert.equal(taches.find(tache => tache.libelle.includes('sans définition')).nombre, 1);
});

test('rien à faire donne une liste vide, pas une liste de zéros', () => {
    const complet = [
        {
            id: 'bo',
            name: 'Client',
            definition: 'x',
            globalOwner: 'Alice',
            elements: [{ id: 'be', name: 'Adresse', definition: 'x', mappings: [{ table: 't', col: 'c' }], usedBy: ['as1'] }]
        }
    ];
    assert.deepEqual(tachesDe(complet, 0), []);
});

test('le parcours en une phrase dit d’où ça vient et ce qui s’en sert', () => {
    const objet = {
        id: 'bo',
        name: 'Client',
        producedBy: ['as1'],
        consumedBy: ['as2'],
        sources: [{ table: 'clients.csv', role: 'maitre' }],
        elements: []
    };
    const applications = [
        { id: 'as1', name: 'CRM' },
        { id: 'as2', name: 'Reporting' }
    ];
    assert.equal(phraseDeParcours('Client', objet, applications), '« Client » vient de CRM, clients.csv ; sert à Reporting.');
    assert.match(
        phraseDeParcours('Client › Adresse', objet, applications, { id: 'be', usedBy: [] }),
        /sert à Reporting\.$/,
        "sans usage propre, l'information hérite de ceux de l'objet"
    );
    assert.equal(
        phraseDeParcours('Contrat', { id: 'x', name: 'Contrat', producedBy: [], consumedBy: [], sources: [], elements: [] }, []),
        "« Contrat » n'a pas encore de source déclarée ; personne n'a encore déclaré s'en servir."
    );
});
