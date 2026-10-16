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

    // ---- 7 bis. Le CHEMIN emprunté se voit, quand il traverse des tables ----
    //
    // Dans un modèle de trente fichiers tous reliés, aller d'une liste de sites aux contrats peut
    // passer par les imputations et les tâches financières : le moteur prend le plus court chemin,
    // qui n'est pas celui qu'on avait en tête. Le résultat est alors vide ou faux, et rien à
    // l'écran ne le disait.
    await conn.query(`CREATE OR REPLACE TABLE t_m1 AS SELECT row_number() OVER () AS __rn, 'A'||i AS K1, 'B'||i AS K2 FROM range(1,101) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_m2 AS SELECT row_number() OVER () AS __rn, 'B'||i AS K2, 'C'||i AS K3 FROM range(1,101) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_m3 AS SELECT row_number() OVER () AS __rn, 'C'||i AS K3, (i%7) AS VALEUR FROM range(1,101) tbl(i)`);
    state.tables['m1'] = { id: 'm1', name: 'DEPART.csv', type: 'csv', status: 'ready', lastRows: 100, headers: ['K1', 'K2'], config: {}, columnsMeta: {} };
    state.tables['m2'] = { id: 'm2', name: 'MILIEU.csv', type: 'csv', status: 'ready', lastRows: 100, headers: ['K2', 'K3'], config: {}, columnsMeta: {} };
    state.tables['m3'] = { id: 'm3', name: 'LOIN.csv', type: 'csv', status: 'ready', lastRows: 100, headers: ['K3', 'VALEUR'], config: {}, columnsMeta: {} };
    state.relations = [
        { id: 'm_a', sourceTable: 'm1', targetTable: 'm2', sourceCol: 'K2', targetCol: 'K2', type: 'N-1' },
        { id: 'm_b', sourceTable: 'm2', targetTable: 'm3', sourceCol: 'K3', targetCol: 'K3', type: 'N-1' }
    ];
    advSetBase('m1');
    const loin = v13CheminLisible('m1', 'm3', '');
    ok('le chemin jusqu’à une table éloignée est connu, saut par saut',
        !!loin && loin.pas === 2 && loin.texte === 'MILIEU.csv → LOIN.csv');
    const colonneLoin = { id: 'z1', tableId: 'm3', col: 'VALEUR', alias: 'VALEUR', transform: 'none' };
    ok('et il est écrit sous la source de la colonne',
        /passe par MILIEU\.csv → LOIN\.csv/.test(v13CheminDeLaColonneHtml(colonneLoin)));
    ok('une table reliée directement n’affiche aucun chemin : il n’y a rien à expliquer',
        v13CheminDeLaColonneHtml({ id: 'z2', tableId: 'm2', col: 'K3', alias: 'K3', transform: 'none' }) === '');
    ok('une colonne de la table de départ non plus',
        v13CheminDeLaColonneHtml({ id: 'z3', tableId: 'm1', col: 'K1', alias: 'K1', transform: 'none' }) === '');
    state.advExtract.columns = [
        { id: 'z0', tableId: 'm1', col: 'K1', alias: 'K1', transform: 'none' },
        colonneLoin
    ];
    renderAdvExtract();
    const panneauChemin = document.querySelector('.v12x-tool[data-tool="liens"]');
    ok('le panneau dit par où passe l’extraction, au lieu d’aligner toutes les sources',
        !!panneauChemin && /en passant par MILIEU\.csv → LOIN\.csv/.test(panneauChemin.textContent));

    // ---- 7 ter. « Ne compter que… » suit la table que l'on vient de choisir ----
    //
    // Le critère d'une synthèse ne peut porter que sur les tables du CHEMIN. La liste était
    // construite une fois pour toutes au dessin du formulaire : on choisissait ensuite « compter
    // les CONTRATS » et « Ne compter que… » proposait encore la table du milieu, jamais les
    // contrats eux-mêmes. Le critère que l'on voulait poser était introuvable.
    await conn.query(`CREATE OR REPLACE TABLE t_n1 AS SELECT row_number() OVER () AS __rn, 'S'||i AS UO, 'E'||i AS DK FROM range(1,51) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_n2 AS SELECT row_number() OVER () AS __rn, 'E'||i AS DK, (1980+i)::VARCHAR AS ANNEE FROM range(1,51) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_n3 AS SELECT row_number() OVER () AS __rn, 'E'||((i-1)%50+1) AS DK, 'C360' AS SRC FROM range(1,151) tbl(i)`);
    state.tables['n1'] = { id: 'n1', name: 'DEPART2.csv', type: 'csv', status: 'ready', lastRows: 50, headers: ['UO', 'DK'], config: {}, columnsMeta: {} };
    state.tables['n2'] = { id: 'n2', name: 'MILIEU2.csv', type: 'csv', status: 'ready', lastRows: 50, headers: ['DK', 'ANNEE'], config: {}, columnsMeta: {} };
    state.tables['n3'] = { id: 'n3', name: 'BOUT2.csv', type: 'csv', status: 'ready', lastRows: 150, headers: ['DK', 'SRC'], config: {}, columnsMeta: {} };
    state.relations = [
        { id: 'n_a', sourceTable: 'n1', targetTable: 'n2', sourceCol: 'DK', targetCol: 'DK', type: 'N-1' },
        { id: 'n_b', sourceTable: 'n3', targetTable: 'n1', sourceCol: 'DK', targetCol: 'DK', type: 'N-1' }
    ];
    advSetBase('n1');
    state.advExtract.columns = [{ id: 'q1', tableId: 'n1', col: 'UO', alias: 'UO', transform: 'none' }];
    v12xAddMode('link');
    renderAdvExtract();
    v12xAddMode('link');
    const tableLiee = el('adv-link-tbl');
    const optionsDuCritere = () =>
        Array.from((el('adv-linkc-tbl') || { options: [] }).options).map(o => o.text);
    ok('le formulaire de synthèse est ouvert', !!tableLiee);
    tableLiee.value = 'n2';
    advLinkTblChanged();
    ok('pour la table du milieu, le critère porte sur elle', optionsDuCritere().join(',') === 'MILIEU2.csv');
    tableLiee.value = 'n3';
    advLinkTblChanged();
    ok('quand on change de table liée, « Ne compter que… » propose CETTE table',
        optionsDuCritere().includes('BOUT2.csv'));
    ok('et elle est choisie par défaut : c’est sur elle qu’on pose un critère neuf fois sur dix',
        (el('adv-linkc-tbl') || {}).value === 'n3');
    ok('ses colonnes suivent aussitôt',
        Array.from((el('adv-linkc-col') || { options: [] }).options).map(o => o.text).join(',') === 'DK,SRC');

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
