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
// Le mode démonstration est essayé sur un jeu « petite taille » produit ici même, pour ne pas alourdir le test.
const dossierDemonstration = path.join(dossierTemporaire, 'jeu-demo');
const { genererLeJeuDeDemonstration } = await import(path.join(racineProjet, 'donnees-demo', 'generer.mjs'));
genererLeJeuDeDemonstration(['--taille', 'petite', '--dossier', dossierDemonstration, '--silencieux']);
const configuration = lireConfiguration({
    SD_DONNEES: dossierTemporaire,
    SD_JOURNAL: 'silent',
    SD_ADMIN_MOT_DE_PASSE: 'MotDePasseAdmin1',
    SD_DEMONSTRATION: dossierDemonstration
});
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
/** Les lignes du tableau de résultat d'une extraction, cellules séparées par « | ». */
const lignesDuResultat = async cible =>
    cible.$$eval('app-extraction .resultat .corps .ligne', lignes =>
        lignes.map(ligne =>
            Array.from(ligne.querySelectorAll('.cellule'))
                .map(cellule => cellule.textContent.trim())
                .join('|')
        )
    );
/**
 * Attend que le tableau des informations d'un objet compte ce nombre de lignes. L'écran se redessine après
 * le clic, jamais pendant : compter tout de suite reviendrait à lire l'écran d'avant.
 */
