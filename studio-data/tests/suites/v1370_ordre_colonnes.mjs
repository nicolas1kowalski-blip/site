import fs from 'fs';
// L'ordre des colonnes en sortie se change sur place.
//
// Cet ordre EST celui des colonnes du fichier produit. Jusqu'ici il ne pouvait être changé
// qu'en supprimant une colonne pour la remettre à la fin : pour remonter la première, il
// fallait toutes les refaire. On vérifie ici qu'on peut la déplacer — et surtout que le SQL
// produit suit, car c'est lui qui décide de l'ordre des colonnes du fichier.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs
    .readFileSync(process.env.SD_FILE || ROOT + 'StudioDataV13.html', 'utf8')
    .replace(/<script src="https:[^"]*"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html, { waitUntil: 'domcontentloaded' });
await p.addStyleTag({ path: D + 'tw/tw_built.css' });
await p.evaluate(() => { v11Prefs.tourDone = true; });
await p.waitForTimeout(1500);

const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    window.lucide = { createIcons: () => {} };
    try { v11TourEnd(true); wizClose(); } catch (e) {}
    restoreCompleted = true;

    state.tables['t1'] = { id: 't1', name: 'CLIENTS', type: 'csv', status: 'ready',
        headers: ['ID', 'NOM', 'VILLE', 'EMAIL'], config: {}, columnsMeta: {} };
    renderTables(); switchTab(3);
    state.advExtract.baseId = 't1';
    ['ID', 'NOM', 'VILLE', 'EMAIL'].forEach(h => {
        el('adv-col-tbl').value = 't1'; advColColChanged(); el('adv-col-col').value = h; advAddColumn();
    });
    const noms = () => state.advExtract.columns.map(c => c.alias).join(',');
    const ordreDuSql = () => (buildAdvSql(state.advExtract).outCols || []).map(c => c.alias).join(',');

    ok('les quatre colonnes sont là, dans l’ordre où on les a ajoutées', noms() === 'ID,NOM,VILLE,EMAIL');
    ok('le SQL produit les colonnes dans ce même ordre', ordreDuSql() === 'ID,NOM,VILLE,EMAIL');

    // ---- Les flèches ----
    advDeplacerColonne(3, -1);
    ok('▲ monte la colonne d’un rang', noms() === 'ID,NOM,EMAIL,VILLE');
    advDeplacerColonne(0, 1);
    ok('▼ la descend d’un rang', noms() === 'NOM,ID,EMAIL,VILLE');
    advDeplacerColonneAuBord(3, 'top');
    ok('⤒ l’envoie tout en haut', noms() === 'VILLE,NOM,ID,EMAIL');
    advDeplacerColonneAuBord(0, 'bottom');
    ok('⤓ l’envoie tout en bas', noms() === 'NOM,ID,EMAIL,VILLE');
    ok('le SQL a suivi chaque déplacement', ordreDuSql() === 'NOM,ID,EMAIL,VILLE');

    // ---- On ne sort pas de la liste ----
    advDeplacerColonne(0, -1);
    ok('monter la première ne fait rien, et ne perd aucune colonne', noms() === 'NOM,ID,EMAIL,VILLE');
    advDeplacerColonne(3, 1);
    ok('descendre la dernière ne fait rien non plus', noms() === 'NOM,ID,EMAIL,VILLE');

    // ---- Le glisser-déposer ----
    advDeposerColonne(0, 3);
    ok('glisser la première tout en bas la met bien en dernier', noms() === 'ID,EMAIL,VILLE,NOM');

    // ---- Ce que l'écran montre ----
    const tableau = [...document.querySelectorAll('#step-3 table')]
        .find(t => /Nom en sortie/.test(t.textContent));
    ok('le tableau des colonnes a une colonne « Ordre »', !!tableau && /Ordre/.test(tableau.tHead.textContent));
    const lignes = [...tableau.tBodies[0].rows];
    ok('chaque ligne a une poignée à glisser', lignes.every(l => l.querySelector('[draggable="true"]')));
    ok('chaque ligne a les quatre flèches', lignes.every(l => l.querySelectorAll('button[title$="haut"], button[title="Monter"], button[title="Descendre"], button[title$="bas"]').length === 4));
    ok('la première ligne ne propose pas de monter', lignes[0].querySelector('button[title="Monter"]').disabled);
    ok('la dernière ligne ne propose pas de descendre', lignes[3].querySelector('button[title="Descendre"]').disabled);
    ok('l’ordre affiché est celui de la configuration',
        lignes.map(l => l.querySelector('input').value).join(',') === 'ID,EMAIL,VILLE,NOM');

    // ---- Ce que le déplacement ne doit PAS casser ----
    const idDeVille = state.advExtract.columns[2].id;
    advToggleDedupKey(idDeVille, true);
    advDeplacerColonneAuBord(2, 'top');
    ok('une colonne choisie comme clé de dédoublonnage le reste après déplacement',
        state.advExtract.dedup.keys.includes(idDeVille) && state.advExtract.columns[0].id === idDeVille);
    ok('aucune colonne n’est perdue ni dupliquée au fil des déplacements',
        state.advExtract.columns.length === 4 &&
            new Set(state.advExtract.columns.map(c => c.id)).size === 4);

    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
