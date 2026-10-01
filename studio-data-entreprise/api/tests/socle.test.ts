// Ce que ce contrôle prouve : le socle tient ses promesses de sécurité, et pas seulement
// dans les intentions écrites en commentaire. Chaque promesse a son test.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireLesReglages } from '../src/configuration/configuration.js';
import { ouvrirUneBaseDeTest } from '../src/base-de-donnees/connexion.js';
import { appliquerLesMigrations, listerLesMigrations } from '../src/base-de-donnees/migrations.js';
import { inscrireAuJournal, detailSansSecret } from '../src/securite/journal.js';
import { construireLeServeur } from '../src/serveur.js';
import { POLITIQUE_DE_CONTENU } from '../src/securite/entetes.js';

const dossierDesMigrations = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

async function baseToutePrete() {
    const base = await ouvrirUneBaseDeTest();
    await appliquerLesMigrations(base, dossierDesMigrations);
    return base;
}

test('les réglages manquants arrêtent le serveur au lieu de le laisser démarrer à moitié', () => {
    assert.throws(
        () => lireLesReglages({ SD_ENVIRONNEMENT: 'production' } as NodeJS.ProcessEnv),
        /SD_ADRESSE_POSTGRESQL est obligatoire/
    );
    assert.throws(() => lireLesReglages({ SD_PORT: 'abc' } as NodeJS.ProcessEnv), /Réglages invalides/);
});

test('en développement, la base embarquée suffit : rien à installer pour lancer le projet', () => {
    const reglages = lireLesReglages({} as NodeJS.ProcessEnv);
    assert.equal(reglages.baseEmbarquee, true);
    assert.equal(reglages.environnement, 'developpement');
});

test('les migrations sont numérotées, jouées une fois, et ne se rejouent pas', async () => {
    assert.ok(listerLesMigrations(dossierDesMigrations).length > 0, 'au moins une migration sur le disque');
    const base = await ouvrirUneBaseDeTest();
    const premierPassage = await appliquerLesMigrations(base, dossierDesMigrations);
    const secondPassage = await appliquerLesMigrations(base, dossierDesMigrations);
    assert.ok(premierPassage.includes('0001_socle.sql'));
    assert.deepEqual(secondPassage, [], 'un redémarrage ne rejoue rien');
    await base.fermer();
});

test('la table des comptes ne contient aucune colonne de mot de passe', async () => {
    const base = await baseToutePrete();
    const colonnes = await base.interroger<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'comptes'`
    );
    const noms = colonnes.map(c => c.column_name).join(' ');
    assert.ok(!/mot_de_passe|password|secret|empreinte/i.test(noms), 'aucun secret dans les comptes : ' + noms);
    await base.fermer();
});

test('une source déclarée range la RÉFÉRENCE du secret, jamais le secret', async () => {
    const base = await baseToutePrete();
    const colonnes = await base.interroger<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'sources'`
    );
    const noms = colonnes.map(c => c.column_name);
    assert.ok(noms.includes('reference_du_secret'));
    assert.ok(!noms.some(nom => /mot_de_passe|password|identifiants/i.test(nom)));
    await base.fermer();
});

test('le journal d’audit ne peut être ni modifié ni supprimé — la base le refuse', async () => {
    const base = await baseToutePrete();
    await base.interroger(
        `INSERT INTO comptes (identifiant, identite_annuaire, nom_affiche, courriel)
         VALUES ('c1', 'annuaire:c1', 'Essai', 'essai@exemple.fr')`
    );
    await inscrireAuJournal(base, { compte: 'c1', espace: null, action: 'connexion' });
    const avant = await base.interroger<{ n: string }>('SELECT COUNT(*)::TEXT AS n FROM journal');
    assert.equal(avant[0]?.n, '1');

    await assert.rejects(
        () => base.interroger(`UPDATE journal SET action = 'autre chose'`),
        /ne peut être ni modifié ni supprimé/
    );
    await assert.rejects(() => base.interroger('DELETE FROM journal'), /ne peut être ni modifié ni supprimé/);

    const apres = await base.interroger<{ n: string }>('SELECT COUNT(*)::TEXT AS n FROM journal');
    assert.equal(apres[0]?.n, '1', 'la ligne est toujours là');
    await base.fermer();
});

