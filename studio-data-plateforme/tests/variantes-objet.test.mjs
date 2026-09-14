/**
 * Tests des variantes d'un objet (V13) : la portée, le nombre de valeurs, et les colonnes répétées.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    colonnesDuGroupe,
    decouperColonneRepetee,
    ecrireSurLeGroupe,
    groupeRepetable,
    libelleDuNombreDeValeurs,
    nombreDeValeurs,
    nombreDeValeursDeclare,
    porteeDeLaVariante,
    pourquoiCeNombreDeValeurs,
    renommerLeGroupe,
    repetitionsDuGroupe,
    replierLesRepetitions,
    resumeDeLaVariante,
    valeurDuGroupe,
    varianteNeuve
} from '../web/src/app/pages/objets-metier/variantes-objet.ts';

const fabrique = () => {
    let rang = 0;
    return prefixe => prefixe + ++rang;
};

test('une variante neuve reprend les colonnes de sa table, sans filtre', () => {
    const variante = varianteNeuve('contacts.csv', 'Contacts techniques', ['nom', 'email'], fabrique());
    assert.equal(variante.name, 'Contacts techniques');
    assert.equal(variante.table, 'contacts.csv');
    assert.equal(variante.cardinality, '1–N');
    assert.deepEqual(variante.scope, []);
    assert.deepEqual(
        variante.elements.map(information => information.name),
        ['nom', 'email']
    );
    assert.deepEqual(variante.elements[0].mappings, [{ table: 'contacts.csv', col: 'nom' }]);
    assert.equal(variante.elements[0].col, 'nom', 'la variante nomme aussi sa colonne, comme le classique');
});

test('une cardinalité qui finit par N annonce un groupe répétable', () => {
    assert.equal(groupeRepetable({ id: 'a', name: 'A', table: 't', cardinality: '1–N' }), true);
    assert.equal(groupeRepetable({ id: 'a', name: 'A', table: 't', cardinality: 'N–N' }), true);
    assert.equal(groupeRepetable({ id: 'a', name: 'A', table: 't', cardinality: '1–1' }), false);
    assert.equal(groupeRepetable({ id: 'a', name: 'A', table: 't' }), true, 'sans rien de dit, 1–N comme le classique');
});

test('sans nom, la variante prend celui de sa table', () => {
    assert.equal(varianteNeuve('contacts.csv', '   ', [], fabrique()).name, 'contacts.csv');
});

test('la portée se lit en clair, et « toute la table » quand rien ne filtre', () => {
    assert.equal(porteeDeLaVariante({ id: 'a', name: 'A', table: 't' }), 'toute la table');
    const filtree = {
        id: 'a',
        name: 'A',
        table: 't',
        scope: [
            { col: 'type', op: '=', val: 'technique' },
            { col: 'email', op: 'notempty' }
        ]
    };
    assert.equal(porteeDeLaVariante(filtree), 'type = « technique » et email n’est pas vide');
});

test('le résumé dit d’où vient la variante, ce qu’elle garde et à quelle condition', () => {
    const resume = resumeDeLaVariante({
        id: 'a',
        name: 'A',
        table: 'mouvements.csv',
        scope: [{ col: 'sens', op: '=', val: 'sortie' }],
        applies: [{ col: 'statut', op: '=', val: 'actif' }]
    });
    assert.equal(resume, 'vue de mouvements.csv · sens = « sortie » — si statut = « actif »');
});

test('le nombre de valeurs déclaré accepte ce que les gens écrivent', () => {
    for (const valeur of ['n', 'N', 'plusieurs', 'multi', 'oui']) assert.equal(nombreDeValeursDeclare(valeur), 'n');
    for (const valeur of ['1', 'unique', 'non']) assert.equal(nombreDeValeursDeclare(valeur), '1');
    assert.equal(nombreDeValeursDeclare('3'), '3');
    assert.equal(nombreDeValeursDeclare('peut-être'), '', 'on n’invente pas ce qui n’est pas clair');
    assert.equal(nombreDeValeursDeclare('2000'), '', 'au-delà de 999, ce n’est plus un nombre de valeurs');
});

test('ce qui est déclaré l’emporte sur ce qui est déduit des colonnes', () => {
    assert.deepEqual(nombreDeValeurs('1', 3), { plusieurs: false, maximum: 1, origine: 'déclaré' });
    assert.deepEqual(nombreDeValeurs('', 3), { plusieurs: true, maximum: 3, origine: 'déduit' });
    assert.deepEqual(nombreDeValeurs('', 0), { plusieurs: false, maximum: 0, origine: '' });
    assert.deepEqual(nombreDeValeurs('n', 0), { plusieurs: true, maximum: 0, origine: 'déclaré' });
});

test('le badge dit ce qu’on a compris, dans les mots du classique', () => {
    assert.equal(libelleDuNombreDeValeurs(nombreDeValeurs('n', 0)), 'plusieurs valeurs');
    assert.equal(libelleDuNombreDeValeurs(nombreDeValeurs('', 3)), '1 à 3 valeurs');
    assert.equal(libelleDuNombreDeValeurs(nombreDeValeurs('1', 0)), '1 valeur');
    assert.equal(libelleDuNombreDeValeurs(nombreDeValeurs('', 0)), '1 valeur', 'rien de déclaré ni de répété : une valeur');
});

test('on dit toujours d’où vient le nombre de valeurs', () => {
    assert.equal(pourquoiCeNombreDeValeurs(nombreDeValeurs('n', 0), []), 'Déclaré sur l’objet métier.');
    assert.match(pourquoiCeNombreDeValeurs(nombreDeValeurs('', 2), ['c.a_1', 'c.a_2']), /Déduit de la structure technique : 2 colonnes/);
    assert.match(pourquoiCeNombreDeValeurs(nombreDeValeurs('', 0), []), /Aucune déclaration/);
});

test('une colonne numérotée se découpe, mais pas n’importe laquelle', () => {
    assert.deepEqual(decouperColonneRepetee('adresse_2'), { base: 'adresse', rang: 2 });
    assert.deepEqual(decouperColonneRepetee('telephone 3'), { base: 'telephone', rang: 3 });
    assert.equal(decouperColonneRepetee('V1_2'), null, 'la base finit par un chiffre : on ne devine pas');
    assert.equal(decouperColonneRepetee('ville'), null);
});

const information = nom => ({ id: 'be_' + nom, name: nom, definition: '', mappings: [{ table: 'clients.csv', col: nom }], usedBy: [] });

test('les colonnes répétées se replient en une seule information à plusieurs valeurs', () => {
    const groupes = replierLesRepetitions([
        information('nom'),
        information('adresse_1'),
        information('adresse_2'),
        information('adresse_3'),
        information('ville')
    ]);
    assert.deepEqual(
        groupes.map(groupe => groupe.base),
        ['nom', 'adresse', 'ville']
    );
    const adresses = groupes[1];
    assert.equal(adresses.replie, true);
    assert.equal(adresses.informations.length, 3);
    assert.equal(repetitionsDuGroupe(adresses), 3);
    assert.equal(libelleDuNombreDeValeurs(nombreDeValeurs('', repetitionsDuGroupe(adresses))), '1 à 3 valeurs');
    assert.deepEqual(colonnesDuGroupe(adresses), ['clients.csv.adresse_1', 'clients.csv.adresse_2', 'clients.csv.adresse_3']);
});

test('une numérotation trouée compte quand même toutes ses colonnes', () => {
    const groupes = replierLesRepetitions([information('tel_1'), information('tel_3')]);
    assert.equal(repetitionsDuGroupe(groupes[0]), 3, 'le plus grand numéro l’emporte');
    const serres = replierLesRepetitions([information('fax_1'), information('fax_2'), information('fax_3')]);
    assert.equal(repetitionsDuGroupe(serres[0]), 3);
});

test('écrire sur un groupe replié écrit sur toutes ses colonnes', () => {
    const groupe = replierLesRepetitions([information('courriel_1'), information('courriel_2')])[0];
    assert.equal(valeurDuGroupe(groupe, 'definition'), '');
    ecrireSurLeGroupe(groupe, 'definition', 'Adresse de courrier électronique');
    assert.deepEqual(
        groupe.informations.map(une => une.definition),
        ['Adresse de courrier électronique', 'Adresse de courrier électronique']
    );
    assert.equal(valeurDuGroupe(groupe, 'definition'), 'Adresse de courrier électronique');
});

test('renommer un groupe replié conserve le numéro de chaque colonne', () => {
    const groupe = replierLesRepetitions([information('courriel_1'), information('courriel_2')])[0];
    renommerLeGroupe(groupe, 'Courriel');
    assert.deepEqual(
        groupe.informations.map(une => une.name),
        ['Courriel_1', 'Courriel_2']
    );
    assert.equal(groupe.base, 'Courriel');
    renommerLeGroupe(groupe, '   ');
    assert.equal(groupe.base, 'Courriel', 'un nom vide ne détruit rien');
});

test('une colonne numérotée toute seule n’est pas une répétition', () => {
    const groupes = replierLesRepetitions([information('nom'), information('adresse_1')]);
    assert.deepEqual(
        groupes.map(groupe => ({ base: groupe.base, replie: groupe.replie })),
        [
            { base: 'nom', replie: false },
            { base: 'adresse_1', replie: false }
        ]
    );
});
