import fs from 'fs';
// V14 — noyau d'architecture (Studio.extend, selfCheck, index des modules) et panneau « Architecture du code ».
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = process.env.SD_FILE || ROOT + 'StudioDataV14.html';
const html = fs.readFileSync(FILE, 'utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g, '').replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
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
        ok('V14 : version 14.x, journal V14 puis V13', /^14\./.test(APP_VERSION) && /^14\./.test(APP_CHANGELOG[0].v) && /^13\./.test(APP_CHANGELOG[1].v));
        // ---- noyau d'architecture ----
        const check = Studio.selfCheck();
        ok('Studio : ' + check.modules + ' modules enregistrés par le build, ' + check.functions + ' fonctions déclarées', check.modules >= 75 && check.functions >= 1400);
        ok('Studio : ' + check.applied + ' extensions appliquées (≥ 106), aucune non appliquée', check.applied >= 106 && check.notApplied.length === 0);
        ok('Studio : aucune fonction déclarée deux fois, auto-contrôle OK', check.duplicates.length === 0 && check.ok === true);
        const chain = Studio.extensionsOf('renderGovernance');
        ok('chaîne d\'extensions de renderGovernance : plusieurs couches, dans l\'ordre d\'assemblage (V11 avant V13)', chain.length >= 3 && chain.every(x => x.applied) && ['V11', 'V13'].every(l => chain.some(x => x.layer === l)) && chain.findIndex(x => x.layer === 'V13') > chain.findIndex(x => x.layer === 'V11'));
        ok('la fonction globale étendue porte sa base (__studioBase) et son nom', typeof renderGovernance.__studioBase === 'function' && renderGovernance.__studioName === 'renderGovernance');
        ok('chaque extension connaît son module et sa couche', Studio.extensions().every(x => x.module && x.layer) && Studio.extensions().some(x => x.module.startsWith('92-couche-v12/')));
        ok('un motif documente les extensions issues d\'anciennes boucles (ex. requêtes sans débordement disque)', Studio.extensionsOf('advCount').some(x => /mémoire pure/.test(x.motif)));
        ok('apiMap : chaque fonction liste les modules qui l\'étendent', Studio.apiMap().some(m => m.functions.some(f => f.name === 'renderGovernance' && f.extendedBy.length >= 3)));
        // extension d'une fonction absente : ignorée, visible dans selfCheck
        const before = Studio.selfCheck().extensions; const r = Studio.extend('fonctionInexistante_v14test', base => function () { return base(); });
        const after = Studio.selfCheck();
        ok('Studio.extend sur une fonction absente : null, enregistrée comme non appliquée', r === null && after.extensions === before + 1 && after.notApplied.some(x => x.name === 'fonctionInexistante_v14test'));
        // extension réelle : la base reste appelée
        let calls = 0; window.v14TestFn = function (x) { calls++; return x * 2; };
        Studio.extend('v14TestFn', base => function (x) { return base(x) + 1; }, { motif: 'test' });
        ok('Studio.extend : la base est appelée, le résultat enrichi (2·3+1 = 7)', v14TestFn(3) === 7 && calls === 1);
        // ---- panneau Architecture ----
        v11HelpOpen(); await wait(50);
        ok('aide « ? » : bouton « Architecture du code »', !!document.querySelector('#v11Help .v14-helpbtn'));
        v14ArchOpen(); await wait(100);
        const modal = el('v11Modal');
        ok('panneau ouvert : modules par domaine (10-noyau, 20-gouvernance, 92-couche-v12…), badges de couche', modal && /10-noyau/.test(modal.textContent) && /92-couche-v12/.test(modal.textContent) && modal.querySelectorAll('.v14-layer.V12').length > 0);
        v14ArchTab('extensions'); await wait(50);
        ok('onglet Extensions : chaîne « base → … » pour renderGovernance', /renderGovernance/.test(el('v14ArchBody').textContent) && el('v14ArchBody').querySelectorAll('.v14-chain').length > 50);
        v14ArchSearch('renderGovernance'); await wait(50);
        ok('filtre : seules les lignes correspondantes restent', el('v14ArchBody').querySelectorAll('.v14-tbl tbody tr').length < 5 && /renderGovernance/.test(el('v14ArchBody').textContent));
        v14ArchSearch(''); v14ArchTab('check'); await wait(50);
        ok('onglet Auto-contrôle : indicateurs et une ligne pour l\'extension de test non appliquée', /modules/.test(el('v14ArchBody').textContent) && /fonctionInexistante_v14test/.test(el('v14ArchBody').textContent));
        // export JSON
        let captured = null; const oldC = URL.createObjectURL; URL.createObjectURL = bl => { captured = bl; return 'blob:x'; }; const oldClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
        v14ApiExport(); const txt = captured ? await captured.text() : ''; URL.createObjectURL = oldC; HTMLAnchorElement.prototype.click = oldClick;
        const api = txt ? JSON.parse(txt) : null;
        ok('export de l\'index de l\'API : JSON avec modules, fonctions et extensions', api && api.version === APP_VERSION && Array.isArray(api.modules) && api.modules.length >= 75 && api.extensions.length >= 106);
        v11ModalClose();
        ok('palette : action « Architecture du code »', v11Index().some(it => /Architecture du code/.test(it.label)));
        ok('lexique : extension (Studio.extend)', !!V11_LEXIQUE['extension (Studio.extend)']);
        // ---- garde-fous de la V14 : rien n'a été perdu ----
        ok('fonctionnalités V13 présentes (question, domaine, proposer) et V12 (jeux temporaires, liste d\'entrée, amont complet, liens lisibles)', typeof v13Ask === 'function' && typeof v13SetDom === 'function' && typeof v13ProposeOpen === 'function' && typeof v12TmpRegister === 'function' && typeof v12ListOpen === 'function' && typeof v12UpExtend === 'function' && typeof v12LnRoute === 'function');
    } catch (e) { R.push(['ERREUR ' + e.message + ' @ ' + String(e.stack).split('\n')[1], false]); }
    return R;
});
let fail = 0; for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0, 5).forEach(e => console.log('  ', e));
if (process.env.SHOTS) {
    const q = await b.newPage({ viewport: { width: 1500, height: 950 } });
    await q.setContent(html, { waitUntil: 'domcontentloaded' }); await q.addStyleTag({ path: D + 'tw/tw_built.css' }); await q.evaluate(() => { v11Prefs.tourDone = true; }); await q.waitForTimeout(1400);
    await q.evaluate(() => { window.lucide = { createIcons: () => {} }; try { v11TourEnd(true); wizClose(); } catch (e) {} document.querySelectorAll('.v11-toast').forEach(t => t.remove()); v14ArchOpen(); v14ArchTab('extensions'); v14ArchSearch('lineage'); });
    await q.waitForTimeout(300); await q.screenshot({ path: D + 'arch_light.png' });
    await q.evaluate(() => { v14ArchTab('check'); v14ArchSearch(''); }); await q.waitForTimeout(200); await q.screenshot({ path: D + 'arch_check.png' });
    await q.close();
}
await b.close(); process.exit(fail || perr.length ? 1 : 0);
