/**
 * Tests de la fiche du catalogue : sous-titre, traçabilité amont/aval, sections par type d'actif
 * (information, objet métier, colonne, terme), actifs liés et boutons du pied.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    RIEN_DE_DOCUMENTE,
    actifsLies,
    actionsDeLaFiche,
    ficheDuCatalogue,
    informationDeLaFiche,
    objetDeLaFiche,
    sousTitreDeLaFiche,
    tableDeLaFiche,
    tracabiliteDe
} from '../web/src/app/pages/catalogue/fiche-catalogue.ts';

const entree = (proprietes = {}) => ({
    type: 'attr',
    id: 'bo_client.be_ville',
    titre: 'Ville',
    sousTitre: 'attribut de Client',
    description: '',
    domaine: 'Ventes',
    proprietaire: 'Alice',
    qualite: null,
    sensibilite: null,
    validation: null,
    etiquettes: [],
    motsCles: [],
    lien: '/objets-metier',
    fraicheur: null,
    ...proprietes
});

const objetClient = {
    id: 'bo_client',
    name: 'Client',
    domain: 'Ventes',
    sources: [
        { table: 'clients.csv', role: 'maitre' },
        { table: 'contacts.csv', role: 'contributeur' }
    ],
    producedBy: ['as_crm'],
    consumedBy: [],
    elements: [
        {
            id: 'be_ville',
            name: 'Ville',
            multi: '1 valeur',
            sensitivity: 'interne',
            examples: 'PARIS ; LYON',
            term: 'gl_commune',
            mappings: [{ table: 'clients.csv', col: 'ville' }],
            usedBy: ['as_crm']
        }
    ]
};

const referentiel = (proprietes = {}) => ({
    objets: [objetClient],
    termes: [{ id: 'gl_commune', term: 'Commune' }],
    actifs: [{ id: 'as_crm', name: 'CRM Vega', kind: 'app' }],
    sources: [{ id: 'src_1', name: 'clients.csv' }],
    fiches: { 'clients.csv': { columns: { ville: { technicalType: 'VARCHAR(40)' } } } },
    liensDuParcours: [
        { de: 'commandes.csv', vers: 'clients.csv' },
        { de: 'clients.csv', vers: 'synthese.csv' },
        { de: 'clients.csv', vers: 'rapport.csv' }
    ],
    volumetrie: [{ nom: 'clients.csv', lignes: 2500 }],
    voisins: [],
    ...proprietes
});

test('le sous-titre annonce le type, le domaine et le propriétaire — et rien de vide', () => {
    assert.equal(sousTitreDeLaFiche(entree()), 'Attribut métier · Domaine Ventes · propriétaire Alice');
    assert.equal(sousTitreDeLaFiche(entree({ domaine: '—', proprietaire: '' })), 'Attribut métier');
    assert.equal(sousTitreDeLaFiche(entree({ type: 'bo' })), 'Objet métier · Domaine Ventes · propriétaire Alice');
});

test('la traçabilité compte les sources en amont et les usages en aval, sans doublon', () => {
    const liens = [
        { de: 'a.csv', vers: 'clients.csv' },
        { de: 'a.csv', vers: 'clients.csv' },
        { de: 'b.csv', vers: 'clients.csv' },
        { de: 'clients.csv', vers: 'c.csv' }
    ];
    assert.deepEqual(tracabiliteDe('clients.csv', liens), { amont: 2, aval: 1 });
    assert.deepEqual(tracabiliteDe('inconnue.csv', liens), { amont: 0, aval: 0 });
    assert.deepEqual(tracabiliteDe('', liens), { amont: 0, aval: 0 }, 'sans table, rien à compter');
});

test('la fiche retrouve la table, l’objet et l’information que le résultat désigne', () => {
    assert.equal(tableDeLaFiche(entree(), referentiel()), 'clients.csv');
    assert.equal(tableDeLaFiche(entree({ type: 'column', titre: 'ville', sousTitre: 'dans clients.csv' }), referentiel()), 'clients.csv');
    assert.equal(tableDeLaFiche(entree({ type: 'table', id: 'src_1', titre: 'clients.csv' }), referentiel()), 'clients.csv');
    assert.equal(objetDeLaFiche(entree(), referentiel()).name, 'Client');
    assert.equal(objetDeLaFiche(entree({ type: 'bo', id: 'bo_client' }), referentiel()).name, 'Client');
    assert.equal(informationDeLaFiche(entree(), referentiel()).name, 'Ville');
    assert.equal(informationDeLaFiche(entree({ type: 'bo' }), referentiel()), null);
});

test('une information dit à quoi elle appartient, d’où elle vient et qui s’en sert', () => {
    const fiche = ficheDuCatalogue(entree(), referentiel());
    const titres = fiche.sections.map(section => section.titre);
    assert.deepEqual(titres, [
        'Appartient à',
        "Détail de l'attribut",
        'Termes du glossaire',
        'Alimenté par (provenance technique)',
        'Utilisé par'
    ]);
    const appartient = fiche.sections[0];
    assert.equal(appartient.lignes[0].libelle, 'Client');
    assert.deepEqual(appartient.lignes[0].cible, { type: 'bo', id: 'bo_client' });
    assert.deepEqual(fiche.sections[1].champs, [
        { cle: 'Nombre de valeurs', valeur: '1 valeur' },
        { cle: 'Sensibilité', valeur: 'interne' },
        { cle: 'Exemples', valeur: 'PARIS ; LYON' }
    ]);
    assert.equal(fiche.sections[2].lignes[0].libelle, 'Commune', 'le terme est nommé, pas son identifiant');
    assert.equal(fiche.sections[3].lignes[0].libelle, 'clients.csv.ville');
    assert.equal(fiche.sections[4].lignes[0].libelle, 'CRM Vega');
    assert.deepEqual(fiche.tracabilite, { amont: 1, aval: 2 });
    assert.deepEqual(fiche.identite[0], { cle: 'Lignes', valeur: (2500).toLocaleString('fr-FR') });
    assert.equal(fiche.identite[2].valeur, 'Alice');
});

test('une information non alimentée ou sans usage le dit, au lieu de laisser un trou', () => {
    const sansRien = { ...objetClient, elements: [{ id: 'be_ville', name: 'Ville', mappings: [], usedBy: [], term: '' }] };
    const fiche = ficheDuCatalogue(entree(), referentiel({ objets: [sansRien] }));
    assert.match(fiche.sections[3].siVide, /non alimenté/);
    assert.equal(fiche.sections[3].lignes.length, 0);
    assert.equal(fiche.sections[4].siVide, 'Aucun usage déclaré.');
    assert.equal(fiche.aQuoiCaSert, RIEN_DE_DOCUMENTE);
    assert.equal(fiche.aQuoiCaSertAbsent, true);
});

test('un objet métier montre ses attributs et sa chaîne amont → aval', () => {
    const fiche = ficheDuCatalogue(entree({ type: 'bo', id: 'bo_client', titre: 'Client' }), referentiel());
    assert.deepEqual(
        fiche.sections.map(section => section.titre),
        ['Attributs et leurs termes (1)', "Chaîne de l'objet"]
    );
    assert.equal(fiche.sections[0].lignes[0].precision, 'Commune');
    assert.deepEqual(
        fiche.sections[1].lignes.map(ligne => ligne.libelle),
        ['CRM Vega', 'clients.csv', 'contacts.csv']
    );
    assert.equal(fiche.sections[1].lignes[1].precision, 'source maître (donnée technique)');
});

test('une colonne technique dit quel attribut métier elle alimente', () => {
    const fiche = ficheDuCatalogue(
        entree({ type: 'column', id: 'src_1.ville', titre: 'ville', sousTitre: 'dans clients.csv' }),
        referentiel()
    );
    assert.deepEqual(fiche.sections[0].champs, [
        { cle: 'Type déclaré', valeur: 'VARCHAR(40)' },
        { cle: 'Colonne dans', valeur: 'clients.csv' }
    ]);
    assert.equal(fiche.sections[1].lignes[0].libelle, 'Ville');
    assert.equal(fiche.sections[1].lignes[0].precision, 'attribut de Client');
});

test('un terme du glossaire dit ce qu’il désigne', () => {
    const fiche = ficheDuCatalogue(entree({ type: 'term', id: 'gl_commune', titre: 'Commune' }), referentiel());
    assert.equal(fiche.sections[0].titre, 'Ce terme désigne (1)');
    assert.equal(fiche.sections[0].lignes[0].libelle, 'Ville');
    const orphelin = ficheDuCatalogue(entree({ type: 'term', id: 'gl_inconnu', titre: 'Inconnu' }), referentiel());
    assert.equal(orphelin.sections[0].titre, 'Ce terme désigne (0)');
    assert.match(orphelin.sections[0].siVide, /Reliez-le depuis le Glossaire/);
});

test('les actifs liés proposent trois voisins du même domaine, jamais soi-même', () => {
    const voisins = [
        entree({ type: 'table', id: 'src_1', titre: 'clients.csv' }),
        entree({ type: 'bo', id: 'bo_client', titre: 'Client' }),
        entree({ type: 'view', id: 'src_2', titre: 'synthese.csv' }),
        entree({ type: 'table', id: 'src_3', titre: 'contacts.csv' }),
        entree({ type: 'term', id: 'gl_commune', titre: 'Commune' }),
        entree({ type: 'table', id: 'src_9', titre: 'autre.csv', domaine: 'Finance' })
    ];
    const lies = actifsLies(entree({ type: 'bo', id: 'bo_client' }), voisins);
    assert.deepEqual(
        lies.map(ligne => ligne.libelle),
        ['clients.csv', 'synthese.csv', 'contacts.csv'],
        'soi-même, les termes et les autres domaines sont écartés'
    );
    assert.deepEqual(actifsLies(entree({ domaine: '—' }), voisins), [], 'sans domaine, pas de voisinage');
});

test('les boutons du pied : « Modifier dans l’objet » seulement là où il veut dire quelque chose', () => {
    assert.deepEqual(
        actionsDeLaFiche(entree()).map(action => action.cle),
        ['lineage', 'objet', 'utiliser']
    );
    assert.deepEqual(
        actionsDeLaFiche(entree({ type: 'bo' })).map(action => action.cle),
        ['lineage', 'objet', 'utiliser']
    );
    assert.deepEqual(
        actionsDeLaFiche(entree({ type: 'table' })).map(action => action.cle),
        ['lineage', 'utiliser']
    );
});
