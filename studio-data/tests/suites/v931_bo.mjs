import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const src=fs.readFileSync(D+'v920_gloss.mjs','utf8'); const SEED=src.split('const SEED = `')[1].split('`;')[0].replace(/\\\\'/g,"\\'");
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage(); const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  eval(SEED); switchPhase('gov'); openGovTab('glossary'); // migration : CA_HT -> attribut, gl1
  termTagAdd('bo',{boId:'bo1'},'Client facturé');
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  openGovTab('catalog');
  const e=catRes.find(r=>r.type==='bo');
  ok('carte objet : seul le terme de l\'objet en tag, pas ceux des attributs', e.tags.includes('📖 Client facturé') && !e.tags.some(t=>t.includes("Chiffre d'affaires")));
  catSet('q','chiffre');
  ok('le terme d\'attribut reste cherchable : l\'objet est trouvé', catRes.some(r=>r.type==='bo'));
  catSet('q','');
  catOpenFiche(catRes.findIndex(r=>r.type==='bo'));
  const dr=document.getElementById('uxDrawer');
  ok('fiche : section « Attributs et leurs termes » avec attribut → tag', dr.textContent.includes('Attributs et leurs termes (3)') && dr.textContent.includes("🔹 Chiffre d'affaires") && dr.querySelectorAll('.term-tag').length>=3);
  ok('fiche : section « Termes de l\'objet » = Client facturé seulement', dr.textContent.includes("Termes de l'objet") && dr.textContent.includes('📖 Client facturé'));
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); await b.close(); process.exit(fail||perr.length?1:0);
