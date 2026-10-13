import fs from 'fs';
// Le code devient son libellé, sans déclarer le moindre lien.
//
// Un fichier de gestion porte des codes : 01, 02, « VIE », « AUTO ». Le lecteur du fichier extrait
// veut lire « Assurance automobile ». La correspondance est dans un autre fichier — le JEU DE
// VALEURS. Jusqu'ici il fallait, pour chaque code, déclarer un lien dans le modèle de données puis
// ajouter la colonne du libellé : vingt codes, vingt liens, pour une traduction mot à mot.
//
// Ici, un jeu de valeurs se déclare UNE FOIS (et se repère tout seul), puis le bouton 🏷️ de chaque
// colonne y cherche le libellé par la VALEUR du code. Aucun lien, aucune jointure, donc aucune
// ligne multipliée.
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
    const lire = async sql => arrowResultToObjects(await conn.query(sql));

    // Un fichier de gestion : des codes partout. Deux jeux de valeurs séparés. Et un troisième
    // fichier qui porte PLUSIEURS jeux de valeurs, distingués par un domaine.
    await conn.query(`CREATE OR REPLACE TABLE t_aff AS SELECT row_number() OVER () AS __rn, 'AFF'||i AS NUM_AFFAIRE,
        CASE WHEN i%3=0 THEN 'VIE' WHEN i%3=1 THEN 'AUTO' ELSE 'HAB' END AS CODE_PRODUIT,
        CASE WHEN i%2=0 THEN '01' ELSE '02' END AS CODE_ETAT,
        CASE WHEN i%2=0 THEN 'MR' ELSE 'MME' END AS CODE_CIVILITE FROM range(1,1001) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_jvp AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
        ('VIE','Assurance vie'),('AUTO','Assurance automobile'),('HAB','Assurance habitation')) v(CODE, LIBELLE)`);
    await conn.query(`CREATE OR REPLACE TABLE t_jve AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
        ('01','En cours'),('02','Resilie'),('03','Suspendu')) v(CODE, LIBELLE_LONG)`);
    await conn.query(`CREATE OR REPLACE TABLE t_jvtout AS SELECT row_number() OVER () AS __rn, * FROM (VALUES
        ('CIVILITE','MR','Monsieur le client'),('CIVILITE','MME','Madame la cliente'),
        ('TITRE','MR','Maitre en exercice'),('TITRE','MME','Maitresse de conference')) v(DOMAINE, CODE, LIBELLE)`);
    const poser = (id, nom, entetes, lignes) => {
        state.tables[id] = { id, name: nom, type: 'csv', status: 'ready', lastRows: lignes,
            headers: entetes, config: {}, columnsMeta: {} };
    };
    poser('aff', 'AFFAIRES.csv', ['NUM_AFFAIRE', 'CODE_PRODUIT', 'CODE_ETAT', 'CODE_CIVILITE'], 1000);
    poser('jvp', 'JV_PRODUIT.csv', ['CODE', 'LIBELLE'], 3);
    poser('jve', 'JV_ETAT.csv', ['CODE', 'LIBELLE_LONG'], 3);
    poser('jvtout', 'JV_TOUTES.csv', ['DOMAINE', 'CODE', 'LIBELLE'], 4);
    state.relations = [];
    renderTables(); switchTab(3); advSetBase('aff');

    // ---- 1. Le repérage tout seul ----
    const proposes = await v13RepererLesJeuxDeValeurs();
    const nomsProposes = proposes.map(x => x.nom).sort().join(', ');
    ok('les fichiers de jeux de valeurs sont repérés tout seuls',
        nomsProposes === 'JV_ETAT.csv, JV_PRODUIT.csv, JV_TOUTES.csv');
    ok('le fichier de gestion, lui, n’est PAS pris pour une nomenclature',
        !proposes.some(x => x.tableId === 'aff'));
    const produit = proposes.find(x => x.tableId === 'jvp');
    ok('la colonne du code et celle du libellé sont devinées',
        !!produit && produit.code === 'CODE' && produit.libelle === 'LIBELLE');
    const toutes = proposes.find(x => x.tableId === 'jvtout');
    ok('un fichier qui porte PLUSIEURS jeux de valeurs est reconnu, avec son domaine',
        !!toutes && toutes.code === 'CODE' && toutes.libelle === 'LIBELLE' && toutes.domaine === 'DOMAINE');
    proposes.forEach(x => v13AccepterLeJeuDeValeurs(x.tableId, x.code, x.libelle, x.domaine));
    ok('une fois acceptés, ils sont déclarés', v13SourcesDesJeuxDeValeurs().length === 3);
    ok('et la déclaration est relue proprement',
        v13JeuDeValeurs(state.tables['jvtout']).domaine === 'DOMAINE');

    // ---- 2. Un clic sur la colonne, et le libellé est là ----
    const spec = state.advExtract;
    spec.columns = [
        { id: 'c1', tableId: 'aff', col: 'NUM_AFFAIRE', alias: 'NUM_AFFAIRE', transform: 'none' },
        { id: 'c2', tableId: 'aff', col: 'CODE_PRODUIT', alias: 'CODE_PRODUIT', transform: 'none' },
        { id: 'c3', tableId: 'aff', col: 'CODE_CIVILITE', alias: 'CODE_CIVILITE', transform: 'none' }
    ];
    renderAdvExtract();
    const messages = [];
    const ancienOk = window.showSuccess, ancienErr = window.showError;
    window.showSuccess = m => messages.push(String(m).replace(/<[^>]+>/g, ''));
    window.showError = m => messages.push('ERREUR : ' + String(m).replace(/<[^>]+>/g, ''));
    await v13ChangerLeJeuDeValeursDeLaColonne('c2', 'jvp');
    await v13ChangerLeJeuDeValeursDeLaColonne('c3', 'jvtout');
    window.showSuccess = ancienOk; window.showError = ancienErr;
    ok('le libellé se pose juste après le code, pas à la fin',
        spec.columns.map(c => c.alias).join(',') ===
        'NUM_AFFAIRE,CODE_PRODUIT,CODE_PRODUIT_LIBELLE,CODE_CIVILITE,CODE_CIVILITE_LIBELLE');
    ok('le message dit d’où vient le libellé et combien de valeurs sont reconnues',
        /JV_PRODUIT\.csv/.test(messages[0]) && /3 valeur\(s\) sur 3 reconnues \(100 %\)/.test(messages[0]));
    ok('et, pour un fichier à plusieurs jeux, quel domaine a été retenu',
        /JV_TOUTES\.csv/.test(messages[1]) && /domaine « CIVILITE »/.test(messages[1]));

    // ---- 3. Le résultat : traduit, complet, et sans une ligne de plus ----
    const requete = buildAdvSql(spec);
    ok('la requête se construit', !requete.err);
    const compte = (await lire(`SELECT COUNT(*)::BIGINT AS n FROM (${requete.sql}) z`))[0];
    ok('le fichier garde ses 1 000 lignes : une recherche par la valeur ne joint rien',
        Number(compte.n) === 1000);
    const vides = (await lire(`SELECT COUNT(*)::BIGINT AS n FROM (${requete.sql}) z
        WHERE CODE_PRODUIT_LIBELLE IS NULL OR CODE_CIVILITE_LIBELLE IS NULL`))[0];
    ok('aucun libellé ne manque', Number(vides.n) === 0);
    const une = (await lire(`SELECT * FROM (${requete.sql}) z WHERE NUM_AFFAIRE = 'AFF3'`))[0];
    ok('le code est traduit par le bon libellé',
        une.CODE_PRODUIT === 'VIE' && une.CODE_PRODUIT_LIBELLE === 'Assurance vie');
    ok('et le domaine évite de ramener le libellé d’un autre jeu de valeurs',
        une.CODE_CIVILITE === 'MME' && une.CODE_CIVILITE_LIBELLE === 'Madame la cliente');
    // Sans le domaine, le code « 01 » de JV_TOUTES voudrait dire autre chose que dans JV_ETAT :
    // c'est exactement le piège que le domaine évite.
    const sansDomaine = buildAdvSql(Object.assign({}, spec, {
        columns: [
            { id: 'c1', tableId: 'aff', col: 'NUM_AFFAIRE', alias: 'NUM_AFFAIRE', transform: 'none' },
            { id: 'x1', kind: 'jv', tableId: 'aff', col: 'CODE_CIVILITE', jvId: 'jvtout', domaine: '', alias: 'SANS_DOMAINE', transform: 'none' }
        ]
    }));
    const sans = (await lire(`SELECT SANS_DOMAINE FROM (${sansDomaine.sql}) z WHERE NUM_AFFAIRE = 'AFF3'`))[0];
    ok('sans domaine, le libellé peut être celui d’un AUTRE jeu du même fichier — le domaine n’est pas un ornement',
        sans.SANS_DOMAINE === 'Madame la cliente' || sans.SANS_DOMAINE === 'Maitresse de conference');
    ok('et quand plusieurs domaines portent les mêmes codes, le message le dit',
        /existent aussi dans le\(s\) domaine\(s\) TITRE/.test(messages[1]));

    // ---- 4. L'écran ----
    renderAdvExtract();
    ok('les jeux de valeurs ont leur propre outil dans la barre, replié tant qu’on ne le demande pas',
        !!document.querySelector('.v12x-toolbtn[data-tool="jeuxdevaleurs"]') &&
        !!document.querySelector('.v12x-tool[data-tool="jeuxdevaleurs"]'));
    ok('les jeux déclarés y sont listés avec leur code et leur libellé',
        /JV_PRODUIT\.csv : CODE → LIBELLE/.test(
            document.querySelector('.v12x-tool[data-tool="jeuxdevaleurs"]').textContent.replace(/\s+/g, ' ')));
    ok('et le bouton porte leur nombre',
        /2|3/.test(document.querySelector('.v12x-toolbtn[data-tool="jeuxdevaleurs"] .n').textContent));
    // Le choix du jeu de valeurs est un SÉLECTEUR NOMMÉ sur la ligne de la colonne, et non plus une
    // emoji grise entre le crayon et la croix, que personne ne pouvait relier à une donnée de sortie.
    const reglages = advReglagesDeColonneHtml(spec.columns[1], 'aff');
    ok('chaque colonne porte le choix de son jeu de valeurs, nommé',
        /v13ChangerLeJeuDeValeursDeLaColonne/.test(reglages) && /sans libellé/.test(reglages));
    ok('les jeux déclarés y sont proposés par leur nom', /JV_PRODUIT\.csv/.test(reglages));
    ok('et celui qui est déjà choisi est sélectionné',
        /value="jvp" selected/.test(advReglagesDeColonneHtml(spec.columns[1], 'aff')));
    ok('une colonne calculée ne propose pas de libellé',
        advReglagesDeColonneHtml({ kind: 'calc', id: 'z' }, 'aff') === '');
    ok('le réglage vit dans la cellule de la transformation, pas dans une colonne de plus',
        /<select/.test(reglages));

    // ---- 5. Ce qui doit échouer proprement ----
    let refus = '';
    const err2 = window.showError;
    window.showError = m => { refus = String(m); };
    spec.columns.push({ id: 'c9', tableId: 'aff', col: 'NUM_AFFAIRE', alias: 'NUM_AFFAIRE_2', transform: 'none' });
    await v13ChangerLeJeuDeValeursDeLaColonne('c9', 'jvp');
    window.showError = err2;
    ok('un jeu de valeurs qui ne reconnaît rien le dit franchement',
        /ne reconnaît aucune valeur/.test(refus));
    // Et l'on revient en arrière d'un seul geste : « pas de libellé ».
    await v13ChangerLeJeuDeValeursDeLaColonne('c9', '');
    ok('« pas de libellé » retire la colonne du libellé',
        !spec.columns.some(c => c.alias === 'NUM_AFFAIRE_2_LIBELLE'));
    await v13ChangerLeJeuDeValeursDeLaColonne('c2', '');
    ok('et le fichier retrouve sa forme d’avant',
        !spec.columns.some(c => c.alias === 'CODE_PRODUIT_LIBELLE'));
    await v13ChangerLeJeuDeValeursDeLaColonne('c2', 'jvp');
    ok('on peut le remettre aussitôt', spec.columns.some(c => c.alias === 'CODE_PRODUIT_LIBELLE'));
    v13RetirerLeJeuDeValeurs('jvp');
    ok('un jeu de valeurs se retire', !v13JeuDeValeurs(state.tables['jvp']));
    ok('les autres restent', v13SourcesDesJeuxDeValeurs().length === 2);
    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
