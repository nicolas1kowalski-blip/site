import fs from 'fs';
// « J'ai un fichier en entrée et j'ai besoin de le compléter. »
//
// On dépose sa liste — un jeu temporaire —, on la prend comme table de départ, et il ne reste qu'à
// aller chercher les colonnes qui manquent. Sauf qu'une colonne ne se ramène qu'en suivant un LIEN,
// et qu'un lien ne se déclarait que dans le modèle de données — où un jeu temporaire n'apparaît
// même pas. Le lien dont on avait besoin ne pouvait donc pas se déclarer du tout.
//
// Ici, il se déclare depuis Extraire, et il est MESURÉ avant d'être créé : combien de valeurs se
// retrouvent dans l'autre fichier, et combien de lignes chacune y trouve — le second nombre
// prévient la multiplication des lignes avant qu'elle n'arrive.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const FICHIER = ROOT + 'StudioDataV13-hors-ligne.html';
if (!fs.existsSync(FICHIER)) {
    console.log('⏭  StudioDataV13-hors-ligne.html absent — lancez node tools/hors-ligne.mjs');
    console.log('\n0/0 OK · erreurs page: 0');
    process.exit(0);
}
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 1050 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.goto('file://' + FICHIER, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    window.lucide = window.lucide || { createIcons: () => {} };
    try { v11Prefs.tourDone = true; v11TourEnd(true); wizClose(); } catch (e) {}
    const { conn } = await getDB();
    const nb = async sql => Number(arrowResultToObjects(await conn.query(sql))[0].n);

    // Deux vraies sources : les affaires, et leurs contrats (deux par affaire).
    await conn.query(`CREATE OR REPLACE TABLE t_aff AS SELECT row_number() OVER () AS __rn, 'AFF'||i AS NUM_AFFAIRE,
        'Client '||i AS CLIENT, 'Paris' AS VILLE FROM range(1,5001) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_ctr AS SELECT row_number() OVER () AS __rn, 'AFF'||((i-1)//2+1) AS NUM_AFFAIRE,
        'CTR'||i AS NUM_CONTRAT, (i%997)::VARCHAR AS MONTANT FROM range(1,10001) tbl(i)`);
    state.tables['aff'] = { id: 'aff', name: 'AFFAIRES.csv', type: 'csv', status: 'ready', lastRows: 5000,
        headers: ['NUM_AFFAIRE', 'CLIENT', 'VILLE'], config: {}, columnsMeta: {},
        sampleData: [{ NUM_AFFAIRE: 'AFF1', CLIENT: 'Client 1', VILLE: 'Paris' }] };
    state.tables['ctr'] = { id: 'ctr', name: 'CONTRATS.csv', type: 'csv', status: 'ready', lastRows: 10000,
        headers: ['NUM_AFFAIRE', 'NUM_CONTRAT', 'MONTANT'], config: {}, columnsMeta: {},
        sampleData: [{ NUM_AFFAIRE: 'AFF1', NUM_CONTRAT: 'CTR1', MONTANT: '417' }] };
    state.relations = [];
    renderTables();

    // Le fichier d'entrée : 300 affaires à compléter, déposé comme JEU TEMPORAIRE. Sa colonne ne
    // porte PAS le même nom que dans les sources — c'est le cas ordinaire d'une liste reçue.
    const lignes = [];
    for (let i = 1; i <= 300; i++) lignes.push(['AFF' + i * 7, 'à traiter']);
    const jeu = await v12TmpFromRows(['N_AFFAIRE', 'CONSIGNE'], lignes, 'Ma liste à compléter', { kind: 'file' });
    switchTab(3);
    advSetBase(jeu.id);
    ok('un jeu temporaire peut être la table de départ d’une extraction',
        state.advExtract.baseId === jeu.id);
    // Sans la correction du voisinage, le seul fait de calculer les tables atteignables depuis un
    // jeu temporaire relié s'arrêtait sur « Cannot read properties of undefined (reading 'push') ».
    ok('et le calcul des tables atteignables ne s’arrête pas dessus',
        advReachableTables().length === 1);

    // ---- 1. La recherche : la donnée, pas les noms ----
    const propositions = await v13ChercherDesLiens(jeu.id);
    ok('des rapprochements sont trouvés alors que les colonnes n’ont PAS le même nom',
        propositions.length >= 2);
    const versAffaires = propositions.find(x => x.autreId === 'aff');
    const versContrats = propositions.find(x => x.autreId === 'ctr');
    ok('le rapprochement avec les affaires est trouvé',
        !!versAffaires && versAffaires.colonneDeDepart === 'N_AFFAIRE' && versAffaires.colonneDeLAutre === 'NUM_AFFAIRE');
    ok('il est mesuré : toutes les valeurs de la liste sont retrouvées',
        !!versAffaires && versAffaires.mesure.cles === 300 && versAffaires.mesure.retrouvees === 300 &&
        Math.round(versAffaires.mesure.taux * 100) === 100);
    ok('et il annonce une seule ligne en face de chacune : ce lien ne multipliera rien',
        !!versAffaires && versAffaires.mesure.parLigne === 1);
    ok('le rapprochement avec les contrats est trouvé lui aussi', !!versContrats);
    ok('et il PRÉVIENT qu’il mettra deux lignes en face de chacune — avant même d’être créé',
        !!versContrats && versContrats.mesure.parLigne === 2 &&
        /multiplier les lignes/.test(v13PhraseDeLaMesure(versContrats.mesure)));
    ok('le meilleur rapprochement est proposé en premier', propositions[0].autreId === 'aff');
    ok('une colonne qui ne porte qu’une seule valeur n’est jamais proposée comme clé',
        !propositions.some(x => x.colonneDeDepart === 'CONSIGNE'));
    const cles = await v13ClesDuDepart(jeu.id);
    ok('elle est écartée dès le départ, avant toute mesure',
        cles.length === 1 && cles[0].colonne === 'N_AFFAIRE' && cles[0].valeurs === 300);

    // ---- 2. Le lien se crée en un clic, et sert tout de suite ----
    await v13RelierDepuisLaProposition('aff', 'N_AFFAIRE', 'NUM_AFFAIRE');
    ok('la source reliée devient atteignable depuis la liste',
        advReachableTables().some(t => t.id === 'aff'));
    const lien = state.relations.find(r => r.targetTable === jeu.id || r.sourceTable === jeu.id);
    ok('le lien est marqué « à la volée », pour pouvoir le reconnaître', !!lien && lien.volee === true);
    ok('et sa cardinalité est déduite de la mesure, pas devinée', !!lien && lien.cardinality === '1-1');
    const spec = state.advExtract;
    spec.columns = [
        { id: 'c1', tableId: jeu.id, col: 'N_AFFAIRE', alias: 'N_AFFAIRE', transform: 'none' },
        { id: 'c2', tableId: 'aff', col: 'CLIENT', alias: 'CLIENT', transform: 'none' }
    ];
    const requete = buildAdvSql(spec);
    ok('l’extraction se construit sur le jeu temporaire relié', !requete.err);
    const compte = arrowResultToObjects(await conn.query(
        `SELECT COUNT(*)::BIGINT AS n, COUNT(CLIENT)::BIGINT AS remplies FROM (${requete.sql}) z`))[0];
    ok('le fichier garde les 300 lignes de la liste : rien n’est perdu, rien n’est ajouté',
        Number(compte.n) === 300);
    ok('et la colonne cherchée est bien remplie pour les 300', Number(compte.remplies) === 300);

    // ---- 3. L'écran ----
    renderAdvExtract();
    // Les liens sont un RÉGLAGE, pas une étape : ils vivent dans la barre d'outils d'Extraire, à
    // côté des paramétrages, et ne s'ouvrent que lorsqu'on les demande — l'écran principal ne porte
    // que les colonnes, les filtres et la forme du résultat.
    const bouton = document.querySelector('.v12x-toolbtn[data-tool="liens"]');
    const panneau = document.querySelector('.v12x-tool[data-tool="liens"]');
    ok('« Sources reliées » est un outil de la barre, pas une section de plus', !!bouton && !!panneau);
    ok('le bouton porte le nombre de sources reliées',
        !!bouton && !!bouton.querySelector('.n') && bouton.querySelector('.n').textContent === '1');
    ok('le panneau dit où l’on peut aller chercher des colonnes',
        !!panneau && /AFFAIRES\.csv/.test(panneau.textContent));
    ok('il montre le lien créé à la volée, avec de quoi le retirer',
        !!panneau && /N_AFFAIRE/.test(panneau.textContent) && !!panneau.querySelector('[onclick^="v13RetirerLeLien"]'));
    ok('et il porte le choix à la main, déplié, en premier',
        !!panneau && !!panneau.querySelector('#v13-lien-col-depart') && !!panneau.querySelector('[onclick^="v13RelierALaMain"]'));

    // ---- 4. Le même lien ne se crée pas deux fois ----
    const avant = state.relations.length;
    let refus = '';
    const ancienErr = window.showError;
    window.showError = m => { refus = String(m); };
    v13CreerLeLien(jeu.id, 'N_AFFAIRE', 'aff', 'NUM_AFFAIRE', { parLigne: 1 });
    window.showError = ancienErr;
    ok('le même lien ne peut pas être créé deux fois',
        state.relations.length === avant && /existe déjà/.test(refus));

    // ---- 5. Deux colonnes sans rien de commun : on le dit, on ne relie pas ----
    const impossible = await v13MesurerUnRapprochement(jeu.id, 'N_AFFAIRE', 'aff', 'VILLE');
    ok('deux colonnes sans valeur commune se mesurent à zéro', impossible.retrouvees === 0);

    // ---- 6. Un lien à la volée dont la table a disparu est oublié ----
    state.relations.push({ id: 'rel_fantome', sourceTable: 'nexiste_pas', sourceCol: 'A',
        targetTable: jeu.id, targetCol: 'N_AFFAIRE', volee: true });
    const oubliees = v13OublierLesLiensOrphelins();
    ok('un lien à la volée vers une table disparue est oublié', oubliees === 1 &&
        !state.relations.some(r => r.id === 'rel_fantome'));
    ok('mais le lien valide, lui, est conservé', state.relations.some(r => r.volee && r.sourceTable === 'aff'));

    // ---- 7. Le lien se retire d'un clic ----
    v13RetirerLeLien(lien.id);
    ok('retirer le lien le fait disparaître', !state.relations.some(r => r.id === lien.id));
    ok('et la source n’est plus atteignable', !advReachableTables().some(t => t.id === 'aff'));

    // ---- 8. Depuis une source ordinaire aussi, pas seulement un jeu temporaire ----
    advSetBase('aff');
    const depuisUneSource = await v13ChercherDesLiens('aff');
    ok('une source ordinaire peut elle aussi se relier à la volée',
        depuisUneSource.some(x => x.autreId === 'ctr' && x.colonneDeLAutre === 'NUM_AFFAIRE'));
    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
