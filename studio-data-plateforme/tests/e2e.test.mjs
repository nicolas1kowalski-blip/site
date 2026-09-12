// Test de bout en bout de la plateforme : API NestJS réelle (PGlite, dossier temporaire) + front Angular construit
// + application classique construite, pilotés dans Chromium headless. Le scénario est celui d'une équipe :
// connexion de l'administrateur, dépôt d'un CSV depuis Angular, aperçu, explorateur SQL, glossaire et dictionnaire,
// création d'une utilisatrice lectrice et vérification de ses droits, application classique dans la coque
// (mêmes sources, même gouvernance), journal, déconnexion.
//   node tests/e2e.test.mjs            (SHOTS=1 : captures d'écran dans tests/captures/)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const dossierTests = path.dirname(fileURLToPath(import.meta.url));
const racineProjet = path.resolve(dossierTests, '..');
const require = createRequire(path.join(racineProjet, 'api', 'package.json'));
require('reflect-metadata');
const { creerApplication } = require('../api/dist/src/application.js');
const { lireConfiguration } = require('../api/dist/src/configuration/configuration.js');
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

for (const [fichier, message] of [
    [
        path.join(racineProjet, 'web', 'dist', 'studio-data', 'browser', 'index.html'),
        'front Angular non construit (npm run construire dans web/)'
    ],
    [
        path.join(racineProjet, 'web-classique', 'dist', 'index.html'),
        'application classique non construite (node web-classique/construire.mjs)'
    ],
    [path.join(racineProjet, 'api', 'dist', 'src', 'application.js'), 'API non compilée (npm run construire dans api/)']
]) {
    if (!fs.existsSync(fichier)) {
        console.error(message);
        process.exit(2);
    }
}

const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-plateforme-e2e-'));
const configuration = lireConfiguration({ SD_DONNEES: dossierTemporaire, SD_JOURNAL: 'silent', SD_ADMIN_MOT_DE_PASSE: 'MotDePasseAdmin1' });
const app = await creerApplication(configuration);
await app.listen(0, '127.0.0.1');
const adresse = `http://127.0.0.1:${app.getHttpServer().address().port}`;

const resultats = [];
const ok = (phrase, condition) => resultats.push([phrase, !!condition]);
const navigateur = await chromium.launch({ executablePath: CHROMIUM });
const contexte = await navigateur.newContext({ viewport: { width: 1500, height: 950 } });
const page = await contexte.newPage();
const erreursPage = [];
page.on('pageerror', erreur => erreursPage.push(String(erreur)));
page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) erreursPage.push('console : ' + message.text());
});
const capture = async nom => {
    if (!process.env.SHOTS) return;
    fs.mkdirSync(path.join(dossierTests, 'captures'), { recursive: true });
    await page.screenshot({ path: path.join(dossierTests, 'captures', nom + '.png') });
};

