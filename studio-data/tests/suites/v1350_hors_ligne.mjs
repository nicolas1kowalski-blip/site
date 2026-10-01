import fs from 'fs';
// La V13 hors ligne : un seul fichier, ouvert depuis le disque, SANS AUCUN RÉSEAU.
// Le navigateur est mis hors ligne et toute adresse http(s) est refusée : si la page
// allait encore chercher quoi que ce soit dehors, ces contrôles échoueraient.
// Construction : node tools/hors-ligne.mjs
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
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
// Hors ligne pour de bon : plus aucune sortie possible.
await ctx.setOffline(true);
const p = await ctx.newPage();
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
// Toute tentative de sortie est notée ET refusée.
const sorties = [];
await p.route(/^https?:/, route => { sorties.push(route.request().url()); route.abort(); });

const out = [];
const ok = (n, c) => out.push([n, !!c]);

await p.goto('file://' + FICHIER, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);

ok('la page s’ouvre depuis le disque, hors ligne', await p.evaluate(() => !!document.getElementById('step-1')));
ok('aucune tentative de sortie vers internet', sorties.length === 0);

// Les trois bibliothèques sont là, sans réseau.
const biblios = await p.evaluate(() => ({
  tableur: typeof XLSX !== 'undefined',
  graphiques: typeof Chart !== 'undefined',
  icones: typeof lucide !== 'undefined'
}));
ok('le tableur, les graphiques et les icônes sont dans le fichier',
  biblios.tableur && biblios.graphiques && biblios.icones);

// La feuille de style est appliquée : une classe connue doit produire un vrai style.
ok('la mise en page est appliquée sans aller chercher la feuille de style dehors',
  await p.evaluate(() => {
    const t = document.createElement('div');
    t.className = 'flex items-center gap-2 rounded-lg';
    document.body.appendChild(t);
    const s = getComputedStyle(t);
    const bon = s.display === 'flex' && s.alignItems === 'center' && s.borderRadius !== '0px';
    t.remove();
    return bon;
  }));

// Le moteur de données : c'est lui qui manquait sans internet.
const moteur = await p.evaluate(async () => {
  try {
    const r = await Promise.race([
      window.__duckdbPromise,
      new Promise(res => setTimeout(() => res({ error: { message: 'délai dépassé' } }), 60000))
    ]);
    if (!r || r.error) return { ok: false, message: (r && r.error && r.error.message) || 'absent' };
    return { ok: true };
  } catch (e) { return { ok: false, message: e.message }; }
});
ok('le moteur de données démarre sans internet' + (moteur.ok ? '' : ' — ' + moteur.message), moteur.ok);

if (moteur.ok) {
  // Une vraie requête, avec les tournures que la V13 emploie partout.
  const calcul = await p.evaluate(async () => {
    try {
      const { conn } = await getDB();
      await conn.query(`CREATE TABLE t_essai AS SELECT * FROM (VALUES
        ('E1','Pompe','P'), ('E2','Pompe bis','P'), ('E3','Vanne','V')) AS v(repere, libelle, famille)`);
      const res = await conn.query(`SELECT famille, COUNT(*)::BIGINT AS n,
          max_by(libelle, libelle, 1) AS tete FROM t_essai GROUP BY 1
          QUALIFY ROW_NUMBER() OVER (ORDER BY famille) > 0 ORDER BY 1`);
      return arrowResultToObjects(res).map(l => l.famille + ':' + l.n).join(' ');
    } catch (e) { return 'ERREUR ' + e.message; }
  });
  ok('une requête réelle s’exécute, avec les tournures propres à la V13 (max_by, QUALIFY)'
    + (calcul === 'P:2 V:1' ? '' : ' — ' + calcul), calcul === 'P:2 V:1');

  // Le chemin complet d'un fichier déposé : c'est l'usage visé hors ligne.
  const depot = await p.evaluate(async () => {
    try {
      const contenu = 'REPERE;LIBELLE;FAMILLE\nA1;Chaudière;C\nA2;Chaudière murale;C\nA3;Disconnecteur;D\n';
      const fichier = new File([contenu], 'essai.csv', { type: 'text/csv' });
      // On déclare la source comme le fait l'écran Sources, puis on la charge.
      const id = 'hl1';
      state.tables[id] = { id, name: 'ESSAI', type: 'csv', status: 'loading', file: fichier,
          headers: [], config: {}, columnsMeta: {} };
      await ingestCsvIntoDuckDB(id);
      const { conn } = await getDB();
      const res = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM ${sqlIdent(duckTableName(id))}`);
      return Number(arrowResultToObjects(res)[0].n);
    } catch (e) { return 'ERREUR ' + e.message; }
  });
  ok('un fichier déposé est lu et chargé, hors ligne' + (depot === 3 ? '' : ' — ' + depot), depot === 3);
}

ok('toujours aucune tentative de sortie après le travail sur les données', sorties.length === 0);

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
if (sorties.length) console.log('  sorties tentées : ' + sorties.slice(0, 5).join(', '));
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
