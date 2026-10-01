// Ce que ce contrôle prouve : la lecture du catalogue marche sur un VRAI moteur
// compatible PostgreSQL, et les échecs de connexion se disent en français utile.
//
// Pourquoi c'est une preuve valable pour Redshift : Redshift parle le protocole de
// PostgreSQL et expose le même `information_schema`. Les requêtes du catalogue n'emploient
// que ce dernier — aucune tournure propre à l'un ou à l'autre. Ce qui passe ici passe là.
//
// Ce que ce contrôle ne prouve pas, et ne peut pas prouver sans entrepôt sous la main :
// que le réseau de l'entreprise laisse sortir, et que le certificat d'Amazon est accepté.
// C'est précisément ce que la commande « npm run essayer-redshift » va vérifier chez vous.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirUneBaseDeTest } from '../src/base-de-donnees/connexion.js';
import { expliquerLEchec } from '../src/sources/connexion-redshift.js';
import { lireLesReglagesRedshift, reglagesRedshiftLisibles } from '../src/sources/reglages-redshift.js';
import {
    listerLesSchemas,
    listerLesTables,
    listerLesColonnes,
    listerLesLiensDeclares,
    lireLeSchema,
    compterLesColonnesParTable
} from '../src/sources/catalogue.js';

// Un petit entrepôt pour de faux : deux tables, une vue, et un lien déclaré.
// Il ressemble à ce que l'on trouve dans un entrepôt : des équipements et leurs relevés.
const PETIT_ENTREPOT = `
    CREATE SCHEMA entrepot;
    CREATE TABLE entrepot.equipements (
        repere      TEXT PRIMARY KEY,
        libelle     TEXT NOT NULL,
        famille     TEXT,
        mis_en_service DATE
    );
    CREATE TABLE entrepot.releves (
        identifiant      BIGINT PRIMARY KEY,
        repere_equipement TEXT REFERENCES entrepot.equipements(repere),
        mesure           NUMERIC,
        releve_le        TIMESTAMP
    );
    CREATE VIEW entrepot.derniers_releves AS
        SELECT repere_equipement, max(releve_le) AS dernier FROM entrepot.releves GROUP BY 1;
`;

async function entrepotDEssai() {
    const base = await ouvrirUneBaseDeTest();
    await base.executerUnScript(PETIT_ENTREPOT);
    return base;
}

test('les schémas de l’utilisateur sont listés, les schémas techniques du moteur écartés', async () => {
    const base = await entrepotDEssai();
    const schemas = (await listerLesSchemas(base)).map(schema => schema.nom);
    assert.ok(schemas.includes('entrepot'), 'le schéma créé est vu : ' + schemas.join(', '));
    assert.ok(!schemas.includes('information_schema'), 'le catalogue du moteur n’est pas proposé');
    assert.ok(
        !schemas.some(nom => nom.startsWith('pg_')),
        'aucun schéma interne du moteur n’est proposé : ' + schemas.join(', ')
    );
    await base.fermer();
});

test('les tables et les vues sont listées, et distinguées l’une de l’autre', async () => {
    const base = await entrepotDEssai();
    const tables = await listerLesTables(base, 'entrepot');
    const parNom = new Map(tables.map(table => [table.nom, table.genre]));
    assert.equal(parNom.get('equipements'), 'table');
    assert.equal(parNom.get('releves'), 'table');
    assert.equal(parNom.get('derniers_releves'), 'vue', 'une vue ne doit pas passer pour une table');
    assert.equal(tables.length, 3);
    await base.fermer();
});

test('les colonnes arrivent dans l’ordre de la table, avec leur type et leur caractère obligatoire', async () => {
    const base = await entrepotDEssai();
    const colonnes = await listerLesColonnes(base, 'entrepot');
    const equipements = colonnes.filter(colonne => colonne.table === 'equipements');
    assert.deepEqual(
        equipements.map(colonne => colonne.nom),
        ['repere', 'libelle', 'famille', 'mis_en_service'],
        'l’ordre déclaré dans la table est conservé'
    );
    assert.deepEqual(
        equipements.map(colonne => colonne.rang),
        [1, 2, 3, 4]
    );
    const repere = equipements.find(colonne => colonne.nom === 'repere');
    const famille = equipements.find(colonne => colonne.nom === 'famille');
    assert.equal(repere?.obligatoire, true, 'une clé primaire est obligatoire');
    assert.equal(famille?.obligatoire, false, 'une colonne qui accepte le vide ne l’est pas');
    assert.ok(/date/i.test(String(equipements.find(c => c.nom === 'mis_en_service')?.type)));
    await base.fermer();
});

test('un lien déclaré dans le catalogue est retrouvé avec ses deux extrémités', async () => {
    const base = await entrepotDEssai();
    const liens = await listerLesLiensDeclares(base, 'entrepot');
    assert.equal(liens.length, 1, 'un seul lien déclaré dans ce petit entrepôt');
    const lien = liens[0];
    assert.equal(lien?.tableQuiPointe, 'releves');
    assert.equal(lien?.colonneQuiPointe, 'repere_equipement');
    assert.equal(lien?.tablePointee, 'equipements');
    assert.equal(lien?.colonnePointee, 'repere');
    assert.ok((lien?.nomDeLaContrainte ?? '').length > 0, 'le nom de la contrainte est rapporté');
    await base.fermer();
});

