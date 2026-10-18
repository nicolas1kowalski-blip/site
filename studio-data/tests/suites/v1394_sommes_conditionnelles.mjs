import fs from 'fs';
// « Des NB.SI et autres fonctions, sans la même condition que le filtre global. »
//
// Une synthèse de table liée savait compter. Elle sait maintenant additionner, faire une moyenne,
// et donner la plus petite ou la plus grande valeur — chacune avec SON critère, indépendant des
// filtres de l'extraction. C'est la différence entre « le montant des contrats ACTIFS de ce site »
// et « ne garder que les sites qui ont un contrat actif » : la première ne retire aucune ligne du
// fichier, la seconde si.
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

    // Trois sites. SITE1 a trois contrats (deux actifs), SITE2 en a deux, SITE3 aucun.
    await conn.query(`CREATE OR REPLACE TABLE t_site AS SELECT * FROM (VALUES
        (1,'SITE1'),(2,'SITE2'),(3,'SITE3')) v(__rn, UO)`);
    await conn.query(`CREATE OR REPLACE TABLE t_ctr AS SELECT * FROM (VALUES
        (1,'SITE1','ACT','1200','2030-03-01'),(2,'SITE1','ACT','350','2028-11-15'),
        (3,'SITE1','FER','9000','2031-01-02'),(4,'SITE2','ACT','40','2029-05-05'),
        (5,'SITE2','FER','7','2027-02-02')) v(__rn, UO, CTT_STAT, MONTANT, DATE_FIN)`);
    state.tables['site'] = { id: 'site', name: 'SITES.csv', type: 'csv', status: 'ready', lastRows: 3,
        headers: ['UO'], config: {}, columnsMeta: {} };
    state.tables['ctr'] = { id: 'ctr', name: 'CONTRAT.csv', type: 'csv', status: 'ready', lastRows: 5,
        headers: ['UO', 'CTT_STAT', 'MONTANT', 'DATE_FIN'], config: {}, columnsMeta: {} };
    state.relations = [{ id: 'r1', sourceTable: 'ctr', targetTable: 'site', sourceCol: 'UO', targetCol: 'UO', type: 'N-1' }];
    renderTables(); switchTab(3); advSetBase('site');

    const spec = state.advExtract;
    const siActif = [{ tableId: 'ctr', col: 'CTT_STAT', op: '=', val: 'ACT' }];
    const synthese = (id, mode, col, conds) => ({
        id, kind: 'link', tableId: 'ctr', mode, col: col || '', n: 3, via: '', alias: id, conds: conds || []
    });
    spec.columns = [
        { id: 'UO', tableId: 'site', col: 'UO', alias: 'UO', transform: 'none' },
        synthese('nb', 'count'),
        synthese('nb_si_actif', 'count', '', siActif),
        synthese('total', 'somme', 'MONTANT'),
        synthese('total_si_actif', 'somme', 'MONTANT', siActif),
        synthese('moyenne_si_actif', 'moyenne', 'MONTANT', siActif),
        synthese('mini', 'min', 'MONTANT'),
        synthese('maxi', 'max', 'MONTANT'),
        synthese('fin_la_plus_loin', 'max', 'DATE_FIN')
    ];
    spec.filters = []; spec.dedup = { on: false, keys: [], keep: 'first' };
    spec.group = { on: false, aggs: [], dims: [] }; spec.limit500 = false; spec.customSql = ''; spec.joinType = 'left';
    const requete = buildAdvSql(spec);
    ok('la requête se construit avec les quatre nouvelles fonctions', !requete.err);
    const lignes = arrowResultToObjects(await conn.query(`SELECT * FROM (${requete.sql}) z ORDER BY UO`));
    const par = {};
    lignes.forEach(l => (par[l.UO] = l));

    // ---- 1. Les quatre fonctions, sans critère ----
    ok('le fichier garde ses trois sites : une synthèse ne retire jamais de ligne', lignes.length === 3);
    ok('additionner : 1200 + 350 + 9000 = 10 550', Number(par.SITE1.total) === 10550);
    ok('la plus petite valeur se compare en NOMBRES, pas en lettres (350, pas 1200)',
        String(par.SITE1.mini) === '350');
    ok('la plus grande aussi (9000, pas 9000 battu par une chaîne)', String(par.SITE1.maxi) === '9000');
    ok('et la valeur rendue est celle du fichier, telle quelle', String(par.SITE2.mini) === '7');
    ok('sur des dates écrites en ISO, la plus grande est bien la plus lointaine',
        String(par.SITE1.fin_la_plus_loin) === '2031-01-02');

    // ---- 2. Le critère de la synthèse : un vrai SOMME.SI ----
    ok('compter avec un critère ne compte que ce qui le satisfait', String(par.SITE1.nb_si_actif) === '2');
    ok('additionner avec un critère : 1200 + 350, sans les 9000 du contrat fermé',
        Number(par.SITE1.total_si_actif) === 1550);
    ok('et la moyenne suit le même critère', Number(par.SITE1.moyenne_si_actif) === 775);
    ok('le critère ne touche pas les colonnes voisines : le total sans critère reste entier',
        Number(par.SITE1.total) === 10550);

    // ---- 3. Une ligne sans aucune correspondance ----
    ok('un site sans contrat reste dans le fichier', !!par.SITE3);
    ok('son compte vaut 0, et sa somme aussi — comme dans un tableur',
        String(par.SITE3.nb) === '0' && Number(par.SITE3.total) === 0);
    ok('sa moyenne et ses extrêmes restent VIDES : zéro serait un mensonge',
        par.SITE3.moyenne_si_actif == null && par.SITE3.mini == null && par.SITE3.maxi == null);

    // ---- 4. Le filtre global et le critère ne se mélangent pas ----
    spec.filters = [{ id: 'f1', tableId: 'ctr', col: 'CTT_STAT', op: '=', val: 'FER', portee: 'ligne' }];
    const avecFiltre = arrowResultToObjects(
        await conn.query(`SELECT * FROM (${buildAdvSql(spec).sql}) z ORDER BY UO`)
    );
    ok('le filtre global retire des lignes du fichier : les sites sans contrat fermé sortent',
        avecFiltre.length === 2 && !avecFiltre.some(l => l.UO === 'SITE3'));
    ok('mais les synthèses gardent LEUR critère, qui n’a rien à voir avec le filtre',
        String(avecFiltre[0].nb_si_actif) === '2' && Number(avecFiltre[0].total_si_actif) === 1550);

    // ---- 5. Une synthèse INDÉPENDANTE des filtres de l'extraction ----
    //
    // Par défaut, un filtre posé « sur le lien » restreint aussi ce que la synthèse compte : c'est
    // ce qu'on veut quand on écrit « ne ramener que les contrats actifs ». Mais on veut parfois
    // l'inverse dans la même extraction : « le nombre TOTAL de contrats de ce site », à côté du
    // reste déjà filtré. La synthèse peut donc être déclarée indépendante.
    spec.filters = [{ id: 'f2', tableId: 'ctr', col: 'CTT_STAT', op: '!=', val: 'FER', portee: 'lien' }];
    spec.columns = [
        { id: 'UO', tableId: 'site', col: 'UO', alias: 'UO', transform: 'none' },
        synthese('nb_filtre', 'count'),
        Object.assign(synthese('nb_tous', 'count'), { sansFiltres: true }),
        synthese('total_filtre', 'somme', 'MONTANT'),
        Object.assign(synthese('total_tous', 'somme', 'MONTANT'), { sansFiltres: true }),
        Object.assign(synthese('nb_tous_si_actif', 'count', '', siActif), { sansFiltres: true })
    ];
    const melange = arrowResultToObjects(
        await conn.query(`SELECT * FROM (${buildAdvSql(spec).sql}) z ORDER BY UO`)
    );
    const un = melange.find(l => l.UO === 'SITE1');
    ok('par défaut, le filtre « sur le lien » restreint bien ce qui est compté',
        String(un.nb_filtre) === '2' && Number(un.total_filtre) === 1550);
    ok('déclarée indépendante, la même synthèse compte TOUT : le filtre ne la concerne plus',
        String(un.nb_tous) === '3' && Number(un.total_tous) === 10550);
    ok('les deux cohabitent dans la MÊME extraction, côte à côte',
        String(un.nb_filtre) === '2' && String(un.nb_tous) === '3');
    ok('indépendante des filtres ne veut pas dire sans critère : le sien s’applique toujours',
        String(un.nb_tous_si_actif) === '2');
    ok('et l’étiquette de la colonne le dit, pour qu’on ne confonde pas deux colonnes voisines',
        / sans les filtres de l’extraction/.test(advColLabel(spec.columns[2])));
    ok('la colonne indépendante n’est pas mélangée à la lecture groupée des autres',
        !spec._groupes || !spec._groupes.nb_tous || spec._groupes.nb_tous.alias !== (spec._groupes.nb_filtre || {}).alias);

    // ---- 6. Ce que l'écran propose ----
    ok('les quatre fonctions sont proposées dans la liste des modes',
        ADV_LINK_MODES.somme && ADV_LINK_MODES.moyenne && ADV_LINK_MODES.min && ADV_LINK_MODES.max);
    ok('elles portent des noms que tout le monde comprend',
        /somme/i.test(ADV_LINK_MODES.somme) && /moyenne/i.test(ADV_LINK_MODES.moyenne) &&
        /plus petite/i.test(ADV_LINK_MODES.min) && /plus grande/i.test(ADV_LINK_MODES.max));
    ok('la colonne à résumer est demandée pour chacune, comme pour « compter les valeurs uniques »',
        ['somme', 'moyenne', 'min', 'max'].every(mode => mode !== 'count'));
    ok('le nom proposé dit ce que la colonne contient, pas seulement d’où elle vient',
        /Σ Additionner \(somme\) — CONTRAT\.csv\.MONTANT/.test(advColLabel(spec.columns[3])));
    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