test('rien de secret n’entre dans le journal, même si on le lui passe', async () => {
    const propre = detailSansSecret({ nomDeLaSource: 'VENTES', motDePasse: 'tres-secret', jeton: 'abc', lignes: 42 });
    assert.equal(propre?.motDePasse, '(retiré)');
    assert.equal(propre?.jeton, '(retiré)');
    assert.equal(propre?.nomDeLaSource, 'VENTES');
    assert.equal(propre?.lignes, 42);

    const base = await baseToutePrete();
    await base.interroger(
        `INSERT INTO comptes (identifiant, identite_annuaire, nom_affiche, courriel)
         VALUES ('c1', 'annuaire:c1', 'Essai', 'essai@exemple.fr')`
    );
    await inscrireAuJournal(base, {
        compte: 'c1',
        espace: null,
        action: 'source.declaree',
        detail: { motDePasse: 'tres-secret' }
    });
    const lignes = await base.interroger<{ detail: unknown }>('SELECT detail FROM journal');
    assert.ok(!JSON.stringify(lignes).includes('tres-secret'), 'le secret n’a pas atteint la base');
    await base.fermer();
});

test('les valeurs passent en paramètres : une apostrophe ne casse rien et n’injecte rien', async () => {
    const base = await baseToutePrete();
    const nomHostile = "Robert'); DROP TABLE comptes; --";
    await base.interroger(
        `INSERT INTO comptes (identifiant, identite_annuaire, nom_affiche, courriel) VALUES ($1, $2, $3, $4)`,
        ['c2', 'annuaire:c2', nomHostile, 'r@exemple.fr']
    );
    const lus = await base.interroger<{ nom_affiche: string }>('SELECT nom_affiche FROM comptes WHERE identifiant = $1', ['c2']);
    assert.equal(lus[0]?.nom_affiche, nomHostile, 'la valeur est rangée telle quelle');
    const tables = await base.interroger<{ n: string }>(
        `SELECT COUNT(*)::TEXT AS n FROM information_schema.tables WHERE table_name = 'comptes'`
    );
    assert.equal(tables[0]?.n, '1', 'la table est toujours là');
    await base.fermer();
});

test('chaque réponse porte les protections du navigateur', async () => {
    const base = await baseToutePrete();
    const reglages = lireLesReglages({ SD_ENVIRONNEMENT: 'production', SD_ADRESSE_POSTGRESQL: 'postgres://x' } as NodeJS.ProcessEnv);
    const serveur = await construireLeServeur(reglages, base);
    const reponse = await serveur.inject({ method: 'GET', url: '/api/sante' });

    assert.equal(reponse.statusCode, 200);
    assert.equal(reponse.headers['content-security-policy'], POLITIQUE_DE_CONTENU);
    assert.equal(reponse.headers['x-content-type-options'], 'nosniff');
    assert.equal(reponse.headers['x-frame-options'], 'DENY');
    assert.ok(String(reponse.headers['strict-transport-security']).includes('max-age='), 'HTTPS imposé en production');
    assert.equal(reponse.headers['x-powered-by'], undefined, 'on ne dit pas quel serveur nous faisons tourner');
    await serveur.close();
    await base.fermer();
});

test('la route de santé ne révèle rien d’utile à un curieux', async () => {
    const base = await baseToutePrete();
    const serveur = await construireLeServeur(lireLesReglages({} as NodeJS.ProcessEnv), base);
    const reponse = await serveur.inject({ method: 'GET', url: '/api/sante' });
    const corps = reponse.body;
    assert.deepEqual(JSON.parse(corps), { etat: 'en ligne', base: 'repond' });
    assert.ok(!/postgres|version|chemin|\//i.test(corps), 'aucune adresse ni version : ' + corps);
    await serveur.close();
    await base.fermer();
});

test('une erreur inattendue ne révèle pas l’intérieur de l’application', async () => {
    const base = await baseToutePrete();
    const serveur = await construireLeServeur(lireLesReglages({} as NodeJS.ProcessEnv), base);
    serveur.get('/api/essai-qui-casse', async () => {
        throw new Error('détail interne : la table secrète est vide');
    });
    const reponse = await serveur.inject({ method: 'GET', url: '/api/essai-qui-casse' });
    assert.equal(reponse.statusCode, 500);
    assert.ok(!reponse.body.includes('table secrète'), 'le détail interne ne sort pas : ' + reponse.body);
    assert.match(reponse.body, /Une erreur est survenue/);
    await serveur.close();
    await base.fermer();
});