const lignesDInformations = async (cible, attendues) =>
    cible
        .waitForFunction(nombre => document.querySelectorAll('app-objets-metier tbody tr').length === nombre, attendues, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
/** Même attente, sur le texte du tableau des informations. */
const texteDesInformations = async (cible, motif) =>
    cible
        .waitForFunction(source => new RegExp(source).test(document.querySelector('app-objets-metier tbody').textContent), motif.source, {
            timeout: 3000
        })
        .then(() => true)
        .catch(() => false);
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
        (await page.$eval('.selection-espace select', liste => liste.options[liste.selectedIndex].textContent.trim())) ===
            'Espace par défaut (administrateur)' && /administrateur/.test(await page.textContent('.utilisateur'))
    );
    await page.waitForFunction(() => /v\d+\.\d+/.test(document.querySelector('app-accueil')?.textContent || ''));
    await page.waitForFunction(
        () =>
            /sources et tables/.test(document.querySelector('.kpis')?.textContent || '') &&
            !/…/.test(document.querySelector('.kpis')?.textContent || '')
    );
    verifier(
        'cockpit : indicateurs du serveur (version DuckDB, base référentielle PGlite), compteurs de l’espace et points d’attention',
        /moteur DuckDB/.test(await page.textContent('app-accueil')) &&
            /pglite/.test(await page.textContent('app-accueil')) &&
            /0\s*sources et tables/.test(await page.textContent('.kpis')) &&
            /Aucun point d'attention/.test(await page.textContent('app-accueil'))
    );
    verifier(
        'confort V12 : « Et ensuite ? » propose les écrans qui suivent le cockpit (Sources, Qualité, Extraire)',
        /Et ensuite \?/.test(await page.textContent('app-et-ensuite')) &&
            (await page.$$eval('app-et-ensuite a', liens => liens.map(lien => lien.getAttribute('href')))).join() ===
                '/sources,/qualite,/extraction'
    );
    await capture('accueil');

    // ---- V11 : fil d'Ariane, Précédent / Suivant, écrans récents ----
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources');
    await page.click('a[href="/qualite"]');
    await page.waitForSelector('app-qualite');
    const filQualite = await page.textContent('app-fil-ariane');
    verifier(
        'confort V11 : le fil d’Ariane situe l’écran dans sa famille, et les écrans récents sont à un clic',
        /Qualité & Audit/.test(filQualite) && /Récemment/.test(filQualite) && /Sources/.test(filQualite)
    );
    await page.click('app-fil-ariane button[name=precedent]');
    await page.waitForSelector('app-sources');
    verifier('confort V11 : « Précédent » revient sur l’écran d’avant', page.url().endsWith('/sources'));
    await page.keyboard.press('Alt+ArrowRight');
    await page.waitForSelector('app-qualite');
    verifier('confort V11 : Alt + → repart en avant, sans repasser par le navigateur', page.url().endsWith('/qualite'));
    // ---- V11 : l'aide « ? » — les raccourcis et le lexique, une fois pour toutes ----
    await page.click('app-aide-generale button[name=ouvrirAide]');
    await page.waitForSelector('.panneau-aide');
    const aide = await page.textContent('.panneau-aide');
    verifier(
        'confort V11 : l’aide « ? » liste les raccourcis clavier et explique les mots de l’application',
        /Ctrl \+ K/.test(aide) && /Alt \+ ←/.test(aide) && /information/.test(aide) && /terme technique : attribut/.test(aide)
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.panneau-aide'));
    verifier('confort V11 : Échap referme l’aide', true);

    // ---- V11 : le mode présentation — grandes polices, menu masqué, et rien de perdu en sortant ----
    await page.click('app-presentation button[name=presentation]');
    await page.waitForFunction(() => document.body.classList.contains('en-presentation'));
    verifier(
        'confort V11 : le mode présentation agrandit l’écran et masque le menu de gauche',
        await page.evaluate(() => {
            const rail = document.querySelector('.rail');
            return window.getComputedStyle(document.body).fontSize === '18px' && window.getComputedStyle(rail).display === 'none';
        })
    );
    await capture('mode-presentation');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('en-presentation'));
    verifier(
        'confort V11 : Échap quitte la présentation et rend l’écran tel qu’il était',
        await page.evaluate(() => window.getComputedStyle(document.querySelector('.rail')).display !== 'none')
    );
    verifier(
        'confort V11 : le bouton « imprimer » est offert à côté de l’aide',
        !!(await page.$('app-presentation button[name=imprimer]'))
    );

    await page.click('a[href="/"]');
    await page.waitForSelector('app-accueil');

    // ---- espace encore vide : le bandeau dit ce qui manque, avec le bouton pour y remédier (V12) ----
    await page.click('a[href="/extraction"]');
    await page.waitForSelector('app-sans-donnees .bandeau-vide');
    verifier(
        'confort V12 : sur un écran qui a besoin de données, un bandeau annonce qu’aucune source n’est chargée et propose d’en charger une',
        /Aucune source chargée/.test(await page.textContent('app-sans-donnees')) &&
            (await page.getAttribute('app-sans-donnees a.bouton', 'href')) === '/sources?action=charger'
    );
    await capture('sans-donnees');

    // ---- dépôt d'un CSV depuis Angular ----
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources');
    await page.setInputFiles('app-sources .entete-page input[type=file]', path.join(dossierTests, 'donnees', 'clients.csv'));
    await page.waitForSelector('app-sources tbody tr');
    const cellulesSource = await page.$$eval('app-sources tbody tr:first-child td', cellules =>
        cellules.map(cellule => cellule.textContent.trim())
    );
    verifier(
        'sources : clients.csv déposé depuis Angular, type csv, 4 lignes, 3 colonnes (' + cellulesSource.slice(0, 4).join(' | ') + ')',
        cellulesSource[0] === 'clients.csv' && cellulesSource[1] === 'csv' && cellulesSource[3] === '4' && cellulesSource[4].startsWith('3')
    );
    const doublon = await page.evaluate(async () => {
        const reponse = await fetch('/api/tables');
        return reponse.json();
    });
    verifier(
        'la source est enregistrée dans PostgreSQL avec le fichier déposé (src_<id>) et ses en-têtes',
        doublon.length === 1 && doublon[0].fichier.nom === 'src_' + doublon[0].id && doublon[0].headers.join() === 'id_client,nom,ville'
    );
    await page.setInputFiles('app-sources .entete-page input[type=file]', path.join(dossierTests, 'donnees', 'commandes.csv'));
    await page.waitForFunction(() => document.querySelectorAll('app-sources tbody tr').length === 2);
    await page.click('app-sources tbody tr:first-child button:has-text("Aperçu")');
    await page.waitForSelector('app-sources h2:has-text("Aperçu")');
    verifier(
        'aperçu : 4 lignes lues par DuckDB, colonnes affichées',
        /4 ligne/.test(await page.textContent('app-sources h2:has-text("Aperçu")')) && /Ana/.test(await page.textContent('app-sources'))
    );
    await capture('sources');
    await page.fill('app-sources input[name=recherche]', 'comm');
    await page.waitForFunction(() => document.querySelectorAll('app-sources table.sources tbody tr').length === 1);
    verifier(
        'sources : la recherche « comm » ne garde que commandes.csv',
        /commandes\.csv/.test(await page.textContent('app-sources tbody'))
    );
    await page.fill('app-sources input[name=recherche]', '');
    await page.waitForFunction(() => document.querySelectorAll('app-sources table.sources tbody tr').length === 2);
    const ligneClientsDomaine = page.locator('app-sources tbody tr', { has: page.locator('td b', { hasText: /^clients\.csv$/ }) });
    await ligneClientsDomaine.locator('input[name^=domaine-]').fill('Ventes');
    await ligneClientsDomaine.locator('input[name^=domaine-]').press('Tab');
    await page.waitForFunction(async () => (await (await fetch('/api/tables')).json()).some(source => source.theme === 'Ventes'));
    await ligneClientsDomaine.locator('button:has-text("voir")').click();
    await ligneClientsDomaine.locator('.colonnes').waitFor();
    verifier(
        'sources : domaine « Ventes » enregistré sur clients.csv, colonnes dépliées (id_client, nom, ville), nombre de lignes affiché',
        /id_client/.test(await ligneClientsDomaine.textContent()) &&
            (await ligneClientsDomaine.locator('td').nth(3).textContent()).trim() === '4'
    );
    await page.locator('app-sources input[name=parametres]').check({ force: true });
    await page.waitForSelector('app-sources tr.parametres');
    verifier(
        'sources : les paramètres de lecture CSV (séparateur, encodage, guillemets, lignes en erreur) sont proposés',
        /Séparateur/.test(await page.textContent('app-sources tr.parametres')) &&
            /Encodage/.test(await page.textContent('app-sources tr.parametres'))
    );
    await capture('sources-parametres');

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
    verifier('modèle : le graphe SVG dessine les deux tables reliées', (await page.$$('app-modele app-graphe-svg .noeud')).length === 2);
    const transformationAvant = await page.getAttribute('app-modele app-graphe-svg svg > g', 'transform');
    await page.click('app-modele app-graphe-svg button[title="Zoom avant"]');
    const agrandi = await page
        .waitForFunction(
            avant => document.querySelector('app-modele app-graphe-svg svg > g')?.getAttribute('transform') !== avant,
            transformationAvant,
            { timeout: 5000 }
        )
        .then(
            () => true,
            () => false
        );
    verifier('graphe : le bouton « + » de la barre d’outils agrandit le dessin', agrandi);
    const telechargementImage = page.waitForEvent('download');
    await page.click('app-modele app-graphe-svg button[title*="Exporter l\'image"]');
    const fichierImage = await telechargementImage;
    const enTeteImage = fs
        .readFileSync(await fichierImage.path())
        .subarray(0, 8)
        .toString('hex');
    verifier(
        'graphe : « Exporter l’image » télécharge un PNG du modèle de données',
        fichierImage.suggestedFilename() === 'modele-de-donnees.png' && enTeteImage === '89504e470d0a1a0a'
    );
    await page.click('app-modele button:has-text("Mesurer sur les données")');
    await page.waitForSelector('app-modele .badge:has-text("mesuré N-1")');
    verifier(
        'modèle : la mesure sur les données constate N-1, 0 commande sans client et 1 client sans commande (Zoé)',
        /0 ligne\(s\) de commandes\.csv sans correspondance/.test(await page.textContent('app-modele tbody')) &&
            /1 orpheline\(s\) de clients\.csv/.test(await page.textContent('app-modele tbody'))
    );
    await page.selectOption('app-modele select[name^=nature-]', 'composition');
    await page.waitForFunction(async () => (await (await fetch('/api/modele/relations')).json())[0].kind === 'composition');
    verifier('modèle : la nature du lien (composition) est enregistrée', true);
    await page.selectOption('app-modele select[name=regle-attendu]', '>=');
    await page.click('app-modele button:has-text("+ Règle")');
    await page.waitForSelector('app-modele .regle');
    await page.click('app-modele .regle button:has-text("Tester")');
    await page.waitForSelector('app-modele .regle .badge:has-text("violation(s)")');
    const regleLien = await page.textContent('app-modele .regle');
    verifier(
        'modèle : la règle métier « 1 clients.csv doit avoir au moins 1 commandes.csv » trouve 1 violation sur 4 (Zoé)',
        /1 violation\(s\) sur 4 parent\(s\)/.test(regleLien) && /au moins/.test(regleLien) && /Zoé|3/.test(regleLien)
    );
    await capture('modele-regles');

    // ---- V13 : le graphe du modèle est fait de blocs rangés par domaine ----
    const blocsDuModele = await page.$$eval('app-modele app-graphe-svg .noeud text.titre-bloc', titres =>
        titres.map(titre => titre.textContent.trim())
    );
    const lignesDuBloc = await page.$$eval('app-modele app-graphe-svg .noeud text.ligne-bloc', lignes =>
        lignes.map(ligne => ligne.textContent.trim())
    );
    verifier(
        'modèle V13 : chaque table est un bloc — son nom en en-tête, ses colonnes dessous, la colonne de jointure marquée 🔗',
        blocsDuModele.some(titre => /clients\.csv/.test(titre)) &&
            lignesDuBloc.some(ligne => /^🔗 id_client/.test(ligne)) &&
            lignesDuBloc.some(ligne => /^· ville/.test(ligne))
    );
    const zones = await page.$$eval('app-modele app-graphe-svg .zone text', noms => noms.map(nom => nom.textContent.trim()));
    verifier(
        'modèle V13 : les tables sont rangées par domaine, chaque domaine dans son cadre nommé',
        zones.some(nom => /Ventes/.test(nom)) && zones.length >= 2
    );
    await capture('modele-blocs-domaines');

    // Les deux tables réunies dans le même domaine se rangent côte à côte, et leur lien redevient horizontal.
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources table.sources tbody tr');
    const ligneCommandesDomaine = page.locator('app-sources tbody tr', { has: page.locator('td b', { hasText: /^commandes\.csv$/ }) });
    await ligneCommandesDomaine.locator('input[name^=domaine-]').fill('Ventes');
    await ligneCommandesDomaine.locator('input[name^=domaine-]').press('Tab');
    await page.waitForFunction(
        async () => (await (await fetch('/api/tables')).json()).filter(source => source.theme === 'Ventes').length === 2
    );
    await page.click('a[href="/modele"]');
    await page.waitForSelector('app-modele app-graphe-svg .noeud');
    await page.waitForFunction(() => document.querySelectorAll('app-modele app-graphe-svg .zone').length === 1, null, { timeout: 10000 });
    verifier('modèle V13 : deux tables du même domaine tiennent dans un seul cadre', true);

    // ---- V13 : on prend un bloc et on le pose ailleurs ; la position est retenue ----
    const placeDuBloc = () =>
        page.$eval('app-modele app-graphe-svg .noeud rect', rectangle => ({
            x: Number(rectangle.getAttribute('x')),
            y: Number(rectangle.getAttribute('y'))
        }));
    const avantDeplacement = await placeDuBloc();
    const bloc = page.locator('app-modele app-graphe-svg .noeud').first();
    const cadreDuBloc = await bloc.boundingBox();
    await page.mouse.move(cadreDuBloc.x + cadreDuBloc.width / 2, cadreDuBloc.y + cadreDuBloc.height / 2);
    await page.mouse.down();
    await page.mouse.move(cadreDuBloc.x + cadreDuBloc.width / 2 + 120, cadreDuBloc.y + cadreDuBloc.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    const apresDeplacement = await placeDuBloc();
    verifier(
        'modèle V13 : un bloc se prend à la souris et se pose ailleurs',
        apresDeplacement.x > avantDeplacement.x + 20 && apresDeplacement.y > avantDeplacement.y + 10
    );
    // La position survit au changement d'écran : c'est le schéma de la personne, pas une vue jetable.
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources table.sources tbody tr');
    await page.click('a[href="/modele"]');
    await page.waitForSelector('app-modele app-graphe-svg .noeud rect');
    const apresRetour = await placeDuBloc();
    verifier(
        'modèle V13 : la position choisie est retenue d’un écran à l’autre',
        Math.abs(apresRetour.x - apresDeplacement.x) < 2 && Math.abs(apresRetour.y - apresDeplacement.y) < 2
    );
    await capture('modele-bloc-deplace');
    // « Ranger » oublie les déplacements et refait la disposition.
    await page.click('app-modele app-graphe-svg button[name=ranger]');
    await page.waitForFunction(
        position => Math.abs(Number(document.querySelector('app-modele app-graphe-svg .noeud rect').getAttribute('x')) - position.x) > 20,
        apresDeplacement
    );
    verifier('modèle V13 : « Ranger » oublie les blocs déplacés et refait la disposition', true);

    // ---- graphes V12.11 : tracé à angles droits, couloirs distincts, mise en avant au survol ----
    const cheminsDuModele = await page.$$eval('app-modele app-graphe-svg .lien path[stroke]:not([stroke=transparent])', chemins =>
        chemins.map(chemin => chemin.getAttribute('d'))
    );
    verifier(
        'graphe : les liens sont tracés à angles droits (segments), et non plus en courbes',
        cheminsDuModele.length >= 1 &&
            cheminsDuModele.every(chemin => /^M [\d.-]+ [\d.-]+ L /.test(chemin)) &&
            cheminsDuModele.every(chemin => !/C /.test(chemin))
    );
    await page.hover('app-modele app-graphe-svg .lien');
    await page.waitForSelector('app-modele app-graphe-svg .lien.en-avant');
    verifier(
        'graphe : au survol, le lien est mis en avant et redessiné par-dessus les cases',
        (await page.$$('app-modele app-graphe-svg path.lien-en-avant')).length >= 1
    );
    await capture('graphe-angles-droits');
    // La bascule vers les liens courbes est mémorisée.
    await page.click('app-modele app-graphe-svg button[name=basculerTrace]');
    await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('app-modele app-graphe-svg .lien path[stroke]')).some(chemin =>
            /C /.test(chemin.getAttribute('d') || '')
        )
    );
    verifier('graphe : la bascule passe aux liens courbes', true);
    await page.click('app-modele app-graphe-svg button[name=basculerTrace]');
    await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('app-modele app-graphe-svg .lien path[stroke]')).every(
            chemin => !/C /.test(chemin.getAttribute('d') || '')
        )
    );

    // ---- V13 : la vue graphique de l'extraction — cocher ses colonnes sur le schéma ----
    await page.click('a[href="/extraction"]');
    await page.waitForSelector('app-extraction');
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    await page.click('app-extraction button[name=vueGraphique]');
    await page.waitForSelector('app-vue-graphique-extraction .case-table');
    const casesDuSchema = await page.$$eval('app-vue-graphique-extraction .case-table .nom-table', noms =>
        noms.map(nom => nom.textContent.trim())
    );
    verifier(
        'extraction V13 : la vue graphique montre la table de départ et les tables qu’elle atteint',
        casesDuSchema.includes('clients.csv') && casesDuSchema.includes('commandes.csv')
    );
    // Cocher une colonne sur la case de commandes.csv l'ajoute avec le bon chemin, sans passer par les menus.
    const caseCommandes = page.locator('app-vue-graphique-extraction .case-table', {
        has: page.locator('.nom-table', { hasText: /^commandes\.csv$/ })
    });
    await caseCommandes.locator('.ligne-colonne', { hasText: 'montant' }).locator('input[type=checkbox]').check();
    await page.waitForSelector('app-extraction .colonne-choisie, app-extraction tbody tr');
    const colonnesRetenues = await page.evaluate(() =>
        [...document.querySelectorAll('app-vue-graphique-extraction .ligne-colonne.choisie .nom-colonne')].map(nom =>
            nom.textContent.trim()
        )
    );
    verifier(
        'extraction V13 : cocher une colonne sur le schéma l’ajoute à l’extraction, avec le chemin de jointure',
        colonnesRetenues.includes('montant') &&
            /commandes\.csv\.montant/.test(await page.textContent('app-extraction')) &&
            (await page.$$('app-vue-graphique-extraction svg path[marker-end]')).length >= 1
    );
    await capture('extraction-vue-graphique');
    await page.click('app-extraction button[name=fermerVueGraphique]');

    // ---- extraction : colonnes, filtre, aperçu, comptage, bilan, export, paramétrage ----
    await page.click('a[href="/extraction"]');
    await page.waitForSelector('app-extraction');
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    await page.waitForSelector('app-extraction select[name=ajout_table]');
    for (const colonne of ['nom', 'ville']) {
        await page.selectOption('app-extraction select[name=ajout_colonne]', colonne);
        await page.click('app-extraction button[name=ajouterColonne]');
    }
    await page.selectOption('app-extraction select[name=ajout_table]', { label: 'commandes.csv' });
    await page.selectOption('app-extraction select[name=ajout_colonne]', 'montant');
    await page.click('app-extraction button[name=ajouterColonne]');
    await page.waitForFunction(() => document.querySelectorAll('app-extraction table.tableau tbody tr').length === 3);
    verifier(
        'extraction : commandes.csv est atteignable par le lien du modèle ; 3 colonnes en sortie',
        (await page.$$('app-extraction table.tableau tbody tr')).length === 3
    );
    await page.selectOption('app-extraction select[name=filtre_colonne]', 'ville');
    await page.selectOption('app-extraction select[name=filtreOperateur]', 'in');
    await page.fill('app-extraction input[name=filtreValeur]', 'paris;lyon');
    await page.click('app-extraction button[name=ajouterFiltre]');
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForSelector('app-extraction .resultat');
    const enTetes = await page.$$eval('app-extraction .entete-colonnes .cellule b', cellules =>
        cellules.map(cellule => cellule.textContent)
    );
    verifier('extraction : aperçu avec les colonnes nom, ville et commandes.montant', enTetes.join() === 'nom,ville,commandes.montant');
    await page.click('app-extraction button[name=compter]');
    await page.waitForFunction(() => /^[0-9]/.test(document.querySelector('app-extraction .total')?.textContent?.trim() || ''));
    verifier(
        'extraction : 4 lignes au total (jointure gauche, filtre ville dans paris;lyon)',
        (await page.textContent('app-extraction .total')).trim() === '4'
    );
    await page.click('app-extraction button[name=bilan]');
    await page.waitForSelector('app-extraction .bilan');
    const bilanExtraction = await page.textContent('app-extraction .bilan');
    verifier(
        'extraction : le bilan qualité du résultat donne 4 lignes et 100 % de complétude sur les 3 colonnes',
        /4 ligne\(s\), 3 colonne\(s\)/.test(bilanExtraction) && (bilanExtraction.match(/100 %/g) || []).length === 3
    );
    await page.click('app-extraction button[name=voirSql]');
    await page.waitForSelector('app-extraction textarea[name=sql]');
    const sqlGenere = await page.inputValue('app-extraction textarea[name=sql]');
    verifier(
        'extraction : le SQL généré est affiché, avec la jointure gauche et le filtre',
        /LEFT JOIN/.test(sqlGenere) && /IN \('PARIS', 'LYON'\)/.test(sqlGenere)
    );
    await capture('extraction-bilan');
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.click('app-extraction button[name=genererCsv]')]);
    const contenuCsv = fs.readFileSync(await telechargement.path(), 'utf8');
    verifier(
        'extraction : export CSV téléchargé (en-têtes, 4 lignes, point-virgule)',
        telechargement.suggestedFilename() === 'clients_extraction.csv' &&
            contenuCsv.startsWith('﻿"nom";"ville";"commandes.montant"') &&
            contenuCsv.trim().split('\n').length === 5
    );
    // Les paramétrages sont rangés derrière leur bouton d'outil, comme dans le plan de travail de l'application classique.
    await page.click('app-extraction button[name=outilParametrages]');
    page.once('dialog', dialogue => dialogue.accept('Clients Paris Lyon'));
    await page.click('app-extraction button[name=enregistrerModele]');
    await page.waitForSelector('.notification.succes:has-text("Paramétrage")');
    verifier(
        'extraction : paramétrage enregistré et proposé dans la liste',
        (
            await page.$$eval('app-extraction select[name=modeleChoisi] option', options => options.map(option => option.textContent))
        ).includes('Clients Paris Lyon')
    );
    await capture('extraction');

    // ---- extraction : dédoublonnage par clé fonctionnelle (une ligne par client) ----
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    await page.selectOption('app-extraction select[name=ajout_colonne]', 'nom');
    await page.click('app-extraction button[name=ajouterColonne]');
    await page.selectOption('app-extraction select[name=ajout_table]', { label: 'commandes.csv' });
    await page.selectOption('app-extraction select[name=ajout_colonne]', 'id_commande');
    await page.click('app-extraction button[name=ajouterColonne]');
    await page.click('app-extraction input[name=dedoublonner]');
    await page.click('app-extraction table.tableau tbody tr:first-child input[type=checkbox]');
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForFunction(() => /id_commande/.test(document.querySelector('app-extraction .entete-colonnes')?.textContent || ''));
    const lignesDedoublonnees = await lignesDuResultat(page);
    verifier(
        'extraction : dédoublonnage par la clé « nom » — une ligne par client, la première commande retenue (Ana → 100)',
        lignesDedoublonnees.length === 4 && lignesDedoublonnees.includes('Ana|100')
    );
    await page.selectOption('app-extraction select[name=garder]', 'derniere');
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('app-extraction .resultat .corps .ligne')).some(ligne => /101/.test(ligne.textContent))
    );
    const lignesDernieres = await lignesDuResultat(page);
    verifier(
        'extraction : en conservant la dernière ligne, Ana ressort avec sa commande 101 (toujours une ligne par client)',
        lignesDernieres.length === 4 && lignesDernieres.includes('Ana|101') && !lignesDernieres.includes('Ana|100')
    );
    await capture('extraction-dedoublonnage');

    // ---- extraction : regroupement avec une mesure à critères (NB.SI.ENS) ----
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    await page.selectOption('app-extraction select[name=ajout_colonne]', 'ville');
    await page.click('app-extraction button[name=ajouterColonne]');
    await page.click('app-extraction input[name=regrouper]');
    await page.waitForSelector('app-extraction select[name=mesureFonction]');
    await page.selectOption('app-extraction select[name=critere_table]', { label: 'commandes.csv' });
    await page.selectOption('app-extraction select[name=critere_colonne]', 'montant');
    await page.selectOption('app-extraction select[name=critereOperateur]', '>=');
    await page.fill('app-extraction input[name=critereValeur]', '20');
    await page.click('app-extraction button[name=ajouterCritere]');
    await page.click('app-extraction button[name=ajouterMesure]');
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForFunction(() => /Nombre de lignes/.test(document.querySelector('app-extraction .entete-colonnes')?.textContent || ''));
    const lignesRegroupees = await lignesDuResultat(page);
    verifier(
        'extraction : regroupement par ville avec « nombre de lignes SI montant ≥ 20 » — Paris 1 (25,5), Lyon 1 (99,9), Lille 0',
        lignesRegroupees.includes('Paris|1') && lignesRegroupees.includes('Lyon|1') && lignesRegroupees.includes('Lille|0')
    );
    await capture('extraction-regroupement');

    // ---- extraction : filtre « dans le fichier » (V12.3) — une liste collée, vérifiée, jointe et ordonnée ----
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    await page.click('app-extraction input[name=regrouper]'); // on repart d'une extraction ligne à ligne
    await page.selectOption('app-extraction select[name=ajout_colonne]', 'nom');
    await page.click('app-extraction button[name=ajouterColonne]');
    await page.click('app-extraction button[name=ouvrirFiltreFichier]');
    await page.click('app-extraction button[name=collerFichier]');
    await page.fill('app-extraction textarea[name=texteColle]', 'client;commentaire\nZoé;à relancer\nAna;VIP\nInconnu;à créer');
    await page.click('app-extraction button[name=lireColle]');
    await page.waitForSelector('app-extraction select[name=colonneFichier]');
    await page.selectOption('app-extraction select[name=cible-fichier_colonne]', 'nom');
    await page.click('app-extraction button[name=ajouterCorrespondance]');
    await page.click('app-extraction button[name=verifierFichier]');
    await page.waitForSelector('app-extraction .bloc.fichier .badge.alerte');
    const bilanDuFichier = await page.textContent('app-extraction .bloc.fichier .badge.alerte');
    verifier(
        'extraction : la vérification du fichier annonce 1 valeur sur 3 absente de clients.csv (« Inconnu »)',
        /1 valeur\(s\) sur 3 absente/.test(bilanDuFichier)
    );
    await page.click('app-extraction input[name=joindreColonnes]');
    await page.click('app-extraction input[name=conserverOrdre]');
    await page.click('app-extraction button[name=validerFiltreFichier]');
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForFunction(() => /commentaire/.test(document.querySelector('app-extraction .entete-colonnes')?.textContent || ''));
    const lignesDuFichier = await lignesDuResultat(page);
    verifier(
        'extraction : le filtre fichier garde les 2 clients connus, dans l’ordre du fichier, avec la colonne « commentaire » rapatriée',
        lignesDuFichier.length === 2 && lignesDuFichier[0] === 'Zoé|Zoé|à relancer' && lignesDuFichier[1] === 'Ana|Ana|VIP'
    );
    await capture('extraction-filtre-fichier');

    // ---- extraction avancée : assistants (colonne calculée, synthèse), filtre sur liste, résultat enregistré comme source ----
    await page.selectOption('app-extraction select[name=base]', { label: 'clients.csv' });
    for (const colonne of ['nom', 'ville']) {
        await page.selectOption('app-extraction select[name=ajout_colonne]', colonne);
        await page.click('app-extraction button[name=ajouterColonne]');
    }
    // Les assistants sont des onglets du panneau « Ajouter une colonne » (plan de travail V12).
    await page.click('app-extraction button[name=ongletAjout_calcul]');
    await page.selectOption('app-extraction select[name=calc_fn]', 'concat');
    for (const colonne of ['nom', 'ville']) {
        await page.selectOption('app-extraction select[name=calc_colonne]', colonne);
        await page.click('app-extraction .assistant.calcul button:has-text("ajouter cette colonne")');
    }
    await page.fill('app-extraction input[name=calc_alias]', 'etiquette');
    await page.click('app-extraction button[name=ajouterCalcul]');
    await page.click('app-extraction button[name=ongletAjout_synthese]');
    await page.fill('app-extraction input[name=synthese_alias]', 'nb_commandes');
    await page.click('app-extraction button[name=ajouterSynthese]');
    await page.waitForFunction(() => document.querySelectorAll('app-extraction table.tableau tbody tr').length === 4);
    verifier(
        'extraction : les assistants ƒx et Σ ajoutent une colonne calculée et une synthèse (4 colonnes en sortie)',
        (await page.$$('app-extraction table.tableau tbody tr')).length === 4
    );
    await page.selectOption('app-extraction select[name=filtre_colonne]', 'ville');
    await page.selectOption('app-extraction select[name=filtreOperateur]', 'list');
    await page.click('app-extraction button[name=ajouterFiltre]');
    page.once('dialog', dialogue => dialogue.accept('paris\nLILLE'));
    await page.click('app-extraction .puce button:has-text("coller")');
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForFunction(() => /nb_commandes/.test(document.querySelector('app-extraction .entete-colonnes')?.textContent || ''));
    const lignesAvancees = await lignesDuResultat(page);
    verifier(
        'extraction avancée : étiquette concaténée, nombre de commandes par client (synthèse sans jointure), filtre « dans la liste » paris + lille → 3 clients',
        lignesAvancees.length === 3 && lignesAvancees.includes('Ana|Paris|Ana Paris|2') && lignesAvancees.includes('Zoé|Lille|Zoé Lille|0')
    );
    await capture('extraction-assistants');
    await page.click('app-extraction input[name=ajouterCommeSource]');
    await page.fill('app-extraction input[name=nomSourceProduite]', 'Clients Paris Lille');
    await Promise.all([page.waitForEvent('download'), page.click('app-extraction button[name=genererCsv]')]);
    await page.waitForSelector('.notification.succes:has-text("Source « Clients Paris Lille »")');
    verifier(
        'extraction avancée : le résultat est aussi enregistré comme source (3 lignes, 4 colonnes)',
        /3 ligne\(s\), 4 colonne\(s\)/.test(await page.textContent('.notification.succes:has-text("Source « Clients Paris Lille »")'))
    );

    // ---- extraction : SQL personnalisé, à partir de la requête générée ----
    const sqlDeBase = await page.inputValue('app-extraction textarea[name=sql]');
    await page.click('app-extraction input[name=sqlPersonnalise]');
    await page.fill(
        'app-extraction textarea[name=sql]',
        `SELECT upper("nom") AS cri FROM (\n${sqlDeBase}\n) AS extraction ORDER BY cri LIMIT 2`
    );
    await page.click('app-extraction button[name=previsualiser]');
    await page.waitForFunction(() => /cri/.test(document.querySelector('app-extraction .entete-colonnes')?.textContent || ''));
    verifier(
        'extraction : le SQL personnalisé, dérivé de la requête générée, est exécuté tel quel (ANA puis IDRIS)',
        (await lignesDuResultat(page)).join() === 'ANA,IDRIS'
    );

    // ---- jeux temporaires : garder un résultat, l'exploiter ailleurs, le promouvoir ----
    await page.click('app-extraction input[name=sqlPersonnalise]');
    page.once('dialog', dialogue => dialogue.accept('Clients à vérifier'));
    await page.click('app-extraction button[name=garderJeu]');
    await page.waitForSelector('.notification.succes:has-text("Jeu « Clients à vérifier » gardé")');
    verifier(
        'jeux : le résultat de l’extraction est gardé comme jeu temporaire (3 lignes, 4 colonnes)',
        /3 ligne\(s\), 4 colonne\(s\)/.test(await page.textContent('.notification.succes:has-text("Clients à vérifier")'))
    );
    await page.click('a[href="/jeux"]');
    await page.waitForSelector('app-jeux table.tableau tbody tr');
    // Cellule par cellule : nom, origine, lignes, colonnes.
    const cellulesJeu = await page.$$eval('app-jeux table.tableau tbody tr:first-child td', cellules =>
        cellules.slice(0, 4).map(cellule => cellule.textContent.trim())
    );
    verifier(
        'jeux : le panneau liste le jeu avec son origine et sa volumétrie',
        cellulesJeu[0] === 'Clients à vérifier' && /extraction/.test(cellulesJeu[1]) && cellulesJeu[2] === '3' && cellulesJeu[3] === '4'
    );
    await capture('jeux-temporaires');
    // Le jeu n'est pas une source : l'écran Sources ne doit pas le montrer.
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources');
    verifier('jeux : un jeu temporaire n’apparaît pas dans les Sources', !/Clients à vérifier/.test(await page.textContent('app-sources')));
    // …mais Qualité doit pouvoir l'auditer.
    await page.click('a[href="/qualite"]');
    await page.waitForSelector('app-qualite select[name=source]');
    const sourcesAuditables = await page.$$eval('app-qualite select[name=source] option', options =>
        options.map(option => option.textContent.trim())
    );
    verifier(
        'jeux : le jeu est proposé à l’audit, aux côtés des sources',
        sourcesAuditables.includes('Clients à vérifier') && sourcesAuditables.includes('clients.csv')
    );
    await page.click('a[href="/jeux"]');
    await page.waitForSelector('app-jeux table.tableau tbody tr');
    page.once('dialog', dialogue => dialogue.accept('Clients vérifiés'));
    await page.click('app-jeux button:has-text("Promouvoir en source")');
    await page.waitForSelector('.notification.succes:has-text("est désormais une source")');
    await page.click('a[href="/sources"]');
    await page.waitForFunction(() => /Clients vérifiés/.test(document.querySelector('app-sources')?.textContent || ''));
    verifier('jeux : promu, le jeu devient une source de l’espace', true);

    // ---- Sources : vue cartes et actions à un clic (V12.0) ----
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources button[name=vueCartes]');
    await page.click('app-sources button[name=vueCartes]');
    await page.waitForSelector('app-sources .carte-source');
    const cartesSources = await page.$$eval('app-sources .carte-source', cartes =>
        cartes.map(carte => carte.textContent.replace(/\s+/g, ' ').trim())
    );
    verifier(
        'sources : la vue cartes présente chaque source avec ses chiffres et ses actions à un clic',
        cartesSources.length >= 2 &&
            cartesSources.some(
                carte => /clients\.csv/.test(carte) && /Explorer/.test(carte) && /Auditer/.test(carte) && /Extraire/.test(carte)
            )
    );
    await capture('sources-cartes');
    // Une action mène bien à l'écran visé, sur la bonne source.
    await page.click('app-sources .carte-source:has-text("clients.csv") button:has-text("Extraire")');
    await page.waitForSelector('app-extraction');
    verifier('sources : « Extraire » depuis une carte ouvre l’écran Extraire', page.url().includes('/extraction'));
    // La vue choisie est mémorisée.
    await page.click('a[href="/sources"]');
    // Les cartes n'apparaissent qu'une fois la liste des sources revenue du serveur : on l'attend.
    await page.waitForSelector('app-sources .carte-source');
    verifier('sources : la vue cartes est retrouvée à la visite suivante', (await page.$$('app-sources .carte-source')).length >= 2);
    await page.click('app-sources button[name=vueListe]');
    await page.waitForSelector('app-sources table.tableau.sources');

    // ---- plein écran (⛶) sur un tableau de données ----
    await page.click('a[href="/navigateur"]');
    await page.waitForSelector('app-navigateur');
    await page.selectOption('app-navigateur select[name=table]', { label: 'clients.csv' });
    await page.waitForSelector('app-navigateur .carte.defilement-x app-plein-ecran button');
    await page.click('app-navigateur .carte.defilement-x app-plein-ecran button');
    await page.waitForSelector('app-navigateur .carte.en-plein-ecran');
    verifier(
        'plein écran : le tableau de données occupe la fenêtre et le corps ne défile plus derrière',
        (await page.$$('app-navigateur .carte.en-plein-ecran')).length === 1 &&
            (await page.evaluate(() => document.body.classList.contains('avec-plein-ecran')))
    );
    await capture('plein-ecran');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.en-plein-ecran'));
    verifier('plein écran : Échap revient à la disposition normale', true);

    // ---- recherche globale Ctrl+K et raccourcis d'écran ----
    await page.keyboard.press('Control+k');
    await page.waitForSelector('app-palette-commandes input[name=rechercheGlobale]');
    await page.fill('app-palette-commandes input[name=rechercheGlobale]', 'audit');
    // La liste se recalcule à la frappe : on attend qu'elle soit filtrée avant de la lire.
    await page.waitForFunction(() =>
        [...document.querySelectorAll('app-palette-commandes .resultats li')].some(ligne =>
            /Lancer un audit qualité/.test(ligne.textContent)
        )
    );
    const propositionsAudit = await page.$$eval('app-palette-commandes .resultats li', lignes =>
        lignes.map(ligne => ligne.textContent.replace(/\s+/g, ' ').trim())
    );
    verifier(
        'recherche Ctrl+K : « audit » propose l’écran Qualité & Audit et l’action « Lancer un audit qualité »',
        propositionsAudit.some(ligne => /Qualité & Audit/.test(ligne)) &&
            propositionsAudit.some(ligne => /Lancer un audit qualité/.test(ligne))
    );
    await capture('recherche-globale');
    await page.fill('app-palette-commandes input[name=rechercheGlobale]', 'clients');
    const propositionsClients = await page.$$eval('app-palette-commandes .resultats li', lignes =>
        lignes.map(ligne => ligne.textContent.replace(/\s+/g, ' ').trim())
    );
    verifier(
        'recherche Ctrl+K : les sources de l’espace et leurs colonnes sont proposées',
        propositionsClients.some(ligne => /clients\.csv/.test(ligne))
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('app-palette-commandes .palette'));
    // « G » puis « S » mène aux Sources, « G » puis « X » à Extraire.
    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await page.waitForSelector('app-sources');
    await page.keyboard.press('g');
    await page.keyboard.press('x');
    await page.waitForSelector('app-extraction');
    verifier('raccourcis : G puis S ouvre les Sources, G puis X ouvre Extraire', true);

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
    // Assistant pas à pas : un second enrichissement (id_commande, accès direct), vérifié puis retiré.
    await page.click('app-tables-concues button:has-text("Assistant pas à pas")');
    await page.selectOption('app-assistant-enrichissement select[name=assistant-table]', { label: 'commandes.csv' });
    await page.selectOption('app-assistant-enrichissement select[name=assistant-colonne]', 'id_commande');
    await page.check('app-assistant-enrichissement input[name=assistant-acces][value=direct]');
    await page.selectOption('app-assistant-enrichissement select[name=assistant-accroche]', 'id_client');
    await page.selectOption('app-assistant-enrichissement select[name=assistant-cle]', 'id_client');
    await capture('tables-concues-assistant');
    await page.click('app-assistant-enrichissement button:has-text("Ajouter cet enrichissement")');
    await page.waitForSelector('app-tables-concues select[name=enrichissement-source-1]');
    verifier(
        'tables conçues : l’assistant pas à pas ajoute un enrichissement complet (commandes.csv.id_commande par id_client)',
        (await page.inputValue('app-tables-concues select[name=enrichissement-source-1]')) === 'commandes.csv' &&
            (await page.inputValue('app-tables-concues select[name=enrichissement-colonne-1]')) === 'id_commande' &&
            (await page.inputValue('app-tables-concues input[name=enrichissement-nom-1]')) === 'id_commande' &&
            (await page.inputValue('app-tables-concues select[name=enrichissement-cle-1]')) === 'id_client'
    );
    await page.click('app-tables-concues .bloc-source:has(select[name=enrichissement-source-1]) button.danger:has-text("✕")');
    await page.waitForSelector('app-tables-concues select[name=enrichissement-source-1]', { state: 'detached' });
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
            // Le montant de Zoé est vide : les tableaux de résultats l'affichent « — » depuis la V11.
            apercuRecette.lignes.some(ligne => ligne[1] === '3' && ligne[3] === 'LILLE' && ligne[4] === '—' && ligne[5] === 'Zoé (LILLE)')
    );
    // Le tableau de résultats est le composant commun : tri d'un clic sur l'en-tête (V11).
    const colonneIdentifiant = () =>
        page.$$eval('app-tables-concues app-tableau-donnees tbody tr td:nth-child(2)', cellules =>
            cellules.map(cellule => cellule.textContent.trim())
        );
    await page.click('app-tables-concues app-tableau-donnees th.triable:nth-child(2)');
    await page.waitForFunction(() =>
        /▲/.test(document.querySelectorAll('app-tables-concues app-tableau-donnees th.triable')[1]?.textContent || '')
    );
    const identifiantsCroissants = await colonneIdentifiant();
    await page.click('app-tables-concues app-tableau-donnees th.triable:nth-child(2)');
    await page.waitForFunction(() =>
        /▼/.test(document.querySelectorAll('app-tables-concues app-tableau-donnees th.triable')[1]?.textContent || '')
    );
    const identifiantsDecroissants = await colonneIdentifiant();
    verifier(
        'confort V11 : un clic sur une en-tête trie le tableau de résultats, un deuxième le renverse',
        identifiantsCroissants.join() === '1,2,3,4' && identifiantsDecroissants.join() === '4,3,2,1'
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
    // V13 : une phrase dit ce qu'on fait ici et pourquoi ; on peut la refermer pour de bon.
    await page.waitForSelector('app-aide-ecran .bandeau-aide');
    const aideObjets = await page.textContent('app-aide-ecran');
    await page.click('app-aide-ecran button[name=fermerAide]');
    await page.click('a[href="/glossaire"]');
    await page.waitForSelector('app-glossaire');
    // Le bandeau du glossaire n'est pas posé au même instant que l'écran : on l'attend, sans quoi on lit le vide.
    await page.waitForSelector('app-aide-ecran .bandeau-aide');
    const aideGlossaire = await page.textContent('app-aide-ecran');
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier');
    verifier(
        'gouvernance V13 : la phrase d’aide dit ce qu’on fait sur chaque écran, et reste refermée sur celui qu’on a refermé',
        /trois questions/.test(aideObjets) &&
            /mots du métier/.test(aideGlossaire) &&
            (await page.$$('app-objets-metier ~ * .bandeau-aide, app-aide-ecran .bandeau-aide')).length === 0
    );
    await page.selectOption('app-objets-metier select[name=sourceInitiale]', { label: 'clients.csv' });
    await page.click('app-objets-metier button:has-text("Initialiser")');
    await page.waitForSelector('app-objets-metier input[name=attribut-nom-2]');
    verifier(
        'objets métier : initialisation depuis clients.csv — nom « clients », 3 informations créées',
        (await page.inputValue('app-objets-metier input[name=nom]')) === 'clients' &&
            (await page.$$('app-objets-metier tbody tr')).length === 3
    );
    // V13 : la fiche d'une information répond à trois questions, et dit laquelle reste à remplir.
    await page.click('app-objets-metier button[name=ouvrirFiche-2]');
    await page.waitForSelector('app-fiche-information .jauge');
    const ficheAvant = await page.textContent('app-fiche-information');
    await page.click('app-fiche-information button[name=chercherExemples]');
    await page.waitForFunction(() => (document.querySelector('app-fiche-information input[name=fiche-exemples]') || {}).value);
    const exemples = await page.inputValue('app-fiche-information input[name=fiche-exemples]');
    verifier(
        'gouvernance V13 : la fiche d’une information montre sa complétude, la prochaine question, la colonne du fichier et va chercher des exemples réels',
        /Fiche complète à 25 %/.test(ficheAvant) &&
            /Prochaine question : C'est quoi \?/.test(ficheAvant) &&
            /clients\.csv\.ville/.test(ficheAvant) &&
            /Paris/.test(exemples)
    );
    await capture('objets-metier-fiche-information');
    await page.click('app-fiche-information button[name=fermerFiche]');
    await page.fill('app-objets-metier input[name=nom]', 'Client');
    await page.fill('app-objets-metier textarea[name=definition]', 'Personne ayant passé au moins une commande');
    await page.fill('app-objets-metier input[name=proprietaire]', 'Alice Martin');
    await page.fill('app-objets-metier input[name=domaine]', 'Ventes');
    await page.fill('app-objets-metier input[name=attribut-definition-2]', 'Ville de résidence');
    await page.click('app-objets-metier button:has-text("Enregistrer")');
    await page.waitForSelector('app-objets-metier #listeDesObjets button:has-text("Client")');
    const objetsMetier = await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json());
    verifier(
        'objets métier : « Client » enregistré dans appState.governance.businessObjects (source maître clients.csv, attribut ville défini)',
        objetsMetier.length === 1 &&
            objetsMetier[0].name === 'Client' &&
            objetsMetier[0].sources[0].role === 'maitre' &&
            objetsMetier[0].elements.find(attribut => attribut.name === 'ville').definition === 'Ville de résidence'
    );
    await capture('objets-metier');

    // ---- V13 : décrire un objet sans partir de zéro (depuis un fichier, puis depuis un modèle) ----
    await page.click('app-objets-metier button[name=decrireDepuisFichier]');
    await page.waitForSelector('app-proposition-objet');
    await page.click('app-proposition-objet button:has-text("commandes.csv")');
    await page.waitForSelector('app-proposition-objet input[name=proposition-nom-0]');
    const objetPropose = await page.evaluate(() => ({
        nom: document.querySelector('app-proposition-objet input[name=proposition-nom]').value,
        informations: [...document.querySelectorAll('app-proposition-objet input[name^=proposition-nom-]')].map(champ => champ.value),
        definitions: [...document.querySelectorAll('app-proposition-objet input[name^=proposition-definition-]')].map(champ => champ.value)
    }));
    verifier(
        'gouvernance V13 : depuis commandes.csv, l’objet « Commande » est proposé avec ses informations nommées et définies',
        objetPropose.nom === 'Commande' &&
            objetPropose.informations.join() === 'Identifiant commande,Identifiant client,Montant' &&
            /Identifiant unique/.test(objetPropose.definitions[0]) &&
            /Montant en devise/.test(objetPropose.definitions[2])
    );
    await page.waitForFunction(() =>
        /25/.test(document.querySelector('app-proposition-objet tbody tr:last-child td:last-child')?.textContent || '')
    );
    verifier(
        'gouvernance V13 : la proposition montre des exemples de valeurs réelles lus dans le fichier',
        /25/.test(await page.textContent('app-proposition-objet tbody tr:last-child td:last-child'))
    );
    await page.click('app-proposition-objet button[name=creerObjetPropose]');
    // La fiche affichée devient celle de l'objet proposé : on l'attend, sans quoi on lit encore la précédente.
    await page.waitForFunction(() => document.querySelector('app-objets-metier input[name=nom]')?.value === 'Commande');
    verifier(
        'gouvernance V13 : l’objet proposé devient une fiche à relire, avec ses trois informations et sa source maître',
        (await page.inputValue('app-objets-metier input[name=nom]')) === 'Commande' &&
            (await page.$$('app-objets-metier tbody tr')).length === 3
    );
    // ---- V12.6 : une information qui provient d'une information d'un autre objet ----
    await page.click('app-objets-metier button[name=ouvrirFiche-1]');
    await page.waitForSelector('app-fiche-information select[name=origine-objet]');
    // On retire la colonne du fichier : cette information ne vient plus de nulle part…
    await page.click('app-fiche-information .puce a');
    await page.waitForFunction(() => /Fiche complète à 50 %/.test(document.querySelector('app-fiche-information')?.textContent || ''));
    // … puis on déclare qu'elle est copiée d'une information d'un autre objet.
    await page.selectOption('app-fiche-information select[name=origine-objet]', { label: 'Client' });
    await page.selectOption('app-fiche-information select[name=origine-information]', { label: 'id_client' });
    await page.selectOption('app-fiche-information select[name=origine-nature]', 'copie');
    await page.fill('app-fiche-information input[name=origine-regle]', 'même identifiant, repris tel quel');
    await page.click('app-fiche-information button[name=ajouterOrigine]');
    await page.waitForSelector('.notification.succes:has-text("Origine déclarée")');
    const ficheOrigine = await page.textContent('app-fiche-information');
    verifier(
        'gouvernance V12.6 : « Identifiant client » est déclarée copiée de « Client › id_client », et compte désormais comme alimentée',
        /Copie/.test(ficheOrigine) &&
            /Client › id_client/.test(ficheOrigine) &&
            /même identifiant, repris tel quel/.test(ficheOrigine) &&
            /Fiche complète à 75 %/.test(ficheOrigine) &&
            /Provient d'un autre objet métier/.test(ficheOrigine)
    );
    verifier(
        'gouvernance V12.6 : la provenance héritée se lit dans la liste des informations',
        /copié de Client › id_client/.test(await page.textContent('app-objets-metier tbody'))
    );
    // Une boucle est refusée avant d'être écrite.
    await page.selectOption('app-fiche-information select[name=origine-objet]', { label: 'Client' });
    await page.selectOption('app-fiche-information select[name=origine-information]', { label: 'id_client' });
    await page.click('app-fiche-information button[name=ajouterOrigine]');
    await page.waitForSelector('.notification.erreur:has-text("déjà déclarée")');
    verifier(
        'gouvernance V12.6 : déclarer deux fois la même origine est refusé',
        /déjà déclarée/.test(await page.textContent('.notification.erreur:has-text("déjà déclarée")'))
    );
    await page.click('app-fiche-information button[name=fermerFiche]');
    await capture('objets-metier-proposition');
    // On n'enregistre pas cet objet de démonstration : on revient sur « Client ».
    await page.click('app-objets-metier #listeDesObjets button:has-text("Client")');

    // ---- V11 : actions groupées, glisser-déposer d'une colonne, dupliquer ----
    await page.click('app-objets-metier button[name=actionsGroupees]');
    await page.click('app-objets-metier button[name=choixTout]');
    await page.selectOption('app-objets-metier select[name=gesteAction]', 'confidentialite');
    await page.fill('app-objets-metier input[name=gesteValeur]', 'Interne');
    await page.click('app-objets-metier button[name=appliquerGeste]');
    // Glisser la dernière colonne du bandeau sur la première information : elle vient aussi de là.
    const colonnes = page.locator('app-objets-metier .puce.colonne');
    await colonnes.last().dragTo(page.locator('app-objets-metier tbody tr').first());
    await page.waitForSelector('.notification:has-text("rattachée à")');
    await page.click('app-objets-metier button:has-text("Enregistrer")');
    await page.waitForSelector('.notification:has-text("enregistré")');
    const clientApresGestes = (await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json()))[0];
    verifier(
        'confort V11 : la confidentialité posée d’un coup vaut pour les trois informations',
        clientApresGestes.elements.every(information => information.sensitivity === 'Interne')
    );
    verifier(
        'confort V11 : la colonne glissée sur une information s’ajoute à ses colonnes du fichier',
        clientApresGestes.elements[0].mappings.length === 2
    );
    await capture('objets-metier-gestes-groupes');
    // Dupliquer : la copie repart en brouillon, à renommer.
    await page.click('app-objets-metier button[name=dupliquerObjet]');
    await page.waitForSelector('app-objets-metier #listeDesObjets button:has-text("Client (copie)")');
    const apresCopie = await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json());
    const copie = apresCopie.find(objet => objet.name === 'Client (copie)');
    verifier(
        'confort V11 : la copie d’un objet repart en brouillon, avec ses informations et des identifiants neufs',
        !!copie &&
            copie.status === 'Brouillon' &&
            copie.elements.length === clientApresGestes.elements.length &&
            copie.elements[0].id !== clientApresGestes.elements[0].id
    );
    // On ne garde pas la copie : les écrans suivants comptent un seul objet métier.
    page.once('dialog', dialogue => dialogue.accept());
    await page.click('app-objets-metier button[name=supprimerObjet]');
    await page.waitForFunction(() => !/Client \(copie\)/.test(document.querySelector('app-objets-metier #listeDesObjets').textContent));

    // ---- V13 : colonnes répétées repliées, nombre de valeurs, et variantes d'un objet ----
    // Deux colonnes numérotées ne sont pas deux informations : c'est une seule, à deux valeurs.
    await page.click('app-objets-metier #listeDesObjets button:has-text("Client")');
    await page.click('app-objets-metier button:has-text("+ Information")');
    await page.click('app-objets-metier button:has-text("+ Information")');
    // Le nom n'est repris qu'une fois le champ quitté : on tabule, comme le ferait une main.
    await page.fill('app-objets-metier input[name=attribut-nom-3]', 'courriel_1');
    await page.press('app-objets-metier input[name=attribut-nom-3]', 'Tab');
    await page.fill('app-objets-metier input[name=attribut-nom-4]', 'courriel_2');
    await page.press('app-objets-metier input[name=attribut-nom-4]', 'Tab');
    await page.waitForSelector('app-objets-metier button[name=replierRepetitions]');
    const lignesRepliees = await page.$$('app-objets-metier tbody tr');
    verifier(
        'V13 : courriel_1 et courriel_2 se replient en une seule information « courriel » à 2 valeurs',
        lignesRepliees.length === 4 && /1 à 2 valeurs/.test(await page.textContent('app-objets-metier tbody'))
    );
    // Le repli se déplie à la demande : on retrouve chaque colonne telle que la source la porte.
    await page.click('app-objets-metier button[name=replierRepetitions]');
    verifier('V13 : déplié, chaque colonne numérotée retrouve sa ligne', await lignesDInformations(page, 5));
    await page.click('app-objets-metier button[name=replierRepetitions]');
    // Déclarer le nombre de valeurs l'emporte sur ce que les colonnes laissent déduire.
    await page.selectOption('app-objets-metier select[name=attribut-valeurs-3]', 'n');
    verifier(
        'V13 : le nombre de valeurs déclaré l’emporte sur celui déduit des colonnes',
        await texteDesInformations(page, /plusieurs valeurs/)
    );
    await capture('objets-metier-colonnes-repliees');
    // On retire le groupe : une seule croix suffit pour les deux colonnes qu'il recouvre.
    const ligneCourriel = page.locator('app-objets-metier tbody tr', { hasText: 'colonnes' }).first();
    await ligneCourriel.locator('button.danger').click();
    verifier('V13 : retirer une information repliée retire toutes les colonnes qu’elle recouvre', await lignesDInformations(page, 3));

    // Une variante : une vue filtrée d'une table, avec son nom métier et sa cardinalité.
    await page.click('app-objets-metier button[name=onglet-structure]');
    await page.selectOption('app-objets-metier select[name=varianteTable]', { label: 'commandes.csv' });
    await page.fill('app-objets-metier input[name=varianteNom]', 'Commandes réglées');
    await page.click('app-objets-metier button[name=ajouterVariante]');
    await page.waitForSelector('app-objets-metier .carte.variante');
    await page.selectOption('app-objets-metier select[name=portee-col-0]', 'montant');
    await page.selectOption('app-objets-metier select[name=portee-op-0]', 'notempty');
    await page.click('app-objets-metier button[name=ajouterPortee-0]');
    const resumeLu = await page
        .waitForFunction(
            () =>
                /vue de commandes\.csv · montant n’est pas vide/.test(
                    document.querySelector('app-objets-metier .carte.variante').textContent
                ),
            null,
            { timeout: 3000 }
        )
        .then(() => true)
        .catch(() => false);
    verifier('V13 : la variante dit en clair d’où elle vient et ce qu’elle garde', resumeLu);
    await capture('objets-metier-variantes');
    await page.click('app-objets-metier button:has-text("Enregistrer")');
    await page.waitForSelector('.notification:has-text("enregistré")');
    const clientAvecVariante = (await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json())).find(
        objet => objet.name === 'Client'
    );
    const variante = (clientAvecVariante.structure || [])[0];
    verifier(
        'V13 : la variante est conservée avec sa table, sa cardinalité, son filtre et ses informations',
        !!variante &&
            variante.name === 'Commandes réglées' &&
            variante.table === 'commandes.csv' &&
            variante.cardinality === '1–N' &&
            variante.scope.length === 1 &&
            variante.elements.length > 0
    );
    // La table de la variante devient une source contributrice : sans cela elle sortirait des parcours.
    verifier(
        'V13 : la table d’une variante est rattachée à l’objet comme source contributrice',
        clientAvecVariante.sources.some(source => source.table === 'commandes.csv' && source.role === 'contributeur')
    );
    // On retire la variante : les écrans suivants comptent les sources de « Client » sans elle.
    await page.click('app-objets-metier button[name=supprimerVariante-0]');
    await page.click('app-objets-metier button:has-text("Enregistrer")');
    await page.waitForSelector('.notification:has-text("enregistré")');

    // ---- V13 : la maîtrise contextuelle, et sa couverture sur les données réelles ----
    await page.click('app-objets-metier button[name=onglet-maitrise]');
    await page.selectOption('app-objets-metier select[name=contexteDeMaitrise]', { label: 'ville' });
    await page.click('app-objets-metier button[name=ajouterRegleMaitrise]');
    await page.fill('app-objets-metier input[name=maitrise-valeur-0]', 'Paris');
    await page.fill('app-objets-metier input[name=maitrise-proprietaire-0]', 'Équipe Île-de-France');
    await page.click('app-objets-metier button[name=verifierCouverture]');
    await page.waitForSelector('app-objets-metier [name=couvertureDuContexte]');
    const couvertureDeLaMaitrise = await page.textContent('app-objets-metier [name=couvertureDuContexte]');
    verifier(
        'V13 : la couverture confronte les règles aux valeurs réelles — Paris couverte, les autres non',
        /1\/3 valeur\(s\) de contexte couverte\(s\)/.test(couvertureDeLaMaitrise) &&
            /✅ Paris/.test(couvertureDeLaMaitrise) &&
            /⚠️ (Lyon|Lille)/.test(couvertureDeLaMaitrise) &&
            /source maître générale et le propriétaire global/.test(couvertureDeLaMaitrise)
    );
    await capture('objet-metier-maitrise');
    // La casse ne compte pas : « paris » couvre « Paris ».
    await page.fill('app-objets-metier input[name=maitrise-valeur-0]', 'PARIS');
    const couvertureApresCasse = await page
        .waitForFunction(
            () => /1\/3 valeur\(s\)/.test(document.querySelector('app-objets-metier [name=couvertureDuContexte]').textContent),
            null,
            { timeout: 3000 }
        )
        .then(() => true)
        .catch(() => false);
    verifier('V13 : la couverture ignore la casse — « PARIS » couvre toujours « Paris »', couvertureApresCasse);
    // On retire la règle : elle ne servait qu'à éprouver la couverture.
    await page.click('app-objets-metier button[name=supprimerRegleMaitrise-0]');
    await page.selectOption('app-objets-metier select[name=contexteDeMaitrise]', '');

    // ---- V13 : déclarer une hiérarchie, puis la confronter aux données ----
    await page.click('app-objets-metier button[name=onglet-hierarchies]');
    await page.click('app-objets-metier button[name=ajouterHierarchie]');
    await page.waitForSelector('app-objets-metier input[name=hier-nom-0]');
    // clients.csv ne porte pas d'arbre : on déclare id_client comme clé et comme parent, ce qui fait de
    // chaque ligne son propre parent — l'audit doit le dire plutôt que de le laisser passer.
    await page.selectOption('app-objets-metier select[name=hier-enfant-0]', 'id_client');
    await page.selectOption('app-objets-metier select[name=hier-cle-0]', 'id_client');
    await page.selectOption('app-objets-metier select[name=hier-type-0]', 'ville');
    await page.fill('app-objets-metier input[name=hier-niveau-0]', 'PARIS');
    await page.click('app-objets-metier button[name=ajouterNiveau-0]');
    verifier('V13 : un niveau déclaré sans parent admis est marqué « racine »', /racine/.test(await page.textContent('app-objets-metier')));
    await page.click('app-objets-metier button[name=auditerArbre-0]');
    await page.waitForSelector('app-objets-metier [name=auditArbre-0]');
    const tuilesDeLArbre = await page.textContent('app-objets-metier [name=auditArbre-0]');
    verifier(
        'V13 : l’audit confronte l’arbre aux données — 4 lignes, et 4 lignes parent d’elles-mêmes',
        /4/.test(tuilesDeLArbre) && /parent d’elles-mêmes/.test(tuilesDeLArbre) && /types non déclarés/.test(tuilesDeLArbre)
    );
    await capture('objet-metier-hierarchies');
    // On retire la hiérarchie : elle ne servait qu'à éprouver l'audit.
    await page.click('app-objets-metier button[name=supprimerHierarchie-0]');
    await page.click('app-objets-metier button[name=onglet-structure]');

    // V13 : la fiche porte six onglets, dans cet ordre et sous ces libellés, avec leur compteur.
    const ongletsDeLaFiche = await page.$$eval('app-objets-metier #ficheDeLObjet [name^=onglet-]', boutons =>
        boutons.map(bouton => bouton.textContent.replace(/\s+/g, ' ').trim())
    );
    verifier(
        'V13 : la fiche d’un objet porte les six onglets du classique, compteurs compris',
        ongletsDeLaFiche.length === 6 &&
            ongletsDeLaFiche[0].startsWith('🧩 Attributs & composition') &&
            ongletsDeLaFiche[1].startsWith('🔗 Sources') &&
            ongletsDeLaFiche[2].startsWith('🌳 Hiérarchies') &&
            ongletsDeLaFiche[3].startsWith('⚖️ Maîtrise') &&
            ongletsDeLaFiche[4].startsWith('🔌 Applis & usages') &&
            ongletsDeLaFiche[5].startsWith('🔎 Audit')
    );
    verifier(
        'V13 : le compteur d’un onglet dit ce qu’il contient — 3 informations, 1 source',
        ongletsDeLaFiche[0].endsWith('3') && ongletsDeLaFiche[1].endsWith('1')
    );
    await capture('objet-metier-onglets-v13');

    // Tant qu'aucune application n'est déclarée, l'onglet des usages dit où aller les déclarer.
    await page.click('app-objets-metier button[name=onglet-usage]');
    await page.waitForSelector('app-usages-objet');
    verifier(
        'V13 : sans application déclarée, l’écran des usages dit où aller les déclarer',
        /Applications & processus/.test(await page.textContent('app-usages-objet'))
    );
    await page.click('app-objets-metier button[name=onglet-structure]');

    // ---- V13 : l'audit de l'objet — check-list, score, volumétrie du périmètre, règles rattachées ----
    await page.click('app-objets-metier button[name=onglet-audit]');
    await page.waitForSelector('app-objets-metier [name=checkListDeGouvernance]');
    await page
        .waitForFunction(() => /ligne\(s\)/.test(document.querySelector('app-objets-metier').textContent), null, { timeout: 5000 })
        .catch(() => {});
    const checkListDeGouvernance = await page.textContent('app-objets-metier [name=checkListDeGouvernance]');
    verifier(
        'V13 : l’audit pose les huit points de la check-list de gouvernance',
        (checkListDeGouvernance.match(/[✅❌]/g) || []).length === 8 &&
            /Propriétaire global nommé/.test(checkListDeGouvernance) &&
            /Source maître désignée/.test(checkListDeGouvernance) &&
            /Pas de conflit de maîtres/.test(checkListDeGouvernance) &&
            /Fiche dictionnaire de la source maître validée/.test(checkListDeGouvernance)
    );
    const scoreDeGouvernance = await page.textContent('app-objets-metier [name=scoreDeGouvernance]');
    verifier(
        'V13 : le score de gouvernance dit combien de points sur huit sont satisfaits',
        /Score de gouvernance de « Client »/.test(scoreDeGouvernance) && /\([0-8]\/8\)/.test(scoreDeGouvernance)
    );
    const volumetrieDuPerimetre = await page.textContent('app-objets-metier [name=volumetrieDuPerimetre]');
    verifier(
        'V13 : l’audit montre le volume de chaque table du périmètre, et le total',
        /clients\.csv/.test(volumetrieDuPerimetre) && /Total/.test(volumetrieDuPerimetre) && /4 ligne\(s\)/.test(volumetrieDuPerimetre)
    );
    // Les règles posées plus tôt sur clients.csv portent sur une table du périmètre : l'audit les rattache.
    const reglesDuPerimetre = await page.textContent('app-objets-metier [name=reglesDuPerimetre]');
    verifier(
        'V13 : l’audit rattache à l’objet les règles de qualité qui portent sur ses tables',
        /clients\.csv/.test(reglesDuPerimetre) && /(%|non exécutée)/.test(reglesDuPerimetre)
    );
    await capture('objet-metier-audit');
    await page.click('app-objets-metier button[name=onglet-structure]');

    // ---- V11 : l'assistant de création en trois étapes ----
    await page.click('app-objets-metier button[name=assistantObjet]');
    await page.waitForSelector('app-assistant-objet');
    await page.click('app-assistant-objet button[name=etapeSuivante]');
    await page
        .waitForFunction(() => /Donnez un nom/.test(document.querySelector('app-assistant-objet').textContent), null, { timeout: 3000 })
        .catch(() => {});
    verifier(
        'confort V11 : l’assistant refuse d’avancer sans nom, et le dit',
        /Donnez un nom/.test(await page.textContent('app-assistant-objet'))
    );
    await page.fill('app-assistant-objet input[name=assistantNom]', 'Site');
    await page.fill('app-assistant-objet input[name=assistantDomaine]', 'Exploitation');
    await page.click('app-assistant-objet button[name=etapeSuivante]');
    await page.fill('app-assistant-objet textarea[name=assistantLibres]', 'Adresse\nVille du site');
    await page.click('app-assistant-objet button[name=etapeSuivante]');
    await page.fill('app-assistant-objet input[name=assistantResponsable]', 'Direction technique');
    verifier(
        'confort V11 : la dernière étape récapitule ce que l’on s’apprête à créer',
        /Site · Exploitation — 2 information\(s\) écrites à la main/.test(await page.textContent('app-assistant-objet'))
    );
    await capture('assistant-objet');
    await page.click('app-assistant-objet button[name=creerObjetAssistant]');
    await page.waitForFunction(() => document.querySelector('app-objets-metier input[name=nom]')?.value === 'Site');
    const avecSite = await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json());
    const site = avecSite.find(objet => objet.name === 'Site');
    verifier(
        'confort V11 : l’assistant crée l’objet avec son domaine, son responsable et ses deux informations',
        !!site &&
            site.domain === 'Exploitation' &&
            site.globalOwner === 'Direction technique' &&
            site.elements.map(information => information.name).join() === 'Adresse,Ville du site'
    );
    // Objet de démonstration : on le retire, les écrans suivants comptent un seul objet métier.
    page.once('dialog', dialogue => dialogue.accept());
    await page.click('app-objets-metier button[name=supprimerObjet]');
    await page.waitForFunction(() => !/Site/.test(document.querySelector('app-objets-metier #listeDesObjets').textContent));
    await page.click('app-objets-metier #listeDesObjets button:has-text("Client")');

    // ---- V13 : l'accueil de la gouvernance — la question, les tâches, les mots du métier ----
    await page.click('a[href="/"]');
    await page.waitForSelector('app-accueil-gouvernance .question');
    await page.fill('app-accueil-gouvernance input[name=question]', 'qui est responsable du client ?');
    await page.click('app-accueil-gouvernance button[name=repondre]');
    await page.waitForSelector('app-accueil-gouvernance .reponse');
    const reponseQuestion = await page.textContent('app-accueil-gouvernance .reponse');
    verifier(
        'gouvernance V13 : « qui est responsable du client ? » répond Alice Martin, domaine Ventes, avec la fiche à un clic',
        /Client/.test(reponseQuestion) &&
            /Alice Martin/.test(reponseQuestion) &&
            /Ventes/.test(reponseQuestion) &&
            (await page.$$eval('app-accueil-gouvernance .reponse a', liens => liens.map(lien => lien.textContent.trim()))).join() ===
                'Ouvrir la fiche,Voir le parcours'
    );
    await page.fill('app-accueil-gouvernance input[name=question]', "qu'est-ce qu'un client ?");
    await page.click('app-accueil-gouvernance button[name=repondre]');
    await page.waitForFunction(() =>
        /au moins une commande/.test(document.querySelector('app-accueil-gouvernance .reponse')?.textContent || '')
    );
    verifier(
        'gouvernance V13 : « qu’est-ce qu’un client ? » répond par la définition, et rien d’autre',
        /Personne ayant passé au moins une commande/.test(await page.textContent('app-accueil-gouvernance .reponse')) &&
            !/Responsable/.test(await page.textContent('app-accueil-gouvernance .reponse'))
    );
    const taches = await page.$$eval('app-accueil-gouvernance .tache', lignes => lignes.map(ligne => ligne.textContent.trim()));
    verifier(
        'gouvernance V13 : « Mes tâches » ne liste que ce qui manque vraiment (les deux informations sans définition)',
        taches.some(tache => /information\(s\) sans définition\s*2/.test(tache.replace(/\s+/g, ' '))) &&
            !taches.some(tache => /sans responsable/.test(tache))
    );
    verifier(
        'gouvernance V13 : les mots du métier sont en première page, avec de quoi ajouter le premier',
        /Les mots du métier/.test(await page.textContent('app-accueil-gouvernance')) &&
            /Aucun mot défini/.test(await page.textContent('app-accueil-gouvernance'))
    );
    await capture('accueil-gouvernance');

    // ---- qualité avancée : périmètre d'audit, anomalies, règle par groupe et lignes en échec, clé fonctionnelle, objet métier ----
    await page.click('a[href="/qualite"]');
    await page.waitForSelector('app-qualite');
    await page.selectOption('app-qualite select[name=source]', { label: 'clients.csv' });
    await page.click('app-qualite button:has-text("Profiler la source")');
    await page.waitForSelector('app-inspecteur-anomalies');
    verifier(
        'qualité avancée : l’inspecteur d’anomalies ne signale rien sur clients.csv (données propres)',
        /Aucune anomalie/.test(await page.textContent('app-inspecteur-anomalies'))
    );
    await page.click('app-qualite button:has-text("Restreindre le périmètre (filtre)")');
    await page.selectOption('app-qualite select[name=profil-colonne-0]', 'ville');
    await page.fill('app-qualite input[name=profil-valeur-0]', 'Paris');
    await page.click('app-qualite button:has-text("Profiler la source")');
    await page.waitForSelector('app-qualite .badge:has-text("périmètre : 1 filtre(s)")');
    verifier(
        'qualité avancée : le profilage restreint au périmètre ville = Paris ne compte que 2 lignes',
        /2 ligne\(s\)/.test(await page.textContent('app-qualite .carte .entete-page'))
    );
    // Analyse d'une colonne (détail), volume analysé, export JSON de l'audit.
    await page.locator('app-qualite table.tableau tbody tr').nth(0).locator('button:has-text("Détail")').click();
    await page.waitForSelector('app-detail-colonne .kpi');
    const detailId = await page.textContent('app-detail-colonne');
    verifier(
        'qualité (écrans) : le détail de la colonne id (périmètre Paris) est numérique, clé candidate, avec médiane et quartiles',
        /Numérique/.test(detailId) && /clé candidate/.test(detailId) && /médiane/.test(detailId) && /Formats/.test(detailId)
    );
    await page.locator('app-qualite table.tableau tbody tr').nth(1).locator('button:has-text("Détail")').click();
    await page.waitForSelector('app-detail-colonne .badge:has-text("Texte")');
    verifier(
        'qualité (écrans) : le détail de la colonne nom est textuel et liste ses valeurs les plus fréquentes',
        /Valeurs les plus fréquentes/.test(await page.textContent('app-detail-colonne'))
    );
    await capture('qualite-colonne');
    await page.selectOption('app-qualite select[name=echantillon]', { label: '1 000 premières lignes' });
    await page.click('app-qualite button:has-text("Profiler la source")');
    await page.waitForSelector('app-qualite .badge:has-text("volume analysé : 1000 premières lignes")');
    const telechargementAudit = page.waitForEvent('download');
    await page.click('app-qualite button:has-text("Exporter l\'audit (JSON)")');
    const fichierAudit = await telechargementAudit;
    const auditJson = JSON.parse(fs.readFileSync(await fichierAudit.path(), 'utf8'));
    verifier(
        'qualité (écrans) : l’export JSON de l’audit contient le profil, le volume analysé et le périmètre',
        fichierAudit.suggestedFilename() === 'audit_clients.csv.json' &&
            auditJson.echantillon === 1000 &&
            auditJson.colonnes.length === 3 &&
            auditJson.filtres.length === 1
    );
    await page.selectOption('app-qualite select[name=echantillon]', { label: 'Toute la source' });
    await page.click('app-qualite .onglets button:has-text("Règles")');
    await page.click('app-qualite button:has-text("Nouvelle règle")');
    await page.fill('app-formulaire-regle input[name=nom]', 'Au plus 1 client par ville');
    await page.selectOption('app-formulaire-regle select[name=type]', 'groupe');
    await page.click('app-formulaire-regle label.case:has-text("ville") input');
    await page.fill('app-formulaire-regle input[name=seuil]', '1');
    await page.click('app-formulaire-regle button[type=submit]:has-text("Enregistrer")');
    await page.waitForSelector('app-qualite tbody tr:has-text("Au plus 1 client par ville")');
    await page.click('app-qualite button:has-text("Exécuter les règles")');
    await page.waitForSelector('app-qualite .score');
    const ligneGroupe = await page.textContent('app-qualite tbody tr:has-text("Au plus 1 client par ville")');
    verifier(
        'qualité avancée : la règle d’agrégat par groupe (au plus 1 client par ville) trouve 1 groupe en échec sur 3 (Paris ×2)',
        /1 échec\(s\) \/ 3/.test(ligneGroupe) && /par ville/.test(ligneGroupe)
    );
    await page.click('app-qualite tbody tr:has-text("Au plus 1 client par ville") button:has-text("Voir les lignes")');
    await page.waitForSelector('app-page-lignes tbody tr');
    const lignesEnEchec = await page.textContent('app-page-lignes');
    verifier(
        'qualité avancée : « Voir les lignes » montre le groupe en échec (Paris, 2 clients)',
        /Lignes en échec/.test(lignesEnEchec) && /Paris/.test(lignesEnEchec) && /1 ligne\(s\)/.test(lignesEnEchec)
    );
    // Explication d'une règle, exécution d'une seule règle, dettes qualité, tendance et comparaison, scorecard, duplication.
    await page.click('app-qualite tbody tr:has-text("Au plus 1 client par ville") button[title*="vérifie"]');
    await page.waitForSelector('app-qualite tr.explication');
    verifier(
        'qualité (écrans) : le bouton « ? » déplie ce que la règle vérifie (quoi) et comment elle compte (comment)',
        /Quoi :/.test(await page.textContent('app-qualite tr.explication')) &&
            /Comment :/.test(await page.textContent('app-qualite tr.explication'))
    );
    await page.click('app-qualite tbody tr:has-text("Ville autorisée") button:has-text("Exécuter")');
    await page.waitForSelector('.notification.succes:has-text("échec(s) sur")');
    verifier(
        'qualité (écrans) : « Exécuter » sur une seule règle affiche son résultat (1 échec sur 4 : Lille)',
        /« Ville autorisée » : 1 échec\(s\) sur 4/.test(await page.textContent('.notification.succes:has-text("échec(s) sur")'))
    );
    const dettes = await page.textContent('app-dettes-qualite');
    verifier(
        'qualité (écrans) : les dettes qualité classent les deux règles en échec (coût = échecs × poids, majeure ×2 → total 4)',
        /coût total 4/.test(dettes) && /Au plus 1 client par ville/.test(dettes) && /Ville autorisée/.test(dettes)
    );
    await page.waitForSelector('app-tendance-scores select[name=comparaison-avant]');
    const tendance = await page.textContent('app-tendance-scores');
    verifier(
        'qualité (écrans) : la tendance mémorise les exécutions et compare les deux dernières règle par règle',
        /exécution\(s\)/.test(tendance) && /Comparaison de deux exécutions/.test(tendance) && /Ville autorisée/.test(tendance)
    );
    const telechargementScorecard = page.waitForEvent('download');
    await page.click('app-qualite button:has-text("Scorecard (JSON)")');
    const fichierScorecard = await telechargementScorecard;
    const scorecard = JSON.parse(fs.readFileSync(await fichierScorecard.path(), 'utf8'));
    verifier(
        'qualité (écrans) : la scorecard JSON contient le score et le résultat de chaque règle',
        fichierScorecard.suggestedFilename() === 'scorecard_clients.csv.json' &&
            typeof scorecard.score === 'number' &&
            scorecard.regles.some(regle => regle.nom === 'Au plus 1 client par ville' && regle.echecs === 1)
    );
    await capture('qualite-regles');
    await page.click('app-qualite tbody tr:has-text("Ville autorisée") button:has-text("Dupliquer")');
    await page.waitForSelector('app-qualite tbody tr:has-text("Ville autorisée (copie)")');
    verifier(
        'qualité (écrans) : « Dupliquer » crée une copie inactive de la règle',
        /inactive/.test(await page.textContent('app-qualite tbody tr:has-text("Ville autorisée (copie)")'))
    );
    page.once('dialog', dialogue => dialogue.accept());
    await page.click('app-qualite tbody tr:has-text("Ville autorisée (copie)") button:has-text("Supprimer")');
    await page.waitForSelector('app-qualite tbody tr:has-text("Ville autorisée (copie)")', { state: 'detached' });
    await page.click('app-qualite .onglets button:has-text("Clé fonctionnelle")');
    await page.waitForSelector('app-cles-fonctionnelles');
    await page.click('app-cles-fonctionnelles button:has-text("Ajouter un profil")');
    await page.selectOption('app-cles-fonctionnelles select[name=composant-colonne-0-0]', 'nom');
    await page.click('app-cles-fonctionnelles button:has-text("Ajouter un composant")');
    await page.selectOption('app-cles-fonctionnelles select[name=composant-table-0-1]', 'commandes.csv');
    await page.selectOption('app-cles-fonctionnelles select[name=composant-colonne-0-1]', 'montant');
    await page.click('app-cles-fonctionnelles button:has-text("Analyser les doublons")');
    await page.waitForSelector('app-cles-fonctionnelles h2:has-text("Résultat")');
    const resultatCle = await page.textContent('app-cles-fonctionnelles');
    verifier(
        'qualité avancée : clé fonctionnelle nom + montant (table liée commandes.csv) analysée sur 4 lignes, sans doublon',
        /4 ligne\(s\) analysée/.test(resultatCle) &&
            /0 clé\(s\) en doublon exact/.test(resultatCle) &&
            !/non chargée|Aucune relation/.test(resultatCle)
    );
    const profilsCle = await page.evaluate(async () => await (await fetch('/api/qualite/cles/clients.csv')).json());
    verifier(
        'qualité avancée : le profil de clé est enregistré dans le dictionnaire de gouvernance (2 composants)',
        profilsCle.length === 1 && profilsCle[0].parts.length === 2 && profilsCle[0].parts[1].table === 'commandes.csv'
    );
    // Exports des lignes en double : un profil sur la ville (Paris ×2), CSV des lignes et classeur Excel.
    await page.click('app-cles-fonctionnelles button:has-text("Ajouter un profil")');
    await page.selectOption('app-cles-fonctionnelles select[name=composant-colonne-1-0]', 'ville');
    await page.click('app-cles-fonctionnelles button:has-text("Analyser les doublons")');
    await page.waitForFunction(() => document.querySelectorAll('app-cles-fonctionnelles h2').length >= 3);
    const telechargementLignes = page.waitForEvent('download');
    await page.click('app-cles-fonctionnelles button:has-text("Toutes les lignes en double (CSV)")');
    const fichierLignes = await telechargementLignes;
    const csvLignes = fs
        .readFileSync(await fichierLignes.path(), 'utf8')
        .trim()
        .split(/\r?\n/);
    verifier(
        'qualité (écrans) : « Toutes les lignes en double (CSV) » exporte les 2 lignes de Paris avec profil, type et clé',
        csvLignes.length === 3 &&
            /"PROFIL";"TYPE";"GROUPE";"CLE_FONCTIONNELLE";"id_client"/.test(csvLignes[0]) &&
            /"Strict"/.test(csvLignes[1])
    );
    const telechargementClasseur = page.waitForEvent('download');
    await page.click('app-cles-fonctionnelles button:has-text("Lignes en double (Excel, 3 onglets)")');
    const fichierClasseur = await telechargementClasseur;
    verifier(
        'qualité (écrans) : « Lignes en double (Excel, 3 onglets) » télécharge un classeur .xlsx (archive ZIP)',
        fichierClasseur.suggestedFilename() === 'Doublons_clients.csv.xlsx' &&
            fs
                .readFileSync(await fichierClasseur.path())
                .subarray(0, 2)
                .toString() === 'PK'
    );
    await page.click('app-qualite .onglets button:has-text("Objet métier")');
    await page.selectOption('app-audit-objet select[name=objet]', { label: 'Client' });
    await page.click('app-audit-objet button:has-text("Auditer l\'objet")');
    await page.waitForSelector('app-audit-objet h2:has-text("table maître clients.csv")');
    const auditObjet = await page.textContent('app-audit-objet');
    verifier(
        'qualité avancée : l’audit de l’objet « Client » profile la table maître (4 lignes) et exécute les 2 règles de son périmètre',
        /4 ligne\(s\)/.test(auditObjet) && /\(2 règle\(s\)\)/.test(auditObjet) && /Au plus 1 client par ville/.test(auditObjet)
    );
    await capture('qualite-avancee');

    // ---- confort : densité compacte, liens croisés depuis l'écran Sources ----
    await page.click('header button:has-text("Compact")');
    verifier(
        'confort : le bouton « Compact » resserre l’affichage (classe compact sur la page)',
        await page.$eval('body', corps => corps.classList.contains('compact'))
    );
    await page.click('header button:has-text("Confort")');
    verifier('confort : « Confort » rétablit l’affichage aéré', !(await page.$eval('body', corps => corps.classList.contains('compact'))));
    await page.click('a[href="/sources"]');
    await page.waitForSelector('table.sources tbody tr');
    await page.click('table.sources tr:has-text("clients.csv") button:has-text("Dictionnaire")');
    await page.waitForSelector('app-dictionnaire h2:has-text("clients.csv")');
    verifier('confort : « Dictionnaire » depuis Sources ouvre directement la fiche de clients.csv', true);
    await page.click('a[href="/sources"]');
    await page.waitForSelector('table.sources tbody tr');
    await page.click('table.sources tr:has-text("clients.csv") button:has-text("Lineage")');
    await page.waitForSelector('app-lineage select[name=table]');
    // On attend la valeur, pas seulement la présence du champ : le paramètre d'adresse est appliqué au tick suivant.
    await page.waitForFunction(() => document.querySelector('app-lineage select[name=table]')?.value === 'clients.csv');
    verifier(
        'confort : « Lineage » depuis Sources ouvre « Autour d’une table » sur clients.csv',
        (await page.inputValue('app-lineage select[name=table]')) === 'clients.csv'
    );
    await page.click('a[href="/sources"]');
    await page.waitForSelector('table.sources tbody tr');
    await page.click('table.sources tr:has-text("clients.csv") button:has-text("Qualité")');
    await page.waitForSelector('app-qualite button:has-text("Profiler la source")');
    verifier(
        'confort : « Qualité » depuis Sources choisit directement clients.csv',
        (await page.$eval('app-qualite select[name=source]', choix => choix.options[choix.selectedIndex].textContent.trim())) ===
            'clients.csv'
    );

    await page.click('a[href="/actifs"]');
    await page.waitForSelector('app-actifs');
    await page.click('app-actifs button:has-text("Nouvelle application")');
    await page.fill('app-actifs input[name=nom]', 'CRM');
    await page.fill('app-actifs input[name=responsable]', 'Équipe Ventes');
    // Cases à cocher désignées par leur texte exact (« Client » ne doit pas retenir « clients.csv »).
    await page
        .locator('app-actifs label.case', { hasText: /^\s*clients\.csv\s*$/ })
        .first()
        .locator('input')
        .click();
    await page
        .locator('app-actifs label.case', { hasText: /^\s*Client\s*$/ })
        .locator('input')
        .click();
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

    // ---- V13 : qui se sert de quelle information, et les exemples pris dans les données ----
    // L'application « CRM » est déclarée : la matrice a maintenant de quoi poser ses colonnes.
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier #listeDesObjets button');
    await page.click('app-objets-metier #listeDesObjets button:has-text("Client")');
    await page.click('app-objets-metier button[name=onglet-usage]');
    await page.waitForSelector('app-usages-objet table');
    verifier(
        'V13 : la matrice des usages montre chaque information, et signale celles que personne ne lit',
        (await page.$$('app-usages-objet tbody tr.sans-usage')).length === 3 &&
            /3 information\(s\) sans usage/.test(await page.textContent('app-usages-objet'))
    );
    await capture('objets-metier-usages');
    // Vue par application : on choisit l'application, et on coche tout d'un geste.
    await page.click('app-usages-objet button[name=vue-application]');
    await page.click('app-usages-objet button[name=cocherTout]');
    const usagesPoses = await page
        .waitForFunction(() => /3\/3 information\(s\) cochée\(s\)/.test(document.querySelector('app-usages-objet').textContent), null, {
            timeout: 3000
        })
        .then(() => true)
        .catch(() => false);
    verifier('V13 : « tout cocher » déclare d’un geste ce qu’une application utilise', usagesPoses);
    await capture('objets-metier-usages-par-application');
    // Les exemples de valeurs, pris pour toutes les informations d'un coup.
    await page.click('app-objets-metier button[name=onglet-structure]');
    await page.click('app-objets-metier button[name=exemplesPourToutes]');
    // On lit la notification du bilan, pas la première venue : les précédentes sont encore à l'écran.
    const bilanDesExemples = await page.textContent('.notification:has-text("complétée")');
    verifier(
        'V13 : les exemples sont pris dans les fichiers pour toutes les informations, et le bilan est rendu',
        /3 information\(s\) complétée\(s\)/.test(bilanDesExemples)
    );
    await page.click('app-objets-metier button:has-text("Enregistrer")');
    await page.waitForSelector('.notification:has-text("enregistré")');
    const clientAvecUsages = (await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json())).find(
        objet => objet.name === 'Client'
    );
    verifier(
        'V13 : usages et exemples sont conservés sur chaque information',
        clientAvecUsages.elements.every(information => information.usedBy.length >= 1) &&
            clientAvecUsages.elements.every(information => !!information.examples && information.examplesAuto === true)
    );

    // ---- V13 : la barre latérale défile pour elle seule, et se réduit ----
    const defilementsSepares = await page.evaluate(() => {
        const navigation = document.querySelector('.rail-navigation');
        const page = document.querySelector('.defilement-page');
        const corps = document.body;
        return {
            navigation: window.getComputedStyle(navigation).overflowY,
            page: window.getComputedStyle(page).overflowY,
            // La fenêtre elle-même ne doit plus défiler : chaque colonne a le sien.
            fenetre: corps.scrollHeight <= window.innerHeight + 1
        };
    });
    verifier(
        'V13 : le menu et l’écran de droite défilent chacun de son côté, la fenêtre ne défile plus',
        defilementsSepares.navigation === 'auto' && defilementsSepares.page === 'auto' && defilementsSepares.fenetre
    );
    // Le menu descend sans emporter la page. On rétrécit la fenêtre pour qu'il déborde vraiment :
    // sans débordement, le faire défiler ne prouverait rien.
    await page.setViewportSize({ width: 1500, height: 520 });
    await page.waitForFunction(() => {
        const navigation = document.querySelector('.rail-navigation');
        return navigation.scrollHeight > navigation.clientHeight;
    });
    // On note où en est l'écran de droite AVANT de toucher au menu : c'est son immobilité qui est en jeu.
    const pageAvant = await page.evaluate(() => document.querySelector('.defilement-page').scrollTop);
    await page.evaluate(() => document.querySelector('.rail-navigation').scrollTo(0, 400));
    const apresDefilementDuMenu = await page.evaluate(() => ({
        menu: document.querySelector('.rail-navigation').scrollTop,
        page: document.querySelector('.defilement-page').scrollTop
    }));
    verifier(
        'V13 : faire défiler le menu ne déplace pas l’écran de droite',
        apresDefilementDuMenu.menu === 400 && apresDefilementDuMenu.page === pageAvant
    );
    await page.evaluate(() => document.querySelector('.rail-navigation').scrollTo(0, 0));
    await page.setViewportSize({ width: 1500, height: 950 });
    // Réduire la barre : 70 px, les libellés s'effacent, les pictogrammes restent.
    const largeurDepliee = await page.evaluate(() => document.querySelector('.rail').getBoundingClientRect().width);
    await page.click('.rail button[name=replierMenu]');
    const barreReduite = await page
        .waitForFunction(() => Math.round(document.querySelector('.rail').getBoundingClientRect().width) === 70, null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    verifier(
        'V13 : « Réduire le menu » ramène la barre à 70 px, pictogrammes seuls',
        largeurDepliee > 200 && barreReduite && (await page.$$('.rail .groupe-titre:visible')).length === 0
    );
    await capture('menu-reduit');
    // Le choix se retrouve après un rechargement, comme dans la V13.
    await page.reload();
    await page.waitForSelector('.rail');
    const repliRetrouve = await page
        .waitForFunction(() => Math.round(document.querySelector('.rail').getBoundingClientRect().width) === 70, null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    verifier('V13 : la barre réduite le reste d’une visite à l’autre', repliRetrouve);
    await page.click('.rail button[name=replierMenu]');
    await page.waitForFunction(() => document.querySelector('.rail').getBoundingClientRect().width > 200);

    // ---- V13 : la navigation de la gouvernance, rangée par famille ----
    const famillesDuRail = await page.$$eval('.rail .famille-titre', titres => titres.map(titre => titre.textContent.trim()));
    verifier(
        'V13 : la gouvernance est rangée en familles — Découvrir, Patrimoine, Acteurs, Sens métier, Lineage, Contrôle',
        JSON.stringify(famillesDuRail) === JSON.stringify(['Découvrir', 'Patrimoine', 'Acteurs', 'Sens métier', 'Lineage', 'Contrôle'])
    );
    const ecransDeLaGouvernance = await page.$$eval('.rail .groupe:has(.famille-titre) a', liens =>
        liens.map(lien => lien.textContent.replace(/\s+/g, ' ').trim())
    );
    verifier(
        'V13 : les écrans de gouvernance sont dans l’ordre et sous les libellés du classique',
        JSON.stringify(ecransDeLaGouvernance) ===
            JSON.stringify([
                '🧭Catalogue',
                '📚Dictionnaire',
                '🧬Modèle de données',
                '🖥Applications & processus',
                '👥Personnes & rôles',
                '🏛️Objets métier',
                '📖Glossaire',
                '🎚️Listes de valeurs',
                '🧩Périmètres',
                '🔐Sensibilité',
                '🕸️Lineage',
                '🛰️Surveillance des sources',
                '✅À valider',
                '📈Historique'
            ])
    );
    await capture('navigation-gouvernance');

    // ---- V13 : le modèle d'objets — les objets, ce qui les compose, ce qui les relie ----
    await page.click('a[href="/modele-objets"]');
    // Le dessin arrive après la lecture des objets : on l'attend, sinon on lirait l'écran vide.
    await page.waitForSelector('app-modele-objets .noeud');
    verifier(
        'V13 : le modèle d’objets dessine une carte par objet métier et dit ce qu’il montre',
        (await page.$$('app-modele-objets .noeud')).length >= 1 &&
            /objet\(s\).*composition\(s\).*référence\(s\)/.test(await page.textContent('app-modele-objets .entete-page'))
    );
    await capture('modele-objets');

    // ---- V13 : import en masse de la gouvernance ----
    // C'est une action du panneau de gouvernance, pas un écran du menu : elle est dans l'en-tête.
    verifier(
        'V13 : « Import en masse » est une action du panneau de gouvernance, offerte sur ses écrans',
        (await page.$$('.entete a[name=importEnMasse]')).length === 1
    );
    await page.click('.entete a[name=importEnMasse]');
    await page.waitForSelector('app-import-gouvernance');
    // Un fichier écrit à la main, avec des en-têtes en français : les colonnes doivent se reconnaître seules.
    const fichierImport = path.join(dossierTests, 'captures', 'import-dictionnaire.csv');
    fs.writeFileSync(
        fichierImport,
        [
            'Table;Colonne;Définition;Sensibilité',
            'clients.csv;nom;Nom de famille du client;Personnelle',
            'clients.csv;ville;Ville;Interne'
        ].join('\n'),
        'utf8'
    );
    await page.setInputFiles('app-import-gouvernance input[type=file]', fichierImport);
    await page.waitForSelector('app-import-gouvernance button[name=importer]');
    verifier(
        'V13 : les colonnes du fichier se posent seules sur les champs de la cible',
        (await page.inputValue('app-import-gouvernance select[name=colonne-table]')) === 'Table' &&
            (await page.inputValue('app-import-gouvernance select[name=colonne-col]')) === 'Colonne' &&
            (await page.inputValue('app-import-gouvernance select[name=colonne-definition]')) === 'Définition'
    );
    verifier(
        'V13 : l’aperçu montre ce qui sera écrit, avant que rien ne le soit',
        /Nom de famille du client/.test(await page.textContent('app-import-gouvernance tbody'))
    );
    await capture('import-gouvernance');
    await page.click('app-import-gouvernance button[name=importer]');
    await page.waitForSelector('app-import-gouvernance .compte-rendu');
    verifier(
        'V13 : l’import rend compte de ce qu’il a créé, mis à jour et ignoré',
        /2 créé\(s\)/.test(await page.textContent('app-import-gouvernance .compte-rendu'))
    );
    const dictionnaireImporte = await page.evaluate(async () => await (await fetch('/api/gouvernance/dictionnaire')).json());
    verifier(
        'V13 : les définitions et sensibilités importées sont bien enregistrées dans le dictionnaire',
        dictionnaireImporte['clients.csv'].columns.nom.description === 'Nom de famille du client' &&
            dictionnaireImporte['clients.csv'].columns.nom.sensitivity === 'Personnelle'
    );
    // Réimporté tel quel, le même contenu ne réécrit rien : on le dit plutôt que de faire semblant.
    // (Sous un autre nom : rechoisir le même fichier ne donnerait rien à signaler au navigateur.)
    const memeContenu = path.join(dossierTests, 'captures', 'import-dictionnaire-bis.csv');
    fs.copyFileSync(fichierImport, memeContenu);
    await page.setInputFiles('app-import-gouvernance input[type=file]', memeContenu);
    await page.waitForSelector('app-import-gouvernance button[name=importer]');
    await page.click('app-import-gouvernance button[name=importer]');
    await page.waitForSelector('app-import-gouvernance .compte-rendu.rien');
    verifier(
        'V13 : réimporté tel quel, rien n’est réécrit — et le motif est donné',
        /Déjà identique/.test(await page.textContent('app-import-gouvernance .compte-rendu'))
    );
    // Ce qui ne se comprend pas est signalé, pas enregistré.
    // Un autre nom de fichier : rechoisir le même laisserait le navigateur sans rien à signaler.
    const fichierEcarts = path.join(dossierTests, 'captures', 'import-informations.csv');
    fs.writeFileSync(
        fichierEcarts,
        ['Objet métier;Information;Sensibilité', 'Inexistant;x;Interne', 'Client;ville;Ultra-secrète'].join('\n'),
        'utf8'
    );
    await page.selectOption('app-import-gouvernance select[name=cible]', 'informations');
    await page.setInputFiles('app-import-gouvernance input[type=file]', fichierEcarts);
    await page.waitForSelector('app-import-gouvernance button[name=importer]');
    await page.click('app-import-gouvernance button[name=importer]');
    await page.waitForSelector('app-import-gouvernance .compte-rendu');
    const ecartsDeLImport = await page.textContent('app-import-gouvernance .compte-rendu');
    verifier(
        'V13 : un objet introuvable et une sensibilité inconnue sont expliqués, avec les noms existants en repère',
        /Objet métier introuvable/.test(ecartsDeLImport) &&
            /Sensibilité inconnue/.test(ecartsDeLImport) &&
            /Objets métier existants/.test(ecartsDeLImport)
    );
    fs.rmSync(fichierImport, { force: true });
    fs.rmSync(fichierEcarts, { force: true });
    fs.rmSync(memeContenu, { force: true });

    // V13 : « 💬 Proposer une correction » depuis la fiche — rien ne change avant validation du responsable.
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier #listeDesObjets button');
    await page.click('app-objets-metier #listeDesObjets button:has-text("Client")');
    await page.click('app-objets-metier button[name=proposerCorrection]');
    await page.fill('app-objets-metier textarea[name=correctionProposee]', 'Personne physique ou morale ayant passé au moins une commande');
    await page.click('app-objets-metier button[name=envoyerCorrection]');
    await page.waitForSelector('.notification.succes:has-text("le responsable la validera")');
    const objetAvantValidation = (await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json()))[0];
    verifier(
        'gouvernance V13 : une correction proposée depuis la fiche ne modifie rien tant qu’elle n’est pas validée',
        objetAvantValidation.definition === 'Personne ayant passé au moins une commande'
    );
    await page.click('a[href="/propositions"]');
    await page.waitForSelector('app-propositions .proposition');
    await page.click('app-propositions button:has-text("Valider")');
    await page.waitForSelector('app-propositions h2:has-text("Décisions passées")');
    const objetApres = (await page.evaluate(async () => await (await fetch('/api/gouvernance/objets-metier')).json()))[0];
    verifier(
        'propositions : la correction proposée, une fois validée, est appliquée à l’objet Client et tracée dans son historique',
        objetApres.definition === 'Personne physique ou morale ayant passé au moins une commande' &&
            objetApres.history.length === 1 &&
            /validée/.test(await page.textContent('app-propositions tbody'))
    );
    await capture('propositions');

    // ---- lineage : carte des flux synchronisée, fiche d'un nœud, parcours d'un attribut ----
    await page.click('a[href="/lineage"]');
    await page.waitForSelector('app-lineage');
    await page.click('app-lineage button:has-text("Synchroniser depuis les données")');
    await page.waitForSelector('app-lineage app-graphe-svg .noeud');
    const noeudsCarte = await page.$$eval('app-lineage app-graphe-svg .noeud .titre', titres =>
        titres.map(titre => titre.textContent.trim()).sort()
    );
    verifier(
        'lineage : la carte dérivée contient les deux fichiers, la table conçue, l’application CRM et l’objet Client (' +
            noeudsCarte.join(', ') +
            ')',
        ['🖥 CRM', '🏛️ Client', '🏛 Clients consolidés', '📄 clients.csv', '🗄 commandes.csv'].every(nom => noeudsCarte.includes(nom))
    );
    await page.click('app-lineage app-graphe-svg .noeud:has-text("Clients consolidés")');
    await page.waitForSelector('app-lineage h2:has-text("Clients consolidés")');
    verifier(
        'lineage : la table conçue alimentée par deux sources est un « Référentiel » (consolidation)',
        /Référentiel/.test(await page.textContent('app-lineage .disposition .carte'))
    );
    await capture('lineage');
    await page.click('app-lineage .onglets button:has-text("Parcours")');
    await page.selectOption('app-lineage select[name=objet]', { label: 'Client' });
    // V12.7 : sans information choisie, on voit le parcours de l'objet entier, avec sa synthèse en clair.
    await page.waitForSelector('app-lineage .synthese-parcours tbody tr');
    const syntheseObjet = await page.textContent('app-lineage .synthese-parcours');
    verifier(
        'parcours V12.7 : l’objet Client montre sa synthèse — les fichiers qui l’alimentent, avec le nombre d’informations',
        /Synthèse/.test(syntheseObjet) &&
            /amont : 1 fichiers/.test(syntheseObjet) &&
            /clients\.csv/.test(syntheseObjet) &&
            /alimente 3 information\(s\)/.test(syntheseObjet)
    );
    // V12.10 / V13.2 : « ⇠ Jusqu'au début » remonte toute la chaîne, et la phrase dit d'où part la donnée.
    await page.waitForSelector('app-lineage .depuis-le-debut');
    const depuisLeDebut = await page.textContent('app-lineage .depuis-le-debut');
    const phraseProfonde = await page.textContent('app-lineage .phrase-parcours');
    verifier(
        'parcours V12.10 : la chaîne complète remonte jusqu’à l’application qui produit le fichier, et la phrase cite ce point de départ',
        /Depuis le début/.test(depuisLeDebut) &&
            /CRM ⇢ clients\.csv ⇢ Client/.test(depuisLeDebut.replace(/\s+/g, ' ')) &&
            /tout au début : CRM/.test(phraseProfonde)
    );
    // Décoché, on revient à la vue à un niveau.
    await page.click('app-lineage input[name=jusquAuDebut]');
    await page.waitForFunction(() => !document.querySelector('app-lineage .depuis-le-debut'));
    verifier(
        'parcours V12.10 : décoché, le parcours revient à un seul niveau',
        !/tout au début/.test(await page.textContent('app-lineage .phrase-parcours'))
    );
    await page.click('app-lineage input[name=jusquAuDebut]');
    await capture('lineage-parcours-objet');
    await page.selectOption('app-lineage select[name=attribut]', { label: 'ville' });
    await page.waitForSelector('app-lineage app-graphe-svg .noeud');
    const noeudsParcours = await page.$$eval('app-lineage app-graphe-svg .noeud .titre', titres =>
        titres.map(titre => titre.textContent.trim())
    );
    verifier(
        'lineage : le parcours de l’attribut « ville » montre l’application CRM, la colonne clients.csv.ville et l’attribut',
        noeudsParcours.includes('🖥 CRM') && noeudsParcours.some(titre => /ville/.test(titre)) && noeudsParcours.length >= 3
    );
    // V13 : une phrase résume le parcours avant le graphe — on lit avant de regarder.
    verifier(
        'gouvernance V13 : le parcours s’ouvre sur une phrase qui dit d’où vient l’information et ce qui s’en sert',
        /« Client › ville » vient de .*clients\.csv/.test(await page.textContent('app-lineage .phrase-parcours'))
    );
    await capture('lineage-parcours-phrase');

    // ---- exploitation : tableau de bord (indicateur et barres), comparateur ----
    await page.click('a[href="/tableaux-de-bord"]');
    await page.waitForSelector('app-tableaux-de-bord');
    await page.click('app-tableaux-de-bord button:has-text("Nouveau tableau")');
    await page.fill('app-tableaux-de-bord input[name=nom]', 'Suivi clients');
    await page.fill('app-tableaux-de-bord input[name=tuile-titre-0]', 'Nombre de clients');
    await page.selectOption('app-tableaux-de-bord select[name=tuile-table-0]', { label: 'clients.csv' });
    await page.selectOption('app-tableaux-de-bord select[name=tuile-genre-0]', 'kpi');
    await page.click('app-tableaux-de-bord button:has-text("+ tuile")');
    await page.fill('app-tableaux-de-bord input[name=tuile-titre-1]', 'Clients par ville');
    await page.selectOption('app-tableaux-de-bord select[name=tuile-table-1]', { label: 'clients.csv' });
    await page.selectOption('app-tableaux-de-bord select[name=tuile-axe-1]', 'ville');
    await page.click('app-tableaux-de-bord button:has-text("Tout actualiser")');
    await page.waitForSelector('app-tableaux-de-bord .indicateur');
    verifier(
        'tableaux de bord : l’indicateur compte 4 clients et le graphique par ville a 3 barres',
        (await page.textContent('app-tableaux-de-bord .indicateur')).trim() === '4' &&
            (await page.$$('app-tableaux-de-bord app-graphique-svg rect')).length === 3
    );
    await capture('tableaux-de-bord');
    const telechargementHtml = page.waitForEvent('download');
    await page.click('app-tableaux-de-bord button:has-text("Export HTML autonome")');
    const fichierHtml = await telechargementHtml;
    verifier('tableaux de bord : l’export HTML autonome télécharge une page .html', /\.html$/.test(fichierHtml.suggestedFilename()));
    await page.click('app-tableaux-de-bord button:has-text("Dupliquer")');
    await page.waitForSelector('.notification.succes:has-text("(copie) » créé")');
    verifier(
        'tableaux de bord : « Dupliquer » crée une copie enregistrée et l’ouvre',
        /\(copie\)/.test(await page.inputValue('app-tableaux-de-bord input[name=nom]'))
    );
    const telechargementRapport = page.waitForEvent('download');
    await page.click('app-tableaux-de-bord button:has-text("Rapport global (HTML)")');
    verifier(
        'tableaux de bord : le rapport global HTML est téléchargé',
        /^RAPPORT_STUDIO_DATA_/.test((await telechargementRapport).suggestedFilename())
    );

    await page.click('a[href="/comparateur"]');
    await page.waitForSelector('app-comparateur');
    await page.selectOption('app-comparateur select[name=tableA]', { label: 'clients.csv' });
    await page.selectOption('app-comparateur select[name=tableB]', { label: 'Clients consolidés' });
    await page.selectOption('app-comparateur select[name=cle-a-0]', 'id_client');
    await page.click('app-comparateur button:has-text("+ colonne à comparer")');
    await page.selectOption('app-comparateur select[name=colonne-a-0]', 'ville');
    // « + colonne à comparer » contient aussi « comparer » : on vise le bouton principal.
    await page.click('app-comparateur button.principal:has-text("Comparer")');
    await page.waitForSelector('app-comparateur .synthese');
    const syntheseComparaison = await page.$$eval('app-comparateur .synthese .valeur', valeurs =>
        valeurs.map(valeur => valeur.textContent.trim())
    );
    verifier(
        'comparateur : clients.csv contre la table conçue — 4 lignes, 4 identiques (ville comparée sans tenir compte de la casse), 0 différente, 0 manquante',
        syntheseComparaison.join() === '4,4,0,0,0' &&
            /Comparaison clients\.csv vs Clients consolidés/.test(await page.textContent('app-comparateur h2'))
    );
    const telechargementComparaison = page.waitForEvent('download');
    await page.click('app-comparateur button:has-text("Télécharger le rapport CSV")');
    verifier(
        'comparateur : le rapport complet se télécharge en CSV',
        (await telechargementComparaison).suggestedFilename() === 'Comparaison_clients.csv_vs_Clients_consolides.csv'
    );

    // ---- comparateur : un fichier extérieur comparé sans devenir une source, puis les écarts gardés (V12.4) ----
    await page.setInputFiles('app-comparateur input[name=fichierB]', path.join(dossierTests, 'donnees', 'clients-recus.csv'));
    await page.waitForSelector('.notification.succes:has-text("gardé comme jeu temporaire")');
    await page.waitForFunction(() => document.querySelector('app-comparateur select[name=tableB]')?.value === 'clients-recus.csv');
    verifier(
        'comparateur : le fichier reçu est gardé comme jeu temporaire et choisi côté B, sans apparaître dans Sources',
        (await page.$$eval('app-comparateur select[name=tableB] option', options => options.map(option => option.value))).includes(
            'clients-recus.csv'
        )
    );
    await page.selectOption('app-comparateur select[name=cle-a-0]', 'id_client');
    await page.click('app-comparateur button:has-text("+ colonne à comparer")');
    await page.selectOption('app-comparateur select[name=colonne-a-0]', 'ville');
    await page.click('app-comparateur button.principal:has-text("Comparer")');
    await page.waitForFunction(() => /clients-recus/.test(document.querySelector('app-comparateur h2')?.textContent || ''));
    const syntheseFichier = await page.$$eval('app-comparateur .synthese .valeur', valeurs => valeurs.map(valeur => valeur.textContent));
    verifier(
        'comparateur : contre le fichier reçu — 4 lignes évaluées, 1 identique, 1 différente (Lyon / Marseille), 2 absentes du fichier, 1 en plus',
        syntheseFichier.join() === '4,1,1,2,1'
    );
    await page.click('app-comparateur button[name=garderEcarts]');
    await page.waitForSelector('.notification.succes:has-text("Écarts")');
    verifier(
        'comparateur : les 4 lignes en écart sont gardées comme jeu temporaire',
        /4 ligne/.test(await page.textContent('.notification.succes:has-text("Écarts")'))
    );
    await capture('comparateur-fichier-exterieur');

    // ---- exploitation : statistiques, explorateur 360°, préparation ----
    await page.click('a[href="/statistiques"]');
    await page.waitForSelector('app-statistiques');
    await page.selectOption('app-statistiques select[name=table]', { label: 'clients.csv' });
    await page.selectOption('app-statistiques select[name=dimension]', 'ville');
    await page.click('app-statistiques button.principal');
    await page.waitForSelector('app-statistiques app-graphique-svg');
    verifier(
        'statistiques : clients par ville — trois barres et trois lignes dans le tableau des valeurs (Paris en tête avec 2)',
        (await page.$$('app-statistiques app-graphique-svg rect')).length === 3 &&
            /Paris\s*2/.test(await page.textContent('app-statistiques table.tableau'))
    );
    await capture('statistiques');

    await page.click('a[href="/explorateur-360"]');
    await page.waitForSelector('app-explorateur-360');
    await page.selectOption('app-explorateur-360 select[name=table]', { label: 'clients.csv' });
    await page.selectOption('app-explorateur-360 select[name=colonne]', 'nom');
    await page.fill('app-explorateur-360 input[name=valeur]', 'ana');
    await page.click('app-explorateur-360 button.principal');
    // Le graphe est dessiné après la réponse du serveur : on attend les nœuds, pas seulement le composant.
    await page.waitForFunction(() => document.querySelectorAll('app-explorateur-360 app-graphe-svg .noeud').length === 3);
    verifier(
        'explorateur 360° : depuis « Ana », le graphe montre la cliente et ses deux commandes reliées par le modèle (id_client)',
        (await page.$$('app-explorateur-360 app-graphe-svg .noeud')).length === 3 &&
            /3 ligne\(s\) · 2 lien\(s\)/.test(await page.textContent('app-explorateur-360')) &&
            /Ana/.test(await page.textContent('app-explorateur-360 aside'))
    );
    await capture('explorateur-360');

    await page.click('a[href="/preparation"]');
    await page.waitForSelector('app-preparation');
    await page.click('app-preparation button:has-text("+ Préparation")');
    await page.fill('app-preparation input[name=nom-0]', 'Clients propres');
    await page.selectOption('app-preparation select[name=source-0]', { label: 'clients.csv' });
    await page.fill('app-preparation input[name=sortie-0]', 'PROPRE_CLIENTS');
    await page.click('app-preparation .ajout-etape button:has-text("Nettoyer")');
    await page.selectOption('app-preparation select[name=col-0-0]', 'ville');
    await page.selectOption('app-preparation select[name=action-0-0]', 'upper');
    await page.click('app-preparation .ajout-etape button:has-text("Dédoublonner")');
    await page.fill('app-preparation input[name=keys-0-1]', 'id_client');
    await page.click('app-preparation button:has-text("👁") >> nth=1');
    await page.waitForSelector('app-preparation .apercu');
    const apercuPreparation = await page.textContent('app-preparation .apercu');
    verifier(
        'préparation : l’aperçu après le dédoublonnage montre 4 lignes avec les villes en majuscules',
        /4 ligne\(s\)/.test(apercuPreparation) && /PARIS/.test(apercuPreparation) && !/Paris/.test(apercuPreparation)
    );
    await page.click('app-preparation button.principal:has-text("Exécuter")');
    await page.waitForSelector('app-preparation .badge.succes');
    verifier(
        'préparation : la table propre « PROPRE_CLIENTS » est produite (4 lignes) et devient une source',
        /4 lignes/.test(await page.textContent('app-preparation .badge.succes'))
    );
    await capture('preparation');

    // ---- catalogue, surveillance des sources, sauvegarde ----
    await page.click('a[href="/catalogue"]');
    await page.waitForSelector('app-catalogue .cat-card');
    await page.fill('app-catalogue input[name=recherche]', 'client');
    await page.waitForFunction(
        () =>
            /résultat\(s\)/.test(document.querySelector('app-catalogue')?.textContent || '') &&
            document.querySelector('app-catalogue .cat-card .font-bold')?.textContent.trim() === 'Client'
    );
    const catalogueTexte = await page.textContent('app-catalogue');
    verifier(
        'catalogue : « client » trouve l’objet métier Client en tête, avec ses signaux, et signale les données techniques masquées',
        /Objet métier/.test(catalogueTexte) && /donnée\(s\) technique\(s\) masquée\(s\)/.test(catalogueTexte)
    );
    await page.click('app-catalogue button[name=coucheTout]');
    await page.waitForFunction(() =>
        /clients\.csv/.test(document.querySelector('app-catalogue [name=cartesDuCatalogue]')?.textContent || '')
    );
    // La carte de la table elle-même (son titre est exactement « clients.csv »), pas celle d'une de ses colonnes (« dans clients.csv »).
    await page.locator('app-catalogue .cat-card', { has: page.locator('.font-bold', { hasText: /^clients\.csv$/ }) }).click();
    await page.waitForSelector('app-catalogue .fiche');
    const ficheCatalogue = await page.textContent('app-catalogue .fiche');
    verifier(
        'catalogue : la couche « tout » montre la table clients.csv, sa fiche affiche la qualité mesurée (71 % après la règle par groupe) et la sensibilité',
        /Qualité\s*71 %/.test(ficheCatalogue) && /données personnelles/.test(ficheCatalogue)
    );
    await capture('catalogue');

    // ---- V13 : le bandeau, le tri, les puces de filtre et la bascule liste / grille ----
    const chiffresDuCatalogue = await page.textContent('app-catalogue [name=chiffresDuCatalogue]');
    verifier(
        'V13 : le bandeau du catalogue annonce ce que l’espace contient et à quel point il est décrit',
        /actifs catalogués/.test(chiffresDuCatalogue) &&
            /domaines métier/.test(chiffresDuCatalogue) &&
            /% *sources documentées/.test(chiffresDuCatalogue.replace(/\s+/g, ' ')) &&
            /validés par un responsable/.test(chiffresDuCatalogue)
    );
    verifier(
        'V13 : le bandeau propose des recherches toutes prêtes, prises dans ce que l’espace contient',
        /données personnelles/.test(await page.textContent('app-catalogue [name=exemplesDeRecherche]'))
    );
    // Le tri A → Z remet les résultats dans l'ordre alphabétique, quelle que soit la pertinence.
    await page.selectOption('app-catalogue select[name=triDuCatalogue]', 'alpha');
    await page.waitForFunction(() => document.querySelectorAll('app-catalogue .cat-card').length > 1);
    const titresTries = await page.$$eval('app-catalogue .cat-card .font-bold', titres => titres.map(titre => titre.textContent.trim()));
    verifier(
        'V13 : le catalogue se trie par pertinence, qualité, fraîcheur ou ordre alphabétique',
        titresTries.length > 1 && titresTries.every((titre, rang) => rang === 0 || titre.localeCompare(titresTries[rang - 1], 'fr') >= 0)
    );
    await page.selectOption('app-catalogue select[name=triDuCatalogue]', 'pertinence');
    // Une facette cochée devient une puce, que l'on retire d'un clic.
    await page.click('app-catalogue .cat-fitem:has-text("Objet métier")');
    await page.waitForSelector('app-catalogue .achip-ux');
    verifier(
        'V13 : un filtre posé est rappelé sous forme de puce, avec sa croix pour le retirer',
        /Objet métier ✕/.test(await page.textContent('app-catalogue .achip-ux'))
    );
    await page.click('app-catalogue .achip-ux');
    await page.waitForFunction(() => !document.querySelector('app-catalogue .achip-ux'));
    verifier('V13 : cliquer la puce retire le filtre', (await page.$$('app-catalogue .achip-ux')).length === 0);
    // La bascule ▤ / ▦ passe les cartes sur deux colonnes.
    await page.click('app-catalogue button[name=vueGrille]');
    await page.waitForFunction(() =>
        (document.querySelector('app-catalogue [name=cartesDuCatalogue]')?.className || '').includes('md:grid-cols-2')
    );
    verifier(
        'V13 : la bascule ▤ / ▦ passe les résultats de la liste à la grille',
        (await page.getAttribute('app-catalogue [name=cartesDuCatalogue]', 'class')).includes('md:grid-cols-2')
    );
    await page.click('app-catalogue button[name=vueListe]');
    // Une recherche qui ne donne rien le dit, et propose de tout effacer.
    await page.fill('app-catalogue input[name=recherche]', 'zzzintrouvable');
    await page.waitForSelector('app-catalogue [name=aucunResultat]');
    verifier(
        'V13 : une recherche sans résultat explique quoi faire au lieu d’afficher une liste vide',
        /Aucun actif ne correspond/.test(await page.textContent('app-catalogue [name=aucunResultat]'))
    );
    await page.click('app-catalogue button[name=effacerFiltres]');
    await page.waitForSelector('app-catalogue .cat-card');
    verifier(
        'V13 : « Tout effacer » remet la recherche et les filtres à zéro',
        (await page.inputValue('app-catalogue input[name=recherche]')) === ''
    );
    await capture('catalogue-v13');

    await page.click('a[href="/surveillance"]');
    await page.waitForSelector('app-surveillance tbody tr');
    await page
        .locator('app-surveillance tr', { has: page.locator('strong', { hasText: /^clients\.csv$/ }) })
        .locator('button:has-text("Prendre un instantané")')
        .click();
    await page.waitForSelector('.notification.succes');
    await page.click('app-surveillance .onglets button:has-text("Réconciliation")');
    await page.selectOption('app-surveillance select[name=sourceA]', { label: 'clients.csv' });
    await page.selectOption('app-surveillance select[name=cleA]', 'id_client');
    await page.selectOption('app-surveillance select[name=sourceB]', { label: 'commandes.csv' });
    await page.selectOption('app-surveillance select[name=cleB]', 'id_client');
    await page.click('app-surveillance button:has-text("Réconcilier")');
    await page.waitForSelector('app-surveillance .synthese');
    const reconciliationValeurs = await page.$$eval('app-surveillance .synthese .valeur', valeurs =>
        valeurs.map(valeur => valeur.textContent.trim())
    );
    verifier(
        'surveillance : réconciliation clients / commandes — 4 et 4 lignes, 3 clés communes, 1 client sans commande (Zoé), 0 orpheline',
        reconciliationValeurs.join('|') === '4 / 4|3|1|0'
    );
    await capture('surveillance');

    await page.click('a[href="/sauvegarde"]');
    await page.waitForSelector('app-sauvegarde');
    const exportEspace = await page.evaluate(async () => await (await fetch('/api/sauvegarde/export')).json());
    verifier(
        'sauvegarde : l’export de l’espace contient les documents partagés et les 7 sources (dont le jeu promu)',
        exportEspace.kind === 'studio-data-espace' &&
            exportEspace.documents.appState.governance.businessObjects.length === 1 &&
            exportEspace.sources.length === 7
    );
    const dossierHtml = await page.evaluate(async () => await (await fetch('/api/sauvegarde/dossier')).text());
    verifier(
        'sauvegarde : le dossier de gouvernance HTML liste l’objet Client et le terme du glossaire',
        /<h3>Client /.test(dossierHtml) && /Clients consolidés/.test(dossierHtml)
    );

    // ---- explorateur SQL ----
    await page.click('a[href="/explorateur"]');
    await page.waitForSelector('app-explorateur .table');
    // Le nom exact est dans le <b> : « Comparaison clients.csv vs … » ne doit pas être retenu.
    await page.locator('app-explorateur .table', { has: page.locator('b', { hasText: /^clients\.csv$/ }) }).click();
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

    // ---- navigateur de données : filtres par colonne, tri, saut vers la table liée ----
    await page.click('a[href="/navigateur"]');
    await page.waitForSelector('app-navigateur');
    await page.selectOption('app-navigateur select[name=table]', { label: 'clients.csv' });
    await page.waitForFunction(() => document.querySelectorAll('app-navigateur tbody tr').length === 4);
    await page.fill('app-navigateur input[name=filtre-ville]', 'Paris');
    await page.waitForFunction(() => document.querySelectorAll('app-navigateur tbody tr').length === 2);
    await page.click('app-navigateur th.entete:has-text("nom")');
    await page.waitForFunction(() => /Ana/.test(document.querySelector('app-navigateur tbody tr')?.textContent || ''));
    verifier(
        'navigateur : filtre « ville contient Paris » → 2 lignes sur 4, tri par nom (Ana en premier)',
        /2 ligne\(s\) sur 4/.test(await page.textContent('app-navigateur .entete-page .badge')) &&
            /Ana/.test(await page.textContent('app-navigateur tbody tr'))
    );
    await page.selectOption('app-navigateur select[name=table]', { label: 'commandes.csv' });
    await page.waitForFunction(() => document.querySelectorAll('app-navigateur tbody tr').length === 4);
    await page.click('app-navigateur tbody tr:first-child a.saut');
    await page.waitForFunction(() => document.querySelectorAll('app-navigateur tbody tr').length === 1);
    verifier(
        'navigateur : cliquer l’id_client d’une commande saute vers clients.csv filtrée sur ce client (Ana)',
        /Ana/.test(await page.textContent('app-navigateur tbody')) &&
            (await page.inputValue('app-navigateur input[name=filtre-id_client]')) === '=1'
    );
    await capture('navigateur');

    // ---- données avancées : mise à jour d'une source, livraison ZIP, fusion, analyse de couverture ----
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources tbody tr');
    // La ligne dont le nom est exactement « clients.csv » (pas la comparaison ni la table conçue qui la citent).
    const ligneClients = page.locator('app-sources tbody tr', { has: page.locator('td b', { hasText: /^clients\.csv$/ }) });
    await ligneClients.locator('input[type=file]').setInputFiles(path.join(dossierTests, 'donnees', 'clients.csv'));
    await page.waitForSelector('.notification.succes:has-text("« clients.csv » mise à jour")');
    verifier(
        'sources : la mise à jour de clients.csv par un nouveau fichier garde la source (4 lignes, 3 colonnes) et rejoue la table conçue qui en dépend',
        /4 ligne\(s\), 3 colonne\(s\)/.test(await page.textContent('.notification.succes:has-text("« clients.csv » mise à jour")')) &&
            (await page.waitForSelector('.notification.succes:has-text("reconstruite")')) !== null
    );
    await page.setInputFiles('app-sources .entete-page input[type=file]', path.join(dossierTests, 'donnees', 'livraison.zip'));
    await page.waitForSelector('app-sources h2:has-text("Livraison « livraison.zip »")');
    const inventaire = await page.textContent('app-sources h2:has-text("Livraison « livraison.zip »")');
    const actionClients = await page.inputValue('app-sources tr:has-text("clients.csv") select[name=action-0]');
    verifier(
        'sources : la livraison ZIP est inventoriée (2 fichiers) et clients.csv, déjà chargée, est proposée en mise à jour',
        /2 fichier\(s\)/.test(inventaire) && actionClients === 'mettreAJour'
    );
    await page.click('app-sources button:has-text("Importer la livraison")');
    await page.waitForSelector('.notification.succes:has-text("Livraison « livraison.zip »")');
    await page.waitForSelector('app-sources tbody tr:has-text("produits.csv")');
    verifier(
        'sources : l’import de la livraison met à jour clients.csv et crée produits.csv',
        /1 import\(s\), 1 mise\(s\) à jour/.test(await page.textContent('.notification.succes:has-text("Livraison « livraison.zip »")'))
    );
    await page.click('app-sources button:has-text("Fusionner des fichiers")');
    await page.fill('app-sources input[name=fusion-nom]', 'Clients et produits');
    await page
        .locator('app-sources label.case', { hasText: /^\s*clients\.csv\s*$/ })
        .locator('input')
        .click();
    await page
        .locator('app-sources label.case', { hasText: /^\s*produits\.csv\s*$/ })
        .locator('input')
        .click();
    await page.click('app-sources button[type=submit]:has-text("Fusionner")');
    await page.waitForSelector('.notification.succes:has-text("« Clients et produits » créée par fusion")');
    verifier(
        'sources : la fusion de clients.csv et produits.csv donne une source de 6 lignes (colonnes alignées par nom, provenance conservée)',
        /6 ligne\(s\)/.test(await page.textContent('.notification.succes:has-text("« Clients et produits » créée par fusion")')) &&
            /fusion/.test(await page.textContent('app-sources tbody tr:has-text("Clients et produits")'))
    );
    await capture('sources-avancees');

    // ---- audit : les lignes en anomalie gardées comme jeu temporaire (V12.4) ----
    await page.click('a[href="/qualite"]');
    await page.waitForSelector('app-qualite');
    await page.selectOption('app-qualite select[name=source]', { label: 'Clients et produits' });
    await page.click('app-qualite button:has-text("Profiler la source")');
    await page.waitForSelector('app-inspecteur-anomalies tbody tr');
    await page.locator('app-inspecteur-anomalies tbody tr').first().locator('button:has-text("Garder")').click();
    await page.waitForSelector('.notification.succes:has-text("jeu temporaire")');
    verifier(
        'audit : les lignes d’une anomalie sont gardées comme jeu temporaire, sans créer de source',
        /gardé comme jeu temporaire/.test(await page.textContent('.notification.succes:has-text("jeu temporaire")'))
    );
    await capture('audit-anomalies-jeu');

    await page.click('a[href="/couverture"]');
    await page.waitForSelector('app-couverture');
    await page.selectOption('app-couverture select[name=base]', 'clients.csv');
    await page.selectOption('app-couverture select[name=dimensionColonne]', 'ville');
    await page.selectOption('app-couverture select[name=liee]', 'commandes.csv');
    await page.click('app-couverture button:has-text("Analyser la couverture")');
    await page.waitForSelector('app-couverture tbody tr');
    const couverture = await page.textContent('app-couverture');
    verifier(
        'couverture : clients par ville avec ou sans commande — Paris 2 avec, Lyon 1 avec, Lille 1 sans ; 3 clients couverts sur 4',
        /Paris\s*2\s*0\s*2/.test(couverture.replace(/\s+/g, ' ')) &&
            /Lille\s*0\s*1\s*1/.test(couverture.replace(/\s+/g, ' ')) &&
            /3\s*avec élément lié \(75\.0 %\)/.test(couverture)
    );
    await capture('couverture');

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
    // ---- V11 : suppression sûre et annulation — supprimer un terme, puis le retrouver ----
    await page.click('app-glossaire button:has-text("Nouveau terme")');
    await page.fill('app-glossaire input[name=term]', 'Terme à retirer');
    await page.fill('app-glossaire textarea[name=definition]', 'Créé pour vérifier que l’on peut revenir en arrière');
    await page.click('app-glossaire button[type=submit]');
    await page.waitForFunction(() => /Terme à retirer/.test(document.querySelector('app-glossaire tbody').textContent));
    let questionPosee = '';
    page.once('dialog', dialogue => {
        questionPosee = dialogue.message();
        dialogue.accept();
    });
    await page
        .locator('app-glossaire tbody tr', { has: page.locator('b', { hasText: /^Terme à retirer$/ }) })
        .locator('button:has-text("Supprimer")')
        .click();
    await page.waitForFunction(() => !/Terme à retirer/.test(document.querySelector('app-glossaire tbody').textContent));
    verifier(
        'confort V11 : la suppression nomme ce qui va disparaître et annonce que l’on peut revenir en arrière',
        /Terme à retirer/.test(questionPosee) && /Annuler/.test(questionPosee)
    );
    await page.click('.notification button[name=annuler]');
    await page.waitForFunction(() => /Terme à retirer/.test(document.querySelector('app-glossaire tbody').textContent));
    verifier('confort V11 : « ⟲ Annuler » remet le terme supprimé, tel qu’il était', true);
    // La même chose au clavier : Ctrl+Z défait la dernière modification du référentiel.
    page.once('dialog', dialogue => dialogue.accept());
    await page
        .locator('app-glossaire tbody tr', { has: page.locator('b', { hasText: /^Terme à retirer$/ }) })
        .locator('button:has-text("Supprimer")')
        .click();
    await page.waitForFunction(() => !/Terme à retirer/.test(document.querySelector('app-glossaire tbody').textContent));
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => /Terme à retirer/.test(document.querySelector('app-glossaire tbody').textContent));
    verifier('confort V11 : Ctrl+Z annule la dernière modification du référentiel', true);
    await capture('annulation');
    // On repart d'un glossaire propre : le terme d'essai n'a plus à traîner dans les écrans suivants.
    page.once('dialog', dialogue => dialogue.accept());
    await page
        .locator('app-glossaire tbody tr', { has: page.locator('b', { hasText: /^Terme à retirer$/ }) })
        .locator('button:has-text("Supprimer")')
        .click();
    await page.waitForFunction(() => !/Terme à retirer/.test(document.querySelector('app-glossaire tbody').textContent));

    await page.click('a[href="/dictionnaire"]');
    await page.waitForSelector('app-dictionnaire .element');
    await page.locator('app-dictionnaire .element', { has: page.locator('b', { hasText: /^clients\.csv$/ }) }).click();
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

    // ---- V13 : le cycle de validation d'une fiche du dictionnaire ----
    // Une définition écrite n'est pas une définition validée : la fiche porte un statut, daté et attribué.
    page.once('dialog', dialogue => dialogue.accept('relue avec les Ventes'));
    await page.selectOption('app-dictionnaire select[name=statut]', 'Validé');
    await page.waitForSelector('app-dictionnaire .historique');
    verifier(
        'V13 : le statut d’une fiche est validé, et le passage est historisé avec son commentaire',
        /Brouillon.*→.*Validé/s.test(await page.textContent('app-dictionnaire .historique')) &&
            /relue avec les Ventes/.test(await page.textContent('app-dictionnaire .historique'))
    );
    const dictionnaireValide = await page.evaluate(async () => await (await fetch('/api/gouvernance/dictionnaire')).json());
    verifier(
        'V13 : le statut, sa date, son auteur et son historique sont conservés',
        dictionnaireValide['clients.csv'].status === 'Validé' &&
            !!dictionnaireValide['clients.csv'].statusAt &&
            !!dictionnaireValide['clients.csv'].statusBy &&
            dictionnaireValide['clients.csv'].history.length === 1
    );
    verifier(
        'V13 : l’avancement du dictionnaire dit combien de fiches sont validées',
        /1\/\d+ validée\(s\)/.test(await page.textContent('app-dictionnaire .entete-page'))
    );
    // Une fiche « proposée » entre dans la file de validation, et le filtre ne montre plus qu'elle.
    await page.locator('app-dictionnaire .element', { has: page.locator('b', { hasText: /^commandes\.csv$/ }) }).click();
    await page.selectOption('app-dictionnaire select[name=statut]', 'Proposé');
    await page.waitForSelector('app-dictionnaire button[name=filtrerAValider]');
    await page.click('app-dictionnaire button[name=filtrerAValider]');
    const filtreesAValider = await page
        .waitForFunction(() => document.querySelectorAll('app-dictionnaire aside .element').length === 1, null, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    verifier('V13 : « à valider » ne montre plus que les fiches qui attendent une décision', filtreesAValider);
    await capture('dictionnaire-validation');
    await page.click('app-dictionnaire button[name=filtrerAValider]');

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
        'application classique : les sources déposées depuis Angular (dont la livraison ZIP et la fusion), la table conçue, la comparaison, la table préparée et l’extraction enregistrée sont restaurées prêtes (sans ré-ingestion)',
        classique.tables.length === 9 &&
            classique.tables.every(table => table.status === 'ready') &&
            classique.tables.filter(table => table.headers === 3).length === 4 &&
            classique.tables.some(table => table.name === 'Clients et produits' && table.headers === 7) &&
            classique.tables.some(table => table.name === 'Clients consolidés' && table.type === 'designed' && table.headers === 6) &&
            classique.tables.some(table => table.name.startsWith('Comparaison ') && table.type === 'extraction')
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

    // ---- mode démonstration : tout l'espace installé en un clic ----
    await page.click('a[href="/demonstration"]');
    // L'écran affiche « Lecture de l'état… » tant que le serveur n'a pas répondu : on attend l'interrupteur.
    await page.waitForSelector('app-demonstration button[name=installer]');
    verifier(
        'mode démonstration : le jeu est prêt (douze fichiers) et l’espace n’est pas encore installé',
        /jeu prêt : 12 fichier\(s\)/.test(await page.textContent('app-demonstration .entete-page')) &&
            /Démonstration non installée/.test(await page.textContent('app-demonstration'))
    );
    await page.click('app-demonstration button[name=installer]');
    await page.waitForSelector('app-demonstration h2:has-text("Installation terminée")', { timeout: 120000 });
    const rapportDemonstration = await page.textContent('app-demonstration');
    verifier(
        'mode démonstration : l’installation charge 12 sources, pose 12 liens, 12 règles, 2 tableaux de bord et calcule un score',
        /12 source\(s\)/.test(rapportDemonstration) &&
            /12 lien\(s\)/.test(rapportDemonstration) &&
            /12 règle\(s\)/.test(rapportDemonstration) &&
            /2 tableau\(x\) de bord/.test(rapportDemonstration) &&
            /score qualité \d+ \/ 100/.test(rapportDemonstration)
    );
    const etatApresInstallation = await page.textContent('app-demonstration');
    verifier(
        'mode démonstration : le jeu a été rangé dans PostgreSQL pendant l’installation (plus besoin des fichiers)',
        /en base : 12 fichier\(s\)/.test(etatApresInstallation) && /Jeu rangé dans la base le/.test(etatApresInstallation)
    );
    await capture('demonstration');
    await page.click('app-demonstration button:has-text("Ouvrir l\'espace de démonstration")');
    await page.waitForSelector('app-accueil');
    verifier(
        'mode démonstration : l’espace « Démonstration » est ouvert (en-tête et cockpit)',
        (await page.$eval('.selection-espace select', liste => liste.value)) === 'demo' &&
            /source/.test(await page.textContent('app-accueil'))
    );
    await page.click('a[href="/sources"]');
    await page.waitForSelector('app-sources table.sources tbody tr');
    const sourcesDemonstration = await page.$$eval('app-sources table.sources tbody tr', lignes => lignes.length);
    verifier('mode démonstration : les douze sources du jeu sont dans l’espace, avec leur domaine', sourcesDemonstration === 12);
    await page.click('a[href="/qualite/regles"]');
    await page.waitForSelector('app-qualite .onglets');
    await page.selectOption('app-qualite select[name=source]', { label: 'clients.csv' });
    await page.waitForSelector('app-qualite tbody tr:has-text("SIRET attendu pour les professionnels")');
    verifier(
        'mode démonstration : les règles de clients.csv sont posées et déjà exécutées (des échecs sont visibles)',
        /échec\(s\)/.test(await page.textContent('app-qualite tbody tr:has-text("SIRET attendu pour les professionnels")'))
    );
    await capture('demonstration-qualite');

    // ---- mode démonstration : la gouvernance est là aussi, et prête à être montrée ----
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier #listeDesObjets button');
    const objetsDemonstration = await page.$$eval('app-objets-metier #listeDesObjets button', elements => elements.length);
    await page.click('app-objets-metier #listeDesObjets button:has-text("Client")');
    await page.waitForFunction(() => document.querySelector('app-objets-metier input[name=nom]')?.value === 'Client');
    const ficheClient = await page.textContent('app-objets-metier #ficheDeLObjet');
    // Les noms des informations sont dans des champs de saisie : leur texte n'est pas dans le document.
    const informationsClient = await page.$$eval('app-objets-metier input[name^=attribut-nom-]', champs =>
        champs.map(champ => champ.value)
    );
    console.log(
        objetsDemonstration,
        '| lignes:',
        (await page.$$('app-objets-metier tbody tr')).length,
        '| raison:',
        /Raison sociale/.test(ficheClient),
        '| copie:',
        /copié de/.test(ficheClient)
    );
    verifier(
        'mode démonstration : sept objets métier décrits, et la fiche « Client » montre ses informations, ses colonnes et sa provenance héritée',
        objetsDemonstration === 7 &&
            informationsClient.length === 7 &&
            informationsClient.includes('Raison sociale') &&
            /copié de Commune/.test(ficheClient)
    );
    await capture('demonstration-objets-metier');
    await page.click('a[href="/actifs"]');
    await page.waitForSelector('app-actifs .liste .element');
    const actifsDemonstration = await page.textContent('app-actifs .liste');
    verifier(
        'mode démonstration : applications, processus et restitutions sont déclarés, avec ce qu’ils produisent',
        (await page.$$eval('app-actifs .liste .element', elements => elements.length)) === 12 &&
            /CRM Vega/.test(actifsDemonstration) &&
            /Déclaration de TVA/.test(actifsDemonstration)
    );
    await page.click('a[href="/lineage"]');
    await page.waitForSelector('app-lineage .noeud');
    const noeudsFlux = await page.$$eval('app-lineage .noeud', elements => elements.length);
    verifier('mode démonstration : le parcours de la donnée est déjà dessiné (la carte n’est plus vide)', noeudsFlux >= 10);
    await capture('demonstration-lineage');
    await page.click('a[href="/propositions"]');
    await page.waitForSelector('app-propositions .proposition');
    verifier(
        'mode démonstration : trois propositions attendent d’être validées, chacune dans son domaine',
        (await page.$$('app-propositions .proposition')).length === 3 && /Client › Statut/.test(await page.textContent('app-propositions'))
    );
    await capture('demonstration-propositions');
    // V13 : les propositions se regroupent par ce qu'elles visent, sous le nom réel de la cible.
    const titresDesGroupes = await page.$$eval('app-propositions .carte h2', titres => titres.map(titre => titre.textContent.trim()));
    verifier(
        'V13 : les propositions sont regroupées sous le nom de ce qu’elles visent, jamais sous un identifiant',
        titresDesGroupes.length > 0 && titresDesGroupes.every(titre => !/\b(bo|gl|as)_/.test(titre))
    );
    // « Tout valider » tranche pour tout le groupe d'un geste — ici en administrateur, qui décide partout.
    const avantToutValider = (await page.$$('app-propositions .proposition')).length;
    const tailleDuGroupe = (await page.$$('app-propositions .carte:has(button[name=toutValider-0]) .proposition')).length;
    await page.click('app-propositions button[name=toutValider-0]');
    await page.waitForSelector('.notification.succes:has-text("validées et appliquées")');
    const apresToutValider = await page
        .waitForFunction(
            restantes => document.querySelectorAll('app-propositions .proposition').length === restantes,
            avantToutValider - tailleDuGroupe,
            { timeout: 5000 }
        )
        .then(() => true)
        .catch(() => false);
    verifier('V13 : « tout valider » tranche d’un geste toutes les propositions d’un même groupe', apresToutValider);
    await capture('propositions-groupees');

    // ---- V13 : le parcours s'ouvre depuis ce que l'on regarde, pas seulement par le menu ----
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier #listeDesObjets button');
    await page.click('app-objets-metier #listeDesObjets button:has-text("Facture")');
    await page.waitForFunction(() => document.querySelector('app-objets-metier input[name=nom]')?.value === 'Facture');
    await page.click('app-objets-metier a[name=parcoursObjet]');
    // Le parcours de l'objet entier montre la synthèse (V12.7), pas la phrase d'une information.
    await page.waitForSelector('app-lineage .synthese-parcours');
    verifier(
        'gouvernance V13 : « 🔎 Parcours » d’une fiche d’objet ouvre le parcours de cet objet, déjà chargé',
        /objet=bo_facture/.test(page.url()) && /information/.test(await page.textContent('app-lineage .synthese-parcours'))
    );
    await capture('parcours-depuis-objet');
    // Depuis une information : le parcours de cette information seule.
    await page.click('a[href="/objets-metier"]');
    await page.waitForSelector('app-objets-metier #listeDesObjets button');
    await page.click('app-objets-metier #listeDesObjets button:has-text("Facture")');
    await page.waitForSelector('app-objets-metier tbody tr');
    await page.click('app-objets-metier a[name=parcours-2]');
    await page.waitForSelector('app-lineage .phrase-parcours');
    verifier(
        'gouvernance V13 : « 🔎 » d’une information ouvre le parcours de cette information seule',
        /objet=bo_facture&information=be_facture_ttc/.test(decodeURIComponent(page.url())) &&
            (await page.inputValue('app-lineage select[name=attribut]')) === 'be_facture_ttc'
    );
    // Depuis le catalogue : la fiche d'une table mène au parcours autour de cette table.
    await page.click('a[href="/catalogue"]');
    await page.waitForSelector('app-catalogue .cat-card');
    // Les tables ne sont pas dans la couche « métier » du catalogue : on demande à tout voir.
    await page.click('app-catalogue button[name=coucheTout]');
    await page.fill('app-catalogue input[name=recherche]', 'factures.csv');
    // Le nom d'une table se lit dans le titre de sa carte ; « dans factures.csv » désignerait une colonne.
    await page.waitForSelector('app-catalogue .cat-card .font-bold:text-is("factures.csv")');
    await page.click('app-catalogue .cat-card:has(.font-bold:text-is("factures.csv"))');
    await page.waitForSelector('app-catalogue button[name=parcoursDepuisCatalogue]');
    await page.click('app-catalogue button[name=parcoursDepuisCatalogue]');
    await page.waitForFunction(() => document.querySelector('app-lineage select[name=table]')?.value === 'factures.csv');
    verifier(
        'gouvernance V13 : « 🔎 Parcours » d’une table du catalogue ouvre le parcours autour de cette table',
        /table=factures.csv/.test(decodeURIComponent(page.url())) && (await page.$$('app-lineage .noeud')).length > 0
    );
    await capture('parcours-depuis-catalogue');
    // Depuis la fiche d'une colonne : ce qui serait touché si elle changeait.
    await page.click('a[href="/catalogue"]');
    await page.waitForSelector('app-catalogue .cat-card');
    await page.click('app-catalogue button[name=coucheTout]');
    await page.fill('app-catalogue input[name=recherche]', 'optin_email');
    await page.waitForSelector('app-catalogue .cat-card .font-bold:text-is("optin_email")');
    await page.click('app-catalogue .cat-card:has(.font-bold:text-is("optin_email"))');
    await page.waitForSelector('app-catalogue button[name=parcoursDepuisCatalogue]');
    await page.click('app-catalogue button[name=parcoursDepuisCatalogue]');
    await page.waitForFunction(() => document.querySelector('app-lineage select[name=colonneImpact]')?.value === 'optin_email');
    await page.waitForSelector('app-lineage ul.impact li');
    verifier(
        'gouvernance V13 : « 🔎 Parcours » d’une colonne ouvre ce qui serait touché si elle changeait (le consentement → la campagne)',
        /colonne=optin_email/.test(decodeURIComponent(page.url())) && /Campagne de courriels/.test(await page.textContent('app-lineage'))
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