try {
    // ---- connexion ----
    await page.goto(adresse + '/sources');
    await page.waitForURL('**/connexion');
    ok('sans session, une adresse d’écran redirige vers la page de connexion', page.url().endsWith('/connexion'));
    await page.fill('#identifiant', 'admin');
    await page.fill('#motDePasse', 'faux');
    await page.click('button[type=submit]');
    await page.waitForSelector('.erreur');
    ok('mot de passe incorrect : message de l’API affiché', /incorrect/.test(await page.textContent('.erreur')));
    await page.fill('#motDePasse', 'MotDePasseAdmin1');
    await page.click('button[type=submit]');
    await page.waitForSelector('.rail');
    ok(
        'connexion réussie : coque affichée, espace « Espace par défaut » sélectionné, rôle administrateur visible',
        /Espace par défaut \(administrateur\)/.test(await page.textContent('.selection-espace')) &&
            /administrateur/.test(await page.textContent('.utilisateur'))
    );
    await page.waitForFunction(() => /v\d+\.\d+/.test(document.querySelector('.kpis')?.textContent || ''));
    ok(
        'accueil : indicateurs du serveur (version DuckDB, base référentielle PGlite, sources)',
        /moteur DuckDB/.test(await page.textContent('.kpis')) && /pglite/.test(await page.textContent('.kpis'))
    );
    await capture('accueil');

    // ---- dépôt d'un CSV depuis Angular ----
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources');
    await page.setInputFiles('app-sources input[type=file]', path.join(dossierTests, 'donnees', 'clients.csv'));
    await page.waitForSelector('app-sources tbody tr');
    const cellulesSource = await page.$$eval('app-sources tbody tr:first-child td', cellules =>
        cellules.map(cellule => cellule.textContent.trim())
    );
    ok(
        'sources : clients.csv déposé depuis Angular, type csv, stockage table, 3 colonnes (' +
            cellulesSource.slice(0, 4).join(' | ') +
            ')',
        cellulesSource[0] === 'clients.csv' && cellulesSource[1] === 'csv' && cellulesSource[2] === 'table' && cellulesSource[3] === '3'
    );
    const doublon = await page.evaluate(async () => {
        const reponse = await fetch('/api/tables');
        return reponse.json();
    });
    ok(
        'la source est enregistrée dans PostgreSQL avec le fichier déposé (src_<id>) et ses en-têtes',
        doublon.length === 1 && doublon[0].fichier.nom === 'src_' + doublon[0].id && doublon[0].headers.join() === 'id_client,nom,ville'
    );
    await page.click('app-sources tbody tr button:has-text("Aperçu")');
    await page.waitForSelector('app-sources h2:has-text("Aperçu")');
    ok(
        'aperçu : 4 lignes lues par DuckDB, colonnes affichées',
        /4 ligne/.test(await page.textContent('app-sources h2:has-text("Aperçu")')) && /Ana/.test(await page.textContent('app-sources'))
    );
    await capture('sources');

    // ---- explorateur SQL ----
    await page.click('a[href="/explorateur"]');
    await page.waitForSelector('app-explorateur .table');
    await page.click('app-explorateur .table');
    await page.click('app-explorateur button:has-text("Exécuter")');
    await page.waitForSelector('app-explorateur .resultat');
    ok(
        'explorateur : la table insérée est interrogée, 4 lignes et 3 colonnes affichées',
        /4 ligne\(s\) · 3 colonne\(s\)/.test(await page.textContent('app-explorateur'))
    );
    await page.fill('app-explorateur textarea', 'SELECT ville, COUNT(*)::BIGINT AS n FROM "t_' + doublon[0].id + '" GROUP BY 1 ORDER BY 1');
    await page.click('app-explorateur button:has-text("Exécuter")');
    await page.waitForFunction(() => /3 ligne\(s\) · 2 colonne\(s\)/.test(document.querySelector('app-explorateur')?.textContent || ''));
    ok(
        'explorateur : une agrégation par ville renvoie 3 lignes (Lille, Lyon, Paris) et 2 colonnes',
        /Paris/.test(await page.textContent('app-explorateur .resultat'))
    );
    await capture('explorateur');

    // ---- glossaire et dictionnaire ----
    await page.click('a[href="/glossaire"]');
    await page.click('app-glossaire button:has-text("Nouveau terme")');
    await page.fill('app-glossaire input[name=term]', 'Client');
    await page.fill('app-glossaire textarea[name=definition]', 'Personne ayant passé au moins une commande');
    await page.fill('app-glossaire input[name=domain]', 'Ventes');
    await page.click('app-glossaire button[type=submit]');
    await page.waitForSelector('app-glossaire tbody tr');
    ok(
        'glossaire : terme créé et listé',
        /Client/.test(await page.textContent('app-glossaire tbody')) && /Ventes/.test(await page.textContent('app-glossaire tbody'))
    );
    await page.click('a[href="/dictionnaire"]');
    await page.waitForSelector('app-dictionnaire .element');
    await page.click('app-dictionnaire .element');
    await page.fill('app-dictionnaire input[name=owner]', 'Équipe Données');
    await page.fill('app-dictionnaire textarea[name=description]', 'Référentiel clients');
    await page.fill('app-dictionnaire input[name="d_ville"]', 'Ville de résidence');
    await page.click('app-dictionnaire button[type=submit]');
    await page.waitForSelector('.notification.succes');
    const etat = await page.evaluate(async () => (await (await fetch('/api/etat/appState')).json()).valeur);
    ok(
        'dictionnaire : fiche et description de colonne écrites dans le document appState partagé',
        etat.governance.dictionary['clients.csv'].owner === 'Équipe Données' &&
            etat.governance.dictionary['clients.csv'].columns.ville.description === 'Ville de résidence' &&
            etat.governance.glossary.length === 1
    );

    // ---- utilisateurs et espaces ----
    await page.click('a[href="/utilisateurs"]');
    await page.waitForSelector('app-utilisateurs');
    await page.fill('app-utilisateurs input[name=identifiant]', 'lea');
    await page.fill('app-utilisateurs input[name=nomAffiche]', 'Léa Martin');
    await page.fill('app-utilisateurs input[name=motDePasse]', 'MotDePasseLea1');
    await page.click('app-utilisateurs button[type=submit]');
    await page.waitForFunction(() => /lea/.test(document.querySelector('app-utilisateurs tbody')?.textContent || ''));
    ok('utilisateurs : compte « lea » créé par l’administrateur', /Léa Martin/.test(await page.textContent('app-utilisateurs tbody')));
    await page.click('a[href="/espaces"]');
    await page.waitForSelector('app-espaces form.formulaire-ligne');
    await page.fill('app-espaces input[name=identifiant]', 'lea');
    await page.selectOption('app-espaces select[name=role]', 'lecteur');
    await page.click('app-espaces form.formulaire-ligne button[type=submit]');
    await page.waitForFunction(() => /lea/.test(document.querySelector('app-espaces tbody')?.textContent || ''));
    ok('espaces : « lea » ajoutée comme lectrice de l’espace par défaut', /Léa Martin/.test(await page.textContent('app-espaces tbody')));
    await capture('espaces');

    // ---- application classique dans la coque : mêmes données ----
    await page.click('a[href="/classique"]');
    const cadre = page.frameLocator('iframe.cadre');
    await cadre.locator('#sdServeurChip').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const classique = await cadre.locator('body').evaluate(() => ({
        tables: Object.values(state.tables).map(t => ({ name: t.name, status: t.status, headers: t.headers.length })),
        glossaire: state.governance.glossary.map(g => g.term),
        dictionnaire: Object.keys(state.governance.dictionary),
        pastille: (document.getElementById('sdServeurChip') || {}).textContent
    }));
    ok(
        'application classique : la source déposée depuis Angular est restaurée prête (sans ré-ingestion)',
        classique.tables.length === 1 &&
            classique.tables[0].name === 'clients.csv' &&
            classique.tables[0].status === 'ready' &&
            classique.tables[0].headers === 3
    );
    ok(
        'application classique : glossaire et dictionnaire saisis dans Angular sont visibles',
        classique.glossaire.includes('Client') && classique.dictionnaire.includes('clients.csv')
    );
    ok('application classique : pastille « serveur · DuckDB » (moteur distant actif)', /serveur · DuckDB/.test(classique.pastille));
    await capture('classique');

    // ---- journal ----
    await page.click('a[href="/journal"]');
    await page.waitForSelector('app-journal tbody tr');
    const journal = await page.textContent('app-journal tbody');
    ok(
        'journal : dépôt de source, glossaire, dictionnaire, membre et connexion consignés avec leur auteur',
        ['source.ajout', 'glossaire.ajout', 'dictionnaire.modification', 'espace.membre'].every(action => journal.includes(action)) &&
            /Administrateur/.test(journal)
    );

    // ---- lectrice : droits limités ----
    await page.click('button:has-text("Se déconnecter")');
    await page.waitForURL('**/connexion');
    await page.fill('#identifiant', 'lea');
    await page.fill('#motDePasse', 'MotDePasseLea1');
    await page.click('button[type=submit]');
    await page.waitForSelector('.rail');
    ok(
        'lectrice connectée : espace par défaut en rôle lecteur, pas de menu Utilisateurs',
        /lecteur/.test(await page.textContent('.selection-espace')) && (await page.$('a[href="/utilisateurs"]')) === null
    );
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources tbody tr');
    ok(
        'lectrice : la source est visible mais sans boutons de dépôt, d’optimisation ni de suppression',
        (await page.$('app-sources input[type=file]')) === null && (await page.$('app-sources button:has-text("Supprimer")')) === null
    );
    const refus = await page.evaluate(async () => {
        const reponse = await fetch('/api/sql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sql: 'CREATE TABLE t_pirate AS SELECT 1' })
        });
        return { statut: reponse.status, corps: await reponse.json() };
    });
    ok(
        'lectrice : une écriture SQL est refusée par l’API (403, message explicite)',
        refus.statut === 403 && /lecture seule/.test(refus.corps.erreur)
    );
    await page.goto(adresse + '/utilisateurs');
    await page.waitForSelector('app-accueil');
    ok('lectrice : l’adresse /utilisateurs renvoie à l’accueil', /Bienvenue/.test(await page.textContent('app-accueil')));
} catch (erreur) {
    resultats.push(['ERREUR ' + erreur.message + ' @ ' + String(erreur.stack).split('\n')[1], false]);
}

let echecs = 0;
for (const [phrase, reussi] of resultats) {
    console.log((reussi ? '✅ ' : '❌ ') + phrase);
    if (!reussi) echecs++;
}
console.log(`\n${resultats.length - echecs}/${resultats.length} OK · erreurs page : ${erreursPage.length}`);
erreursPage.slice(0, 5).forEach(e => console.log('  ', e));
await navigateur.close();
await app.close();
fs.rmSync(dossierTemporaire, { recursive: true, force: true });
process.exit(echecs || erreursPage.length ? 1 : 0);
