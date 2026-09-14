/**
 * Tests de « décrire une information sans partir de zéro » (V13) : le nom lisible deviné d'après une colonne,
 * la définition proposée, la reprise d'une définition écrite ailleurs, la jauge de complétude et les feux.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    completudeInformation,
    definitionDejaEcrite,
    definitionDevinee,
    feuDeLObjet,
    humaniser,
    memeNom,
    nomDObjet,
    propositionDepuisFichier,
    propositionDepuisModele
} from '../web/src/app/pages/objets-metier/description-information.ts';

test('un nom de colonne devient un nom lisible : abréviations développées, casse et séparateurs traités', () => {
    assert.equal(humaniser('dt_naiss'), 'Date naissance');
    assert.equal(humaniser('idClient'), 'Identifiant client');
    assert.equal(humaniser('MNT_TTC'), 'Montant TTC');
    assert.equal(humaniser('ville'), 'Ville');
});

test('un nom de fichier devient un nom d’objet, au singulier et sans préfixe technique', () => {
    assert.equal(nomDObjet('tb_clients.csv'), 'Client');
    assert.equal(nomDObjet('dim_produit.xlsx'), 'Produit');
    assert.equal(nomDObjet('contrats'), 'Contrat');
});

test('la définition proposée suit ce que le nom évoque, et cite l’objet', () => {
    assert.match(definitionDevinee('Date naissance'), /Date de naissance/);
    assert.match(definitionDevinee('Numéro client', 'Client'), /un\(e\) client/);
    assert.match(definitionDevinee('Montant TTC'), /toutes taxes comprises/);
    assert.equal(definitionDevinee('Zibouli'), '', 'rien ne se devine sur un mot inconnu');
});

test('deux noms qui ne diffèrent que par la casse ou la ponctuation désignent la même information', () => {
    assert.ok(memeNom('N° client', 'n client'));
    assert.ok(memeNom('Prénom', 'prenom'));
    assert.ok(!memeNom('Nom', 'Prénom'));
});

test('une définition déjà écrite ailleurs est préférée à une devinette', () => {
    const objets = [
        { id: 'bo1', name: 'Contrat', elements: [{ id: 'a', name: 'Ville', definition: "Commune de l'adresse du souscripteur." }] },
        { id: 'bo2', name: 'Client', elements: [{ id: 'b', name: 'Ville', definition: '' }] }
    ];
    const trouvee = definitionDejaEcrite(objets, 'ville', 'bo2');
    assert.equal(trouvee.objet.name, 'Contrat');
    assert.match(trouvee.attribut.definition, /souscripteur/);
    assert.equal(definitionDejaEcrite(objets, 'ville', 'bo1'), null, 'la seule autre définition est vide');
});

test('la jauge compte les quatre questions et nomme la prochaine à remplir', () => {
    const vide = completudeInformation({ id: 'a', name: 'Ville', mappings: [], usedBy: [] });
    assert.equal(vide.score, 0);
    assert.equal(vide.prochaine.question, "C'est quoi ?");
    const commencee = completudeInformation({
        id: 'a',
        name: 'Ville',
        definition: "Commune de l'adresse.",
        mappings: [{ table: 'clients.csv', col: 'ville' }],
        usedBy: []
    });
    assert.equal(commencee.score, 50);
    assert.equal(commencee.prochaine.question, "Qui s'en sert ?");
    const complete = completudeInformation({
        id: 'a',
        name: 'Ville',
        definition: "Commune de l'adresse.",
        mappings: [{ table: 'clients.csv', col: 'ville' }],
        usedBy: ['as1'],
        examples: 'Paris ; Lyon'
    });
    assert.equal(complete.score, 100);
    assert.equal(complete.prochaine, null);
});

test('un objet sans responsable est rouge, quel que soit son score', () => {
    assert.equal(feuDeLObjet({ globalOwner: '' }, 100).couleur, 'rouge');
    assert.equal(feuDeLObjet({ globalOwner: 'Léa' }, 90).couleur, 'vert');
    assert.equal(feuDeLObjet({ globalOwner: 'Léa' }, 40).couleur, 'orange');
    assert.match(feuDeLObjet({ globalOwner: 'Léa' }, 40).titre, /Incomplet \(40 %\)/);
});

test('depuis un fichier : une information par colonne, nommée, définie et rattachée', () => {
    const proposition = propositionDepuisFichier({ name: 'tb_clients.csv', headers: ['id_client', 'nom', 'dt_naiss'], theme: 'Ventes' });
    assert.equal(proposition.nom, 'Client');
    assert.equal(proposition.domaine, 'Ventes');
    assert.deepEqual(
        proposition.informations.map(information => information.nom),
        ['Identifiant client', 'Nom', 'Date naissance']
    );
    assert.ok(proposition.informations.every(information => information.retenue && information.table === 'tb_clients.csv'));
    assert.match(proposition.informations[2].definition, /Date de naissance/);
});

test('depuis un modèle : les colonnes qui ressemblent sont reconnues, les autres restent à rattacher', () => {
    const proposition = propositionDepuisModele('Client', [{ name: 'clients.csv', headers: ['ville', 'e_mail'] }]);
    assert.equal(proposition.nom, 'Client');
    const ville = proposition.informations.find(information => information.nom === 'Ville');
    assert.equal(ville.colonne, 'ville', 'la colonne « ville » est reconnue');
    const courriel = proposition.informations.find(information => information.nom === 'E-mail');
    assert.equal(courriel.colonne, 'e_mail', '« e_mail » devient « E-mail » et se reconnaît');
    const segment = proposition.informations.find(information => information.nom === 'Segment');
    assert.equal(segment.colonne, '', 'aucune colonne ne lui ressemble : elle reste proposée sans rattachement');
    assert.ok(
        proposition.informations.every(information => information.definition),
        'toutes ont une définition, écrite ou devinée'
    );
});
