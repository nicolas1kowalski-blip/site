// Test de bout en bout : serveur réel (dossier de données temporaire) + front construit + Chromium headless.
// Le scénario est celui d'un utilisateur : dépôt de deux CSV, contrôle des tables, lecture en flux, gouvernance,
// rechargement de la page (restauration instantanée sans renvoi de fichier), optimisation Parquet, export,
// suppression, remise à zéro. Chaque assertion est une phrase en français ; sortie « n/m OK ».
//   node tests/e2e.test.mjs            (SHOTS=1 pour des captures dans tests/captures/)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireConfiguration } from '../serveur/configuration.mjs';
import { creerApplication } from '../serveur/application.mjs';

const dossierTests = path.dirname(fileURLToPath(import.meta.url));
const racineProjet = path.resolve(dossierTests, '..');
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js'))
    .default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!fs.existsSync(path.join(racineProjet, 'client', 'dist', 'index.html'))) {
    console.error('Front non construit : lancez « npm run construire » avant ce test.');
    process.exit(2);
}
const dossierTemporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-data-e2e-'));
const configuration = lireConfiguration({ SD_DONNEES: dossierTemporaire, SD_JOURNAL: 'silent' });
const app = await creerApplication(configuration);
await app.listen({ host: '127.0.0.1', port: 0 });
const adresse = `http://127.0.0.1:${app.server.address().port}/`;
const dossierFichiers = path.join(dossierTemporaire, 'espaces', 'defaut', 'fichiers');

const resultats = [];
const ok = (phrase, condition) => resultats.push([phrase, !!condition]);
const navigateur = await chromium.launch({ executablePath: CHROMIUM });
const page = await navigateur.newPage({ viewport: { width: 1500, height: 950 } });
const erreursPage = [];
page.on('pageerror', erreur => erreursPage.push(String(erreur)));
page.on('console', message => {
    // Les ressources en 4xx sont attendues (DROP TABLE sur une vue, image d'aperçu absente) : l'application les gère.
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text()))
        erreursPage.push('console : ' + message.text());
});

async function ouvrir() {
    await page.goto(adresse);
    await page.waitForFunction(() => restoreCompleted === true, null, { timeout: 20000 });
    await page.waitForFunction(() => Object.values(state.tables).every(t => t.status !== 'loading'), null, {
        timeout: 20000
    });
    await page.evaluate(() => {
        v11Prefs.tourDone = true;
        try {
            v11TourEnd(true);
            wizClose();
        } catch (e) {}
    });
}
const attendreTables = nombre =>
    page.waitForFunction(
        n => Object.values(state.tables).length === n && Object.values(state.tables).every(t => t.status !== 'loading'),
        nombre,
        { timeout: 60000 }
    );
const attendreSauvegarde = () => page.waitForTimeout(1200);

