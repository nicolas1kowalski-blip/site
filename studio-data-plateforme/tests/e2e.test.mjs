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
const verifier = (phrase, condition) => resultats.push([phrase, !!condition]);
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
    verifier('sans session, une adresse d’écran redirige vers la page de connexion', page.url().endsWith('/connexion'));
    await page.fill('#identifiant', 'admin');
    await page.fill('#motDePasse', 'faux');
    await page.click('button[type=submit]');
    await page.waitForSelector('.erreur');
    verifier('mot de passe incorrect : message de l’API affiché', /incorrect/.test(await page.textContent('.erreur')));
    await page.fill('#motDePasse', 'MotDePasseAdmin1');
    await page.click('button[type=submit]');
    await page.waitForSelector('.rail');
    verifier(
        'connexion réussie : coque affichée, espace « Espace par défaut » sélectionné, rôle administrateur visible',
        /Espace par défaut \(administrateur\)/.test(await page.textContent('.selection-espace')) &&
            /administrateur/.test(await page.textContent('.utilisateur'))
    );
    await page.waitForFunction(() => /v\d+\.\d+/.test(document.querySelector('.kpis')?.textContent || ''));
    verifier(
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
    verifier(
        'sources : clients.csv déposé depuis Angular, type csv, stockage table, 3 colonnes (' +
            cellulesSource.slice(0, 4).join(' | ') +
            ')',
        cellulesSource[0] === 'clients.csv' && cellulesSource[1] === 'csv' && cellulesSource[2] === 'table' && cellulesSource[3] === '3'
    );
    const doublon = await page.evaluate(async () => {
        const reponse = await fetch('/api/tables');
        return reponse.json();
    });
    verifier(
        'la source est enregistrée dans PostgreSQL avec le fichier déposé (src_<id>) et ses en-têtes',
        doublon.length === 1 && doublon[0].fichier.nom === 'src_' + doublon[0].id && doublon[0].headers.join() === 'id_client,nom,ville'
    );
    await page.setInputFiles('app-sources input[type=file]', path.join(dossierTests, 'donnees', 'commandes.csv'));
    await page.waitForFunction(() => document.querySelectorAll('app-sources tbody tr').length === 2);
    await page.click('app-sources tbody tr:first-child button:has-text("Aperçu")');
    await page.waitForSelector('app-sources h2:has-text("Aperçu")');
    verifier(
        'aperçu : 4 lignes lues par DuckDB, colonnes affichées',
        /4 ligne/.test(await page.textContent('app-sources h2:has-text("Aperçu")')) && /Ana/.test(await page.textContent('app-sources'))
    );
    await capture('sources');

    // ---- modèle de données : détection et ajout d'un lien ----
    await page.click('a[href="/modele"]');
    await page.waitForSelector('app-modele');
    await page.click('app-modele button:has-text("Détecter les liens")');
    await page.waitForSelector('app-modele button:has-text("Ajouter")');
    const proposition = await page.textContent('app-modele tbody tr');
    verifier(
        'modèle : un lien commandes.id_client → clients.id_client est proposé d’après le contenu (100 %)',
        /commandes\.csv/.test(proposition) && /clients\.csv/.test(proposition) && /100 %/.test(proposition)
    );
    await page.click('app-modele button:has-text("Ajouter")');
    await page.waitForSelector('app-modele button:has-text("Supprimer")');
    const relations = await page.evaluate(async () => await (await fetch('/api/modele/relations')).json());
    verifier(
        'modèle : le lien est enregistré au format de l’application classique (par nom de table)',
        relations.length === 1 && relations[0].sourceTable === 'commandes.csv' && relations[0].targetCol === 'id_client'
    );
    await capture('modele');

    // ---- extraction : jointure, colonnes, filtre, aperçu, comptage, export, modèle ----
    await page.click('a[href="/extraction"]');
    await page.waitForSelector('app-extraction');
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    await page.waitForSelector('app-extraction .ligne-table.proposee');
    await page.click('app-extraction .ligne-table.proposee button');
    await page.waitForFunction(() => document.querySelectorAll('app-extraction details').length === 2);
    const cases = await page.$$('app-extraction details input[type=checkbox]');
    verifier('extraction : la table commandes est proposée par le lien du modèle puis jointe ; 6 colonnes disponibles', cases.length === 6);
    // Cases dans l'ordre d'affichage : clients (id_client, nom, ville) puis commandes (id_commande, id_client, montant).
    for (const position of [1, 2, 5]) await cases[position].click();
    await page.click('app-extraction button:has-text("Ajouter un filtre")');
    await page.selectOption('app-extraction select[name="fc_0"]', 'ville');
    await page.selectOption('app-extraction select[name="fo_0"]', 'in');
    await page.fill('app-extraction input[name="fv_0"]', 'paris;lyon');
    await page.click('app-extraction button:has-text("Aperçu (200 lignes)")');
    await page.waitForSelector('app-extraction .resultat');
    const enTetes = await page.$$eval('app-extraction .entete-colonnes .cellule b', cellules =>
        cellules.map(cellule => cellule.textContent)
    );
    verifier('extraction : aperçu avec les colonnes nom, ville et commandes.montant', enTetes.join() === 'nom,ville,commandes.montant');
    await page.click('app-extraction button:has-text("Compter")');
    await page.waitForSelector('app-extraction .badge:has-text("ligne(s) au total")');
    verifier(
        'extraction : 4 lignes au total (jointure gauche, filtre ville dans paris;lyon)',
        /4 ligne\(s\) au total/.test(await page.textContent('app-extraction .badge'))
    );
    const [telechargement] = await Promise.all([
        page.waitForEvent('download'),
        page.click('app-extraction button:has-text("Exporter en CSV")')
    ]);
    const contenuCsv = fs.readFileSync(await telechargement.path(), 'utf8');
    verifier(
        'extraction : export CSV téléchargé (en-têtes, 4 lignes, point-virgule)',
        telechargement.suggestedFilename() === 'clients_extraction.csv' &&
            contenuCsv.startsWith('\ufeff"nom";"ville";"commandes.montant"') &&
            contenuCsv.trim().split('\n').length === 5
    );
    page.once('dialog', dialogue => dialogue.accept('Clients Paris Lyon'));
    await page.click('app-extraction button:has-text("Enregistrer le modèle")');
    await page.waitForSelector('.notification.succes:has-text("Modèle")');
    verifier(
        'extraction : modèle enregistré et proposé dans la liste',
        (
            await page.$$eval('app-extraction select[name=modeleCharge] option', options => options.map(option => option.textContent))
        ).includes('Clients Paris Lyon')
    );
    await capture('extraction');

    // ---- explorateur SQL ----
    await page.click('a[href="/explorateur"]');
    await page.waitForSelector('app-explorateur .table');
    await page.click('app-explorateur .table');
    await page.click('app-explorateur button:has-text("Exécuter")');
    await page.waitForSelector('app-explorateur .resultat');
    verifier(
        'explorateur : la table insérée est interrogée, 4 lignes et 3 colonnes affichées',
        /4 ligne\(s\) · 3 colonne\(s\)/.test(await page.textContent('app-explorateur'))
    );
    await page.fill('app-explorateur textarea', 'SELECT ville, COUNT(*)::BIGINT AS n FROM "t_' + doublon[0].id + '" GROUP BY 1 ORDER BY 1');
    await page.click('app-explorateur button:has-text("Exécuter")');
    await page.waitForFunction(() => /3 ligne\(s\) · 2 colonne\(s\)/.test(document.querySelector('app-explorateur')?.textContent || ''));
    verifier(
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
    verifier(
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
    verifier(
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
    verifier(
        'utilisateurs : compte « lea » créé par l’administrateur',
        /Léa Martin/.test(await page.textContent('app-utilisateurs tbody'))
    );
    await page.click('a[href="/espaces"]');
    await page.waitForSelector('app-espaces form.formulaire-ligne');
    await page.fill('app-espaces input[name=identifiant]', 'lea');
    await page.selectOption('app-espaces select[name=role]', 'lecteur');
    await page.click('app-espaces form.formulaire-ligne button[type=submit]');
    await page.waitForFunction(() => /lea/.test(document.querySelector('app-espaces tbody')?.textContent || ''));
    verifier(
        'espaces : « lea » ajoutée comme lectrice de l’espace par défaut',
        /Léa Martin/.test(await page.textContent('app-espaces tbody'))
    );
    await capture('espaces');

    // ---- application classique dans la coque : mêmes données ----
    await page.click('a[href="/classique"]');
    const cadre = page.frameLocator('iframe.cadre');
    await cadre.locator('#sdServeurChip').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const classique = await cadre.locator('body').evaluate(() => ({
        tables: Object.values(state.tables).map(table => ({ name: table.name, status: table.status, headers: table.headers.length })),
        glossaire: state.governance.glossary.map(terme => terme.term),
        dictionnaire: Object.keys(state.governance.dictionary),
        relations: state.relations.map(lien => state.tables[lien.sourceTable].name + '>' + state.tables[lien.targetTable].name),
        pastille: (document.getElementById('sdServeurChip') || {}).textContent
    }));
    verifier(
        'application classique : les deux sources déposées depuis Angular sont restaurées prêtes (sans ré-ingestion)',
        classique.tables.length === 2 &&
            classique.tables.some(table => table.name === 'clients.csv') &&
            classique.tables.every(table => table.status === 'ready' && table.headers === 3)
    );
    verifier(
        'application classique : glossaire et dictionnaire saisis dans Angular sont visibles',
        classique.glossaire.includes('Client') && classique.dictionnaire.includes('clients.csv')
    );
    verifier('application classique : pastille « serveur · DuckDB » (moteur distant actif)', /serveur · DuckDB/.test(classique.pastille));
    verifier(
        'application classique : le lien déclaré dans Angular est présent dans son modèle de données',
        classique.relations.join() === 'commandes.csv>clients.csv'
    );
    await capture('classique');

    // ---- journal ----
    await page.click('a[href="/journal"]');
    await page.waitForSelector('app-journal tbody tr');
    const journal = await page.textContent('app-journal tbody');
    verifier(
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
    verifier(
        'lectrice connectée : espace par défaut en rôle lecteur, pas de menu Utilisateurs',
        /lecteur/.test(await page.textContent('.selection-espace')) && (await page.$('a[href="/utilisateurs"]')) === null
    );
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources tbody tr');
    verifier(
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
    verifier(
        'lectrice : une écriture SQL est refusée par l’API (403, message explicite)',
        refus.statut === 403 && /lecture seule/.test(refus.corps.erreur)
    );
    await page.goto(adresse + '/utilisateurs');
    await page.waitForSelector('app-accueil');
    verifier('lectrice : l’adresse /utilisateurs renvoie à l’accueil', /Bienvenue/.test(await page.textContent('app-accueil')));
} catch (erreur) {
    resultats.push(['ERREUR ' + erreur.message + ' @ ' + String(erreur.stack).split('\n')[1], false]);
}

let echecs = 0;
for (const [phrase, reussi] of resultats) {
    console.log((reussi ? '✅ ' : '❌ ') + phrase);
    if (!reussi) echecs++;
}
console.log(`\n${resultats.length - echecs}/${resultats.length} OK · erreurs page : ${erreursPage.length}`);
erreursPage.slice(0, 5).forEach(erreur => console.log('  ', erreur));
await navigateur.close();
await app.close();
fs.rmSync(dossierTemporaire, { recursive: true, force: true });
process.exit(echecs || erreursPage.length ? 1 : 0);
