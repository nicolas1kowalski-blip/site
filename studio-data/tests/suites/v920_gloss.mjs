import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const html = fs.readFileSync(process.env.SD_FILE||ROOT + 'StudioDataV7.html','utf8')
  .replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const SEED = `
  window.lucide={createIcons:()=>{}};
  state.tables['t1']={id:'t1',name:'CLIENTS',type:'csv',status:'ready',headers:['ID','NOM','CA_HT','ZONE'],config:{},columnsMeta:{}};
  state.tables['t3']={id:'t3',name:'ADRESSE.csv',type:'csv',status:'ready',headers:['ID','TYPE','VILLE'],config:{},columnsMeta:{}};
  const g=state.governance;
  g.assets=[{id:'a_erp',kind:'app',name:'ERP',sources:['CLIENTS']},{id:'p_fact',kind:'process',name:'Facturation',appIds:['a_erp']}];
  g.businessObjects=[{id:'bo1',name:'Client',definition:'d',globalOwner:'Alice',status:'Validé',
    elements:[{id:'e1',name:'Identifiant',mappings:[{table:'CLIENTS',col:'ID'}]},{id:'e2',name:'Chiffre d\\'affaires',mappings:[{table:'CLIENTS',col:'CA_HT'}]}],
    sources:[{table:'CLIENTS',role:'maitre'},{table:'ADRESSE.csv',role:'contributeur'}],producedBy:['a_erp'],consumedBy:['p_fact'],
    structure:[{id:'st1',name:'Adresse principale',table:'ADRESSE.csv',cardinality:'1–1',scope:[],elements:[{id:'f1',name:'Ville',col:'VILLE'}]}]}];
  // ancien modèle : liens colonne (un qui alimente un attribut, un qui n'alimente rien)
  g.glossary=[{id:'gl1',term:'Chiffre d\\'affaires',definition:'CA',links:[{table:'CLIENTS',col:'CA_HT'},{table:'CLIENTS',col:'ZONE'}]},{id:'gl2',term:'Commune',definition:'',links:[{table:'ADRESSE.csv',col:'VILLE'}]}];
`;
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'});
await p.addStyleTag({ path: D+'tw/tw_built.css' });
const out = await p.evaluate(async (SEED)=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]);
  eval(SEED);
  const g=state.governance; const T=()=>g.glossary; const bo=()=>g.businessObjects[0];
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  switchPhase('gov'); openGovTab('glossary');
  const S=()=>document.getElementById('step-9');
  // ---- migration ----
  ok('migration : lien colonne CA_HT → lien attribut « Chiffre d\'affaires »', T()[0].attrLinks.length===1 && T()[0].attrLinks[0].elId==='e2' && bo().elements[1].term==='gl1');
  ok('migration : ZONE (n\'alimente rien) reste en héritage', T()[0].links.length===1 && T()[0].links[0].col==='ZONE');
  ok('migration : colonne de facette VILLE → attribut de facette « Ville »', T()[1].attrLinks.length===1 && T()[1].attrLinks[0].elId==='f1' && bo().structure[0].elements[0].term==='gl2' && T()[1].links.length===0);
  // ---- écran ----
  ok('plus de sélecteur table/colonne (« Lier colonne » disparu)', !S().innerHTML.includes('gl-tbl-') && !S().textContent.includes('Lier colonne'));
  ok('sélecteur objet ▸ attribut + « + Attribut »', document.getElementById('gl-bo-gl1') && document.getElementById('gl-attr-gl1') && S().textContent.includes('+ Attribut'));
  ok('sélecteur applications / processus + « + Lier »', document.getElementById('gl-as-gl1') && document.getElementById('gl-as-gl1').options.length===2);
  ok('objets métier (rattachement existant) toujours présent', S().innerHTML.includes("boatt-gl-gl1"));
  ok('pastille attribut cliquable + pastille héritage ZONE', S().textContent.includes('Chiffre d\'affaires · Client') && S().textContent.includes('CLIENTS.ZONE') && S().textContent.includes('héritage'));
  ok('attribut déjà lié absent du sélecteur', !Array.from(document.getElementById('gl-attr-gl1').options).some(o=>o.value==='e2') && Array.from(document.getElementById('gl-attr-gl1').options).some(o=>o.value==='e1'));
  // ---- lier un attribut ----
  document.getElementById('gl-attr-gl1').value='e1'; addGlossaryAttr('gl1');
  ok('+ Attribut : lien ajouté des deux côtés', T()[0].attrLinks.length===2 && bo().elements[0].term==='gl1');
  ok('compteur « désigne n élément(s) »', S().textContent.includes('désigne 2 élément(s)') || S().textContent.includes('désigne 3 élément(s)'));
  glossaryFillAttrs('gl1','bo1');
  ok('sélecteur ne propose plus que la Ville de facette', Array.from(document.getElementById('gl-attr-gl1').options).map(o=>o.value).join()==='f1');
  // ---- lier une application et un processus ----
  document.getElementById('gl-as-gl1').value='a_erp'; addGlossaryAsset('gl1');
  document.getElementById('gl-as-gl1').value='p_fact'; addGlossaryAsset('gl1');
  ok('application + processus liés', T()[0].assetIds.length===2 && !document.getElementById('gl-as-gl1'));
  ok('termsOfAsset', termsOfAsset('a_erp').length===1 && termsOfAsset('p_fact')[0].id==='gl1');
  // ---- termTargets ----
  const tg=termTargets(T()[0]);
  ok('termTargets : 2 attributs + 2 actifs + 1 héritage, sans doublon', tg.filter(x=>x.kind==='attr').length===2 && tg.filter(x=>x.kind==='asset').length===2 && tg.filter(x=>x.kind==='col').length===1);
  // ---- retrait ----
  removeGlossaryAttr('gl1',1);
  ok('retrait du lien attribut : champ « Terme » de l\'attribut vidé', T()[0].attrLinks.length===1 && bo().elements[0].term==='');
  removeGlossaryAsset('gl1',0);
  ok('retrait d\'un actif', T()[0].assetIds.length===1 && T()[0].assetIds[0]==='p_fact');
  // ---- côté formulaire d'attribut : changer de terme ----
  boAttrSetTerm('bo1','','e1','gl2');
  ok('terme posé depuis le formulaire → lien dans le glossaire', T()[1].attrLinks.some(x=>x.elId==='e1') && bo().elements[0].term==='gl2');
  boAttrSetTerm('bo1','','e1','gl1');
  ok('changement de terme : ancien lien retiré, nouveau posé', !T()[1].attrLinks.some(x=>x.elId==='e1') && T()[0].attrLinks.some(x=>x.elId==='e1'));
  boAttrSetTerm('bo1','','e1','');
  ok('terme vidé : attribut sans terme, lien conservé côté glossaire seulement si posé là', bo().elements[0].term==='' );
  // ---- héritage colonne (catalogue) ----
  ok('termsOfColumn : CA_HT hérite du terme via l\'attribut', termsOfColumn('CLIENTS','CA_HT').some(t=>t.id==='gl1'));
  ok('termsOfColumn : ZONE via ancien lien', termsOfColumn('CLIENTS','ZONE').some(t=>t.id==='gl1'));
  ok('termsOfColumn : VILLE (facette) hérite', termsOfColumn('ADRESSE.csv','VILLE').some(t=>t.id==='gl2'));
  // ---- catalogue ----
  openGovTab('catalog'); catSet('q','chiffre');
  const types=new Set(catRes.map(r=>r.type));
  ok('recherche du terme : trouve l\'objet et le processus (synonyme)', types.has('bo') && types.has('asset') && catRes.some(r=>r.type==='asset'&&r.id==='p_fact'));
  const ti=catRes.findIndex(r=>r.type==='term'&&(r.termId||r.id)==='gl1'); catOpenFiche(ti);
  const dr=document.getElementById('uxDrawer');
  ok('fiche terme : attribut, processus et héritage listés, cliquables', dr.textContent.includes('Client · Chiffre d\'affaires') && dr.textContent.includes('Facturation') && dr.innerHTML.includes("catOpenByKey") && dr.innerHTML.includes('&quot;type&quot;:&quot;asset&quot;'));
  closeUxDrawer();
  const ai=catRes.findIndex(r=>r.type==='asset'&&r.id==='p_fact'); catOpenFiche(ai);
  ok('fiche processus : pastille terme', document.getElementById('uxDrawer').textContent.includes('Termes du glossaire') && document.getElementById('uxDrawer').textContent.includes('📖 Chiffre'));
  closeUxDrawer(); catSet('q','');
  const bi=catRes.findIndex(r=>r.type==='bo'); catOpenFiche(bi);
  ok('fiche objet : termes de ses attributs listés à part', document.getElementById('uxDrawer').textContent.includes('Attributs et leurs termes'));
  closeUxDrawer();
  catSet('layer','tout'); catSet('q','chiffre');
  ok('couche Tout : la colonne CA_HT est trouvée par le terme (héritage)', catRes.some(r=>r.type==='column'&&r.col==='CA_HT'));
  catSet('layer','metier'); catSet('q','');
  // ---- applis & processus : termes affichés ----
  openGovTab('assets');
  ok('fiche processus (onglet Applis) : « Termes du glossaire »', S().textContent.includes('Termes du glossaire') && S().textContent.includes('Chiffre d\'affaires'));
  // ---- formulaire d'attribut : autres termes ----
  glossaryLinkAttr('gl2','bo1','e2'); // second terme sur CA (gl1 déjà via el.term)
  openGovTab('objects'); govState.selectedBoId='bo1'; govState.structView='fiche'; govState.boSel={kind:'attr',stId:'',elId:'e2'}; setBoTab('structure');
  ok('formulaire : les deux termes en tags (Chiffre d\'affaires, Commune)', document.querySelectorAll('#boDetail .term-tags .term-tag').length===2 && document.getElementById('boDetail').textContent.includes('📖 Commune'));
  // ---- suppression d'un terme nettoie les attributs ----
  removeGlossaryTerm('gl1');
  ok('suppression du terme : attributs nettoyés', !boAllAttrRows(bo()).some(r=>r.el.term==='gl1'));
  // ---- import : nouveau terme sans crash ----
  addGlossaryTerm();
  ok('nouveau terme : structure attrLinks/assetIds', Array.isArray(T()[T().length-1].attrLinks) && Array.isArray(T()[T().length-1].assetIds));
  return R;
}, SEED);
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
await p.close();
for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' });
  await q.evaluate((SEED)=>{ eval(SEED); switchPhase('gov'); openGovTab('glossary'); }, SEED);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(300);
  await q.evaluate(()=>{ const t=document.querySelector('#step-9 .border-slate-200.rounded-xl.p-4'); if(t) t.scrollIntoView({block:'start'}); });
  await q.waitForTimeout(200);
  await q.screenshot({ path: D+'gloss_'+theme+'.png' });
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
