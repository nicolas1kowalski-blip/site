import fs from 'fs';
// Agrandir un schéma doit TOUJOURS marcher.
//
// Le vrai plein écran du navigateur peut être refusé : une entreprise peut l'interdire par
// stratégie, et certains navigateurs le refusent à une page ouverte depuis le disque — donc
// à la version hors ligne, justement là où elle sert. On vérifie ici qu'un refus n'aboutit
// plus à un message d'erreur, mais à un agrandissement dans la page.
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FICHIER = process.env.SD_FILE || ROOT + 'StudioDataV13.html';

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr = []; p.on('pageerror', e => { if (!/lucide/.test(String(e))) perr.push(String(e)); });
await p.goto('file://' + FICHIER, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

const out = await p.evaluate(async () => {
    const R = []; const ok = (n, c) => R.push([n, !!c]);
    const attendre = ms => new Promise(r => setTimeout(r, ms));
    window.lucide = window.lucide || { createIcons: () => {} };
    try { v11Prefs.tourDone = true; v11TourEnd(true); wizClose(); } catch (e) {}
    state.tables['t0'] = { id: 't0', name: 'CLIENTS', type: 'csv', status: 'ready', headers: ['ID'], config: {}, columnsMeta: {} };
    state.governance.businessObjects.push({ id: 'bo1', name: 'Personne', definition: '', globalOwner: '',
        contributors: [], producedBy: [], sources: [{ table: 'CLIENTS', role: 'maitre' }], structure: [], elements: [] });
    renderTables();
    switchTab(6); await attendre(300); openGovTab('lineage'); await attendre(900);

    const cadre = document.getElementById('lineageFsWrap');
    ok('le parcours de la donnée a bien un cadre à agrandir', !!cadre);
    ok('le bouton « Plein écran » est là', [...document.querySelectorAll('button')].some(x => /Plein écran/.test(x.textContent)));

    // 1. Le navigateur accepte : c'est son plein écran qui est employé, pas un autre.
    lineageFullscreen(); await attendre(500);
    ok('quand le navigateur accepte, c’est son vrai plein écran qui sert',
        document.fullscreenElement === cadre);
    document.exitFullscreen().catch(() => {}); await attendre(400);

    // 2. Le navigateur refuse — exactement comme le ferait une stratégie d'entreprise.
    const vrai = cadre.requestFullscreen.bind(cadre);
    cadre.requestFullscreen = () => Promise.reject(new Error('Permissions check failed'));
    const erreurs = []; const ancienShowError = window.showError;
    window.showError = message => erreurs.push(message);
    lineageFullscreen(); await attendre(500);
    const boite = document.getElementById('v11Fs');
    ok('un refus n’arrête plus l’utilisateur : le schéma est agrandi dans la page',
        !!boite && boite.contains(document.getElementById('lineageFsWrap')));
    ok('l’agrandissement porte le nom de l’écran, pas un titre générique',
        !!boite && boite.querySelector('h3').textContent === 'Parcours de la donnée');
    ok('plus aucun message d’erreur n’est montré pour un refus rattrapé', erreurs.length === 0);
    const graphe = document.getElementById('lineageGraphWrap');
    ok('le schéma occupe vraiment la fenêtre une fois agrandi',
        graphe.getBoundingClientRect().height > 700);
    window.showError = ancienShowError;
    v11FsClose(); await attendre(300);
    ok('on revient à l’écran normal en fermant', !document.getElementById('v11Fs'));
    ok('le schéma a retrouvé sa taille d’origine',
        document.getElementById('lineageGraphWrap').getBoundingClientRect().height < 700);
    cadre.requestFullscreen = vrai;

    // 3. Un navigateur qui ne connaît pas du tout le plein écran.
    const sansPleinEcran = document.getElementById('lineageFsWrap');
    const memoire = sansPleinEcran.requestFullscreen;
    sansPleinEcran.requestFullscreen = undefined;
    lineageFullscreen(); await attendre(400);
    ok('un navigateur sans plein écran du tout agrandit quand même dans la page',
        !!document.getElementById('v11Fs'));
    v11FsClose(); await attendre(200);
    sansPleinEcran.requestFullscreen = memoire;

    return R;
});

await b.close();
let fail = 0;
for (const [n, c] of out) { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; }
console.log(`\n${out.length - fail}/${out.length} OK · erreurs page: ${perr.length}`);
perr.slice(0, 5).forEach(e => console.log('  ', e));
process.exit(fail || perr.length ? 1 : 0);