try {
    await ouvrir();
    ok(
        'la page se charge sans bibliothèque externe : titre « Studio Data 14.1.0 », aucune requête vers un CDN',
        (await page.title()) === 'Studio Data 14.1.0'
    );
    const controle = await page.evaluate(() => {
        const c = Studio.selfCheck();
        return {
            ok: c.ok,
            notApplied: c.notApplied.length,
            duplicates: c.duplicates.length,
            serveur: Studio.extensions().filter(x => x.layer === 'Serveur').length
        };
    });
    ok(
        'auto-contrôle Studio : toutes les extensions de la couche Serveur sont appliquées (' +
            controle.serveur +
            '), aucune fonction dupliquée',
        controle.ok && controle.notApplied === 0 && controle.duplicates === 0 && controle.serveur >= 20
    );
    ok(
        'en-tête : pastille « serveur · DuckDB vX » affichée',
        /serveur · DuckDB v\d/.test(await page.evaluate(() => (el('sdServeurChip') || {}).textContent || ''))
    );

    // ---- dépôt de deux CSV ----
    await page.setInputFiles('#fileUploader', [
        path.join(dossierTests, 'donnees', 'clients.csv'),
        path.join(dossierTests, 'donnees', 'commandes.csv')
    ]);
    await attendreTables(2);
    const tables = await page.evaluate(() =>
        Object.values(state.tables).map(t => ({
            id: t.id,
            name: t.name,
            status: t.status,
            headers: t.headers,
            storage: t.storage,
            sample: (t.sampleData || []).length,
            enc: t.config.enc
        }))
    );
    const clients = tables.find(t => t.name === 'clients.csv');
    const commandes = tables.find(t => t.name === 'commandes.csv');
    ok(
        'deux sources prêtes : clients.csv (id_client, nom, ville) et commandes.csv (id_commande, id_client, montant)',
        clients &&
            commandes &&
            clients.status === 'ready' &&
            commandes.status === 'ready' &&
            clients.headers.join() === 'id_client,nom,ville' &&
            commandes.headers.join() === 'id_commande,id_client,montant'
    );
    ok(
        'les tables sont matérialisées dans la base du serveur (storage = table), avec un échantillon',
        clients.storage === 'table' && clients.sample === 4 && commandes.sample === 4
    );
    ok('encodage détecté sur les premiers octets : UTF-8', clients.enc === 'UTF-8');
    ok(
        'les fichiers ont été déposés une fois sur le serveur (src_<id>)',
        fs.existsSync(path.join(dossierFichiers, 'src_' + clients.id)) &&
            fs.existsSync(path.join(dossierFichiers, 'src_' + commandes.id))
    );
    const jointure = await page.evaluate(
        async ids => {
            const { conn } = await getDB();
            const res = await conn.query(
                `SELECT c.ville, COUNT(*)::BIGINT AS n, SUM(o.montant::DOUBLE) AS total FROM ${sqlIdent(duckTableName(ids[0]))} c JOIN ${sqlIdent(duckTableName(ids[1]))} o ON o.id_client = c.id_client GROUP BY 1 ORDER BY 1`
            );
            return arrowResultToObjects(res);
        },
        [clients.id, commandes.id]
    );
    ok(
        'une jointure SQL entre les deux tables s’exécute sur le serveur (Paris : 3 commandes, 42.5)',
        jointure.length === 2 &&
            jointure[0].ville === 'Lyon' &&
            jointure[1].ville === 'Paris' &&
            jointure[1].n === '3' &&
            Math.abs(jointure[1].total - 42.5) < 1e-9
    );
    const flux = await page.evaluate(async id => {
        const lignes = [];
        let progression = 0;
        await duckStreamRows(
            id,
            0,
            r => lignes.push(r),
            () => progression++
        );
        return { n: lignes.length, premiere: lignes[0], cles: Object.keys(lignes[0]) };
    }, clients.id);
    ok(
        'lecture en flux (conn.send → NDJSON) : 4 lignes, sans la colonne technique __rn',
        flux.n === 4 && flux.premiere.nom === 'Ana' && !flux.cles.includes('__rn')
    );
    const distantes = await page.evaluate(async id => {
        const table = state.tables[id];
        const sniff = await sniffFileEncoding(table.file);
        return { sniff: sniff && sniff.enc, taille: table.file.size };
    }, clients.id);
    ok('le fichier navigateur reste lisible (reniflage d’encodage sur un objet File)', distantes.sniff === 'UTF-8');

    // ---- gouvernance et sauvegarde serveur ----
    await page.evaluate(() => {
        state.governance.dictionary['clients.csv'] = {
            description: 'Référentiel clients (test)',
            owner: 'Équipe Données'
        };
        state.governance.glossary.push({ id: 'gl_test', term: 'Client', definition: 'Personne ayant passé commande' });
        persistAppState();
    });
    await attendreSauvegarde();
    const document = JSON.parse(
        fs.readFileSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'etat', 'appState.json'), 'utf8')
    );
    ok(
        'la configuration est écrite sur le serveur (etat/appState.json) : dictionnaire et glossaire',
        document.governance &&
            document.governance.dictionary['clients.csv'].owner === 'Équipe Données' &&
            document.governance.glossary.some(g => g.term === 'Client')
    );
    ok(
        'libellé d’état : « Sauvegarde serveur : hh:mm:ss »',
        /Sauvegarde serveur : \d/.test(await page.evaluate(() => el('persistStatus').textContent))
    );
    const metadonnees = JSON.parse(
        fs.readFileSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'tables', clients.id + '.json'), 'utf8')
    );
    ok(
        'les métadonnées de la table sont sur le serveur (tables/<id>.json), avec la description du fichier déposé',
        metadonnees.name === 'clients.csv' &&
            metadonnees.fichier &&
            metadonnees.fichier.nom === 'src_' + clients.id &&
            metadonnees.headers.length === 3
    );

    // ---- rechargement : restauration instantanée, sans renvoi de fichier ----
    const fichiersAvant = fs
        .readdirSync(dossierFichiers)
        .map(n => n + ':' + fs.statSync(path.join(dossierFichiers, n)).mtimeMs)
        .sort()
        .join('|');
    const requetesFichiers = [];
    page.on('request', r => {
        if (/\/api\/fichiers\//.test(r.url()) && r.method() === 'PUT') requetesFichiers.push(r.url());
    });
    await ouvrir();
    const apres = await page.evaluate(() => ({
        ids: Object.keys(state.tables).sort(),
        prets: Object.values(state.tables).every(
            t => t.status === 'ready' && t.headers.length === 3 && (t.sampleData || []).length === 4
        ),
        fichierDistant: Object.values(state.tables).every(
            t => t.file && t.file.__distant === 'src_' + t.id && t.file.name.endsWith('.csv')
        ),
        dictionnaire: state.governance.dictionary['clients.csv'] && state.governance.dictionary['clients.csv'].owner,
        glossaire: state.governance.glossary.length
    }));
    const fichiersApres = fs
        .readdirSync(dossierFichiers)
        .map(n => n + ':' + fs.statSync(path.join(dossierFichiers, n)).mtimeMs)
        .sort()
        .join('|');
    ok(
        'après rechargement : mêmes identifiants de tables, prêtes avec en-têtes et échantillon, sans ré-ingestion',
        apres.ids.join() === [clients.id, commandes.id].sort().join() && apres.prets
    );
    ok(
        'aucun fichier n’a été renvoyé au serveur (pas de PUT /api/fichiers, fichiers inchangés)',
        requetesFichiers.length === 0 && fichiersAvant === fichiersApres
    );
    ok('les fichiers sources sont des « fichiers distants » (nom d’origine conservé)', apres.fichierDistant);
    ok(
        'la gouvernance est restaurée depuis le serveur',
        apres.dictionnaire === 'Équipe Données' && apres.glossaire >= 1
    );
    const relecture = await page.evaluate(async id => {
        const table = state.tables[id];
        const texte = await readFileAsText(table.file);
        const sniff = await sniffFileEncoding(table.file);
        return { debut: texte.slice(0, 24), sniff: sniff && sniff.enc };
    }, clients.id);
    ok(
        'un fichier distant se relit depuis le serveur (readFileAsText, reniflage par plage d’octets)',
        relecture.debut.startsWith('id_client;nom;ville') && relecture.sniff === 'UTF-8'
    );
    const reingestion = await page.evaluate(async id => {
        state.tables[id].config.enc = 'UTF-8';
        const headers = await ingestFileTable(id);
        const n = arrowResultToObjects(
            await (await getDB()).conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(id))}`)
        )[0].n;
        return { headers, n };
    }, clients.id);
    ok(
        'la ré-ingestion d’une source distante fonctionne sans renvoi du fichier (4 lignes)',
        reingestion.headers.join() === 'id_client,nom,ville' && reingestion.n === '4' && requetesFichiers.length === 0
    );

    // ---- optimisation Parquet côté serveur, export, panneau de sauvegarde ----
    const optimisation = await page.evaluate(async id => {
        await optimizeSourceToParquet(id);
        const table = state.tables[id];
        const n = arrowResultToObjects(
            await (await getDB()).conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(id))}`)
        )[0].n;
        return { storage: table.storage, pqSize: table.pqSize, n };
    }, commandes.id);
    ok(
        'optimisation Parquet exécutée sur le serveur : vue sur pq_<id>.parquet, 4 lignes toujours lisibles',
        optimisation.storage === 'parquet' &&
            optimisation.pqSize > 0 &&
            optimisation.n === '4' &&
            fs.existsSync(path.join(dossierFichiers, 'pq_' + commandes.id + '.parquet'))
    );
    const octetsParquet = await page.evaluate(
        async id => Array.from((await exportTableParquet(id)).subarray(0, 4)),
        clients.id
    );
    ok(
        'export Parquet produit sur le serveur (en-tête PAR1), sans fichier temporaire laissé sur le disque',
        String.fromCharCode(...octetsParquet) === 'PAR1' &&
            !fs.readdirSync(dossierFichiers).some(n => n.startsWith('exp_'))
    );
    await page.evaluate(() => openBackupCenter());
    await page.waitForTimeout(600);
    const centre = await page.evaluate(() => ({
        statut: el('bkStatusUx').textContent,
        estimation: el('storageEstimate').textContent,
        partage: el('uxDrawerBody').textContent
    }));
    ok(
        'centre de sauvegarde : « Persistance sur le serveur active », volumes du serveur, libellés adaptés',
        /Persistance sur le serveur active/.test(centre.statut) &&
            /Serveur : \d+ table\(s\) dans DuckDB v/.test(centre.estimation) &&
            /sauvegardé automatiquement sur le serveur/.test(centre.partage)
    );
    await page.evaluate(() => closeBackupCenter());

    // ---- rechargement après optimisation, suppression d'une table, remise à zéro ----
    await ouvrir();
    const apresOptimisation = await page.evaluate(
        id => ({
            storage: state.tables[id].storage,
            status: state.tables[id].status,
            optimized: state.tables[id].optimized
        }),
        commandes.id
    );
    ok(
        'après rechargement, la table optimisée reste une vue Parquet prête',
        apresOptimisation.storage === 'parquet' &&
            apresOptimisation.status === 'ready' &&
            apresOptimisation.optimized === true
    );
    await page.evaluate(id => removeTable(id), commandes.id);
    await page.waitForTimeout(800);
    ok(
        'suppression d’une source : table DuckDB, métadonnées et fichiers effacés sur le serveur',
        !fs.existsSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'tables', commandes.id + '.json')) &&
            !fs.existsSync(path.join(dossierFichiers, 'src_' + commandes.id)) &&
            !fs.existsSync(path.join(dossierFichiers, 'pq_' + commandes.id + '.parquet'))
    );
    const restantes = await page.evaluate(async () =>
        (
            await (
                await getDB()
            ).conn.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 't_%' ORDER BY 1")
        )
            .toArray()
            .map(r => r.table_name)
    );
    ok(
        'il ne reste que la table clients dans la base du serveur',
        restantes.length === 1 && restantes[0] === 't_' + clients.id
    );
    await page.evaluate(async () => {
        await idbClear('meta');
        await idbClear('tabledata');
    });
    ok(
        'remise à zéro (idbClear) : plus d’état ni de tables ni de fichiers sur le serveur',
        fs.readdirSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'etat')).length === 0 &&
            fs.readdirSync(path.join(dossierTemporaire, 'espaces', 'defaut', 'tables')).length === 0 &&
            fs.readdirSync(dossierFichiers).length === 0
    );
    if (process.env.SHOTS) {
        fs.mkdirSync(path.join(dossierTests, 'captures'), { recursive: true });
        await page.screenshot({ path: path.join(dossierTests, 'captures', 'serveur_sources.png') });
    }
} catch (erreur) {
    resultats.push(['ERREUR ' + erreur.message + ' @ ' + String(erreur.stack).split('\n')[1], false]);
}

let echecs = 0;
for (const [phrase, reussi] of resultats) {
    console.log((reussi ? '✅ ' : '❌ ') + phrase);
    if (!reussi) echecs++;
}
const erreursGraves = erreursPage;
console.log(`\n${resultats.length - echecs}/${resultats.length} OK · erreurs page : ${erreursGraves.length}`);
erreursGraves.slice(0, 5).forEach(e => console.log('  ', e));
await navigateur.close();
await app.close();
fs.rmSync(dossierTemporaire, { recursive: true, force: true });
process.exit(echecs || erreursGraves.length ? 1 : 0);
