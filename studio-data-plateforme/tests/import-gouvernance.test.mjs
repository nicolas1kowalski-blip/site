/**
 * Tests de l'import en masse de la gouvernance (V13) : la lecture du fichier, la reconnaissance des
 * colonnes, la fusion, et tout ce qui est laissé de côté plutôt que deviné.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    CIBLES_IMPORT,
    appliquerLImport,
    cibleParCle,
    clesManquantes,
    correspondanceAutomatique,
    ecartsParFrequence,
    genreDActif,
    listeSeparee,
    normaliser,
    phraseDuBilan,
    valeurDuChamp
} from '../web/src/app/pages/import-gouvernance/import-gouvernance.ts';
import {
    casesDuCsv,
    clesDuModele,
    enTetesDuModele,
    lireLeCsv,
    modeleDAlimentation,
    separateurDe
} from '../web/src/app/pages/import-gouvernance/fichier-import.ts';

// Ce que l'import reçoit du reste de l'application : de quoi nommer, et de quoi lire un nombre de valeurs.
const outils = () => {
    let rang = 0;
    return {
        identifiant: prefixe => prefixe + ++rang,
        comprendreLeNombreDeValeurs: ecrit => (/^(1|n|\d{1,3})$/i.test(String(ecrit).trim()) ? String(ecrit).trim().toLowerCase() : '')
    };
};
const information = nom => ({ id: 'be_' + nom, name: nom, definition: '', mappings: [], usedBy: [] });
const gouvernance = () => ({
    dictionnaire: {},
    glossaire: [{ id: 'gl_1', term: 'Client', definition: 'Personne qui achète' }],
    actifs: [{ id: 'as_1', name: 'CRM', kind: 'app', description: '', owner: '', domain: '', criticality: '' }],
    objets: [
        {
            id: 'bo_1',
            name: 'Client',
            definition: '',
            domain: '',
            globalOwner: '',
            contributors: [],
            elements: [information('ville'), information('nom')],
            structure: [{ id: 'st_1', name: 'Adresses', table: 'adresses.csv', elements: [information('rue')] }],
            sources: [],
            producedBy: [],
            consumedBy: [],
            references: []
        }
    ]
});

// ---- lecture du fichier ----

test('le séparateur est celui qui découpe le plus l’en-tête', () => {
    assert.equal(separateurDe('a;b;c'), ';');
    assert.equal(separateurDe('a,b,c'), ',');
    assert.equal(separateurDe('nom'), ';', 'sans séparateur visible, le point-virgule des tableurs français');
});

test('les guillemets protègent le séparateur, les retours à la ligne et les guillemets doublés', () => {
    const cases = casesDuCsv('a;b\n"un ; deux";"il a dit ""oui"""\n"sur\ndeux lignes";x', ';');
    assert.deepEqual(cases, [
        ['a', 'b'],
        ['un ; deux', 'il a dit "oui"'],
        ['sur\ndeux lignes', 'x']
    ]);
});

test('un CSV se lit en colonnes nommées, sans se laisser arrêter par une colonne sans nom', () => {
    const fichierLu = lireLeCsv('Table;Colonne;\nclients.csv;ville;Paris\n');
    assert.deepEqual(fichierLu.colonnes, ['Table', 'Colonne', 'Colonne 3']);
    assert.deepEqual(fichierLu.lignes, [{ Table: 'clients.csv', Colonne: 'ville', 'Colonne 3': 'Paris' }]);
});

test('les lignes vides du bas d’un tableur sont ignorées', () => {
    assert.equal(lireLeCsv('Terme;Définition\nClient;Qui achète\n;\n\n').lignes.length, 1);
});

// ---- reconnaissance des colonnes ----

test('les accents, la casse et la ponctuation ne comptent pas pour reconnaître un en-tête', () => {
    assert.equal(normaliser('Définition '), 'definition');
    assert.equal(normaliser('OBJET_MÉTIER'), 'objetmetier');
});

test('les colonnes du fichier se posent toutes seules sur les champs de la cible', () => {
    const correspondance = correspondanceAutomatique(cibleParCle('dictionnaire'), ['Table', 'Colonne', 'Définition', 'Sensibilité']);
    assert.equal(correspondance.table, 'Table');
    assert.equal(correspondance.col, 'Colonne');
    assert.equal(correspondance.definition, 'Définition');
    assert.equal(correspondance.sensitivity, 'Sensibilité');
    assert.equal(correspondance.term, undefined, 'aucune colonne pour le terme : rien n’est inventé');
});

test('on dit quelles clés manquent avant de laisser importer', () => {
    const cible = cibleParCle('dictionnaire');
    assert.deepEqual(
        clesManquantes(cible, { table: 'Table' }).map(champ => champ.champ),
        ['col']
    );
    assert.deepEqual(clesManquantes(cible, { table: 'Table', col: 'Colonne' }), []);
});

test('une case non associée vaut une case vide, jamais une valeur inventée', () => {
    assert.equal(valeurDuChamp({ Table: 'clients.csv' }, { table: 'Table' }, 'table'), 'clients.csv');
    assert.equal(valeurDuChamp({ Table: 'clients.csv' }, { table: 'Table' }, 'definition'), '');
});

test('les sept cibles de la V13 sont là, chacune avec au moins une clé', () => {
    assert.equal(CIBLES_IMPORT.length, 7);
    for (const cible of CIBLES_IMPORT)
        assert.ok(
            cible.champs.some(champ => champ.cle),
            `${cible.cle} doit avoir une clé`
        );
});

// ---- la fusion ----

test('le dictionnaire se remplit, et ne se réécrit pas pour rien', () => {
    const etat = gouvernance();
    const cible = cibleParCle('dictionnaire');
    const correspondance = { table: 'Table', col: 'Colonne', definition: 'Définition' };
    const lignes = [{ Table: 'clients.csv', Colonne: 'ville', Définition: 'Ville de résidence' }];
    const premier = appliquerLImport(etat, cible, lignes, correspondance, outils());
    assert.equal(premier.bilan.crees, 1);
    assert.equal(etat.dictionnaire['clients.csv'].columns.ville.description, 'Ville de résidence');
    assert.deepEqual(premier.reecriture.dictionnaire, ['clients.csv']);
    const second = appliquerLImport(etat, cible, lignes, correspondance, outils());
    assert.equal(second.bilan.ignores, 1, 'la même valeur ne se réécrit pas');
    assert.match(second.bilan.ecarts[0].motif, /Déjà identique/);
    assert.deepEqual(second.reecriture.dictionnaire, [], 'rien à réécrire');
});

test('le glossaire reconnaît un terme déjà là malgré l’orthographe', () => {
    const etat = gouvernance();
    const resultat = appliquerLImport(
        etat,
        cibleParCle('glossaire'),
        [{ Terme: 'client', Définition: 'Personne ou entreprise qui achète' }],
        { term: 'Terme', definition: 'Définition' },
        outils()
    );
    assert.equal(resultat.bilan.crees, 0);
    assert.equal(resultat.bilan.misAJour, 1);
    assert.equal(etat.glossaire.length, 1, 'aucun doublon créé');
    assert.equal(etat.glossaire[0].definition, 'Personne ou entreprise qui achète');
});

test('une application inconnue est créée, avec le genre écrit dans le fichier', () => {
    const etat = gouvernance();
    const resultat = appliquerLImport(
        etat,
        cibleParCle('actifs'),
        [
            { Nom: 'Facturation', Type: 'processus', Responsable: 'Alice' },
            { Nom: 'CRM', Type: 'application', Responsable: 'Bob' }
        ],
        { name: 'Nom', kind: 'Type', owner: 'Responsable' },
        outils()
    );
    assert.equal(resultat.bilan.crees, 1);
    assert.equal(resultat.bilan.misAJour, 1);
    assert.equal(etat.actifs.find(actif => actif.name === 'Facturation').kind, 'process');
    assert.equal(etat.actifs.find(actif => actif.name === 'CRM').owner, 'Bob');
});

test('le genre d’un actif se lit dans les mots du fichier', () => {
    assert.equal(genreDActif('Processus métier'), 'process');
    assert.equal(genreDActif('Restitution'), 'report');
    assert.equal(genreDActif('rapport mensuel'), 'report');
    assert.equal(genreDActif(''), 'app', 'par défaut, une application');
});

test('les informations se complètent, y compris celles des variantes', () => {
    const etat = gouvernance();
    const resultat = appliquerLImport(
        etat,
        cibleParCle('informations'),
        [
            { Objet: 'Client', Information: 'ville', Définition: 'Ville de résidence', Terme: 'Client' },
            { Objet: 'Client', Information: 'rue', Définition: 'Voie de livraison' }
        ],
        { bo: 'Objet', attr: 'Information', definition: 'Définition', term: 'Terme' },
        outils()
    );
    assert.equal(resultat.bilan.crees, 2);
    assert.equal(etat.objets[0].elements[0].definition, 'Ville de résidence');
    assert.equal(etat.objets[0].elements[0].term, 'gl_1', 'le terme écrit en clair est résolu vers le glossaire');
    assert.equal(etat.objets[0].structure[0].elements[0].definition, 'Voie de livraison');
});

test('ce qui ne se comprend pas est signalé, pas enregistré', () => {
    const etat = gouvernance();
    const resultat = appliquerLImport(
        etat,
        cibleParCle('informations'),
        [
            { Objet: 'Client', Information: 'ville', Sensibilité: 'Ultra-secrète' },
            { Objet: 'Client', Information: 'nom', Terme: 'Prospect' },
            { Objet: 'Client', Information: 'ville', 'Nombre de valeurs': 'peut-être' },
            { Objet: 'Inexistant', Information: 'x', Sensibilité: 'Interne' },
            { Objet: 'Client', Information: 'introuvable', Sensibilité: 'Interne' }
        ],
        { bo: 'Objet', attr: 'Information', sensitivity: 'Sensibilité', term: 'Terme', multi: 'Nombre de valeurs' },
        outils()
    );
    assert.equal(etat.objets[0].elements[0].sensitivity, undefined, 'une sensibilité inconnue n’est pas écrite');
    assert.equal(etat.objets[0].elements[1].term, undefined, 'un terme absent du glossaire n’est pas écrit');
    const motifs = ecartsParFrequence(resultat.bilan).map(ecart => ecart.motif);
    assert.ok(motifs.some(motif => /Sensibilité inconnue/.test(motif)));
    assert.ok(motifs.some(motif => /Terme de glossaire introuvable/.test(motif)));
    assert.ok(motifs.some(motif => /Nombre de valeurs non reconnu/.test(motif)));
    assert.ok(motifs.some(motif => /Objet métier introuvable/.test(motif)));
    assert.ok(motifs.some(motif => /Information introuvable/.test(motif)));
});

test('les écarts rassemblent leurs exemples, et se rangent du plus fréquent au plus rare', () => {
    const etat = gouvernance();
    const lignes = ['a', 'b', 'c'].map(nom => ({ Objet: 'Absent ' + nom, Information: 'x', Définition: 'y' }));
    lignes.push({ Objet: 'Client', Information: 'introuvable', Définition: 'y' });
    const resultat = appliquerLImport(
        etat,
        cibleParCle('informations'),
        lignes,
        { bo: 'Objet', attr: 'Information', definition: 'Définition' },
        outils()
    );
    const ecarts = ecartsParFrequence(resultat.bilan);
    assert.match(ecarts[0].motif, /Objet métier introuvable/);
    assert.equal(ecarts[0].nombre, 3);
    assert.deepEqual(ecarts[0].exemples, ['Absent a', 'Absent b', 'Absent c']);
});

test('un renommage n’a lieu que s’il est demandé', () => {
    const etat = gouvernance();
    appliquerLImport(
        etat,
        cibleParCle('informations'),
        [{ Objet: 'Client', Information: 'ville', 'Renommer en': 'Ville de résidence' }],
        { bo: 'Objet', attr: 'Information', rename: 'Renommer en' },
        outils()
    );
    assert.equal(etat.objets[0].elements[0].name, 'Ville de résidence');
    assert.equal(etat.objets[0].elements[0].id, 'be_ville', 'renommer ne remplace pas l’information');
});

test('un usage déclare l’application si elle n’existe pas encore', () => {
    const etat = gouvernance();
    const resultat = appliquerLImport(
        etat,
        cibleParCle('usages'),
        [
            { Objet: 'Client', Information: 'ville', Application: 'CRM' },
            { Objet: 'Client', Information: 'nom', Application: 'Facturation' },
            { Objet: 'Client', Information: 'ville', Application: 'CRM' }
        ],
        { bo: 'Objet', attr: 'Information', app: 'Application' },
        outils()
    );
    assert.deepEqual(etat.objets[0].elements[0].usedBy, ['as_1']);
    assert.equal(etat.actifs.length, 2, 'l’application inconnue est créée');
    assert.equal(resultat.bilan.ignores, 1, 'le doublon est signalé, pas réécrit');
    assert.match(resultat.bilan.ecarts[0].motif, /Usage déjà enregistré/);
});

test('un objet métier se crée avec ses informations et sa source maître', () => {
    const etat = gouvernance();
    appliquerLImport(
        etat,
        cibleParCle('objets'),
        [{ Objet: 'Commande', Définition: 'Achat passé', Informations: 'id_commande ; montant ; id_commande', Source: 'commandes.csv' }],
        { boname: 'Objet', definition: 'Définition', attrs: 'Informations', srctable: 'Source' },
        outils()
    );
    const commande = etat.objets.find(objet => objet.name === 'Commande');
    assert.equal(commande.definition, 'Achat passé');
    assert.deepEqual(
        commande.elements.map(une => une.name),
        ['id_commande', 'montant'],
        'la même information deux fois ne fait qu’une'
    );
    assert.deepEqual(commande.sources, [{ table: 'commandes.csv', role: 'maitre' }]);
    assert.equal(commande.status, 'Brouillon');
});

test('un lien objet ↔ application distingue produire et consommer', () => {
    const etat = gouvernance();
    appliquerLImport(
        etat,
        cibleParCle('objets-actifs'),
        [
            { Objet: 'Client', Application: 'CRM', Rôle: 'produit' },
            { Objet: 'Client', Application: 'Facturation', Rôle: 'utilise' }
        ],
        { bo: 'Objet', app: 'Application', role: 'Rôle' },
        outils()
    );
    assert.deepEqual(etat.objets[0].producedBy, ['as_1']);
    assert.equal(etat.objets[0].consumedBy.length, 1);
});

test('le bilan se raconte en une phrase', () => {
    assert.equal(phraseDuBilan({ crees: 2, misAJour: 3, ignores: 1, ecarts: [] }), '2 créé(s) · 3 mis à jour · 1 ignoré(s).');
});

test('une liste écrite dans une seule case se découpe, sans cases vides', () => {
    assert.deepEqual(listeSeparee(' a ; b ;; c '), ['a', 'b', 'c']);
    assert.deepEqual(listeSeparee(''), []);
});

// ---- le modèle d'alimentation ----

test('les en-têtes du modèle disent le champ, sans la mention technique « (clé) »', () => {
    assert.deepEqual(enTetesDuModele(cibleParCle('glossaire')), ['Terme', 'Définition', 'Domaine métier', 'Responsable']);
});

test('le modèle du dictionnaire apporte les vraies tables et colonnes, et ce que l’on sait déjà', () => {
    const etat = gouvernance();
    etat.dictionnaire['clients.csv'] = { columns: { ville: { description: 'Ville', term: 'gl_1' } } };
    const sources = [{ id: 1, name: 'clients.csv', headers: ['id_client', 'ville'] }];
    const modele = modeleDAlimentation(cibleParCle('dictionnaire'), etat, sources);
    assert.equal(clesDuModele(modele), 2);
    assert.deepEqual(modele.lignes[0], ['clients.csv', 'id_client', '', '', '', '']);
    assert.deepEqual(modele.lignes[1], ['clients.csv', 'ville', 'Ville', '', '', 'Client'], 'le terme est écrit en clair');
});

test('le modèle des informations propose celles du cœur et celles des variantes', () => {
    const modele = modeleDAlimentation(cibleParCle('informations'), gouvernance(), []);
    assert.deepEqual(
        modele.lignes.map(ligne => ligne[1]),
        ['ville', 'nom', 'rue']
    );
});

test('le modèle des usages n’apporte que les clés : les liens restent à déclarer', () => {
    const modele = modeleDAlimentation(cibleParCle('usages'), gouvernance(), []);
    assert.deepEqual(modele.lignes, [
        ['Client', 'ville', ''],
        ['Client', 'nom', ''],
        ['Client', 'rue', '']
    ]);
});

test('ce qui sort du modèle revient par la lecture, et les colonnes se reconnaissent seules', () => {
    const cible = cibleParCle('glossaire');
    const modele = modeleDAlimentation(cible, gouvernance(), []);
    const csv = [modele.colonnes, ...modele.lignes].map(ligne => ligne.join(';')).join('\n');
    const relu = lireLeCsv(csv);
    const correspondance = correspondanceAutomatique(cible, relu.colonnes);
    assert.deepEqual(clesManquantes(cible, correspondance), [], 'aucune clé ne manque après un aller-retour');
    assert.equal(valeurDuChamp(relu.lignes[0], correspondance, 'term'), 'Client');
});
