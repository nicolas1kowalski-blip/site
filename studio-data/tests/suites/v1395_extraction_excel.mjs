import fs from 'fs';
import path from 'node:path';
import os from 'node:os';
// L'extraction au format Excel : les données dans un onglet, et dans l'autre de quoi relire le
// fichier trois jours plus tard — d'où il vient, ce qui a été paramétré, et ce qui a été contrôlé.
//
// Le contrôle des clés est la vraie raison d'être de cette synthèse : quand une LISTE a servi de
// filtre, elle dit ce qu'on attendait. On vérifie donc que chaque valeur demandée se retrouve
// dans le fichier — et l'on nomme celles qui manquent.
//
// Ce contrôle a besoin du moteur ET de la bibliothèque Excel dans la page : il s'exécute sur la
// version hors ligne, qui les porte. Sans elle, il se tait plutôt que d'échouer.
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
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const p = await ctx.newPage();
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.goto('file://' + FICHIER, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

// Le montage : 1 000 affaires, 2 contrats chacune. La liste demande 110 valeurs, dont 10 qui
// n'existent nulle part — c'est exactement le cas où l'on veut être prévenu.
const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    window.lucide = window.lucide || { createIcons: () => {} };
    try { v11Prefs.tourDone = true; v11TourEnd(true); wizClose(); } catch (e) {}
    const { conn } = await getDB();
    await conn.query(`CREATE OR REPLACE TABLE t_a AS SELECT 'A'||i AS dk_code_aff, 'nom'||i AS NOM, i AS __rn FROM range(1,1001) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_x AS SELECT 'A'||((i-1)//2+1) AS AFF_ID, 'C'||i AS CTT_ID, i AS __rn FROM range(1,2001) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE t_k AS SELECT 'C'||i AS DK_CODE_CTT, i AS __rn FROM range(1,2001) tbl(i)`);
    await conn.query(`CREATE OR REPLACE TABLE liste_ma_liste_f1 AS SELECT 'A'||i AS AFF_ID FROM range(1,101) tbl(i)
        UNION ALL SELECT 'A' || (9000+i) FROM range(1,11) tbl(i)`);
    state.tables['a'] = { id:'a', name:'Affaire.txt', type:'csv', status:'ready', headers:['dk_code_aff','NOM'], config:{}, columnsMeta:{}, lastRows:1000 };
    state.tables['x'] = { id:'x', name:'REL_CONTRAT_AFF.csv', type:'csv', status:'ready', headers:['AFF_ID','CTT_ID'], config:{}, columnsMeta:{} };
    state.tables['k'] = { id:'k', name:'CONTRAT.csv', type:'csv', status:'ready', headers:['DK_CODE_CTT'], config:{}, columnsMeta:{} };
    state.relations = [{ id:'r1', sourceTable:'x', targetTable:'a', sourceCol:'AFF_ID', targetCol:'dk_code_aff', type:'N-1' },
                       { id:'r2', sourceTable:'x', targetTable:'k', sourceCol:'CTT_ID', targetCol:'DK_CODE_CTT', type:'N-1' }];
    renderTables(); switchTab(3);
    const spec = state.advExtract;
    spec.baseId='a'; spec.dedup={on:false,keys:[],keep:'first'}; spec.group={on:false,aggs:[],dims:[]};
    spec.limit500=false; spec.customSql=''; spec.joinType='left';
    spec.columns=[{ id:'c1', tableId:'a', col:'dk_code_aff', alias:'dk_code_aff', transform:'none' },
                  { id:'c2', kind:'link', tableId:'k', mode:'count', col:'', n:3, via:'', alias:'nb_CONTRAT', transform:'none' }];
    const valeurs = [];
    for (let i = 1; i <= 100; i++) valeurs.push(['A' + i]);
    for (let i = 1; i <= 10; i++) valeurs.push(['A' + (9000 + i)]);
    spec.filters=[{ id:'f1', tableId:'x', col:'AFF_ID', op:'list', val:'', via:'',
        list:{ name:'ma liste', cols:['AFF_ID'], rows:valeurs, keys:[{ lc:'AFF_ID', tableId:'x', col:'AFF_ID', via:'' }], mode:'in', match:'ci', attach:false } }];

    const materialiser = async () => {
        const q = buildAdvSql(spec);
        if (q.err) throw new Error(q.err);
        await conn.query(`CREATE OR REPLACE TABLE ${sqlIdent(duckTableName('essai'))} AS SELECT ROW_NUMBER() OVER () AS __rn, * FROM (${q.sql}) r`);
    };

    // 1. Sans clé déclarée : on compte les lignes, et on le dit.
    spec.cleDeSortie = [];
    await materialiser();
    const sansCle = await advControlerLesCles('essai', spec);
    ok('sans clé déclarée, le nombre de lignes est quand même donné', sansCle.lignes === 100 && sansCle.cleDeclaree === false);
    ok('et la synthèse invite à en déclarer une plutôt que de rester muette',
        advFeuilleDeSynthese(spec, sansCle, sansCle.lignes).some(l => /Aucune clé de contrôle déclarée/.test(String(l[0]))));

    // 2. Avec une clé : lignes, clés différentes, lignes sans clé, doublons.
    spec.cleDeSortie = ['c1'];
    const avecCle = await advControlerLesCles('essai', spec);
    ok('la clé déclarée est nommée par son nom en sortie', avecCle.nomDeLaCle === 'dk_code_aff');
    ok('100 lignes, 100 clés différentes, aucune vide, aucun doublon',
        avecCle.lignes === 100 && avecCle.distinctes === 100 && avecCle.sansCle === 0 && avecCle.enDouble === 0);

    // 3. LE contrôle qui compte : la liste demandait 110 valeurs, le fichier en porte 100.
    const a = avecCle.attendues;
    ok('la liste ayant servi de filtre est confrontée au fichier produit', !!a && !a.impossible);
    ok('elle dit combien de valeurs étaient demandées, et combien sont retrouvées',
        a.demandees === 110 && a.retrouvees === 100);
    ok('elle compte les valeurs ABSENTES du fichier — la question que l’on se pose vraiment',
        a.manquantes === 10);
    ok('et elle en nomme quelques-unes, au lieu d’annoncer un nombre sec',
        a.exemples.length > 0 && a.exemples.every(v => /^A90/.test(v)));
    ok('elle dit aussi CE QU’ELLE COMPARE, pour qu’on puisse juger du rapprochement',
        /AFF_ID.*dk_code_aff/.test(String(a.compare)));

    // 4. Une clé composée de plusieurs colonnes : la comparaison n'a plus de sens, on le dit.
    spec.cleDeSortie = ['c1', 'c2'];
    const composee = await advControlerLesCles('essai', spec);
    ok('une clé sur plusieurs colonnes reste mesurée (lignes, clés différentes)',
        composee.distinctes === 100 && composee.nomDeLaCle === 'dk_code_aff + nb_CONTRAT');
    ok('mais la comparaison à la liste est déclarée impossible, avec ce qu’il faut faire',
        composee.attendues && composee.attendues.impossible === true);

    // 5. L'onglet de synthèse porte bien tout ce qui permet de relire le fichier.
    spec.cleDeSortie = ['c1'];
    const feuille = advFeuilleDeSynthese(spec, avecCle, avecCle.lignes).map(l => l.map(x => (x == null ? '' : String(x))).join(' | '));
    const contient = motif => feuille.some(l => motif.test(l));
    ok('la synthèse date le fichier et donne son nombre de lignes', contient(/Produite le/) && contient(/Lignes dans le fichier \| 100/));
    ok('elle rappelle la table de départ et son volume', contient(/Table de départ \| Affaire\.txt/) && contient(/Lignes de la table de départ \| 1000/));
    ok('elle liste les colonnes en sortie et leur provenance', contient(/dk_code_aff \| Affaire\.txt\.dk_code_aff/) && contient(/nb_CONTRAT \| Σ Compter/));
    ok('elle écrit les LIENS empruntés, saut par saut', contient(/Affaire\.txt\.dk_code_aff = REL_CONTRAT_AFF\.csv\.AFF_ID.*puis.*CONTRAT\.csv\.DK_CODE_CTT/));
    ok('elle écrit les filtres AVEC leur portée — c’est elle qui explique le nombre de lignes',
        contient(/dans la liste « ma liste » \(110 valeur\(s\)\) \| sur la ligne/));
    ok('et elle porte le contrôle des clés, valeurs absentes comprises',
        contient(/Clés différentes \| 100/) && contient(/Valeurs ABSENTES du fichier \| 10/));
    ok('une colonne de la table de départ n’affiche aucun réglage « plusieurs valeurs »',
        feuille.some(l => /^dk_code_aff \| Affaire\.txt\.dk_code_aff \| — brut — \|  \|/.test(l)));
    return R;
});

// ---- le classeur est-il vraiment produit ? ----
const attente = p.waitForEvent('download', { timeout: 60000 }).catch(() => null);
await p.evaluate(() => advGenererExcel());
const telechargement = await attente;
let fichierEcrit = null;
if (telechargement) {
    fichierEcrit = path.join(os.tmpdir(), 'essai_extraction_' + Date.now() + '.xlsx');
    await telechargement.saveAs(fichierEcrit);
}
out.push([
    'le classeur est réellement produit, et porte le nom attendu',
    !!telechargement && /^Extraction_\d+\.xlsx$/.test(telechargement.suggestedFilename())
]);
if (fichierEcrit && fs.existsSync(fichierEcrit)) {
    const octets = fs.readFileSync(fichierEcrit);
    const texte = octets.toString('latin1');
    out.push(['le fichier est un vrai classeur Excel (archive ZIP)', octets[0] === 0x50 && octets[1] === 0x4b]);
    out.push(['il contient DEUX onglets, « Extraction » et « Synthèse »', /Extraction/.test(texte) && /Synth/.test(texte)]);
    fs.unlinkSync(fichierEcrit);
}

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
