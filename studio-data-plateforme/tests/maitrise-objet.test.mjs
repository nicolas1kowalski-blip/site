/**
 * Tests de la maîtrise contextuelle d'un objet métier (V13) : les règles, le défaut, et la couverture.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    cequiManquePourVerifier,
    choisirLeContexte,
    conclusionDeCouverture,
    couvertureDuContexte,
    informationDeContexte,
    maitriseDe,
    maitrisePour,
    phraseDeCouverture,
    regleNeuve,
    tablesProposees
} from '../web/src/app/pages/objets-metier/maitrise-objet.ts';

const identifiants = () => {
    let rang = 0;
    return prefixe => prefixe + ++rang;
};
/** La colonne de fichier qui alimente une information, dans la forme réelle du modèle. */
const alimenteePar = nom => [{ table: 'contrats.csv', col: nom }];
const information = (nom, colonnes = alimenteePar(nom)) => ({
    id: 'be_' + nom,
    name: nom,
    definition: '',
    mappings: colonnes,
    usedBy: []
});
const objet = (reste = {}) => ({
    id: 'bo_1',
    name: 'Contrat',
    definition: '',
    globalOwner: 'Alice',
    contributors: [],
    elements: [information('type'), information('montant')],
    sources: [
        { table: 'contrats.csv', role: 'maitre' },
        { table: 'crm.csv', role: 'contributeur' }
    ],
    producedBy: [],
    consumedBy: [],
    references: [],
    ...reste
});

test('un objet sans maîtrise déclarée en reçoit une, vide', () => {
    const contrat = objet();
    assert.deepEqual(maitriseDe(contrat), { elementId: '', rules: [] });
    assert.equal(informationDeContexte(contrat), null);
});

test('l’information de contexte n’est reconnue que si elle appartient toujours à l’objet', () => {
    const contrat = objet();
    choisirLeContexte(contrat, 'be_type');
    assert.equal(informationDeContexte(contrat).name, 'type');
    contrat.elements = [information('montant')];
    assert.equal(informationDeContexte(contrat), null, 'une information supprimée ne fait plus contexte');
});

test('changer de contexte efface les règles : elles parlaient d’autres valeurs', () => {
    const contrat = objet();
    choisirLeContexte(contrat, 'be_type');
    maitriseDe(contrat).rules.push(regleNeuve(contrat, identifiants()));
    assert.equal(maitriseDe(contrat).rules.length, 1);
    choisirLeContexte(contrat, 'be_type');
    assert.equal(maitriseDe(contrat).rules.length, 1, 're-choisir le même contexte ne détruit rien');
    choisirLeContexte(contrat, 'be_montant');
    assert.deepEqual(maitriseDe(contrat).rules, []);
});

test('une règle neuve part de la source maître de l’objet', () => {
    const regle = regleNeuve(objet(), identifiants());
    assert.equal(regle.masterTable, 'contrats.csv');
    assert.equal(regle.value, '');
    assert.equal(regle.owner, '');
});

test('les tables proposées sont celles de l’objet, ou toutes à défaut', () => {
    assert.deepEqual(tablesProposees(objet(), ['a.csv']), ['contrats.csv', 'crm.csv']);
    assert.deepEqual(tablesProposees(objet({ sources: [] }), ['a.csv', 'b.csv']), ['a.csv', 'b.csv']);
});

const valeurs = [
    { valeur: 'PARTICULIER', compte: 120 },
    { valeur: 'entreprise', compte: 45 },
    { valeur: 'ASSOCIATION', compte: 3 }
];

test('la couverture ignore la casse et les espaces de bord', () => {
    const regles = [
        { id: 'cr_1', value: ' particulier ', masterTable: 'crm.csv', owner: 'Bob' },
        { id: 'cr_2', value: 'ENTREPRISE', masterTable: 'contrats.csv', owner: '' }
    ];
    const couverture = couvertureDuContexte(valeurs, regles);
    assert.deepEqual(
        couverture.map(une => [une.valeur, une.couverte]),
        [
            ['PARTICULIER', true],
            ['entreprise', true],
            ['ASSOCIATION', false]
        ]
    );
});

test('une règle sans valeur ne couvre rien', () => {
    const couverture = couvertureDuContexte(valeurs, [{ id: 'cr_1', value: '   ', masterTable: 'crm.csv', owner: '' }]);
    assert.equal(couverture.filter(une => une.couverte).length, 0);
});

test('le contrôle se raconte, et dit ce qu’il faut vérifier', () => {
    const toutesCouvertes = couvertureDuContexte([{ valeur: 'A', compte: 1 }], [{ id: 'c', value: 'A', masterTable: 't', owner: '' }]);
    assert.equal(phraseDeCouverture(toutesCouvertes), '1/1 valeur(s) de contexte couverte(s) par une règle');
    assert.match(conclusionDeCouverture(toutesCouvertes), /Toutes les valeurs observées sont couvertes/);
    const partielle = couvertureDuContexte(valeurs, []);
    assert.equal(phraseDeCouverture(partielle), '0/3 valeur(s) de contexte couverte(s) par une règle');
    assert.match(conclusionDeCouverture(partielle), /source maître générale et le propriétaire global/);
});

test('on dit ce qui manque avant d’aller lire les valeurs', () => {
    const contrat = objet();
    assert.match(cequiManquePourVerifier(contrat), /Choisissez d’abord l’information de contexte/);
    choisirLeContexte(contrat, 'be_type');
    assert.equal(cequiManquePourVerifier(contrat), '');
    contrat.elements = [information('type', [])];
    choisirLeContexte(contrat, 'be_montant');
    choisirLeContexte(contrat, 'be_type');
    assert.match(cequiManquePourVerifier(contrat), /n’est rattachée à aucune colonne/);
});

test('une valeur sans règle retombe sur le maître général : rien n’est jamais sans maître', () => {
    const contrat = objet();
    choisirLeContexte(contrat, 'be_type');
    maitriseDe(contrat).rules.push({ id: 'cr_1', value: 'PARTICULIER', masterTable: 'crm.csv', owner: 'Bob' });
    assert.deepEqual(maitrisePour(contrat, 'particulier'), { masterTable: 'crm.csv', owner: 'Bob', parDefaut: false });
    assert.deepEqual(maitrisePour(contrat, 'ASSOCIATION'), { masterTable: 'contrats.csv', owner: 'Alice', parDefaut: true });
});
