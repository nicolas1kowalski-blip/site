import fs from 'fs';
// Un gros fichier doit être LU, pas RECOPIÉ — et son compte de lignes doit être juste.
//
// Deux défauts se répondaient sur les fichiers volumineux :
//
//  1. le compteur de lignes brutes lisait le fichier en parallèle et, comme on lui demande de
//     passer outre les lignes fautives, il gardait les DEUX MOITIÉS de la ligne coupée à chaque
//     jointure de tranches (environ huit méga-octets). Un fichier propre de 600 000 lignes en
//     annonçait 600 003, un de 1 500 000 en annonçait 1 500 014 : la source affichait « des lignes
//     manquent » alors que rien ne manquait ;
//
//  2. au-delà du seuil, un CSV doit rester lu directement (une VUE sur le fichier), jamais recopié
//     dans la mémoire du moteur. La lecture directe demandait « file_row_number », qu'aucun moteur
//     publié ne connaît pour un CSV ; le repli redemandait la même chose, échouait pareillement, et
//     finissait par recopier le fichier ENTIER. Plus rien n'était lu directement, et toutes les
//     requêtes suivantes s'arrêtaient sur « Résultat trop volumineux pour la mémoire du navigateur ».
//
// Ce contrôle a besoin du MOTEUR dans la page : il s'exécute donc sur la version hors ligne, qui le
// porte. Sans elle, il se tait plutôt que d'échouer.
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
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.goto('file://' + FICHIER, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);

