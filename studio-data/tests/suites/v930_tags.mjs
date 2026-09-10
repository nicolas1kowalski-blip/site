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
  eval(SEED);
  const g=state.governance; const S=()=>document.getElementById('step-9'); const bo=()=>g.businessObjects[0];
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  switchPhase('gov'); openGovTab('glossary');
  // ---- dictionnaire par objet : tags ----
  openGovTab('dictionary'); govState.dictMode='bo'; renderGovernance();
  const cellOf=(name)=>Array.from(S().querySelectorAll('tr')).find(tr=>tr.querySelector('input') && tr.querySelector('input').value===name);
  let row=cellOf("Chiffre d'affaires");
  ok('dictionnaire : terme affiché en TAG (pas de liste déroulante de termes)', row && row.querySelector('.term-tag') && row.querySelector('.term-tag').textContent.includes("Chiffre d'affaires") && !row.querySelector('select[onchange^="boAttrSetTerm"]'));
  ok('dictionnaire : champ « + terme » avec suggestions', row.querySelector('input.term-add') && row.querySelector('datalist').options.length===1 && row.querySelector('datalist').options[0].value==='Commune');
  // ajout d'un terme existant par le champ
  termTagAdd('attr',{boId:'bo1',elId:'e2'},'commune');
  row=cellOf("Chiffre d'affaires");
  ok('ajout d\'un terme existant (insensible à la casse) : 2 tags', row.querySelectorAll('.term-tag').length===2 && termsOfAttr('bo1','e2').length===2 && g.glossary.length===2);
  // création d'un nouveau terme à la volée
  termTagAdd('attr',{boId:'bo1',elId:'e1'},'Numéro client');
  ok('nouveau terme créé et relié', g.glossary.length===3 && g.glossary[2].term==='Numéro client' && termsOfAttr('bo1','e1').some(t=>t.term==='Numéro client') && bo().elements[0].term===g.glossary[2].id);
  ok('dictionnaire : tag du nouveau terme sur Identifiant', cellOf('Identifiant').querySelector('.term-tag').textContent.includes('Numéro client'));
  // retrait
  termTagRemove('attr',{boId:'bo1',elId:'e2'},'gl2');
  ok('✕ retire le tag', termsOfAttr('bo1','e2').length===1 && cellOf("Chiffre d'affaires").querySelectorAll('.term-tag').length===1);
  // Entrée dans le champ
  const inp=cellOf('Identifiant').querySelector('input.term-add'); inp.value='Commune'; inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  ok('Entrée dans le champ ajoute le terme', termsOfAttr('bo1','e1').length===2);
  // vue technique : hérités en tags verts, lecture seule
  govState.dictMode='table'; govState.dictTable='CLIENTS'; renderGovernance();
  const trow=Array.from(S().querySelectorAll('tr')).find(tr=>tr.textContent.includes('CA_HT'));
  ok('vue technique : tag hérité (vert), sans ✕ ni champ', trow.querySelector('.term-tag.inh') && !trow.querySelector('.term-tag.inh .x:not([style])') && !trow.querySelector('input.term-add'));
  // ---- fiche objet : carte d'identité + formulaire ----
  openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; govState.boSel={kind:'attr',stId:'',elId:'e2'}; setBoTab('structure');
  ok('carte d\'identité : « Termes de l\'objet » en tags + champ', S().textContent.includes("Termes de l'objet") && S().querySelector('.bg-emerald-50\\/70 .term-tags input.term-add'));
  termTagAdd('bo',{boId:'bo1'},'Client facturé');
  ok('terme posé sur l\'objet (boIds) et affiché en tag', g.glossary.some(t=>t.term==='Client facturé' && t.boIds.includes('bo1')) && S().querySelector('.bg-emerald-50\\/70 .term-tag').textContent.includes('Client facturé'));
  const det=document.getElementById('boDetail');
  ok('formulaire attribut : tags (pas de select) + champ', det.querySelector('.term-tags .term-tag') && det.querySelector('.term-tags input.term-add') && !det.querySelector('select[onchange^="boAttrSetTerm"]'));
  termTagRemove('bo',{boId:'bo1'}, g.glossary.find(t=>t.term==='Client facturé').id);
  ok('retrait du terme de l\'objet', !g.glossary.find(t=>t.term==='Client facturé').boIds.includes('bo1'));
  // ---- applis & processus ----
  openGovTab('assets');
  const card=Array.from(S().querySelectorAll('input[type=text]')).find(i=>i.value==='Facturation').closest('div.border, div[class*="rounded"]');
  ok('fiche processus : tags + champ « + terme »', S().querySelectorAll('.term-tags input.term-add').length>=2);
  termTagAdd('asset',{assetId:'p_fact'},'Facturation mensuelle');
  ok('terme créé et posé sur le processus', g.glossary.some(t=>t.term==='Facturation mensuelle' && t.assetIds.includes('p_fact')) && S().querySelector('.term-tag') && S().textContent.includes('📖 Facturation mensuelle'));
  // ---- glossaire : vues ----
  openGovTab('glossary');
  ok('barre de vues : Par terme / Par objet & attribut / Par application & processus', S().textContent.includes('Par terme') && S().textContent.includes('Par objet & attribut') && S().textContent.includes('Par application & processus'));
  govState.glossView='bo'; renderGovernance();
  ok('vue par objet : objet + attributs avec tags', S().textContent.includes('🏛️ Client') && S().textContent.includes('Identifiant') && S().querySelectorAll('.term-tags').length>=4);
  termTagAdd('attr',{boId:'bo1',elId:'f1'},'Localité');
  ok('ajout depuis la vue par objet (attribut de facette)', termsOfAttr('bo1','f1').some(t=>t.term==='Localité') && govState.glossView==='bo');
  govState.glossView='asset'; renderGovernance();
  ok('vue par application : ERP et Facturation avec tags', S().textContent.includes('ERP') && S().textContent.includes('📖 Facturation mensuelle') && S().querySelectorAll('.term-tags').length===2);
  termTagOpen(g.glossary[0].id);
  ok('clic sur un tag : vue par terme, carte mise en évidence', govState.glossView==='terms' && document.getElementById('gl-card-gl1') && document.getElementById('gl-card-gl1').className.includes('ring-2'));
  // ---- consultation : le champ d'ajout est neutralisé, les tags restent cliquables ----
  govSetReadOnly(true); openGovTab('dictionary'); govState.dictMode='bo'; renderGovernance();
  const addInp=S().querySelector('input.term-add');
  ok('consultation : champ « + terme » sans data-ro=keep (désactivé), libellé de tag conservé', addInp && addInp.getAttribute('data-ro')!=='keep' && S().querySelector('.term-tag .lb').getAttribute('data-ro')==='keep');
  govSetReadOnly(false);
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,3).forEach(e=>console.log('  ',e));
await p.close();
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate((SEED)=>{ eval(SEED); switchPhase('gov'); openGovTab('glossary'); termTagAdd('attr',{boId:'bo1',elId:'e2'},'Revenu'); termTagAdd('bo',{boId:'bo1'},'Client facturé'); openGovTab('dictionary'); govState.dictMode='bo'; renderGovernance(); }, SEED);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300);
  await q.evaluate(()=>{ const t=document.querySelector('#step-9 table'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200); await q.screenshot({ path: D+'tags_dict_'+theme+'.png' });
  await q.evaluate(()=>{ openGovTab('glossary'); govState.glossView='bo'; renderGovernance(); const t=document.querySelector('#step-9 .border-slate-200.rounded-xl'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200); await q.screenshot({ path: D+'tags_gloss_'+theme+'.png' });
  await q.evaluate(()=>{ openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; govState.boSel={kind:'attr',stId:'',elId:'e2'}; setBoTab('structure'); const t=document.querySelector('#step-9 .border-2.border-emerald-200'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200); await q.screenshot({ path: D+'tags_bo_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
