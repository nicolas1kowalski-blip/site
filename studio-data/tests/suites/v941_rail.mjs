import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const src=fs.readFileSync(D+'v920_gloss.mjs','utf8'); const SEED=src.split('const SEED = `')[1].split('`;')[0].replace(/\\\\'/g,"\\'");
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  eval(SEED); switchPhase('gov'); openGovTab('objects');
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  v7ToggleCollapse(); renderNav();
  await new Promise(r=>setTimeout(r,350));
  const side=document.querySelector('.v7-side').getBoundingClientRect();
  ok('rail de 64 px', Math.round(side.width)===64);
  const els=[...document.querySelectorAll('.v7-side .v7-grp>.hd'), ...document.querySelectorAll('.v7-side .v7-grp.open .v7-it'), ...document.querySelectorAll('.v7-side .v7-fbtn')].filter(e=>e.offsetParent!==null);
  const inside=els.every(e=>{ const r=e.getBoundingClientRect(); return r.left>=side.left-0.5 && r.right<=side.right+0.5; });
  ok('tout tient dans le rail (rien de rogné) — '+els.length+' éléments', inside);
  const centered=els.every(e=>{ const r=e.getBoundingClientRect(); return Math.abs((r.left+r.right)/2-(side.left+side.right)/2)<=1.5; });
  ok('icônes centrées', centered);
  ok('libellés masqués, icônes visibles', [...document.querySelectorAll('.v7-side .lbl')].every(l=>getComputedStyle(l).display==='none') && document.querySelectorAll('.v7-side .v7-grp.open .v7-it svg, .v7-side .v7-grp.open .v7-it .ic').length>=10);
  ok('écran actif surligné + info-bulle', document.querySelector('.v7-side .v7-it.on') && document.querySelector('.v7-side .v7-it.on').getAttribute('title')==='Objets métier');
  ok('groupes fermés sans sous-écrans', [...document.querySelectorAll('.v7-side .v7-grp:not(.open) .v7-items')].every(x=>getComputedStyle(x).display==='none'));
  document.querySelector('.v7-side .v7-it[title="Glossaire"]').click();
  ok('navigation depuis le rail', govState.tab==='glossary');
  v7ToggleCollapse(); renderNav(); await new Promise(r=>setTimeout(r,350));
  ok('redéployé : libellés de retour, largeur ≥ 240', document.querySelector('.v7-side').getBoundingClientRect().width>=240 && getComputedStyle(document.querySelector('.v7-side .v7-it .lbl')).display!=='none');
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await p.evaluate(()=>{ v7ToggleCollapse(); renderNav(); }); await p.waitForTimeout(400);
await p.screenshot({ path: D+'rail.png', clip:{x:0,y:0,width:700,height:950} });
await b.close(); process.exit(fail||perr.length?1:0);