const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    window.lucide = window.lucide || { createIcons: () => {} };
    try { v11Prefs.tourDone = true; v11TourEnd(true); wizClose(); } catch (e) {}

    // Un fichier assemblé par blocs : on ne fabrique jamais une chaîne de plusieurs dizaines de
    // méga-octets d'un coup.
    const fabriquer = (nom, nbLignes) => {
        const morceaux = ['NUM_AFFAIRE;NUM_CONTRAT;MONTANT;STATUT;LIBELLE\n'];
        for (let debut = 1; debut <= nbLignes; debut += 20000) {
            const bloc = [];
            for (let i = debut; i < Math.min(debut + 20000, nbLignes + 1); i++)
                bloc.push('AFF' + ((i % 20094) + 1) + ';CTR' + i + ';' + (i % 9999) + ';' +
                    (i % 7 ? 'ACTIF' : 'SOLDE') + ';Un libelle de contrat assez long numero ' + i + '\n');
            morceaux.push(bloc.join(''));
        }
        return new File(morceaux, nom, { type: 'text/csv' });
    };
    const charger = async (id, fichier) => {
        state.tables[id] = { id, name: fichier.name, type: 'csv', status: 'loading', file: fichier,
            headers: [], config: {}, columnsMeta: {} };
        let message = '';
        const ancien = window.showError;
        window.showError = m => { message = String(m).replace(/<[^>]+>/g, ''); };
        try { state.tables[id].headers = await ingestFileTable(id); state.tables[id].status = 'ready'; }
        catch (e) { message = 'ÉCHEC ' + e.message; }
        window.showError = ancien;
        return { table: state.tables[id], message };
    };
    const compter = async sql => Number(arrowResultToObjects(await (await getDB()).conn.query(sql))[0].n);

    const seuil = csvViewThreshold();
    // 600 000 lignes, environ 43 Mo : plusieurs jointures de tranches, et au-delà du seuil.
    const gros = fabriquer('CONTRATS.csv', 600000);
    ok('le fichier d’essai dépasse bien le seuil de lecture directe', gros.size > seuil);
    const grosse = await charger('ctr', gros);

    // ---- 1. Le compte de lignes brutes est EXACT, malgré les jointures de tranches ----
    ok('un gros fichier propre compte exactement ses lignes chargées', grosse.table.lastRows === 600000);
    ok('et exactement ses lignes de fichier : aucune moitié de ligne en trop',
        grosse.table.lignesDuFichier === 600000);
    ok('donc rien n’est signalé : pas d’alerte « des lignes manquent » sur un fichier propre',
        !grosse.message);
    ok('et la carte de la source dit « = fichier »', /= fichier/.test(sourceLignesManquantesHtml(grosse.table)));

    // ---- 2. Un gros fichier est LU, pas RECOPIÉ dans la mémoire du moteur ----
    ok('au-delà du seuil, la source est lue directement dans le fichier (une vue)',
        grosse.table.storage === 'view');
    ok('la lecture directe voit toutes les colonnes',
        (grosse.table.headers || []).join(',') === 'NUM_AFFAIRE,NUM_CONTRAT,MONTANT,STATUT,LIBELLE');
    const T = sqlIdent(duckTableName('ctr'));
    ok('et toutes les lignes', (await compter(`SELECT COUNT(*)::BIGINT AS n FROM ${T}`)) === 600000);
    const une = arrowResultToObjects(await (await getDB()).conn.query(
        `SELECT STATUT, LIBELLE FROM ${T} WHERE NUM_CONTRAT = 'CTR500000'`));
    ok('une ligne précise se lit correctement à travers la vue',
        une.length === 1 && une[0].STATUT === 'ACTIF' && /numero 500000$/.test(une[0].LIBELLE));
    ok('le numéro de ligne __rn existe aussi sur une vue (il sert à ordonner et à paginer)',
        (await compter(`SELECT COUNT(*)::BIGINT AS n FROM ${T} WHERE __rn IS NOT NULL`)) === 600000);
    ok('deux lectures de suite donnent le même compte : la vue est stable',
        (await compter(`SELECT COUNT(*)::BIGINT AS n FROM ${T}`)) === 600000);

    // ---- 3. Un petit fichier reste recopié : c'est plus rapide, et sans danger ----
    const petites = ['NUM_AFFAIRE;CLIENT;VILLE\n'];
    for (let i = 1; i <= 20094; i++) petites.push('AFF' + i + ';Client numero ' + i + ';Paris\n');
    const petit = await charger('aff', new File([petites.join('')], 'AFFAIRES.csv', { type: 'text/csv' }));
    ok('un petit fichier reste recopié dans le moteur', petit.table.storage === 'table');
    ok('un petit fichier compte juste lui aussi',
        petit.table.lastRows === 20094 && petit.table.lignesDuFichier === 20094);
    ok('et ne signale rien', !petit.message);

    // ---- 4. Une extraction par-dessus une source lue directement reste juste ----
    state.relations = [{ id: 'r1', sourceTable: 'ctr', targetTable: 'aff',
        sourceCol: 'NUM_AFFAIRE', targetCol: 'NUM_AFFAIRE', type: 'N-1' }];
    const spec = state.advExtract;
    spec.baseId = 'aff'; spec.filters = []; spec.dedup = { on: false, keys: [], keep: 'first' };
    spec.group = { on: false, aggs: [], dims: [] }; spec.limit500 = false; spec.customSql = '';
    spec.joinType = 'left';
    spec.columns = [
        { id: 'c1', tableId: 'aff', col: 'NUM_AFFAIRE', alias: 'NUM_AFFAIRE', transform: 'none' },
        { id: 'c2', tableId: 'ctr', col: 'STATUT', alias: 'STATUT', transform: 'none' },
        { id: 'c3', kind: 'link', tableId: 'ctr', mode: 'count', col: '', n: 3, via: '', alias: 'nb_CONTRAT' }
    ];
    const requete = buildAdvSql(spec);
    ok('l’extraction se construit sur une source lue directement', !requete.err);
    ok('et garde le nombre d’affaires de départ, sans en multiplier ni en perdre',
        (await compter(`SELECT COUNT(*)::BIGINT AS n FROM (${requete.sql}) z`)) === 20094);
    const compte = arrowResultToObjects(await (await getDB()).conn.query(
        `SELECT nb_CONTRAT FROM (${requete.sql}) z WHERE NUM_AFFAIRE = 'AFF2' LIMIT 1`));
    ok('le nombre de contrats liés est compté, non nul', compte.length === 1 && Number(compte[0].nb_CONTRAT) > 0);

    // ---- 5. Le repli mémoire couvre AUSSI les deux actions d'Excel ----
    // Sans lui, elles s'arrêtaient sur le message technique « HTML FileReaders do not support
    // writing » au lieu d'être relancées en mémoire pure, puis expliquées.
    const protegee = {};
    const vraiGetDB = window.getDB;
    window.getDB = async function () {
        const r = await vraiGetDB.apply(this, arguments);
        if (window.__actionEnCours) protegee[window.__actionEnCours] = !!(r && r.conn && r.conn.__v12ns);
        return r;
    };
    if (window.XLSX) XLSX.writeFile = () => {};
    const sous = async (nom, fn) => {
        window.__actionEnCours = nom;
        const ancien = window.showError;
        window.showError = () => {};
        try { await fn(); } catch (e) {}
        window.showError = ancien;
        window.__actionEnCours = '';
    };
    await sous('controle', () => advControlerLesClesMaintenant());
    await sous('excel', () => advGenererExcel());
    window.getDB = vraiGetDB;
    ok('« contrôler les clés » reçoit la connexion protégée contre le manque de mémoire', protegee.controle === true);
    ok('« générer l’Excel » aussi', protegee.excel === true);
    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
