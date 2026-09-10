import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV11.html','utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async ()=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; v11Prefs.tourDone=true; v11TourEnd(true);
  const S=()=>document.getElementById('govContent'); const g=state.governance;
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM'],config:{},columnsMeta:{},theme:'Finance'};
  switchPhase('gov'); v11LoadSample(); const bo=g.businessObjects[0]; bo.sources=[{table:'CLIENTS',role:'maitre'}]; g.assets[0].sources=['CLIENTS']; persistAppState();
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  // lineage dans la fiche lecture
  v11GoBo(bo.id); const F=()=>document.getElementById('v11-bo-'+bo.id);
  F().querySelector('.acts button[title^="Applications"]').click();
  ok('🕸 Lineage : graphe dessiné dans la fiche lecture, pas de passage en modification', F() && F().querySelector('#attrLineageBox svg') && !document.querySelector('.v11-editbar'));
  ok('fiche lecture : le nœud objet et l\'application y figurent', /Client/.test(F().querySelector('#attrLineageBox svg').textContent) && /ERP/.test(F().querySelector('#attrLineageBox svg').textContent));
  F().querySelector('.acts button[title^="Applications"]').click(); ok('second clic : lineage replié', !F().querySelector('#attrLineageBox'));
  F().querySelector('.acts button[title^="Audit"]').click(); ok('Audit : formulaire ouvert sur l\'onglet audit', document.querySelector('.v11-editbar') && govState.boTab==='audit'); v11State.edit['bo:'+bo.id]=false; govState.boTab='structure'; renderGovernance();
  // consultation
  govSetReadOnly(true); v11GoBo(bo.id);
  ok('consultation : fiche en lecture forcée, sans Modifier / Dupliquer / Actions groupées, ⛶ et 🖨 présents', F() && !/Modifier|Dupliquer|Actions groupées/.test(F().querySelector('.acts').textContent) && /⛶/.test(F().querySelector('.acts').textContent));
  ok('consultation : valeurs non éditables, fil d\'Ariane visible et cliquable', F().querySelectorAll('.v11-ie:not(.ro)').length===0 && Array.from(document.querySelectorAll('#govCrumb a')).every(a=>getComputedStyle(a).display!=='none') && document.getElementById('govCrumb').textContent.includes('Consultation'));
  ok('consultation : pas de bouton « Nouvel objet » dans l\'écran', !Array.from(S().querySelectorAll('button')).some(b2=>/Nouvel objet/.test(b2.textContent) && getComputedStyle(b2).display!=='none'));
  v11State.edit['bo:'+bo.id]=true; renderGovernance(); ok('consultation : même en « modification », la lecture s\'impose', !!F() && !document.querySelector('.v11-editbar'));
  govSetReadOnly(false); v11State.edit={};
  // dictionnaire par objet
  govState.dictMode='bo'; govState.dictBoId=bo.id; openGovTab('dictionary');
  ok('dictionnaire par objet : lecture (aucun champ), barre avec Modifier, valeurs affichées', !S().querySelector('td input, td select, td textarea') && S().querySelector('.v11-editbar') && S().textContent.includes('Modifier') && S().textContent.includes('Identifiant unique'));
  S().querySelector('.v11-editbar .v11-btn').click(); ok('Modifier → formulaire du dictionnaire par objet + barre Terminer', S().querySelector('td input, td textarea') && /Terminer/.test(S().querySelector('.v11-editbar').textContent));
  v11State.edit['dictbo:'+bo.id]=false;
  // libellés des barres
  openGovTab('assets'); v11ToggleEdit('asset', g.assets[0].id); ok('barre : « Modification de l\'application « ERP Finance » »', /Modification de l'application « ERP Finance »/.test(S().querySelector('.v11-editbar').textContent)); v11ToggleEdit('asset', g.assets[0].id);
  openGovTab('glossary'); v11ToggleEdit('term', g.glossary[0].id); ok('barre : « Modification du terme »', /Modification du terme/.test(S().querySelector('.v11-editbar').textContent)); v11ToggleEdit('term', g.glossary[0].id);
  // catalogue → modifier dans l'objet
  openGovTab('catalog'); const i=catRes.findIndex(r=>r.type==='bo'&&r.bo===bo.id); catOpenFiche(i); catEditInObject();
  ok('« Modifier dans l\'objet » ouvre le formulaire', govState.tab==='objects' && document.querySelector('.v11-editbar') && !F());
  v11State.edit={};
  // menu : replié seulement en modification
  govState.dictMode='table'; govState.dictTable='CLIENTS'; document.body.classList.remove('v7-collapsed'); v11State.prevCollapsed=null; openGovTab('dictionary');
  ok('dictionnaire en lecture : menu non replié', !document.body.classList.contains('v7-collapsed'));
  // raccourci présentation : Maj+P seulement
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true})); ok('P seul ne déclenche plus la présentation', !v11Prefs.present);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'P',shiftKey:true,bubbles:true})); ok('Maj+P déclenche la présentation', v11Prefs.present); v11Present(false);
  // annulation protégée avant restauration
  v11State.undo=[]; restoreCompleted=false; updateBusinessObject(bo.id,'definition','x1'); ok('avant restauration : rien n\'est empilé', v11State.undo.length===0); restoreCompleted=true; updateBusinessObject(bo.id,'definition','x2'); ok('après : empilé', v11State.undo.length===1);
  return R;
});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await b.close(); process.exit(fail||perr.length?1:0);