test('un schéma sans aucun lien déclaré renvoie une liste vide, sans erreur : c’est le cas habituel', async () => {
    const base = await ouvrirUneBaseDeTest();
    await base.executerUnScript(`CREATE SCHEMA brut; CREATE TABLE brut.evenements (identifiant BIGINT, charge TEXT);`);
    assert.deepEqual(await listerLesLiensDeclares(base, 'brut'), []);
    assert.equal((await listerLesTables(base, 'brut')).length, 1);
    await base.fermer();
});

test('un schéma qui n’existe pas ne fait pas tomber la lecture : tout est vide', async () => {
    const base = await entrepotDEssai();
    const apercu = await lireLeSchema(base, 'ce_schema_n_existe_pas');
    assert.deepEqual(apercu.tables, []);
    assert.deepEqual(apercu.colonnes, []);
    assert.deepEqual(apercu.liensDeclares, []);
    await base.fermer();
});

test('la synthèse d’un schéma compte les colonnes table par table', async () => {
    const base = await entrepotDEssai();
    const apercu = await lireLeSchema(base, 'entrepot');
    const compte = compterLesColonnesParTable(apercu);
    assert.equal(compte.get('equipements'), 4);
    assert.equal(compte.get('releves'), 4);
    assert.equal(compte.get('derniers_releves'), 2, 'les colonnes d’une vue sont comptées aussi');
    await base.fermer();
});

test('la lecture du catalogue n’écrit rien : l’entrepôt est exactement dans le même état après', async () => {
    const base = await entrepotDEssai();
    const avant = await base.interroger<{ n: string }>(
        `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'entrepot'`
    );
    await lireLeSchema(base, 'entrepot');
    const apres = await base.interroger<{ n: string }>(
        `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'entrepot'`
    );
    assert.equal(avant[0]?.n, apres[0]?.n);
    await base.fermer();
});

// ---- Les réglages et les échecs -----------------------------------------------------

test('des réglages incomplets sont refusés en nommant ce qui manque', () => {
    assert.throws(
        () => lireLesReglagesRedshift({ SD_REDSHIFT_HOTE: 'entrepot.exemple.fr' } as NodeJS.ProcessEnv),
        /SD_REDSHIFT_BASE/
    );
});

test('le port 5439 de Redshift et le schéma « public » sont pris par défaut', () => {
    const reglages = lireLesReglagesRedshift({
        SD_REDSHIFT_HOTE: 'entrepot.exemple.fr',
        SD_REDSHIFT_BASE: 'dev',
        SD_REDSHIFT_UTILISATEUR: 'lecteur',
        SD_REDSHIFT_MOT_DE_PASSE: 'tres-secret-123'
    } as NodeJS.ProcessEnv);
    assert.equal(reglages.port, 5439);
    assert.equal(reglages.schemaParDefaut, 'public');
    assert.equal(reglages.certificatDeLAutorite, null);
});

test('sans aucun mot de passe, on ne tente même pas la connexion', () => {
    assert.throws(
        () =>
            lireLesReglagesRedshift({
                SD_REDSHIFT_HOTE: 'entrepot.exemple.fr',
                SD_REDSHIFT_BASE: 'dev',
                SD_REDSHIFT_UTILISATEUR: 'lecteur'
            } as NodeJS.ProcessEnv),
        /mot de passe/i
    );
});

test('ce que l’on affiche des réglages ne contient JAMAIS le mot de passe', () => {
    const reglages = lireLesReglagesRedshift({
        SD_REDSHIFT_HOTE: 'entrepot.exemple.fr',
        SD_REDSHIFT_BASE: 'dev',
        SD_REDSHIFT_UTILISATEUR: 'lecteur',
        SD_REDSHIFT_MOT_DE_PASSE: 'mot-de-passe-a-ne-pas-montrer'
    } as NodeJS.ProcessEnv);
    const affiche = reglagesRedshiftLisibles(reglages);
    assert.ok(!affiche.includes('mot-de-passe-a-ne-pas-montrer'), 'le mot de passe ne sort pas : ' + affiche);
    assert.ok(affiche.includes('entrepot.exemple.fr') && affiche.includes('5439'));
});

test('chaque échec de connexion courant est expliqué par une phrase qui dit quoi faire', () => {
    const adresseIntrouvable = expliquerLEchec(Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }));
    assert.match(adresseIntrouvable, /SD_REDSHIFT_HOTE/);

    const reseauFerme = expliquerLEchec(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    assert.match(reseauFerme, /groupe de sécurité/i);

    const portRefuse = expliquerLEchec(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    assert.match(portRefuse, /SD_REDSHIFT_PORT/);

    const certificat = expliquerLEchec(new Error('unable to verify the first certificate'));
    assert.match(certificat, /SD_REDSHIFT_CERTIFICAT_AC/);
    assert.match(certificat, /Ne désactivez pas la vérification/);

    const baseAbsente = expliquerLEchec(new Error('database "devv" does not exist'));
    assert.match(baseAbsente, /SD_REDSHIFT_BASE/);
});

test('l’explication d’un refus d’authentification ne recopie pas le mot de passe', () => {
    const explique = expliquerLEchec(new Error('password authentication failed for user "lecteur"'));
    assert.ok(!/lecteur/.test(explique), 'ni l’utilisateur ni le mot de passe ne sont recopiés : ' + explique);
    assert.match(explique, /refusé/i);
});
