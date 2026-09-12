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

    // ---- qualité : profilage, doublons, règle et score ----
    await page.click('a[href="/qualite"]');
    await page.waitForSelector('app-qualite');
    await page.selectOption('app-qualite select[name=source]', { label: 'clients.csv' });
    await page.click('app-qualite button:has-text("Profiler la source")');
    await page.waitForSelector('app-qualite tbody tr');
    const profil = await page.textContent('app-qualite');
    verifier(
        'qualité : profilage de clients.csv — 4 lignes, complétude moyenne 100 %, 0 doublon exact, 3 colonnes profilées',
        /4 ligne\(s\)/.test(profil) &&
            /complétude moyenne 100\.0 %/.test(profil) &&
            /0 doublon\(s\) exact/.test(profil) &&
            (await page.$$('app-qualite tbody tr')).length === 3
    );
    await page.click('app-qualite .onglets button:has-text("Doublons")');
    await page.click('app-qualite label.case:has-text("ville") input');
    await page.click('app-qualite button:has-text("Chercher les doublons")');
    await page.waitForSelector('app-qualite h2:has-text("groupe(s)")');
    const texteDoublons = await page.textContent('app-qualite');
    verifier(
        'qualité : doublons sur la clé ville — 1 groupe (Paris ×2), 2 lignes',
        // La clé est affichée normalisée (majuscules, sans espaces) : « PARIS ».
        /1 groupe\(s\)/.test(texteDoublons) && /2 ligne\(s\) concernée/.test(texteDoublons) && /PARIS/i.test(texteDoublons)
    );
    await page.click('app-qualite .onglets button:has-text("Règles")');
    await page.click('app-qualite button:has-text("Nouvelle règle")');
    await page.fill('app-qualite input[name=nom]', 'Ville autorisée');
    await page.selectOption('app-qualite select[name=colonne]', 'ville');
    await page.selectOption('app-qualite select[name=type]', 'dansListe');
    await page.fill('app-qualite input[name=valeurs]', 'Paris;Lyon');
    await page.click('app-qualite button[type=submit]:has-text("Enregistrer")');
    await page.waitForSelector('app-qualite tbody tr:has-text("Ville autorisée")');
    await page.click('app-qualite button:has-text("Exécuter les règles")');
    await page.waitForSelector('app-qualite .score');
    const regles = await page.textContent('app-qualite');
    verifier(
        'qualité : la règle « ville dans Paris;Lyon » trouve 1 échec sur 4 (Lille), score 75 / 100',
        /1 échec\(s\) \/ 4/.test(regles) && /Score 75 \/ 100/.test(regles) && /ex\. Lille/.test(regles)
    );
    await page.click('app-qualite .onglets button:has-text("Historique")');
    await page.waitForSelector('app-qualite tbody tr');
    await page.waitForFunction(() => document.querySelectorAll('app-qualite tbody tr').length >= 3);
    const historique = await page.textContent('app-qualite tbody');
    verifier(
        'qualité : l’historique montre les trois audits (profilage, doublons, règles)',
        ['profilage', 'doublons', 'regles'].every(genre => historique.includes(genre))
    );
    await capture('qualite');

    // ---- tables conçues : recette, SQL, aperçu, construction, contribution ----
    await page.click('a[href="/tables-concues"]');
    await page.waitForSelector('app-tables-concues');
    await page.click('app-tables-concues button:has-text("Nouvelle table")');
    await page.fill('app-tables-concues input[name=nom]', 'Clients consolidés');
    await page.selectOption('app-tables-concues select[name=ajoutSource]', { label: 'clients.csv' });
    await page.click('app-tables-concues button:has-text("Ajouter la source")');
    await page.waitForSelector('app-tables-concues input[name=attribut-2]');
    // Renommage d'un attribut, clé, format « code » (majuscules) sur la ville.
    await page.fill('app-tables-concues input[name=attribut-1]', 'Nom du client');
    await page.press('app-tables-concues input[name=attribut-1]', 'Tab');
    await page.check('app-tables-concues input[name=cle-0]');
    await page.selectOption('app-tables-concues select[name=format-2]', 'code');
    // Enrichissement : montant ramené de commandes.csv par id_client.
    await page.click('app-tables-concues button:has-text("+ enrichissement")');
    await page.selectOption('app-tables-concues select[name=enrichissement-source-0]', { label: 'commandes.csv' });
    await page.selectOption('app-tables-concues select[name=enrichissement-colonne-0]', 'montant');
    await page.selectOption('app-tables-concues select[name=enrichissement-accroche-0]', 'id_client');
    await page.selectOption('app-tables-concues select[name=enrichissement-cle-0]', 'id_client');
    // Colonne calculée et clé étrangère.
    await page.click('app-tables-concues button:has-text("+ colonne calculée")');
    await page.fill('app-tables-concues input[name=calcul-nom-0]', 'Etiquette');
    await page.fill('app-tables-concues input[name=calcul-formule-0]', "[Nom du client] || ' (' || [ville] || ')'");
    await page.click('app-tables-concues button:has-text("+ clé étrangère")');
    await page.selectOption('app-tables-concues select[name=cle-etrangere-attribut-0]', 'id_client');
    await page.selectOption('app-tables-concues select[name=cle-etrangere-table-0]', { label: 'commandes.csv' });
    await page.selectOption('app-tables-concues select[name=cle-etrangere-colonne-0]', 'id_client');
    await page.click('app-tables-concues button:has-text("Voir le SQL")');
    await page.waitForSelector('app-tables-concues pre.sql');
    const sqlRecette = await page.textContent('app-tables-concues pre.sql');
    verifier(
        'tables conçues : le SQL de la recette contient l’union, l’enrichissement (LEFT JOIN), le calcul et le dédoublonnage par clé',
        /SOURCE_ORIGINE/.test(sqlRecette) && /LEFT JOIN/.test(sqlRecette) && /"Etiquette"/.test(sqlRecette) && /QUALIFY/.test(sqlRecette)
    );
    await page.click('app-tables-concues button:has-text("Aperçu (50 lignes)")');
    await page.waitForSelector('app-tables-concues th:has-text("Etiquette")');
    const apercuRecette = await page.evaluate(() => {
        const table = [...document.querySelectorAll('app-tables-concues table')].find(candidat =>
            [...candidat.querySelectorAll('th')].some(entete => entete.textContent.trim() === 'Etiquette')
        );
        const lignes = [...table.querySelectorAll('tbody tr')].map(ligne =>
            [...ligne.querySelectorAll('td')].map(cellule => cellule.textContent.trim())
        );
        return { entetes: [...table.querySelectorAll('th')].map(entete => entete.textContent.trim()), lignes };
    });
    verifier(
        'tables conçues : l’aperçu montre 4 lignes, la ville en majuscules, le montant ramené et l’étiquette calculée',
        apercuRecette.entetes.join() === 'SOURCE_ORIGINE,id_client,Nom du client,ville,montant,Etiquette' &&
            apercuRecette.lignes.length === 4 &&
            apercuRecette.lignes.some(ligne => ligne[1] === '3' && ligne[3] === 'LILLE' && ligne[4] === '' && ligne[5] === 'Zoé (LILLE)')
    );
    await page.click('app-tables-concues button:has-text("Construire la table")');
    await page.waitForSelector('app-tables-concues .table-concue');
    const carteTable = await page.textContent('app-tables-concues .table-concue');
    verifier(
        'tables conçues : la table « Clients consolidés » est construite (4 lignes, clé id_client, 1 format, 1 orphelin de clé étrangère : Zoé sans commande)',
        /Clients consolidés/.test(carteTable) &&
            /4 ligne\(s\)/.test(carteTable) &&
            /🔑 id_client/.test(carteTable) &&
            /1 orphelin\(s\)/.test(carteTable) &&
            (await page.$('app-tables-concues button:has-text("Écarts entre sources")')) === null
    );
    await page.click('app-tables-concues button:has-text("Contribution par source")');
    await page.waitForSelector('app-tables-concues h2:has-text("Contribution par source")');
    const contributionsTexte = await page.textContent('app-tables-concues');
    verifier(
        'tables conçues : la contribution par source affiche clients.csv, 4 lignes, 100 %',
        /clients\.csv\s*4\s*100,0 %/.test(contributionsTexte.replace(/\s+/g, ' '))
    );
    await capture('tables-concues');

    // ---- gouvernance : objets métier, applications, personnes, listes de valeurs, sensibilité, propositions ----
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier');
    await page.selectOption('app-objets-metier select[name=sourceInitiale]', { label: 'clients.csv' });
    await page.click('app-objets-metier button:has-text("Initialiser")');
    await page.waitForSelector('app-objets-metier input[name=attribut-nom-2]');
    verifier(
        'objets métier : initialisation depuis clients.csv — nom « clients », 3 attributs alimentés par la source',
        (await page.inputValue('app-objets-metier input[name=nom]')) === 'clients' &&
            (await page.$$('app-objets-metier tbody tr')).length === 3 &&
            /clients\.csv\.ville/.test(await page.textContent('app-objets-metier tbody'))
    );
    await page.fill('app-objets-metier input[name=nom]', 'Client');
    await page.fill('app-objets-metier textarea[name=definition]', 'Personne ayant passé au moins une commande');
    await page.fill('app-objets-metier input[name=proprietaire]', 'Alice Martin');
    await page.fill('app-objets-metier input[name=domaine]', 'Ventes');
    await page.fill('app-objets-metier input[name=attribut-definition-2]', 'Ville de résidence');
    await page.click('app-objets-metier button:has-text("Enregistrer")');
    await page.waitForSelector('app-objets-metier .liste .element:has-text("Client")');
    const objetsMetier = await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json());
    verifier(
        'objets métier : « Client » enregistré dans appState.governance.businessObjects (source maître clients.csv, attribut ville défini)',
        objetsMetier.length === 1 &&
            objetsMetier[0].name === 'Client' &&
            objetsMetier[0].sources[0].role === 'maitre' &&
            objetsMetier[0].elements.find(attribut => attribut.name === 'ville').definition === 'Ville de résidence'
    );
    await capture('objets-metier');

    await page.click('a[href="/actifs"]');
    await page.waitForSelector('app-actifs');
    await page.click('app-actifs button:has-text("Nouvelle application")');
    await page.fill('app-actifs input[name=nom]', 'CRM');
    await page.fill('app-actifs input[name=responsable]', 'Équipe Ventes');
    // Cases à cocher désignées par leur texte exact (« Client » ne doit pas retenir « clients.csv »).
    await page.locator('app-actifs label.case', { hasText: /^\s*clients\.csv\s*$/ }).first().locator('input').click();
    await page.locator('app-actifs label.case', { hasText: /^\s*Client\s*$/ }).locator('input').click();
    await page.click('app-actifs button:has-text("Enregistrer")');
    await page.waitForSelector('app-actifs .liste .element:has-text("CRM")');
    const actifs = await page.evaluate(async () => await (await fetch('/api/gouvernance/actifs')).json());
    verifier(
        'applications : « CRM » produit clients.csv et porte l’objet Client',
        actifs.length === 1 && actifs[0].kind === 'app' && actifs[0].sources.join() === 'clients.csv' && actifs[0].boIds.length === 1
    );

    await page.click('a[href="/personnes"]');
    await page.waitForSelector('app-personnes');
    await page.fill('app-personnes input[name=nouveauDomaine]', 'Finance');
    await page.click('app-personnes form button:has-text("Ajouter")');
    await page.waitForSelector('app-personnes .puce:has-text("Finance")');
    await page.click('app-personnes button:has-text("Nouvelle personne")');
    await page.fill('app-personnes input[name=personne-nom-0]', 'Alice Martin');
    await page.selectOption('app-personnes select[name=personne-role-0]', 'owner');
    await page.selectOption('app-personnes select[name=personne-domaine-0]', 'Ventes');
    await page.click('app-personnes button:has-text("+ rôle")');
    await page.click('app-personnes button:has-text("Enregistrer")');
    await page.waitForSelector('.notification.succes');
    const personnes = await page.evaluate(async () => await (await fetch('/api/gouvernance/personnes')).json());
    verifier(
        'personnes : Alice Martin propriétaire du domaine Ventes ; domaines = Finance (déclaré) + Ventes (cité)',
        personnes.length === 1 &&
            personnes[0].roles[0].role === 'owner' &&
            personnes[0].roles[0].domain === 'Ventes' &&
            /Finance/.test(await page.textContent('app-personnes .puces'))
    );

    await page.click('a[href="/listes-de-valeurs"]');
    await page.waitForSelector('app-listes-valeurs');
    await page.click('app-listes-valeurs button:has-text("Créer une liste")');
    await page.fill('app-listes-valeurs input[name=liste-nom-0]', 'Villes autorisées');
    await page.fill('app-listes-valeurs textarea[name=liste-codes-0]', 'PARIS ; Paris\nLYON ; Lyon');
    await page.click('app-listes-valeurs button:has-text("Enregistrer")');
    await page.waitForSelector('.notification.succes');
    await page.selectOption('app-listes-valeurs select[name=controle-table-0]', { label: 'clients.csv' });
    await page.selectOption('app-listes-valeurs select[name=controle-colonne-0]', 'ville');
    await page.click('app-listes-valeurs button:has-text("Contrôler la colonne")');
    await page.waitForSelector('app-listes-valeurs .resultat-controle');
    verifier(
        'listes de valeurs : clients.ville contrôlée contre {PARIS, LYON} — 1 valeur hors liste sur 4 (LILLE)',
        /1 valeur\(s\) hors liste sur 4/.test(await page.textContent('app-listes-valeurs .resultat-controle')) &&
            /LILLE/.test(await page.textContent('app-listes-valeurs .resultat-controle'))
    );

    await page.click('a[href="/sensibilite"]');
    await page.waitForSelector('app-sensibilite tbody tr');
    await page.click('app-sensibilite button:has-text("Détecter")');
    await page.waitForSelector('app-sensibilite .puce');
    await page.selectOption('app-sensibilite select[name="niveau-clients.csv-ville"]', 'interne');
    await page.waitForFunction(() => /1 \/ \d+ classée/.test(document.querySelector('app-sensibilite .badge')?.textContent || ''));
    verifier(
        'sensibilité : la colonne « nom » est détectée comme donnée personnelle ; ville classée « interne »',
        /clients\.csv\.nom/.test(await page.textContent('app-sensibilite .carte')) &&
            (await page.inputValue('app-sensibilite select[name="niveau-clients.csv-ville"]')) === 'interne'
    );
    await capture('sensibilite');

    // Une proposition (déposée par l'API, comme le ferait un lecteur) est validée depuis l'écran.
    await page.evaluate(async boId => {
        await fetch('/api/gouvernance/propositions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                kind: 'bo',
                field: 'definition',
                target: { boId },
                label: 'Client : définition',
                before: 'Personne ayant passé au moins une commande',
                after: 'Personne physique ou morale ayant passé au moins une commande',
                domain: 'Ventes'
            })
        });
    }, objetsMetier[0].id);
    await page.click('a[href="/propositions"]');
    await page.waitForSelector('app-propositions .proposition');
    await page.click('app-propositions button:has-text("Valider")');
    await page.waitForSelector('app-propositions h2:has-text("Décisions passées")');
    const objetApres = (await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json()))[0];
    verifier(
        'propositions : la proposition validée est appliquée à l’objet Client et tracée dans son historique',
        objetApres.definition === 'Personne physique ou morale ayant passé au moins une commande' &&
            objetApres.history.length === 1 &&
            /validée/.test(await page.textContent('app-propositions tbody'))
    );
    await capture('propositions');

    // ---- explorateur SQL ----
    await page.click('a[href="/explorateur"]');
    await page.waitForSelector('app-explorateur .table');
    await page.click('app-explorateur .table:has-text("clients.csv")');
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
    await page.click('app-dictionnaire .element:has-text("clients.csv")');
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
        tables: Object.values(state.tables).map(table => ({
            name: table.name,
            type: table.type,
            status: table.status,
            headers: table.headers.length
        })),
        glossaire: state.governance.glossary.map(terme => terme.term),
        dictionnaire: Object.keys(state.governance.dictionary),
        relations: state.relations.map(lien => state.tables[lien.sourceTable].name + '>' + state.tables[lien.targetTable].name),
        pastille: (document.getElementById('sdServeurChip') || {}).textContent
    }));
    verifier(
        'application classique : les deux sources déposées depuis Angular et la table conçue sont restaurées prêtes (sans ré-ingestion)',
        classique.tables.length === 3 &&
            classique.tables.every(table => table.status === 'ready') &&
            classique.tables.filter(table => table.headers === 3).length === 2 &&
            classique.tables.some(table => table.name === 'Clients consolidés' && table.type === 'designed' && table.headers === 6)
    );
    verifier(
        'application classique : glossaire et dictionnaire saisis dans Angular sont visibles',
        classique.glossaire.includes('Client') && classique.dictionnaire.includes('clients.csv')
    );
    verifier('application classique : pastille « serveur · DuckDB » (moteur distant actif)', /serveur · DuckDB/.test(classique.pastille));
    verifier(
        'application classique : le lien déclaré dans Angular est présent dans son modèle de données',
        classique.relations.sort().join() === 'Clients consolidés>commandes.csv,commandes.csv>clients.csv'
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
