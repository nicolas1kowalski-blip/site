import fs from 'fs';
// Chemins : racine studio-data et dossier des suites (surchargeables par l'environnement, voir tests/run.mjs)
const ROOT = process.env.SD_ROOT || new URL('../../', import.meta.url).pathname;
const D = new URL('./', import.meta.url).pathname;
const { chromium } = (await import(process.env.PLAYWRIGHT_INDEX || '/opt/node22/lib/node_modules/playwright/index.js')).default;
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FILE = process.env.SD_FILE||ROOT + 'StudioDataV12.html'; const isV13=/V13/.test(FILE);
const html = fs.readFileSync(FILE,'utf8').replace(/<script src="https:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*rel="stylesheet"[^>]*>/g,'');
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const perr=[]; p.on('pageerror',e=>{ if(!/lucide/.test(String(e))) perr.push(String(e)); });
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.addStyleTag({ path: D+'tw/tw_built.css' });
await p.evaluate(()=>{ v11Prefs.tourDone=true; }); await p.waitForTimeout(1500);
// Chaîne : Système tiers (carte des flux) → Gestion des tiers → CLIENTS → Personne › Adresse → (copie) Contrat › Adresse de risque
//          Référentiel → REF_PRODUITS → (table conçue) SEGMENTS → Contrat › Segment ; Batch (processus) s'appuie sur Gestion des contrats, lit CONTRATS
const seed = `['CLIENTS','CONTRATS','SEGMENTS','REF_PRODUITS'].forEach((n,i)=>{ state.tables['t'+i]={id:'t'+i,name:n,type:'csv',status:'ready',headers:['ID','CODE','PRIME'],config:{},columnsMeta:{}}; });
  state.tables['t2'].type='designed'; state.tables['t2'].design={sources:[{src:'REF_PRODUITS'}],joins:[]};
  state.governance.assets=[{id:'app0',name:'Système tiers',kind:'app'},{id:'app1',name:'Gestion des tiers',kind:'app',sources:['CLIENTS']},{id:'app2',name:'Gestion des contrats',kind:'app',sources:['CONTRATS'],tables:['CLIENTS']},{id:'app4',name:'Référentiel produits',kind:'app',sources:['REF_PRODUITS']},{id:'pr2',name:'Batch quittancement',kind:'process',tables:['CONTRATS'],appIds:['app2']}];
  state.governance.flow={nodes:[{id:'n0',name:'Système tiers',kind:'app',assetId:'app0'},{id:'n1',name:'Gestion des tiers',kind:'app',assetId:'app1'}],edges:[{id:'e0',source:'n0',target:'n1',rel:'feeds'}]};
  state.governance.businessObjects.push(
    {id:'bo1',name:'Personne',definition:'',globalOwner:'',contributors:[],producedBy:['app1'],sources:[{table:'CLIENTS',role:'maitre'}],structure:[],elements:[{id:'e1',name:'Adresse',mappings:[{table:'CLIENTS',col:'CODE'}],usedBy:[]},{id:'e0',name:'Civilité',mappings:[],usedBy:[]}]},
    {id:'bo2',name:'Contrat',definition:'Engagement.',globalOwner:'Paul',contributors:[],producedBy:['app2'],sources:[{table:'CONTRATS',role:'maitre'}],structure:[],elements:[{id:'e2',name:'Adresse de risque',mappings:[],usedBy:['pr2'],origins:[{boId:'bo1',elId:'e1',kind:'copy',rule:''}]},{id:'e5',name:'Segment',mappings:[{table:'SEGMENTS',col:'CODE'}],usedBy:[]},{id:'e7',name:'Titre',mappings:[],usedBy:[],origins:[{boId:'bo1',elId:'e0',kind:'derived',rule:'M./Mme'}]}]});
  renderTables();`;
const out = await p.evaluate(async ({seed,isV13})=>{
  const R=[]; const ok=(n,c)=>R.push([n,!!c]); window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} restoreCompleted=true;
  const wait=ms=>new Promise(r=>setTimeout(r,ms)); const BO=id=>state.governance.businessObjects.find(b=>b.id===id);
  try {
  ok('version : APP_VERSION = tête du journal = titre de l\'onglet (' + APP_VERSION + ')', APP_CHANGELOG[0].v===APP_VERSION && document.title==='Studio Data ' + APP_VERSION);
  eval(seed); govState.lineageFiles=false; v12UpSet(true);
  // ---- graphe de l'objet Contrat ----
  const g=buildBoLineageGraph(BO('bo2')); const N=id=>g.nodes.find(n=>n.id===id); const E=(s,t)=>g.edges.find(e=>e.source===s && e.target===t);
  ok('niveau 1 conservé : Personne (objet amont) et Gestion des contrats → Contrat', N('bo:bo1') && E('bo:bo1','bo:bo2') && N('as:app2') && E('as:app2','bo:bo2'));
  ok('niveau 2 : Gestion des tiers alimente Personne (via CLIENTS) — source de l\'objet amont', N('as:app1') && E('as:app1','bo:bo1') && /via CLIENTS/.test(N('as:app1').content) && /amont 2/.test(N('as:app1').content));
  ok('niveau 3 : Système tiers alimente Gestion des tiers (carte des flux), début de la chaîne', N('as:app0') && E('as:app0','as:app1') && /amont 3/.test(N('as:app0').content) && N('as:app0').first && /début de la chaîne/.test(N('as:app0').content));
  ok('fichier lu par l\'application : Gestion des contrats lit CLIENTS → Gestion des tiers alimente Gestion des contrats via CLIENTS', E('as:app1','as:app2') && /via CLIENTS/.test(E('as:app1','as:app2').label));
  ok('table conçue : SEGMENTS vient de REF_PRODUITS, produit par Référentiel produits (sans fichiers : appli via REF_PRODUITS)', N('as:app4') && (E('as:app4','bo:bo2') || E('as:app4','tbl:SEGMENTS')) );
  ok('processus aval non remonté : Batch quittancement reste en aval, sans nœud « amont » ajouté par lui', N('as:pr2') && E('bo:bo2','as:pr2') && !g.nodes.some(n=>n.deep && /Gestion des contrats/.test(n.title)));
  ok('pas de doublon, pas de « aucune source », pas de lien vers le centre en double', new Set(g.nodes.map(n=>n.id)).size===g.nodes.length && !N('nosrc') && g.edges.filter(e=>e.source==='as:app2' && e.target==='bo:bo2').length===1);
  const paths=v12UpPaths(g,'bo:bo2',30);
  ok('chaînes : au moins une chaîne à 4 maillons Système tiers ⇢ Gestion des tiers ⇢ Personne ⇢ Contrat', paths.some(p=>p.join('>')==='as:app0>as:app1>bo:bo1>bo:bo2'));
  // mode fichiers
  const gf=buildBoLineageGraph(BO('bo2'),{files:true}); govState.lineageFiles=true; const gf2=buildBoLineageGraph(BO('bo2')); govState.lineageFiles=false;
  ok('avec fichiers : CLIENTS produit par Gestion des tiers alimente Personne ; REF_PRODUITS alimente SEGMENTS', gf2.nodes.some(n=>n.id==='tbl:CLIENTS') && gf2.edges.some(e=>e.source==='as:app1' && e.target==='tbl:CLIENTS') && gf2.edges.some(e=>e.source==='tbl:CLIENTS' && e.target==='bo:bo1') && gf2.nodes.some(n=>n.id==='tbl:REF_PRODUITS') && gf2.edges.some(e=>e.source==='tbl:REF_PRODUITS' && e.target==='tbl:SEGMENTS'));
  // ---- graphe d'un attribut : copie d'un attribut mappé, et dérivé d'un attribut sans colonne ----
  const ga=buildAttrLineageGraph(BO('bo2'),null,BO('bo2').elements[0]);
  ok('attribut « Adresse de risque » : Personne › Adresse (copie) ← Gestion des tiers ← Système tiers (début)', ga.nodes.some(n=>/attr:e1$/.test(n.id)) && ga.nodes.some(n=>n.id==='as:app1') && ga.nodes.some(n=>n.id==='as:app0' && n.first) && ga.edges.some(e=>e.source==='as:app0' && e.target==='as:app1'));
  const gt=buildAttrLineageGraph(BO('bo2'),null,BO('bo2').elements[2]);
  ok('attribut « Titre » dérivé de Civilité (sans colonne) : l\'objet Personne porte l\'information, puis ses sources', gt.nodes.some(n=>n.id==='bo:bo1') && gt.edges.some(e=>e.source==='bo:bo1' && /attr:e0$/.test(e.target) && /porte/.test(e.label)) && gt.nodes.some(n=>n.id==='as:app1') && gt.edges.some(e=>e.source==='as:app1' && e.target==='bo:bo1'));
  // ---- graphe de colonne (catalogue) ----
  state.governance.dictionary=state.governance.dictionary||{}; state.governance.dictionary['CONTRATS']={sourceSystem:'Gestion des contrats',columns:{}};
  const gc=buildColumnLineageGraph('CONTRATS','PRIME');
  ok('colonne CONTRATS.PRIME (non mappée) : Gestion des contrats (système source) ← Gestion des tiers via CLIENTS', gc.nodes.some(n=>n.id==='as:app2') && gc.nodes.some(n=>n.id==='as:app1' && n.deep===2) && gc.edges.some(e=>e.source==='as:app1' && e.target==='as:app2'));
  // ---- interrupteur ----
  v12UpSet(false); const g1=buildBoLineageGraph(BO('bo2'));
  ok('interrupteur décoché : retour à un niveau (plus de Système tiers ni de Gestion des tiers), mémorisé', !g1.nodes.some(n=>n.id==='as:app0') && !g1.nodes.some(n=>n.id==='as:app1') && v12State.linDeep===false);
  v12UpSet(true);
  // ---- ouverture réelle : onglet Objets ----
  govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); await wait(100); openBoLineage('bo2'); await wait(250);
  const box=el('attrLineageBox');
  ok('onglet Objets : panneau « Depuis le début » ouvert, chaîne Système tiers ⇢ Gestion des tiers ⇢ Personne ⇢ Contrat', box.querySelector('.v12up-panel') && box.querySelector('.v12up-panel').open && /Depuis le début : \d+ chaîne/.test(box.textContent) && [...box.querySelectorAll('.v12up-chain')].some(c=>/Système tiers⇢Gestion des tiers⇢Personne⇢Contrat/.test(c.textContent)));
  ok('interrupteur « ⇠ Jusqu\'au début » dans la barre, coché', box.querySelector('.v12up-toggle input') && box.querySelector('.v12up-toggle input').checked);
  ok('synthèse : Système tiers listé en amont avec « niveau 3 · début de la chaîne »', /Système tiers/.test(box.textContent) && /niveau 3 · début de la chaîne/.test(box.textContent));
  ok('graphe rendu avec les nœuds lointains', el('attrLineageWrap').querySelectorAll(':scope > svg.usvg').length===1 && /Système tiers/.test(el('attrLineageWrap').textContent));
  if (isV13) ok('V13 : la phrase cite le point de départ (« tout au début : Système tiers »)', /tout au début/.test(box.textContent) && /Système tiers/.test((box.querySelector('.v13-sentence')||{}).textContent||''));
  openBoLineage('bo2'); await wait(100); ok('réouverture : un seul panneau, un seul interrupteur', box.querySelectorAll('.v12up-panel').length===1 && box.querySelectorAll('.v12up-toggle').length===1);
  // décocher depuis l'écran
  box.querySelector('.v12up-toggle input').click(); await wait(200);
  ok('décoché depuis l\'écran : redessiné à un niveau, panneau replié avec l\'explication', !/Système tiers/.test(el('attrLineageWrap').textContent) && /Vue à un niveau/.test(el('attrLineageBox').textContent));
  el('attrLineageBox').querySelector('.v12up-toggle input').click(); await wait(200);
  ok('recoché : Système tiers de retour', /Système tiers/.test(el('attrLineageWrap').textContent));
  // attribut ouvert
  openAttrLineage('bo2','','e2'); await wait(200);
  ok('lineage d\'un attribut : panneau « Depuis le début » avec la chaîne jusqu\'à « Adresse de risque »', el('attrLineageBox').querySelector('.v12up-panel') && [...el('attrLineageBox').querySelectorAll('.v12up-chain')].some(c=>/Système tiers/.test(c.textContent) && /Adresse de risque/.test(c.textContent)));
  // ---- catalogue ----
  openGovTab('catalog'); await wait(150); catRes=catBuildIndex(); const i=catRes.findIndex(e=>e.type==='bo' && e.bo==='bo2'); catOpenFiche(i); await wait(100); catGoLineage(); await wait(300);
  const cb=el('catLineageBox');
  ok('catalogue, fiche de l\'objet Contrat : graphe avec Système tiers (début), panneau et interrupteur', cb && !cb.classList.contains('hidden') && /Système tiers/.test(el('catLineageWrap').textContent) && cb.querySelector('.v12up-panel') && cb.querySelector('.v12up-toggle input') && cb.querySelector('.v12up-toggle input').checked);
  const j=catRes.findIndex(e=>e.type==='attr' && e.elId==='e2'); catOpenFiche(j); await wait(100); catGoLineage(); await wait(300);
  ok('catalogue, fiche de l\'information « Adresse de risque » : chaîne complète', /Système tiers/.test(el('catLineageWrap').textContent) && [...el('catLineageBox').querySelectorAll('.v12up-chain')].some(c=>/Système tiers/.test(c.textContent)));
  el('catLineageBox').querySelector('.v12up-toggle input').click(); await wait(300);
  ok('catalogue : interrupteur décoché → un niveau', !/Système tiers/.test(el('catLineageWrap').textContent));
  v12UpSet(true); await wait(200);
  // ---- objet sans amont : rien de cassé ----
  const g0=buildBoLineageGraph(BO('bo1'));
  ok('objet Personne : Gestion des tiers ← Système tiers (début), pas de retour vers Contrat (aval)', g0.nodes.some(n=>n.id==='as:app0' && n.first) && g0.edges.some(e=>e.source==='bo:bo1' && e.target==='bo:bo2') && !g0.edges.some(e=>e.source==='bo:bo2' && e.target==='bo:bo1'));
  ok('palette : action « remonter jusqu\'au début / premier niveau »', v11Index().some(it=>/Jusqu|premier niveau|jusqu/i.test(it.label) && /lineage/i.test(it.label)));
  ok('lexique : jusqu\'au début', !!V11_LEXIQUE['jusqu\'au début']);
  } catch(e) { R.push(['ERREUR '+e.message+' @ '+String(e.stack).split('\n')[1], false]); }
  return R;
}, {seed,isV13});
let fail=0; for(const [n,c] of out){ console.log((c?'✅ ':'❌ ')+n); if(!c) fail++; }
console.log(`\n${out.length-fail}/${out.length} OK · erreurs page: ${perr.length}`); perr.slice(0,5).forEach(e=>console.log('  ',e));
if (process.env.SHOTS) for (const theme of ['light','dark']) {
  const q = await b.newPage({ viewport: { width: 1500, height: 1000 }, colorScheme: theme==='dark'?'dark':'light' });
  await q.setContent(html,{waitUntil:'domcontentloaded'}); await q.addStyleTag({ path: D+'tw/tw_built.css' }); await q.evaluate(()=>{ v11Prefs.tourDone=true; }); await q.waitForTimeout(1400);
  await q.evaluate((seed)=>{ window.lucide={createIcons:()=>{}}; try{ v11TourEnd(true); wizClose(); }catch(e){} eval(seed); govState.lineageFiles=false; v12UpSet(true); govState.selectedBoId='bo2'; v11State.edit['bo:bo2']=true; openGovTab('objects'); setBoTab('usage'); openBoLineage('bo2'); document.querySelectorAll('.v11-toast').forEach(t=>t.remove()); }, seed);
  if (theme==='dark') await q.evaluate(()=>{ try { v7ApplyTheme(); } catch(e) {} document.documentElement.setAttribute('data-theme','dark'); });
  await q.waitForTimeout(500); await q.evaluate(()=>{ const s=el('attrLineageBox'); if(s) s.scrollIntoView({block:'start'}); }); await q.waitForTimeout(200); await q.screenshot({ path: D+'up_'+(isV13?'v13_':'')+theme+'.png' });
  if (theme==='light') { await q.evaluate(async()=>{ openGovTab('catalog'); await new Promise(r=>setTimeout(r,150)); catRes=catBuildIndex(); catOpenFiche(catRes.findIndex(e=>e.type==='bo' && e.bo==='bo2')); await new Promise(r=>setTimeout(r,100)); catGoLineage(); }); await q.waitForTimeout(600); await q.screenshot({ path: D+'up_cat_'+(isV13?'v13_':'')+theme+'.png' }); }
  await q.close();
}
await b.close(); process.exit(fail||perr.length?1:0);
