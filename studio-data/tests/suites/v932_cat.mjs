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
  eval(SEED); switchPhase('gov'); openGovTab('glossary'); openGovTab('catalog');
  const g=state.governance; const dr=()=>document.getElementById('uxDrawer');
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  catOpenFiche(catRes.findIndex(r=>r.type==='bo'));
  ok('fiche objet : « Termes de l\'objet » + « Attributs et leurs termes (3) » avec champs d\'ajout', dr().textContent.includes("Termes de l'objet") && dr().textContent.includes('Attributs et leurs termes (3)') && dr().querySelectorAll('input.term-add').length===4);
  ok('libellé du champ : « ＋ Ajouter un terme… »', dr().querySelector('input.term-add').placeholder==='＋ Ajouter un terme…');
  // ajout d'un NOUVEAU terme sur l'attribut Identifiant depuis le catalogue
  termTagAdd('attr',{boId:'bo1',elId:'e1'},'Numéro client');
  ok('nouveau terme créé + relié + fiche reconstruite (drawer ouvert, tag visible)', g.glossary.some(t=>t.term==='Numéro client') && !dr().classList.contains('hidden') && dr().textContent.includes('📖 Numéro client') && _catFicheCtx.type==='bo');
  termTagAdd('bo',{boId:'bo1'},'Client facturé');
  ok('terme sur l\'objet depuis le catalogue, carte à jour', catRes.find(r=>r.type==='bo').tags.includes('📖 Client facturé') && dr().textContent.includes('📖 Client facturé'));
  termTagRemove('bo',{boId:'bo1'}, g.glossary.find(t=>t.term==='Client facturé').id);
  ok('retrait depuis le catalogue, fiche reconstruite', !dr().textContent.includes('📖 Client facturé') && !dr().classList.contains('hidden'));
  closeUxDrawer();
  // application
  catOpenFiche(catRes.findIndex(r=>r.type==='asset'&&r.id==='p_fact'));
  ok('fiche processus : champ d\'ajout', dr().querySelector('input.term-add')!==null);
  termTagAdd('asset',{assetId:'p_fact'},'Facturation mensuelle');
  ok('terme créé sur le processus depuis le catalogue', g.glossary.some(t=>t.term==='Facturation mensuelle' && t.assetIds.includes('p_fact')) && dr().textContent.includes('📖 Facturation mensuelle'));
  closeUxDrawer();
  // colonne : via attribut alimenté
  catSet('layer','tout');
  catOpenByKey({type:'column',tbl:'CLIENTS',col:'CA_HT'});
  ok('fiche colonne : termes de l\'attribut alimenté, éditables', dr().textContent.includes("Termes de l'attribut que cette colonne alimente") && dr().textContent.includes("🔹 Chiffre d'affaires") && dr().querySelector('input.term-add'));
  termTagAdd('attr',{boId:'bo1',elId:'e2'},'Revenu');
  ok('terme ajouté depuis la fiche colonne → sur l\'attribut, fiche colonne reconstruite', termsOfAttr('bo1','e2').some(t=>t.term==='Revenu') && _catFicheCtx.type==='column' && dr().textContent.includes('📖 Revenu'));
  closeUxDrawer();
  catOpenByKey({type:'column',tbl:'CLIENTS',col:'NOM'});
  ok('colonne sans attribut : message explicite, pas de champ', dr().textContent.includes("n'alimente aucun attribut") && !dr().querySelector('input.term-add'));
  closeUxDrawer(); catSet('layer','metier');
  // lineage ouvert conservé au rafraîchissement
  catOpenFiche(catRes.findIndex(r=>r.type==='bo')); catGoLineage();
  termTagAdd('bo',{boId:'bo1'},'Compte client');
  ok('lineage inline conservé après ajout', !document.getElementById('catLineageBox').classList.contains('hidden') && document.querySelector('#catLineageWrap svg')!==null);
  closeUxDrawer();
  // consultation : champs neutralisés
  govSetReadOnly(true); openGovTab('catalog'); catOpenFiche(catRes.findIndex(r=>r.type==='bo'));
  ok('consultation : champs d\'ajout sans data-ro=keep', Array.from(dr().querySelectorAll('input.term-add')).every(i=>i.getAttribute('data-ro')!=='keep'));
  govSetReadOnly(false); closeUxDrawer();
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await p.close();
const q = await b.newPage({ viewport: { width: 1600, height: 900 } });
await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
await q.evaluate((SEED)=>{ eval(SEED); switchPhase('gov'); openGovTab('glossary'); openGovTab('catalog'); catOpenFiche(catRes.findIndex(r=>r.type==='bo')); termTagAdd('attr',{boId:'bo1',elId:'e1'},'Numéro client'); const ds=document.querySelectorAll('#uxDrawer .dsect'); for (const d of ds) if (d.textContent.includes("Termes de l'objet")) d.scrollIntoView(); }, SEED);
await q.waitForTimeout(400); await q.screenshot({ path: D+'cat_terms.png' });
await b.close(); process.exit(fail||perr.length?1:0);
