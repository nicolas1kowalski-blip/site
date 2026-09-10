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
  const S=()=>document.getElementById('step-9'); const vis=e=>e && getComputedStyle(e).display!=='none';
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  ok('panneau : plus de titre « Gouvernance des données » ni de puces de famille', !S().textContent.includes('Gouvernance des données') && document.getElementById('govFamTabs').innerHTML==='' && !vis(document.getElementById('govFamTabs')));
  ok('panneau : fil d\'Ariane « Sens métier › Objets métier »', document.getElementById('govCrumb').textContent.includes('Sens métier') && document.getElementById('govCrumb').textContent.includes('Objets métier'));
  ok('panneau : Mode consultation + Import en masse conservés', document.getElementById('govRoChk') && S().textContent.includes('Import en masse') && S().innerHTML.includes('giOpen()'));
  ok('en-tête : familles masquées quand le menu latéral est déployé', !document.body.classList.contains('v7-collapsed') && !vis(document.getElementById('v7FamNav')));
  v7ToggleCollapse(); renderNav();
  ok('menu réduit : les familles de l\'en-tête prennent le relais', document.body.classList.contains('v7-collapsed') && vis(document.getElementById('v7FamNav')) && document.getElementById('v7FamNav').querySelectorAll('button').length>=5);
  v7ToggleCollapse(); renderNav();
  ok('menu redéployé : familles de nouveau masquées', !vis(document.getElementById('v7FamNav')));
  // navigation par le menu latéral
  const side=Array.from(document.querySelectorAll('.v7-side button, .v7-side a')).find(b2=>/Glossaire/.test(b2.textContent));
  if (side) side.click();
  ok('menu latéral : clic « Glossaire » navigue', govState.tab==='glossary' && document.getElementById('govCrumb').textContent.includes('Glossaire'));
  openGovTab('flow');
  ok('vue bout en bout : fil d\'Ariane sur Lineage', document.getElementById('govCrumb').textContent.includes('Lineage'));
  // consultation
  openGovTab('objects'); govSetReadOnly(true);
  ok('consultation : fil d\'Ariane « 👁 Consultation », bandeau présent, écran autorisé', document.getElementById('govCrumb').textContent.includes('Consultation') && !document.getElementById('govRoBand').classList.contains('hidden'));
  const sideItems=Array.from(document.querySelectorAll('.v7-side .v7-items button, .v7-side .v7-items a')).map(x=>x.textContent.trim());
  ok('consultation : le menu latéral ne liste pas Périmètres / Sensibilité / Surveillance', !sideItems.some(t=>/Périmètres|Sensibilité|Surveillance/.test(t)) && sideItems.some(t=>/Catalogue/.test(t)));
  govSetReadOnly(false);
  ok('retour édition : menu complet', Array.from(document.querySelectorAll('.v7-side .v7-items button, .v7-side .v7-items a')).some(x=>/Périmètres/.test(x.textContent)));
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await p.evaluate(()=>{ openGovTab('objects'); const t=document.querySelector('#step-9 .gov-bar'); if(t) t.scrollIntoView({block:'start'}); });
await p.waitForTimeout(300); await p.screenshot({ path: D+'nav_light.png' });
await p.evaluate(()=>{ v7ToggleCollapse(); renderNav(); }); await p.waitForTimeout(300); await p.screenshot({ path: D+'nav_collapsed.png' });
await b.close(); process.exit(fail||perr.length?1:0);
