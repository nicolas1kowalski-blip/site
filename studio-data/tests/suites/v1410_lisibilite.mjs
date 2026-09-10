import fs from 'fs';
// V14.1 — lisibilité : mesures embarquées, onglet Lisibilité, seuils de non-régression, outils de mise en forme.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { execFileSync } = await import('node:child_process');
const FILE = process.env.SD_FILE || ROOT + 'StudioDataV14.html';
const html = fs.readFileSync(FILE, 'utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g, '').replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
const R = []; const ok = (n, c) => R.push([n, !!c]);
// ---- côté dépôt : les outils tiennent leurs promesses ----
const run = (script, args) => { try { return { out: execFileSync(process.execPath, [ROOT + 'tools/' + script, ...(args || [])], { encoding: 'utf8' }), code: 0 }; } catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), code: e.status }; } };
const fmt = run('formater.mjs', ['--check']); ok('toutes les sources sont formatées (formater.mjs --check)', fmt.code === 0 && /0 fichier\(s\) à formater/.test(fmt.out));
const lis = run('lisibilite-mesurer.mjs', ['--strict']); ok('seuils de lisibilité respectés (lisibilite-mesurer.mjs --strict) : ' + (lis.out.match(/Lignes de logique[^\n]*/) || [''])[0], lis.code === 0 && /✓ seuils respectés/.test(lis.out));
ok('0 ligne à trois instructions ou plus', /Lignes à ≥ 3 instructions : 0\b/.test(lis.out));
const ren = run('renommer-locales.mjs', ['--dry-run']); ok('le renommage par portée n\'a plus rien à faire (dry-run : 0 renommable)', ren.code === 0 && /^0 variable\(s\) renommables/m.test(ren.out));
const air = run('gabarits-aerer.mjs', ['--dry-run']); ok('les gabarits sont aérés (dry-run : 0 fichier)', air.code === 0 && /^0 fichier\(s\) à aérer/m.test(air.out));
const report = JSON.parse(fs.readFileSync(ROOT + 'src/LISIBILITE.json', 'utf8'));
ok('src/LISIBILITE.json : rapport par fichier avec totaux et seuils', report.files.length >= 75 && report.total.lines > 40000 && report.thresholds.multiStatementLines === 0);
const headerless = report.files.filter(f => { const first = fs.readFileSync(ROOT + 'src/' + f.file, 'utf8').split('\n').find(l => l.trim()); return !/^\s*(?:\/\/|\/\*)/.test(first || ''); });
ok('chaque fichier source commence par un en-tête explicatif', headerless.length === 0);
// ---- côté application ----
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html, { waitUntil: 'domcontentloaded' }); await p.addStyleTag({ path: D + 'tw/tw_built.css' });
await p.evaluate(() => { v11Prefs.tourDone = true; }); await p.waitForTimeout(1500);
const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]); window.lucide = { createIcons: () => {} }; try { v11TourEnd(true); wizClose(); } catch (e) {} restoreCompleted = true;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
        ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v === APP_VERSION && document.title === 'Studio Data ' + APP_VERSION);
        const modules = Studio.modules();
        ok('le build embarque les mesures de chaque module (lignes, commentaires, noms courts…)', modules.length >= 75 && modules.every(m => m.metrics && typeof m.metrics.lines === 'number' && typeof m.metrics.shortLocals === 'number'));
        const totals = v14ReadabilityTotals();
        ok('totaux : ' + totals.lines + ' lignes, ' + totals.longLogicLines + ' longue(s), ' + totals.multiStatementLines + ' multi-instructions, ' + (100 * totals.shortLocalsRatio).toFixed(1) + ' % de noms courts — dans les seuils', totals.withinThresholds === true && totals.multiStatementLines === 0);
        v14ArchOpen(); await wait(80);
        ok('panneau Architecture : onglet « Lisibilité » présent', !!document.querySelector('#v14Arch .v14-tabs [data-tab="lisibilite"]'));
        v14ArchTab('lisibilite'); await wait(80);
        const body = el('v14ArchBody');
        ok('onglet Lisibilité : seuils respectés, indicateurs et tableau des fichiers', /Seuils de lisibilité respectés/.test(body.textContent) && body.querySelectorAll('.v14-kpi').length >= 6 && body.querySelectorAll('.v14-tbl tbody tr').length >= 5);
        v14ArchSearch('lineage'); await wait(50);
        ok('filtre sur l\'onglet Lisibilité', [...body.querySelectorAll('.v14-tbl tbody tr')].every(tr => /lineage/i.test(tr.textContent)));
        v14ArchSearch(''); v11ModalClose();
        ok('lexique : lisibilité (mesure)', !!V11_LEXIQUE['lisibilité (mesure)']);
        // rien n'a été perdu par la mise en forme et le renommage : quelques fonctions clés répondent toujours
        state.tables['t0'] = { id: 't0', name: 'CONTRAT', type: 'csv', status: 'ready', headers: ['NUM', 'ID_PP'], config: {}, columnsMeta: {} };
        state.tables['t1'] = { id: 't1', name: 'PERSONNE', type: 'csv', status: 'ready', headers: ['ID', 'NOM'], config: {}, columnsMeta: {} };
        state.relations.push({ id: 'r1', sourceTable: 't0', targetTable: 't1', sourceCol: 'ID_PP', targetCol: 'ID', type: 'N-1' });
        renderTables(); switchTab(3); advSetBase('t0'); await wait(100);
        el('adv-col-tbl').value = 't1'; advColColChanged(); el('adv-col-col').value = 'NOM'; advAddColumn(); await wait(60);
        const sql = buildAdvSql(state.advExtract);
        ok('extraction : le SQL se construit toujours (jointure CONTRAT → PERSONNE, colonne NOM)', !sql.err && /LEFT JOIN "t_t1"/.test(sql.sql) && /"NOM"/.test(sql.sql));
        state.governance.businessObjects.push({ id: 'bo1', name: 'Contrat', definition: 'x', globalOwner: 'Paul', contributors: [], producedBy: [], sources: [{ table: 'CONTRAT', role: 'maitre' }], structure: [], elements: [{ id: 'e1', name: 'Numéro', mappings: [{ table: 'CONTRAT', col: 'NUM' }], usedBy: [] }] });
        const graph = buildBoLineageGraph(state.governance.businessObjects.find(b => b.id === 'bo1'));
        ok('lineage : le graphe d\'un objet se construit toujours', graph.nodes.some(n => n.id === 'bo:bo1') && graph.edges.length >= 1);
    } catch (e) { R.push(['ERREUR ' + e.message + ' @ ' + String(e.stack).split('\n')[1], false]); }
    return R;
});
R.push(...out);
let fail = 0; for (const [n, c] of R) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${R.length - fail}/${R.length} OK · erreurs page: ${perr.length}`); perr.slice(0, 5).forEach(e => console.log('  ', e));
if (process.env.SHOTS) {
    const q = await b.newPage({ viewport: { width: 1500, height: 950 } });
    await q.setContent(html, { waitUntil: 'domcontentloaded' }); await q.addStyleTag({ path: D + 'tw/tw_built.css' }); await q.evaluate(() => { v11Prefs.tourDone = true; }); await q.waitForTimeout(1400);
    await q.evaluate(() => { window.lucide = { createIcons: () => {} }; try { v11TourEnd(true); wizClose(); } catch (e) {} document.querySelectorAll('.v11-toast').forEach(t => t.remove()); v14ArchOpen(); v14ArchTab('lisibilite'); });
    await q.waitForTimeout(300); await q.screenshot({ path: D + 'lisibilite_light.png' });
    await q.close();
}
await b.close(); process.exit(fail || perr.length ? 1 : 0);
