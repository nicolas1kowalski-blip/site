import fs from 'fs';
// Le fichier produit porte UNE ligne par ligne de la table de départ.
//
// C'est la règle de l'extraction, et un seul réglage a le droit de la rompre : « une ligne par
// valeur », choisi colonne par colonne. Une colonne y échappait — celle qui emprunte « l'un ou
// l'autre lien » : sa valeur venant de plusieurs chemins, elle les JOIGNAIT tous. Mesuré sur un cas
// ordinaire (140 000 affaires, 220 000 liens, deux adresses par objet) : 440 000 lignes en sortie,
// sans que rien n'ait été demandé. Les chemins sont maintenant réunis DANS une sous-requête.
//
// Deux autres manques se contrôlent ici :
//  - la clé de contrôle était une emoji à vingt pour cent d'opacité, en niveaux de gris, collée
//    contre le nom de sortie : personne ne pouvait la déclarer ;
//  - la synthèse ne disait rien fichier par fichier, ni colonne par colonne, ni combien de valeurs
//    un filtre portait.
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

    // 1 000 affaires. Chacune désigne DEUX personnes : le souscripteur et le bénéficiaire — deux
    // chemins vers la même table, le cas même de « l'un ou l'autre lien ».
    await conn.query(`CREATE OR REPLACE TABLE t_aff AS SELECT row_number() OVER () AS __rn, 'AFF'||i AS NUM_AFFAIRE,
        'Client '||i AS CLIENT, 'P'||i AS CODE_SOUSCRIPTEUR, 'P'||(i+1000) AS CODE_BENEFICIAIRE FROM range(1,1001) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_per AS SELECT row_number() OVER () AS __rn, 'P'||i AS CODE_PERSONNE,
        'Personne '||i AS NOM FROM range(1,2001) tbl(i)`);
    // Et une table liée ordinaire : deux lignes par affaire.
    await conn.query(`CREATE OR REPLACE TABLE t_lien AS SELECT row_number() OVER () AS __rn, 'AFF'||((i-1)//2+1) AS NUM_AFFAIRE,
        'OBJ'||i AS CODE_OBJET, CASE WHEN i%2=0 THEN 'PRINCIPAL' ELSE 'SECONDAIRE' END AS ROLE FROM range(1,2001) tbl(i)`);
    state.tables['aff'] = { id: 'aff', name: 'AFFAIRES.csv', type: 'csv', status: 'ready', lastRows: 1000, lignesDuFichier: 1000,
        headers: ['NUM_AFFAIRE', 'CLIENT', 'CODE_SOUSCRIPTEUR', 'CODE_BENEFICIAIRE'], config: {}, columnsMeta: {} };
    state.tables['per'] = { id: 'per', name: 'PERSONNES.csv', type: 'csv', status: 'ready', lastRows: 2000, lignesDuFichier: 2000,
        headers: ['CODE_PERSONNE', 'NOM'], config: {}, columnsMeta: {} };
    state.tables['lien'] = { id: 'lien', name: 'LIENS.csv', type: 'csv', status: 'ready', lastRows: 2000, lignesDuFichier: 2000,
        headers: ['NUM_AFFAIRE', 'CODE_OBJET', 'ROLE'], config: {}, columnsMeta: {} };
    state.relations = [
        { id: 'r1', sourceTable: 'aff', targetTable: 'per', sourceCol: 'CODE_SOUSCRIPTEUR', targetCol: 'CODE_PERSONNE', type: 'N-1' },
        { id: 'r2', sourceTable: 'aff', targetTable: 'per', sourceCol: 'CODE_BENEFICIAIRE', targetCol: 'CODE_PERSONNE', type: 'N-1' },
        { id: 'r3', sourceTable: 'lien', targetTable: 'aff', sourceCol: 'NUM_AFFAIRE', targetCol: 'NUM_AFFAIRE', type: 'N-1' }
    ];
    renderTables(); switchTab(3);
    const s = state.advExtract;
    const neuf = () => {
        s.baseId = 'aff'; s.filters = []; s.dedup = { on: false, keys: [], keep: 'first' };
        s.group = { on: false, aggs: [], dims: [] }; s.limit500 = false; s.customSql = ''; s.joinType = 'left';
        s.cleDeSortie = [];
        s.columns = [{ id: 'c1', tableId: 'aff', col: 'NUM_AFFAIRE', alias: 'NUM_AFFAIRE', transform: 'none' }];
    };
    const compter = async () => {
        const q = buildAdvSql(s);
        if (q.err) return 'ERREUR ' + q.err;
        return nb(`SELECT COUNT(*)::BIGINT AS n FROM (${q.sql}) z`);
    };

    // ---- 1. « L'un ou l'autre lien » ne multiplie plus ----
    ok('deux chemins mènent bien à la même table : « l’un ou l’autre lien » a un sens ici',
        advViaOptions('per').length === 2);
    neuf(); s.columns.push({ id: 'c2', tableId: 'per', col: 'NOM', alias: 'NOM', transform: 'none', via: 'any' });
    ok('une colonne par « l’un ou l’autre lien » garde une ligne par ligne de départ',
        (await compter()) === 1000);
    const lire = async (sql, affaire) =>
        arrowResultToObjects(await conn.query(`SELECT NOM FROM (${sql}) z WHERE NUM_AFFAIRE = '${affaire}'`));
    // La valeur ne doit pas changer : c'était « le premier chemin renseigné » (un COALESCE des
    // deux routes), cela le reste — mais sans joindre la table, donc sans pouvoir multiplier.
    const parDefaut = await lire(buildAdvSql(s).sql, 'AFF1');
    ok('elle ramène la valeur du PREMIER chemin renseigné, comme avant',
        parDefaut.length === 1 && parDefaut[0].NOM === 'Personne 1');
    ok('le réglage par défaut est donc « la première valeur »', advPlusieursValeurs(s.columns[1], 'aff') === 'premiere');
    ok('aucune table n’est jointe pour cette colonne : elle ne demande aucune jointure',
        advColNeeds(s.columns[1], 'aff').length === 0);
    // Quand le premier chemin est vide, c'est le second qui donne la valeur : c'est le sens même
    // de « l'un ou l'autre lien ».
    await conn.query(`UPDATE t_aff SET CODE_SOUSCRIPTEUR = NULL WHERE NUM_AFFAIRE = 'AFF2'`);
    const second = await lire(buildAdvSql(s).sql, 'AFF2');
    ok('et celle du second chemin quand le premier est vide',
        second.length === 1 && second[0].NOM === 'Personne 1002');
    await conn.query(`UPDATE t_aff SET CODE_SOUSCRIPTEUR = 'P2' WHERE NUM_AFFAIRE = 'AFF2'`);
    // Et l'on peut désormais demander les DEUX valeurs à la fois, ce qui n'existait pas.
    s.columns[1].plusieurs = 'regroupees';
    const reunies = await lire(buildAdvSql(s).sql, 'AFF1');
    ok('« valeurs regroupées » réunit les deux chemins dans la même cellule, sans ligne en plus',
        reunies.length === 1 && /Personne 1\b/.test(reunies[0].NOM) && /Personne 1001/.test(reunies[0].NOM));
    ok('et le nombre de lignes ne bouge pas pour autant', (await compter()) === 1000);
    delete s.columns[1].plusieurs;

    // ---- 2. Le choix reste offert, « une ligne par valeur » comprise ----
    ok('l’écran propose le réglage au lieu d’annoncer une fatalité',
        /<select/.test(advChoixPlusieursValeursHtml(s.columns[1], 'aff')));
    neuf(); s.columns.push({ id: 'c2', tableId: 'per', col: 'NOM', alias: 'NOM', transform: 'none', via: 'any', plusieurs: 'lignes' });
    const ancien = buildAdvSql(s);
    ok('« une ligne par valeur » garde l’ancien fonctionnement : les chemins sont joints',
        (await compter()) === 1000 && /LEFT JOIN[\s\S]*LEFT JOIN/.test(ancien.sql));
    neuf(); s.columns.push({ id: 'c2', tableId: 'per', col: 'NOM', alias: 'NOM', transform: 'none', via: 'any', plusieurs: 'premiere' });
    ok('« la première valeur » tient aussi sur une ligne', (await compter()) === 1000);
    // Et sur une table liée ordinaire, « une ligne par valeur » multiplie bel et bien : c'est son
    // rôle, et il ne faut pas le lui retirer.
    neuf(); s.columns.push({ id: 'c2', tableId: 'lien', col: 'ROLE', alias: 'ROLE', transform: 'none', plusieurs: 'lignes' });
    ok('« une ligne par valeur » fait toujours une ligne par valeur quand on le demande',
        (await compter()) === 2000);

    // ---- 3. Ce qui multiplie se voit AVANT de produire le fichier ----
    neuf(); s.columns.push({ id: 'c2', tableId: 'lien', col: 'ROLE', alias: 'ROLE', transform: 'none' });
    renderAdvExtract();
    ok('aucun avertissement quand rien ne multiplie', !document.querySelector('.v13-multiplie-avis'));
    s.columns[1].plusieurs = 'lignes';
    renderAdvExtract();
    const avis = document.querySelector('.v13-multiplie-avis');
    ok('un avertissement apparaît dès qu’une colonne est réglée sur « une ligne par valeur »', !!avis);
    ok('il nomme la colonne fautive et sa table',
        !!avis && /ROLE/.test(avis.textContent) && /LIENS\.csv/.test(avis.textContent));
    ok('il dit quoi faire pour garder une ligne par ligne de départ',
        !!avis && /valeurs regroupées/.test(avis.textContent));

    // ---- 4. La clé de contrôle se voit et se déclare ----
    neuf(); renderAdvExtract();
    // Le panneau des colonnes, et lui seul : le code de l'application est dans la page lui aussi.
    const panneauDesColonnes = () => {
        const premiere = document.querySelector('[ondrop^="reorderDrop(event,\'advcol\'"]');
        const tableau = premiere && premiere.closest('table');
        return tableau ? tableau.parentNode.parentNode : document.createElement('div');
    };
    const boutons = Array.from(document.querySelectorAll('[onclick^="advBasculerLaCleDeSortie"]'));
    ok('chaque colonne porte un bouton de clé', boutons.length === s.columns.length);
    ok('le bouton est lisible : plus d’emoji effacée à 20 % d’opacité',
        boutons.every(bt => getComputedStyle(bt).opacity === '1' && getComputedStyle(bt).filter !== 'grayscale(1)'));
    ok('il porte un mot, pas seulement un symbole', /déclarer/.test(boutons[0].textContent));
    ok('la clé a sa propre colonne dans le tableau',
        /Clé de contrôle/i.test(panneauDesColonnes().textContent.replace(/\s+/g, ' ')));
    ok('tant qu’aucune clé n’est déclarée, l’écran dit à quoi elle sert',
        /Aucune clé de contrôle déclarée/.test(panneauDesColonnes().textContent));
    advBasculerLaCleDeSortie('c1');
    ok('un clic déclare la colonne comme clé', (state.advExtract.cleDeSortie || []).includes('c1'));
    const apres = Array.from(document.querySelectorAll('[onclick^="advBasculerLaCleDeSortie"]'));
    ok('et le bouton change d’état, visiblement', /clé/.test(apres[0].textContent));
    ok('le rappel disparaît une fois la clé déclarée',
        !/Aucune clé de contrôle déclarée/.test(panneauDesColonnes().textContent));
    advBasculerLaCleDeSortie('c1');
    ok('un second clic la retire', !(state.advExtract.cleDeSortie || []).includes('c1'));

    // ---- 5. La synthèse : fichier par fichier, colonne par colonne, valeur par filtre ----
    neuf();
    s.cleDeSortie = ['c1'];
    s.columns.push({ id: 'c2', tableId: 'lien', col: 'ROLE', alias: 'ROLE', transform: 'none', plusieurs: 'lignes' });
    s.filters = [{ id: 'f1', tableId: 'lien', col: 'ROLE', op: 'in', val: 'PRINCIPAL;SECONDAIRE', portee: 'ligne' }];
    const identifiant = 'xl_test';
    const requete = advCurrentSql();
    await conn.query(`CREATE OR REPLACE TABLE ${sqlIdent(duckTableName(identifiant))} AS SELECT ROW_NUMBER() OVER () AS __rn, * FROM (${requete.sql}) q`);
    const entetes = await advColumnsOf(`SELECT * FROM ${sqlIdent(duckTableName(identifiant))}`);
    const controle = await advControlerLesCles(identifiant, s);
    const mesure = await advMesureDesColonnes(sqlIdent(duckTableName(identifiant)), entetes);
    const feuille = advFeuilleDeSynthese(s, controle, controle.lignes, mesure);
    const texte = feuille.map(l => (l || []).join(' | ')).join('\n');
    ok('la synthèse a un bloc « Fichiers utilisés »', /Fichiers utilisés/.test(texte));
    ok('il donne chaque fichier, son rôle et son nombre de lignes',
        /AFFAIRES\.csv \| table de départ \| 1000/.test(texte) && /LIENS\.csv \| table liée \| 2000/.test(texte));
    ok('il dit combien de colonnes et de filtres portent sur chaque fichier',
        /LIENS\.csv \| table liée \| 2000 \| 2000 \| 1 \| 1/.test(texte));
    ok('chaque colonne dit combien de valeurs différentes elle contient',
        !!mesure && mesure.NUM_AFFAIRE.distinctes === 1000 && mesure.ROLE.distinctes === 2);
    ok('et combien de cellules vides', !!mesure && mesure.NUM_AFFAIRE.vides === 0);
    ok('la synthèse porte ces deux mesures', /Valeurs différentes \| Cellules vides/.test(texte));
    ok('le filtre dit sur quel fichier et quelle colonne il porte', /LIENS\.csv \| ROLE/.test(texte));
    ok('et combien de valeurs il contient', advNombreDeValeursDUnFiltre(s.filters[0]) === 2);
    ok('une liste de fichier compte ses valeurs elle aussi',
        advNombreDeValeursDUnFiltre({ op: 'list', list: { rows: [1, 2, 3, 4] } }) === 4);
    ok('« est vide » ne compte aucune valeur', advNombreDeValeursDUnFiltre({ op: 'empty' }) === '');
    ok('le compte des lignes est expliqué, pas seulement affiché', /Compte des lignes/.test(texte));
    ok('et il nomme la colonne qui multiplie', /une ligne par valeur » — ROLE/.test(texte));
    await duckDropTable(identifiant);
    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
